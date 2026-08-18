/**
 * Application state: one Solid store plus the actions that mutate it.
 *
 * Every remote read lands in an `Async<T>` slot so a panel can distinguish
 * "never loaded", "loading", "failed" and "stale but usable" without extra
 * bookkeeping. Polling is opt-in per slot and never overlaps itself.
 */

import { createStore, produce } from "solid-js/store"
import * as gortex from "../gortex/client.ts"
import type { EnrichKind } from "../gortex/client.ts"
import { errorMessage } from "../gortex/parse.ts"
import type {
  CommandResult,
  DaemonStatus,
  GraphSummary,
  IndexHealth,
  Repo,
  Savings,
  WorkspaceDeclaration,
} from "../gortex/types.ts"
import { loadPersisted, savePersisted } from "./persist.ts"

/**
 * Panel order. Repos leads because it is what people come for; Daemon sits
 * immediately before Logs at the end, where the plumbing belongs.
 */
export const PANELS = ["repos", "workspaces", "projects", "sessions", "savings", "daemon", "logs"] as const
export type PanelId = (typeof PANELS)[number]

export const PANEL_TITLES: Record<PanelId, string> = {
  repos: "Repos",
  workspaces: "Workspaces",
  projects: "Projects",
  sessions: "Sessions",
  savings: "Savings",
  daemon: "Daemon",
  logs: "Logs",
}

export interface Async<T> {
  data: T | null
  error: string | null
  loading: boolean
  /** epoch ms of the last successful load */
  at: number
}

function empty<T>(): Async<T> {
  return { data: null, error: null, loading: false, at: 0 }
}

export type MessageKind = "info" | "error" | "success"

export interface Message {
  kind: MessageKind
  text: string
  at: number
}

export type Overlay =
  | { kind: "help" }
  | { kind: "confirm"; title: string; body: string; confirmLabel: string; onConfirm: () => void }
  | { kind: "prompt"; title: string; body: string; initial: string; onSubmit: (value: string) => void }
  | {
      kind: "menu"
      title: string
      options: Array<{ label: string; value: string }>
      onPick: (value: string) => void
    }

export interface State {
  panel: PanelId
  /** which column has the keyboard: the panel list or the detail pane */
  focus: "side" | "main"
  cursor: Record<PanelId, number>
  filter: Record<PanelId, string>
  status: Async<DaemonStatus>
  repos: Async<Repo[]>
  savings: Async<Savings>
  logs: Async<string[]>
  /** index-wide graph summary, with a per-repo breakdown; one slow call */
  graph: Async<GraphSummary>
  /** index-wide health report */
  index: Async<IndexHealth>
  declarations: Async<WorkspaceDeclaration[]>
  /** label of the command currently running, if any */
  busy: string | null
  message: Message | null
  overlay: Overlay | null
  logTail: number
  quitting: boolean
}

function zeroCursors(): Record<PanelId, number> {
  return Object.fromEntries(PANELS.map((panel) => [panel, 0])) as Record<PanelId, number>
}

function noFilters(): Record<PanelId, string> {
  return Object.fromEntries(PANELS.map((panel) => [panel, ""])) as Record<PanelId, string>
}

function initialState(): State {
  return {
    panel: "repos",
    focus: "side",
    cursor: zeroCursors(),
    filter: noFilters(),
    status: empty<DaemonStatus>(),
    repos: empty<Repo[]>(),
    savings: empty<Savings>(),
    logs: empty<string[]>(),
    graph: empty<GraphSummary>(),
    index: empty<IndexHealth>(),
    declarations: empty<WorkspaceDeclaration[]>(),
    busy: null,
    message: null,
    overlay: null,
    logTail: 300,
    quitting: false,
  }
}

export const [state, setState] = createStore<State>(initialState())

/** Back to a freshly-started app; used by the frame tests. */
export function resetState(): void {
  inFlight.clear()
  setState(initialState())
}

// ---------------------------------------------------------------------------
// message helpers
// ---------------------------------------------------------------------------

export function notify(kind: MessageKind, text: string): void {
  setState("message", { kind, text, at: Date.now() })
}

export function clearMessage(): void {
  setState("message", null)
}

// ---------------------------------------------------------------------------
// async slots
// ---------------------------------------------------------------------------

type SlotKey = "status" | "repos" | "savings" | "logs" | "graph" | "index" | "declarations"

/**
 * One load per slot at a time. A caller that arrives mid-flight waits for the
 * running load instead of being dropped, so `await refresh.x()` always means
 * "the slot is populated".
 */
const inFlight = new Map<SlotKey, Promise<void>>()

function load<K extends SlotKey>(key: K, fetcher: () => Promise<State[K]["data"]>): Promise<void> {
  const running = inFlight.get(key)
  if (running) return running
  const promise = runLoad(key, fetcher)
  inFlight.set(key, promise)
  return promise
}

async function runLoad<K extends SlotKey>(key: K, fetcher: () => Promise<State[K]["data"]>): Promise<void> {
  setState(
    produce((draft) => {
      ;(draft[key] as Async<unknown>).loading = true
    }),
  )
  try {
    const data = await fetcher()
    setState(
      produce((draft) => {
        const slot = draft[key] as Async<unknown>
        slot.data = data
        slot.error = null
        slot.loading = false
        slot.at = Date.now()
      }),
    )
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error)
    setState(
      produce((draft) => {
        const slot = draft[key] as Async<unknown>
        slot.error = text
        slot.loading = false
      }),
    )
  } finally {
    inFlight.delete(key)
  }
}

/** Any tracked repo works as the entry point for index-wide calls. */
function anyRepoPath(): string | null {
  return state.repos.data?.[0]?.path ?? state.status.data?.repos[0]?.path ?? null
}

export const refresh = {
  status: () => load("status", () => gortex.daemonStatus()),
  repos: () => load("repos", () => gortex.repos()),
  savings: () => load("savings", () => gortex.savings()),
  logs: () => load("logs", () => gortex.logs(state.logTail)),
  declarations: () => load("declarations", () => gortex.workspaceList()),
  graph: async () => {
    const path = anyRepoPath()
    if (!path) return
    await load("graph", () => gortex.graphSummary(path))
  },
  index: async () => {
    const path = anyRepoPath()
    if (!path) return
    await load("index", () => gortex.indexHealth(path))
  },
  /** the cheap slots, safe to poll */
  fast: async () => {
    await Promise.all([refresh.status(), refresh.repos()])
  },
  all: async () => {
    await refresh.fast()
    await Promise.all([refresh.savings(), refresh.logs(), refresh.declarations(), refresh.graph(), refresh.index()])
  },
  /** whatever the visible panel needs */
  current: async () => {
    switch (state.panel) {
      case "savings":
        return refresh.savings()
      case "logs":
        return refresh.logs()
      case "workspaces":
        await Promise.all([refresh.status(), refresh.declarations()])
        return
      case "repos":
        await Promise.all([refresh.fast(), refresh.graph()])
        return
      default:
        await Promise.all([refresh.fast(), refresh.index()])
        return
    }
  },
}

// ---------------------------------------------------------------------------
// derived selections
// ---------------------------------------------------------------------------

export type Freshness = "fresh" | "stale" | "unversioned" | "unindexed"

export interface RepoRow {
  name: string
  path: string
  workspace: string
  project: string
  branch: string
  head: string
  freshness: Freshness
  lastIndexed: string
  files: number
  nodes: number
  edges: number
  size: string
}

/**
 * Merge `gortex repos --json` with the richer `daemon status` table.
 *
 * `stale` from the CLI means "HEAD moved past the indexed commit **or** there
 * is no indexed commit". A directory that is not a git repository can never
 * satisfy the first test, so it is reported as unversioned rather than stale —
 * otherwise `~/.config` looks permanently out of date.
 */
export function repoRows(options: { filtered?: boolean } = {}): RepoRow[] {
  const list = state.repos.data ?? []
  const daemonRepos = state.status.data?.repos ?? []
  const declarations = state.declarations.data ?? []

  const rows = list.map<RepoRow>((repo) => {
    const extra = daemonRepos.find((row) => row.path === repo.path || row.repo === repo.name)
    const declared = declarations.find((row) => row.path === repo.path || row.repo === repo.name)
    // the daemon reports one composite `workspace/project` slug
    const [statusWorkspace = "", statusProject = ""] = (extra?.workspace ?? "").split("/")
    const versioned = Boolean(repo.head_commit || repo.branch)
    const freshness: Freshness = !repo.indexed
      ? "unindexed"
      : !versioned
        ? "unversioned"
        : repo.stale
          ? "stale"
          : "fresh"
    return {
      name: repo.name,
      path: repo.path,
      workspace: declared?.workspace ?? statusWorkspace,
      project: declared?.project ?? statusProject,
      branch: repo.branch ?? "",
      head: repo.head_commit ?? "",
      freshness,
      lastIndexed: repo.last_indexed ?? "",
      files: extra?.files ?? 0,
      nodes: extra?.nodes ?? 0,
      edges: extra?.edges ?? 0,
      size: extra?.total ?? "",
    }
  })

  // repos the daemon knows about but the config listing does not
  for (const row of daemonRepos) {
    if (rows.some((existing) => existing.path === row.path)) continue
    const [workspace = "", project = ""] = row.workspace.split("/")
    rows.push({
      name: row.repo,
      path: row.path,
      workspace,
      project,
      branch: "",
      head: "",
      freshness: "fresh",
      lastIndexed: "",
      files: row.files,
      nodes: row.nodes,
      edges: row.edges,
      size: row.total,
    })
  }

  const needle = options.filtered === false ? "" : state.filter.repos.trim().toLowerCase()
  const filtered = needle
    ? rows.filter((row) => row.name.toLowerCase().includes(needle) || row.path.toLowerCase().includes(needle))
    : rows
  return filtered.sort((a, b) => b.nodes - a.nodes || a.name.localeCompare(b.name))
}

export function currentRepo(): RepoRow | null {
  const rows = repoRows()
  if (rows.length === 0) return null
  return rows[Math.min(state.cursor.repos, rows.length - 1)] ?? null
}

/** The per-repo slice of the index-wide graph summary. */
export function repoGraph(
  name: string,
): { by_kind?: Record<string, number>; by_language?: Record<string, number> } | null {
  const perRepo = state.graph.data?.["per_repo"]
  if (!perRepo || typeof perRepo !== "object") return null
  const entry = (perRepo as Record<string, unknown>)[name]
  return entry && typeof entry === "object" ? (entry as Record<string, never>) : null
}

export interface ProjectRow {
  /** `workspace/project`, unique across the index */
  key: string
  workspace: string
  project: string
  /** distinct places the slug is declared */
  sources: string[]
  members: RepoRow[]
  files: number
  nodes: number
  edges: number
}

/**
 * Repos grouped by the project slug they declare — the second axis next to
 * workspaces. A project usually holds one repo, but a linked worktree or a
 * split front/back end lands several under the same slug.
 */
export function projectRows(): ProjectRow[] {
  const declarations = state.declarations.data ?? []
  const groups = new Map<string, ProjectRow>()

  for (const repo of repoRows({ filtered: false })) {
    const project = repo.project || repo.name
    const key = `${repo.workspace}/${project}`
    const group = groups.get(key) ?? {
      key,
      workspace: repo.workspace,
      project,
      sources: [],
      members: [],
      files: 0,
      nodes: 0,
      edges: 0,
    }
    const source = declarations.find((row) => row.path === repo.path)?.source
    if (source && !group.sources.includes(source)) group.sources.push(source)
    group.members.push(repo)
    group.files += repo.files
    group.nodes += repo.nodes
    group.edges += repo.edges
    groups.set(key, group)
  }

  const needle = state.filter.projects.trim().toLowerCase()
  const rows = [...groups.values()].filter((row) => !needle || row.key.toLowerCase().includes(needle))
  return rows.sort((a, b) => b.nodes - a.nodes || a.key.localeCompare(b.key))
}

export function currentProject(): ProjectRow | null {
  const rows = projectRows()
  if (rows.length === 0) return null
  return rows[Math.min(state.cursor.projects, rows.length - 1)] ?? null
}

export function workspaceNames(): string[] {
  return (state.status.data?.workspaces ?? []).map((workspace) => workspace.workspace)
}

export function currentWorkspace(): string | null {
  const names = workspaceNames()
  if (names.length === 0) return null
  return names[Math.min(state.cursor.workspaces, names.length - 1)] ?? null
}

export function listLength(panel: PanelId): number {
  switch (panel) {
    case "repos":
      return repoRows().length
    case "workspaces":
      return state.status.data?.workspaces.length ?? 0
    case "projects":
      return projectRows().length
    case "sessions":
      return state.status.data?.mcpSessions.length ?? 0
    case "daemon":
      return state.status.data?.fields.length ?? 0
    case "savings":
      return state.savings.data?.buckets.length ?? 0
    case "logs":
      return 0
  }
}

// ---------------------------------------------------------------------------
// navigation
// ---------------------------------------------------------------------------

/** While restoring, navigation is replaying old state — never write it back. */
let restoring = false

function remember(): void {
  if (restoring) return
  savePersisted({
    panel: state.panel,
    repo: currentRepo()?.path,
    logTail: state.logTail,
  })
}

export function selectPanel(panel: PanelId): void {
  setState({ panel, focus: "side" })
  if (panel === "savings" && !state.savings.data) void refresh.savings()
  if (panel === "logs" && !state.logs.data) void refresh.logs()
  if (panel === "repos" && !state.graph.data) void refresh.graph()
  if (panel === "daemon" && !state.index.data) void refresh.index()
  if ((panel === "workspaces" || panel === "projects") && !state.declarations.data) void refresh.declarations()
  remember()
}

export function cyclePanel(delta: number): void {
  const index = PANELS.indexOf(state.panel)
  selectPanel(PANELS[(index + delta + PANELS.length) % PANELS.length]!)
}

export function setCursor(panel: PanelId, index: number): void {
  const length = listLength(panel)
  if (length === 0) return
  setState("cursor", panel, Math.max(0, Math.min(length - 1, index)))
  remember()
}

export function moveCursor(delta: number): void {
  setCursor(state.panel, state.cursor[state.panel] + delta)
}

export function jumpCursor(position: "top" | "bottom"): void {
  setCursor(state.panel, position === "top" ? 0 : listLength(state.panel) - 1)
}

/** Restore the panel and selection from the previous session. */
export async function restoreView(): Promise<void> {
  const saved = await loadPersisted()
  restoring = true
  try {
    await applyPersisted(saved)
  } finally {
    restoring = false
  }
}

async function applyPersisted(saved: Awaited<ReturnType<typeof loadPersisted>>): Promise<void> {
  if (saved.logTail && Number.isFinite(saved.logTail)) setState("logTail", saved.logTail)

  if (saved.repo) {
    const index = repoRows().findIndex((row) => row.path === saved.repo)
    if (index >= 0) setState("cursor", "repos", index)
  }

  // through selectPanel, so the restored panel loads whatever it needs
  if (saved.panel && (PANELS as readonly string[]).includes(saved.panel)) {
    selectPanel(saved.panel as PanelId)
  }
}

// ---------------------------------------------------------------------------
// commands
// ---------------------------------------------------------------------------

/** Run a mutating gortex command with a busy indicator and a result message. */
export async function command(label: string, action: () => Promise<CommandResult>): Promise<void> {
  if (state.busy) {
    notify("error", `busy: ${state.busy} is still running`)
    return
  }
  setState("busy", label)
  notify("info", `${label}…`)
  try {
    const result = await action()
    if (result.ok) {
      notify("success", `${label} ok (${(result.ms / 1000).toFixed(1)}s)`)
    } else {
      notify("error", `${label}: ${errorMessage(result.stderr, result.stdout)}`)
    }
  } catch (error) {
    notify("error", `${label}: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    setState("busy", null)
    await refresh.fast()
    void refresh.graph()
    void refresh.declarations()
  }
}

export function isTracked(path: string): boolean {
  return repoRows().some((row) => row.path === path)
}

/** Expand `~`, resolve relatives, drop a trailing slash. */
export function normalizePath(input: string): string {
  const home = process.env["HOME"] ?? ""
  let path = input.trim()
  if (path === "~") path = home
  else if (path.startsWith("~/")) path = `${home}/${path.slice(2)}`
  if (!path.startsWith("/")) path = `${process.cwd()}/${path}`
  return path.length > 1 ? path.replace(/\/+$/, "") : path
}

export const actions = {
  daemonStart: () => command("daemon start", gortex.daemon.start),
  daemonStop: () => command("daemon stop", gortex.daemon.stop),
  daemonRestart: () => command("daemon restart", gortex.daemon.restart),
  daemonReload: () => command("daemon reload", gortex.daemon.reload),
  track: (path: string) => command(`track ${path}`, () => gortex.track(path)),
  untrack: (path: string) => command(`untrack ${path}`, () => gortex.untrack(path)),
  reindex: (path: string) => command(`re-index ${path}`, () => gortex.reindex(path)),
  enrich: (kind: EnrichKind, path: string) => command(`enrich ${kind}`, () => gortex.enrich(kind, path)),
  init: (path: string) => command(`init ${path}`, () => gortex.init(path)),
  workspaceSet: (path: string, workspace: string, project?: string) =>
    command(`workspace set ${workspace}${project ? `/${project}` : ""}`, () =>
      gortex.workspaceSet(path, workspace, project),
    ),
}

// ---------------------------------------------------------------------------
// overlays
// ---------------------------------------------------------------------------

export function openOverlay(overlay: Overlay): void {
  setState("overlay", overlay)
}

export function closeOverlay(): void {
  setState("overlay", null)
}

// ---------------------------------------------------------------------------
// polling
// ---------------------------------------------------------------------------

export function startPolling(): () => void {
  const timers = [
    setInterval(() => void refresh.status(), 3_000),
    setInterval(() => void refresh.repos(), 6_000),
    setInterval(() => {
      if (state.panel === "logs") void refresh.logs()
    }, 3_000),
    setInterval(() => {
      if (state.panel === "savings") void refresh.savings()
    }, 30_000),
    // the graph call costs over a second; it never belongs on a fast tick
    setInterval(() => void refresh.graph(), 120_000),
  ]
  return () => timers.forEach(clearInterval)
}
