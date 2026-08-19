/**
 * Thin wrapper around the `gortex` CLI.
 *
 * Every read goes through `--json` where the CLI offers it, and through a
 * forgiving text parser where it does not. Nothing in here throws: a failed
 * invocation comes back as `{ ok: false, stderr }` so panels can render a
 * degraded state instead of crashing the renderer.
 */

import { parseDaemonStatus, parseSavings, parseWorkspaceList, errorMessage } from "./parse.ts"
import type {
  CommandResult,
  FailureKind,
  DaemonStatus,
  GraphSummary,
  IndexHealth,
  Repo,
  Savings,
  WorkspaceDeclaration,
} from "./types.ts"

const HOME = process.env["HOME"] ?? ""

/** Resolve the gortex binary: $GORTEX_BIN, then PATH, then ~/.local/bin. */
function resolveBin(): string {
  const explicit = process.env["GORTEX_BIN"]
  if (explicit) return explicit
  const fromPath = Bun.which("gortex")
  if (fromPath) return fromPath
  const local = `${HOME}/.local/bin/gortex`
  return local
}

export const GORTEX_BIN = resolveBin()

export interface RunOptions {
  /** working directory for the invocation (defaults to the process cwd) */
  cwd?: string
  /** hard timeout in ms; the child is killed past it */
  timeoutMs?: number
  /** extra environment */
  env?: Record<string, string>
}

const DEFAULT_TIMEOUT = 20_000
/** How long a killed child gets to exit before the group is killed outright. */
const GRACE = 500
/** How long to wait for the pipes after that before giving up on the output. */
const DRAIN = 250
/** The shell's convention for "killed by a timeout". */
const TIMEOUT_CODE = 124

/** What a spawn failure was really about, out of the error the runtime threw. */
function spawnFailure(error: unknown): FailureKind {
  const code = (error as { code?: string } | null)?.code ?? ""
  const message = error instanceof Error ? error.message : String(error)
  if (code === "ENOENT" || message.includes("ENOENT")) return "notFound"
  if (code === "EACCES" || code === "EPERM" || message.includes("EACCES")) return "notExecutable"
  return "spawnError"
}

/**
 * Run `gortex <args...>` and capture everything. Never throws.
 *
 * The timeout bounds wall-clock time, not just the child's life. Reading the
 * pipes blocks until every holder of them exits, so a child that ignores
 * SIGTERM, or one that leaves a grandchild on the pipes, used to make this
 * outlive its budget without limit — and the caller sets `state.busy` before
 * awaiting, so one hung invocation refused every later action until the app was
 * restarted. The reads are raced against the timer, the child is killed and
 * then its process group is killed, and the result comes back either way.
 */
export async function run(args: string[], options: RunOptions = {}): Promise<CommandResult> {
  const started = performance.now()
  const argv = [GORTEX_BIN, ...args]
  const elapsed = (): number => performance.now() - started
  let timer: ReturnType<typeof setTimeout> | undefined
  let escalation: ReturnType<typeof setTimeout> | undefined

  try {
    const proc = Bun.spawn(argv, {
      cwd: options.cwd,
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
      // its own process group, so the escalation below can reach a grandchild
      // still holding the pipes rather than only the child we spawned
      detached: true,
      env: {
        ...process.env,
        NO_COLOR: "1",
        TERM: "dumb",
        ...options.env,
      },
    })

    const streams = Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]).then(
      ([stdout, stderr]) => ({ stdout, stderr }),
    )
    streams.catch(() => {})

    const expiry = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => {
        proc.kill("SIGTERM")
        escalation = setTimeout(() => {
          try {
            process.kill(-proc.pid, "SIGKILL")
          } catch {
            // already gone, or never became a group leader
          }
          proc.kill("SIGKILL")
        }, GRACE)
        resolve("timeout")
      }, options.timeoutMs ?? DEFAULT_TIMEOUT)
    })

    if ((await Promise.race([streams.then(() => "done" as const), expiry])) === "timeout") {
      // whatever the child managed to write before it was killed is worth
      // keeping, but not worth waiting on indefinitely
      const partial = await Promise.race([streams, Bun.sleep(GRACE + DRAIN).then(() => null)])
      return {
        ok: false,
        code: TIMEOUT_CODE,
        stdout: partial?.stdout ?? "",
        stderr: partial?.stderr ?? "",
        failure: "timedOut",
        ms: elapsed(),
        argv,
      }
    }

    const { stdout, stderr } = await streams
    const code = await proc.exited
    return { ok: code === 0, code, stdout, stderr, ms: elapsed(), argv }
  } catch (error) {
    return {
      ok: false,
      code: -1,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      failure: spawnFailure(error),
      ms: elapsed(),
      argv,
    }
  } finally {
    // the catch path used to leave both of these running
    clearTimeout(timer)
    clearTimeout(escalation)
  }
}

/** One line saying what went wrong, preferring what we know over what we guess. */
export function failureMessage(result: CommandResult): string {
  switch (result.failure) {
    case "timedOut":
      return `timed out after ${Math.round(result.ms)}ms`
    case "notFound":
      return `gortex not found at ${GORTEX_BIN}`
    case "notExecutable":
      return `not executable: ${GORTEX_BIN}`
    case "spawnError":
      return result.stderr.trim() || "could not start gortex"
    default:
      return errorMessage(result.stderr, result.stdout)
  }
}

/**
 * The CLI prints `Error: ...` on stderr but sometimes still exits 0 (e.g. an
 * untracked repo), so treat a leading `Error:` as a failure too.
 */
function failed(result: CommandResult): boolean {
  return !result.ok || /^\s*Error:/i.test(result.stderr) || /^\s*Error:/i.test(result.stdout)
}

export class GortexError extends Error {
  constructor(
    message: string,
    readonly result: CommandResult,
  ) {
    super(message)
    this.name = "GortexError"
  }
}

async function json<T>(args: string[], options?: RunOptions): Promise<T> {
  const result = await run(args, options)
  if (failed(result)) throw new GortexError(failureMessage(result), result)
  try {
    return JSON.parse(result.stdout) as T
  } catch {
    // a killed call leaves half-written JSON, and its first line used to be
    // shown to the user as the error text
    throw new GortexError(result.failure ? failureMessage(result) : "unparseable JSON from gortex", result)
  }
}

async function text(args: string[], options?: RunOptions): Promise<string> {
  const result = await run(args, options)
  if (failed(result)) throw new GortexError(failureMessage(result), result)
  return result.stdout
}

/**
 * Is the gortex binary reachable and runnable?
 *
 * Checked once at start-up so a machine without gortex gets an explanation
 * instead of seven panels of spawn errors.
 */
export async function probe(): Promise<{ ok: boolean; version?: string; reason?: string }> {
  const result = await run(["version"], { timeoutMs: 10_000 })
  if (result.ok) {
    const version = result.stdout.trim().split("\n")[0]
    return { ok: true, version: version || undefined }
  }
  // a binary that exists but has no exec bit is not "not found", and saying so
  // sent people looking for a file that was sitting right there
  return { ok: false, reason: failureMessage(result) }
}

// ---------------------------------------------------------------------------
// reads
// ---------------------------------------------------------------------------

export function repos(): Promise<Repo[]> {
  return json<Repo[]>(["repos", "--json"])
}

export async function daemonStatus(): Promise<DaemonStatus> {
  const result = await run(["daemon", "status"], { timeoutMs: 10_000 })
  // A call that never ran is not a daemon that is not running. Reporting the
  // second for the first painted a definite red `daemon stopped`, with no error
  // text anywhere, over a daemon that was up and mid-index — and offered `s` and
  // `x` to restart it.
  if (result.failure) throw new GortexError(failureMessage(result), result)
  // A stopped daemon exits non-zero; report that rather than throwing, and keep
  // what it said about itself.
  if (failed(result) && !result.stdout.trim()) {
    return {
      running: false,
      reason: errorMessage(result.stderr, result.stdout, "the daemon did not answer"),
      fields: [],
      workspaces: [],
      repos: [],
      mcpSessions: [],
    }
  }
  return parseDaemonStatus(result.stdout || result.stderr)
}

export async function savings(): Promise<Savings> {
  const raw = await text(["savings"])
  const parsed = parseSavings(raw)
  try {
    parsed.json = JSON.parse(await text(["savings", "--json"]))
  } catch {
    // the dashboard text alone is enough
  }
  return parsed
}

export async function logs(tail = 200): Promise<string[]> {
  const raw = await text(["daemon", "logs", "-n", String(tail)], { timeoutMs: 10_000 })
  return raw.split("\n")
}

/**
 * `workspace graph` — node/edge counts by kind and language.
 *
 * The answer covers the whole index, with a `per_repo` breakdown, so it is
 * fetched once for the process rather than once per selected repo: the call
 * costs well over a second.
 */
export function graphSummary(repoPath: string): Promise<GraphSummary> {
  return json<GraphSummary>(
    ["call", "workspace", "--arg", "operation=graph", "--index", repoPath, "--format", "json"],
    { timeoutMs: 30_000 },
  )
}

/** `workspace index` — parse failures, stale files, language coverage, health. */
export function indexHealth(repoPath: string): Promise<IndexHealth> {
  return json<IndexHealth>(["call", "workspace", "--arg", "operation=index", "--index", repoPath, "--format", "json"], {
    timeoutMs: 30_000,
  })
}

/** `gortex workspace list` — what each repo declares, and where it declares it. */
export async function workspaceList(): Promise<WorkspaceDeclaration[]> {
  return parseWorkspaceList(await text(["workspace", "list"], { timeoutMs: 15_000 }))
}

// ---------------------------------------------------------------------------
// mutations — each returns the raw result so the caller can surface stderr
// ---------------------------------------------------------------------------

export const daemon = {
  start: () => run(["daemon", "start"], { timeoutMs: 60_000 }),
  stop: () => run(["daemon", "stop"], { timeoutMs: 60_000 }),
  restart: () => run(["daemon", "restart"], { timeoutMs: 120_000 }),
  reload: () => run(["daemon", "reload"], { timeoutMs: 60_000 }),
}

export function track(repoPath: string): Promise<CommandResult> {
  return run(["track", repoPath], { timeoutMs: 300_000 })
}

export function untrack(repoPath: string): Promise<CommandResult> {
  return run(["untrack", repoPath], { timeoutMs: 60_000 })
}

/**
 * Re-index a repo the daemon already tracks.
 *
 * `track` is idempotent and re-adds the repo, which is the only lever the CLI
 * offers for forcing a rebuild; `--wait` blocks until the graph is queryable.
 */
export function reindex(repoPath: string): Promise<CommandResult> {
  return run(["track", repoPath, "--wait", "--wait-timeout", "5m"], { timeoutMs: 320_000 })
}

/** `gortex workspace set <repo> <workspace> [project]` */
export function workspaceSet(repoPath: string, workspace: string, project?: string): Promise<CommandResult> {
  const args = ["workspace", "set", repoPath, workspace]
  if (project) args.push(project)
  return run(args, { timeoutMs: 30_000 })
}

/** `gortex init <repo>` — writes MCP + instruction files into the repo. */
export function init(repoPath: string, dryRun = false): Promise<CommandResult> {
  const args = ["init", repoPath]
  if (dryRun) args.push("--dry-run")
  return run(args, { timeoutMs: 300_000 })
}

export const ENRICH_KINDS = ["churn", "blame", "coverage", "releases", "cochange"] as const
export type EnrichKind = (typeof ENRICH_KINDS)[number]

export function enrich(kind: EnrichKind, repoPath: string): Promise<CommandResult> {
  return run(["enrich", kind], { cwd: repoPath, timeoutMs: 300_000 })
}
