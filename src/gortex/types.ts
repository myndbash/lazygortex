/**
 * Shapes returned by the `gortex` CLI.
 *
 * Everything here is derived from real CLI output: `gortex repos --json`,
 * `gortex savings --json`, `gortex doctor --json` and the text tables printed
 * by `gortex daemon status`.
 */

export interface Repo {
  name: string
  path: string
  head_commit: string
  branch?: string
  indexed_commit?: string
  last_indexed?: string
  stale: boolean
  indexed: boolean
}

/** One row of the `tracked repos` table in `gortex daemon status`. */
export interface DaemonRepo {
  repo: string
  workspace: string
  total: string
  files: number
  nodes: number
  edges: number
  path: string
}

/** One row of the `workspaces` table in `gortex daemon status`. */
export interface DaemonWorkspace {
  workspace: string
  repos: number
  projects: string
  files: number
  nodes: number
  edges: number
}

/** One row of the `MCP sessions` table in `gortex daemon status`. */
export interface DaemonSession {
  id: string
  client: string
  version: string
  connected: string
  cwd: string
}

export interface DaemonStatus {
  /** true when the daemon answered at all */
  running: boolean
  /** what the CLI said when it is not running */
  reason?: string
  version?: string
  pid?: string
  socket?: string
  uptime?: string
  state?: string
  sessions?: string
  memory?: string
  search?: string
  trigram?: string
  runtime?: string
  /** every `key   value` line, in order, including ones not modelled above */
  fields: Array<[string, string]>
  workspaces: DaemonWorkspace[]
  repos: DaemonRepo[]
  mcpSessions: DaemonSession[]
}

export interface SavingsBucket {
  label: string
  percent: number
  saved: number
  total: number
  usd: number
}

export interface Savings {
  /** rendered dashboard, kept verbatim for the detail pane */
  text: string
  buckets: SavingsBucket[]
  json?: unknown
}

export interface GraphSummary {
  nodes?: number
  edges?: number
  by_kind?: Record<string, number>
  by_language?: Record<string, number>
  [key: string]: unknown
}

export interface IndexHealth {
  health_score?: number
  parse_failures?: number
  stale_files?: number
  [key: string]: unknown
}

/**
 * Why an invocation failed, when the reason is known.
 *
 * Without this every consumer invents an answer — `command failed` for a
 * timeout, `not found` for a permissions error, `daemon stopped` for a status
 * call that never ran — and tells the user something definite and wrong.
 */
export type FailureKind = "timedOut" | "notFound" | "notExecutable" | "spawnError"

/** Result of one CLI invocation. */
export interface CommandResult {
  ok: boolean
  code: number
  stdout: string
  stderr: string
  /** set only when the reason is known; absent means the CLI itself failed */
  failure?: FailureKind
  /** wall-clock duration in ms */
  ms: number
  argv: string[]
}

/** One row of `gortex workspace list`. */
export interface WorkspaceDeclaration {
  repo: string
  workspace: string
  project: string
  /** where the declaration lives: `.gortex.yaml`, global config, … */
  source: string
  path: string
}
