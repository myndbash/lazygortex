/**
 * Parsers for the `gortex` CLI surfaces that have no `--json` flag.
 *
 * `gortex daemon status` prints a key/value block followed by box-drawing
 * tables. Parsing is deliberately forgiving: an unknown key lands in `fields`,
 * an unrecognised table simply yields no rows, and nothing here throws.
 */

import type {
  DaemonRepo,
  DaemonSession,
  DaemonStatus,
  DaemonWorkspace,
  Savings,
  SavingsBucket,
  WorkspaceDeclaration,
} from "./types.ts"

const ANSI = new RegExp("\\u001b\\[[0-9;?]*[ -/]*[@-~]|\\u001b\\][^\\u0007\\u001b]*(?:\\u0007|\\u001b\\\\)", "g")

export function stripAnsi(input: string): string {
  return input.replace(ANSI, "")
}

/** Split a `│ a │ b │` row into trimmed cells. */
function tableCells(line: string): string[] {
  const trimmed = line.trim()
  if (!trimmed.startsWith("│")) return []
  return trimmed
    .slice(1, trimmed.endsWith("│") ? -1 : undefined)
    .split("│")
    .map((cell) => cell.trim())
}

function isRule(line: string): boolean {
  const t = line.trim()
  return /^[┌├└┬┴┼─┐┤┘]+$/.test(t) && t.length > 0
}

/**
 * Read the table that starts at or after `from`, returning its rows as objects
 * keyed by the header cells, plus the index of the first line after the table.
 */
function readTable(lines: string[], from: number): { rows: Array<Record<string, string>>; next: number } {
  const rows: Array<Record<string, string>> = []
  let i = from
  // skip blank lines / leading rule
  while (i < lines.length && (lines[i]!.trim() === "" || isRule(lines[i]!))) i++

  const header = tableCells(lines[i] ?? "")
  if (header.length === 0) return { rows, next: i }
  i++

  for (; i < lines.length; i++) {
    const line = lines[i]!
    if (isRule(line)) {
      // A rule that arrives after a data row separates a summary block from the
      // data: `daemon status` closes its tracked-repos table with an `other`
      // totals row carrying prose where a path belongs. The rule under the
      // header has no rows behind it yet and is simply skipped.
      if (rows.length > 0) break
      continue
    }
    const cells = tableCells(line)
    if (cells.length === 0) break
    const row: Record<string, string> = {}
    header.forEach((key, idx) => {
      row[key] = cells[idx] ?? ""
    })
    rows.push(row)
  }
  // whatever is left of the table is not data, but `next` still has to point
  // past it or the caller re-reads those lines
  while (i < lines.length && (isRule(lines[i]!) || tableCells(lines[i]!).length > 0)) i++
  return { rows, next: i }
}

function num(value: string | undefined): number {
  if (!value) return 0
  const parsed = Number(value.replace(/[\s,]/g, ""))
  return Number.isFinite(parsed) ? parsed : 0
}

/** Parse the whole `gortex daemon status` output. */
export function parseDaemonStatus(raw: string): DaemonStatus {
  const text = stripAnsi(raw)
  const lines = text.split("\n")
  const status: DaemonStatus = {
    running: false,
    fields: [],
    workspaces: [],
    repos: [],
    mcpSessions: [],
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const section = line.trim().toLowerCase()

    if (section === "workspaces:") {
      const { rows, next } = readTable(lines, i + 1)
      status.workspaces = rows.map<DaemonWorkspace>((row) => ({
        workspace: row["workspace"] ?? "",
        repos: num(row["repos"]),
        projects: row["projects"] ?? "",
        files: num(row["files"]),
        nodes: num(row["nodes"]),
        edges: num(row["edges"]),
      }))
      i = next - 1
      continue
    }

    if (section === "tracked repos:") {
      const { rows, next } = readTable(lines, i + 1)
      status.repos = rows.map<DaemonRepo>((row) => ({
        repo: row["repo"] ?? "",
        workspace: row["workspace"] ?? "",
        total: row["total"] ?? "",
        files: num(row["files"]),
        nodes: num(row["nodes"]),
        edges: num(row["edges"]),
        path: row["path"] ?? "",
      }))
      i = next - 1
      continue
    }

    if (section === "mcp sessions:") {
      const { rows, next } = readTable(lines, i + 1)
      status.mcpSessions = rows
        .map<DaemonSession>((row) => ({
          id: row["id"] ?? "",
          client: row["client"] ?? "",
          version: row["version"] ?? "",
          connected: row["connected"] ?? "",
          cwd: row["cwd"] ?? "",
        }))
        // reading the status registers a control session of its own, so the
        // list would carry a phantom row with a fresh id on every poll
        .filter((session) => !(session.client === "cli" && session.cwd === ""))
        // the daemon emits these in Go map order, randomised per call; a cursor
        // that is an integer into that list changes record without a keypress
        .sort((a, b) => a.client.localeCompare(b.client) || a.cwd.localeCompare(b.cwd) || a.id.localeCompare(b.id))
      i = next - 1
      continue
    }

    // key/value block: two or more spaces separate the key from the value
    const kv = /^\s{1,3}([a-z][a-z_ ]*?)\s{2,}(\S.*?)\s*$/.exec(line)
    if (kv) {
      const key = kv[1]!.trim()
      const value = kv[2]!.trim()
      status.fields.push([key, value])
      switch (key) {
        case "daemon":
          status.version = value
          break
        case "pid":
          status.pid = value
          break
        case "socket":
          status.socket = value
          break
        case "uptime":
          status.uptime = value
          break
        case "state":
          status.state = value
          break
        case "sessions":
          status.sessions = value
          break
        case "memory":
          status.memory = value
          break
        case "search":
          status.search = value
          break
        case "trigram":
          status.trigram = value
          break
        case "runtime":
          status.runtime = value
          break
      }
    }
  }

  status.running = Boolean(status.pid)
  return status
}

/**
 * Parse the three progress bars of the `gortex savings` dashboard:
 *   `Today       ████░░░░  28.5%  saved 5,158 / 18,130 tokens  $0.0258`
 */
export function parseSavings(raw: string): Savings {
  const text = stripAnsi(raw)
  const buckets: SavingsBucket[] = []
  const re =
    /^(Today|Last 7 days|All time)\s+[█░▓▒\s]*\s+([\d.]+)%\s+saved\s+([\d,]+)\s*\/\s*([\d,]+)\s*tokens\s*\$?([\d.]+)?/gm
  let lastBucketEnd = 0
  for (const m of text.matchAll(re)) {
    // the printed figures are kept as well as the numbers: `Number("2.92")`
    // rendered back is `2.92`, but `Number("0.2070")` is `0.207`, and a cost is
    // not a quantity to re-format
    buckets.push({
      label: m[1]!,
      percent: Number(m[2]),
      percentText: m[2]!,
      saved: num(m[3]),
      total: num(m[4]),
      usd: m[5] ? Number(m[5]) : 0,
      usdText: m[5] ?? "0",
    })
    lastBucketEnd = (m.index ?? 0) + m[0].length
  }

  // where the dashboard goes on after the bars, so the detail pane does not
  // have to count header lines it does not control
  const after = text.indexOf("\n", lastBucketEnd)
  const tail = lastBucketEnd > 0 && after >= 0 ? text.slice(after + 1).replace(/^\n+/, "") : ""
  return { text: text.trimEnd(), tail: tail.trimEnd(), buckets }
}

/** Best-effort one-line reason out of a failed CLI invocation. */
export function errorMessage(stderr: string, stdout: string, fallback = "command failed"): string {
  const source = stripAnsi(stderr || stdout).trim()
  if (!source) return fallback
  const line = source.split("\n").find((l) => l.trim().length > 0) ?? fallback
  return line.replace(/^Error:\s*/i, "").trim()
}

/**
 * Parse the `gortex workspace list` table.
 *
 * A repo with no `.gortex.yaml` gets the literal prose `(default: <name>)` in
 * its workspace and project cells: a rendering of "nothing is declared here",
 * not a slug. The SOURCE column reads `default` for exactly those rows, which
 * is the reliable test — the prose is dropped so no caller can adopt it as a
 * repo's workspace, its project, or a key to group on.
 */
export function parseWorkspaceList(raw: string): WorkspaceDeclaration[] {
  const lines = stripAnsi(raw).split("\n")
  const { rows } = readTable(lines, 0)
  return rows.map((row) => {
    const source = row["SOURCE"] ?? row["source"] ?? ""
    const inherited = source === "default"
    return {
      repo: row["REPO"] ?? row["repo"] ?? "",
      workspace: inherited ? "" : (row["WORKSPACE"] ?? row["workspace"] ?? ""),
      project: inherited ? "" : (row["PROJECT"] ?? row["project"] ?? ""),
      source,
      path: row["PATH"] ?? row["path"] ?? "",
    }
  })
}
