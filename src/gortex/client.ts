/**
 * Thin wrapper around the `gortex` CLI.
 *
 * Every read goes through `--json` where the CLI offers it, and through a
 * forgiving text parser where it does not. Nothing in here throws: a failed
 * invocation comes back as `{ ok: false, stderr }` so panels can render a
 * degraded state instead of crashing the renderer.
 */

import { parseDaemonStatus, parseSavings, errorMessage } from "./parse.ts"
import type { CommandResult, DaemonStatus, GraphSummary, IndexHealth, Repo, Savings } from "./types.ts"

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

/** Run `gortex <args...>` and capture everything. Never throws. */
export async function run(args: string[], options: RunOptions = {}): Promise<CommandResult> {
  const started = performance.now()
  const argv = [GORTEX_BIN, ...args]
  try {
    const proc = Bun.spawn(argv, {
      cwd: options.cwd,
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
      env: {
        ...process.env,
        NO_COLOR: "1",
        TERM: "dumb",
        ...options.env,
      },
    })

    const timeout = setTimeout(() => proc.kill(), options.timeoutMs ?? DEFAULT_TIMEOUT)
    const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
    const code = await proc.exited
    clearTimeout(timeout)

    return { ok: code === 0, code, stdout, stderr, ms: performance.now() - started, argv }
  } catch (error) {
    return {
      ok: false,
      code: -1,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      ms: performance.now() - started,
      argv,
    }
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
  if (failed(result)) throw new GortexError(errorMessage(result.stderr, result.stdout), result)
  try {
    return JSON.parse(result.stdout) as T
  } catch {
    throw new GortexError("unparseable JSON from gortex", result)
  }
}

async function text(args: string[], options?: RunOptions): Promise<string> {
  const result = await run(args, options)
  if (failed(result)) throw new GortexError(errorMessage(result.stderr, result.stdout), result)
  return result.stdout
}

// ---------------------------------------------------------------------------
// reads
// ---------------------------------------------------------------------------

export function repos(): Promise<Repo[]> {
  return json<Repo[]>(["repos", "--json"])
}

export async function daemonStatus(): Promise<DaemonStatus> {
  const result = await run(["daemon", "status"], { timeoutMs: 10_000 })
  // A stopped daemon exits non-zero; report that rather than throwing.
  if (failed(result) && !result.stdout.trim()) {
    return { running: false, fields: [], workspaces: [], repos: [], mcpSessions: [] }
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

/** `workspace graph` — node/edge counts by kind and language for one repo. */
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

export const ENRICH_KINDS = ["churn", "blame", "coverage", "releases", "cochange"] as const
export type EnrichKind = (typeof ENRICH_KINDS)[number]

export function enrich(kind: EnrichKind, repoPath: string): Promise<CommandResult> {
  return run(["enrich", kind], { cwd: repoPath, timeoutMs: 300_000 })
}
