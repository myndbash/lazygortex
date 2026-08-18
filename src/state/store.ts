/**
 * Application state: one Solid store plus the actions that mutate it.
 *
 * Every remote read lands in an `Async<T>` slot so a panel can distinguish
 * "never loaded", "loading", "failed" and "stale but usable" without extra
 * bookkeeping. Polling is opt-in per slot and never overlaps itself.
 */

import { createStore, produce } from "solid-js/store"
import * as gortex from "../gortex/client.ts"
import { errorMessage } from "../gortex/parse.ts"
import type { EnrichKind } from "../gortex/client.ts"
import type { DaemonStatus, GraphSummary, IndexHealth, Repo, Savings } from "../gortex/types.ts"

export const PANELS = ["daemon", "repos", "workspaces", "sessions", "savings", "logs"] as const
export type PanelId = (typeof PANELS)[number]

export const PANEL_TITLES: Record<PanelId, string> = {
  daemon: "Daemon",
  repos: "Repos",
  workspaces: "Workspaces",
  sessions: "Sessions",
  savings: "Savings",
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
  | {
      kind: "prompt"
      title: string
      body: string
      initial: string
      onSubmit: (value: string) => void
    }
  | { kind: "menu"; title: string; options: Array<{ label: string; value: string }>; onPick: (value: string) => void }

export interface RepoDetail {
  /** repo path the detail belongs to */
  path: string
  graph: Async<GraphSummary>
  index: Async<IndexHealth>
}

export interface State {
  panel: PanelId
  /** which column has the keyboard: the panel list or the detail pane */
  focus: "side" | "main"
  cursor: Record<PanelId, number>
  filter: string
  status: Async<DaemonStatus>
  repos: Async<Repo[]>
  savings: Async<Savings>
  logs: Async<string[]>
  detail: RepoDetail | null
  /** label of the command currently running, if any */
  busy: string | null
  message: Message | null
  overlay: Overlay | null
  logTail: number
  quitting: boolean
}

function initialState(): State {
  return {
    panel: "daemon",
    focus: "side",
    cursor: { daemon: 0, repos: 0, workspaces: 0, sessions: 0, savings: 0, logs: 0 },
    filter: "",
    status: empty<DaemonStatus>(),
    repos: empty<Repo[]>(),
    savings: empty<Savings>(),
    logs: empty<string[]>(),
    detail: null,
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
  detailToken++
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

type SlotKey = "status" | "repos" | "savings" | "logs"

const inFlight = new Set<SlotKey>()

async function load<K extends SlotKey>(key: K, fetcher: () => Promise<State[K]["data"]>): Promise<void> {
  if (inFlight.has(key)) return
  inFlight.add(key)
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

export const refresh = {
  status: () => load("status", () => gortex.daemonStatus()),
  repos: () => load("repos", () => gortex.repos()),
  savings: () => load("savings", () => gortex.savings()),
  logs: () => load("logs", () => gortex.logs(state.logTail)),
  all: async () => {
    await Promise.all([refresh.status(), refresh.repos(), refresh.savings(), refresh.logs()])
  },
  /** whatever the visible panel needs */
  current: async () => {
    switch (state.panel) {
      case "savings":
        return refresh.savings()
      case "logs":
        return refresh.logs()
      case "repos":
        await Promise.all([refresh.repos(), refresh.status()])
        return loadDetail(true)
      default:
        return Promise.all([refresh.status(), refresh.repos()]).then(() => undefined)
    }
  },
}

// ---------------------------------------------------------------------------
// derived selections
// ---------------------------------------------------------------------------

export interface RepoRow {
  name: string
  path: string
  workspace: string
  branch: string
  head: string
  stale: boolean
  indexed: boolean
  lastIndexed: string
  files: number
  nodes: number
  edges: number
  size: string
}

/** Merge `gortex repos --json` with the richer `daemon status` table. */
export function repoRows(): RepoRow[] {
  const list = state.repos.data ?? []
  const daemonRepos = state.status.data?.repos ?? []
  const rows = list.map<RepoRow>((repo) => {
    const extra = daemonRepos.find((row) => row.path === repo.path || row.repo === repo.name)
    return {
      name: repo.name,
      path: repo.path,
      workspace: extra?.workspace ?? "",
      branch: repo.branch ?? "",
      head: repo.head_commit ?? "",
      stale: repo.stale,
      indexed: repo.indexed,
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
    rows.push({
      name: row.repo,
      path: row.path,
      workspace: row.workspace,
      branch: "",
      head: "",
      stale: false,
      indexed: true,
      lastIndexed: "",
      files: row.files,
      nodes: row.nodes,
      edges: row.edges,
      size: row.total,
    })
  }

  const needle = state.filter.trim().toLowerCase()
  const filtered = needle
    ? rows.filter((row) => row.name.toLowerCase().includes(needle) || row.path.toLowerCase().includes(needle))
    : rows
  return filtered.sort((a, b) => b.nodes - a.nodes || a.name.localeCompare(b.name))
}

export function currentRepo(): RepoRow | null {
  const rows = repoRows()
  if (rows.length === 0) return null
  const index = Math.min(state.cursor.repos, rows.length - 1)
  return rows[index] ?? null
}

export function listLength(panel: PanelId): number {
  switch (panel) {
    case "repos":
      return repoRows().length
    case "workspaces":
      return state.status.data?.workspaces.length ?? 0
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
// repo detail (lazy, per selection)
// ---------------------------------------------------------------------------

let detailToken = 0

export async function loadDetail(force = false): Promise<void> {
  const repo = currentRepo()
  if (!repo) {
    setState("detail", null)
    return
  }
  if (!force && state.detail?.path === repo.path) return

  const token = ++detailToken
  setState("detail", {
    path: repo.path,
    graph: { ...empty<GraphSummary>(), loading: true },
    index: { ...empty<IndexHealth>(), loading: true },
  })

  const apply = <K extends "graph" | "index">(key: K, data: unknown, error: string | null) => {
    if (token !== detailToken) return
    setState(
      produce((draft) => {
        if (!draft.detail || draft.detail.path !== repo.path) return
        const slot = draft.detail[key] as Async<unknown>
        slot.loading = false
        slot.data = data as never
        slot.error = error
        if (!error) slot.at = Date.now()
      }),
    )
  }

  await Promise.all([
    gortex
      .graphSummary(repo.path)
      .then((data) => apply("graph", data, null))
      .catch((error: unknown) => apply("graph", null, error instanceof Error ? error.message : String(error))),
    gortex
      .indexHealth(repo.path)
      .then((data) => apply("index", data, null))
      .catch((error: unknown) => apply("index", null, error instanceof Error ? error.message : String(error))),
  ])
}

// ---------------------------------------------------------------------------
// navigation
// ---------------------------------------------------------------------------

export function selectPanel(panel: PanelId): void {
  setState({ panel, focus: "side", filter: "" })
  if (panel === "savings" && !state.savings.data) void refresh.savings()
  if (panel === "logs" && !state.logs.data) void refresh.logs()
  if (panel === "repos") void loadDetail()
}

export function cyclePanel(delta: number): void {
  const index = PANELS.indexOf(state.panel)
  const next = PANELS[(index + delta + PANELS.length) % PANELS.length]!
  selectPanel(next)
}

export function moveCursor(delta: number): void {
  const panel = state.panel
  const length = listLength(panel)
  if (length === 0) return
  const next = Math.max(0, Math.min(length - 1, state.cursor[panel] + delta))
  setState("cursor", panel, next)
  if (panel === "repos") void loadDetail()
}

export function jumpCursor(position: "top" | "bottom"): void {
  const panel = state.panel
  const length = listLength(panel)
  if (length === 0) return
  setState("cursor", panel, position === "top" ? 0 : length - 1)
  if (panel === "repos") void loadDetail()
}

// ---------------------------------------------------------------------------
// commands
// ---------------------------------------------------------------------------

/** Run a mutating gortex command with a busy indicator and a result message. */
export async function command(label: string, action: () => Promise<gortexResult>): Promise<void> {
  if (state.busy) {
    notify("error", `busy: ${state.busy} is still running`)
    return
  }
  setState("busy", label)
  notify("info", `${label}…`)
  try {
    const result = await action()
    if (result.ok) {
      notify("success", `${label} ok (${Math.round(result.ms)}ms)`)
    } else {
      notify("error", `${label}: ${errorMessage(result.stderr, result.stdout)}`)
    }
  } catch (error) {
    notify("error", `${label}: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    setState("busy", null)
    await refresh.all()
    if (state.panel === "repos") await loadDetail(true)
  }
}

type gortexResult = Awaited<ReturnType<typeof gortex.track>>

export const actions = {
  daemonStart: () => command("daemon start", gortex.daemon.start),
  daemonStop: () => command("daemon stop", gortex.daemon.stop),
  daemonRestart: () => command("daemon restart", gortex.daemon.restart),
  daemonReload: () => command("daemon reload", gortex.daemon.reload),
  track: (path: string) => command(`track ${path}`, () => gortex.track(path)),
  untrack: (path: string) => command(`untrack ${path}`, () => gortex.untrack(path)),
  enrich: (kind: EnrichKind, path: string) => command(`enrich ${kind}`, () => gortex.enrich(kind, path)),
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
  ]
  return () => timers.forEach(clearInterval)
}
