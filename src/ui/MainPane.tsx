/**
 * The right-hand detail pane. Each panel gets its own view; all of them are
 * plain text rows inside one scrollbox that the keymap drives.
 */

import { For, Show, createMemo, onMount, type Accessor } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core"
import {
  currentProject,
  currentRepo,
  currentWorkspace,
  repoGraph,
  repoRows,
  setState,
  state,
  PANEL_TITLES,
  type ProjectRow,
  type RepoRow,
} from "../state/store.ts"
import type { DaemonSession, IndexHealth } from "../gortex/types.ts"
import { setScroller } from "./keymap.ts"
import { c, Row } from "./Row.tsx"
import { Table } from "./Table.tsx"
import { FRESHNESS, SIDE_WIDTH } from "./SidePanel.tsx"
import {
  ageColor,
  branchColor,
  faultColor,
  flagColor,
  logColor,
  magnitudeColor,
  scoreColor,
  shareColor,
  stateColor,
  uptimeColor,
  LEVEL_COLOR,
} from "./semantics.ts"
import { bar, glyph, humanCount, relativeTime, shortPath, theme, truncate } from "./theme.ts"

/** Characters the detail pane can give a table. */
function usePaneWidth(): () => number {
  const dimensions = useTerminalDimensions()
  return () => Math.max(24, dimensions().width - SIDE_WIDTH - 6)
}

function Section(props: { title: string }) {
  return (
    <text fg={theme.accent} attributes={TextAttributes.BOLD}>
      {`── ${props.title} `}
    </text>
  )
}

function KV(props: { k: string; v: string | number | undefined; fg?: string }) {
  const missing = () => props.v === undefined || props.v === ""
  const value = () => (missing() ? "—" : String(props.v))
  return (
    <Row parts={[c(theme.dim, props.k.padEnd(16)), c(missing() ? theme.dim : (props.fg ?? theme.text), value())]} />
  )
}

function Blank() {
  return <text> </text>
}

function topEntries(map: unknown, limit: number): Array<[string, number]> {
  if (!map || typeof map !== "object") return []
  return Object.entries(map as Record<string, number>)
    .filter(([, count]) => typeof count === "number" && count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
}

function Bars(props: { entries: Array<[string, number]>; width?: number }) {
  const max = () => Math.max(1, ...props.entries.map(([, count]) => count))
  return (
    <For each={props.entries}>
      {([label, count]) => (
        <Row
          parts={[
            c(theme.muted, truncate(label, 14).padEnd(15)),
            c(theme.info, bar((count / max()) * 100, props.width ?? 18)),
            c(theme.text, ` ${humanCount(count)}`),
          ]}
        />
      )}
    </For>
  )
}

function ErrorLine(props: { error: string | null | undefined }) {
  return (
    <Show when={props.error}>
      <text fg={theme.error}>{`${glyph.bad} ${props.error}`}</text>
    </Show>
  )
}

function Loading(props: { when: boolean; children: unknown }) {
  return (
    <Show when={!props.when} fallback={<text fg={theme.dim}>loading…</text>}>
      {props.children as never}
    </Show>
  )
}

// ---------------------------------------------------------------------------
// repos
// ---------------------------------------------------------------------------

/** The largest value across every tracked repo, for magnitude colouring. */
function maxOf(pick: (repo: RepoRow) => number): number {
  return repoRows({ filtered: false }).reduce((max, repo) => Math.max(max, pick(repo)), 0)
}

function ReposDetail() {
  const paneWidth = usePaneWidth()
  const repo = createMemo(() => currentRepo())
  const graph = () => (repo() ? repoGraph(repo()!.name) : null)

  return (
    <Show when={repo()} fallback={<text fg={theme.dim}>no repository selected</text>}>
      {(row: Accessor<RepoRow>) => (
        <box style={{ flexDirection: "column" }}>
          <Section title={row().name} />
          <KV k="path" v={shortPath(row().path)} />
          <KV k="workspace" v={row().project ? `${row().workspace}/${row().project}` : row().workspace} />
          <KV k="branch" v={row().branch} fg={branchColor(row().branch)} />
          <KV k="head" v={row().head ? row().head.slice(0, 12) : ""} fg={theme.dim} />
          <Row
            parts={[
              c(theme.dim, "freshness".padEnd(16)),
              c(FRESHNESS[row().freshness].fg, `${FRESHNESS[row().freshness].mark} ${row().freshness}`),
              c(theme.dim, ` — ${FRESHNESS[row().freshness].label}`),
            ]}
          />
          <Show when={row().freshness === "stale"}>
            <Row parts={[c(theme.dim, "".padEnd(16)), c(theme.muted, "press R to re-index it now")]} />
          </Show>
          <KV k="last indexed" v={relativeTime(row().lastIndexed)} fg={ageColor(row().lastIndexed)} />
          <Blank />

          <Section title="index size" />
          <Table
            width={paneWidth()}
            columns={[
              { header: "files", align: "right" },
              { header: "nodes", align: "right" },
              { header: "edges", align: "right" },
              { header: "on disk", align: "right" },
            ]}
            rows={[
              [
                {
                  text: humanCount(row().files),
                  fg: magnitudeColor(
                    row().files,
                    maxOf((repo) => repo.files),
                  ),
                },
                {
                  text: humanCount(row().nodes),
                  fg: magnitudeColor(
                    row().nodes,
                    maxOf((repo) => repo.nodes),
                  ),
                },
                {
                  text: humanCount(row().edges),
                  fg: magnitudeColor(
                    row().edges,
                    maxOf((repo) => repo.edges),
                  ),
                },
                { text: row().size || "—", fg: theme.dim },
              ],
            ]}
          />
          <Blank />

          <Section title="graph" />
          <ErrorLine error={state.graph.error} />
          <Loading when={state.graph.loading && !state.graph.data}>
            <Show when={graph()} fallback={<text fg={theme.dim}>no per-repo breakdown for this repo</text>}>
              <text fg={theme.muted}>by kind</text>
              <Bars entries={topEntries(graph()?.by_kind, 8)} />
              <Blank />
              <text fg={theme.muted}>by language</text>
              <Bars entries={topEntries(graph()?.by_language, 8)} />
            </Show>
          </Loading>
        </box>
      )}
    </Show>
  )
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// projects
// ---------------------------------------------------------------------------

function ProjectsDetail() {
  const paneWidth = usePaneWidth()
  const project = createMemo(() => currentProject())

  return (
    <Show when={project()} fallback={<text fg={theme.dim}>no project</text>}>
      {(row: Accessor<ProjectRow>) => (
        <box style={{ flexDirection: "column" }}>
          <Section title={`${row().project}`} />
          <KV k="workspace" v={row().workspace} />
          <KV k="declared in" v={row().sources.join(", ")} />
          <KV k="repos" v={row().members.length} />
          <KV k="files" v={humanCount(row().files)} />
          <KV k="nodes" v={humanCount(row().nodes)} />
          <KV k="edges" v={humanCount(row().edges)} />
          <Blank />

          <Section title="members" />
          <Table
            width={paneWidth()}
            columns={[
              { header: "repo" },
              { header: "branch" },
              { header: "files", align: "right" },
              { header: "nodes", align: "right" },
              { header: "path", max: 40 },
            ]}
            rows={row().members.map((member) => [
              { text: `${FRESHNESS[member.freshness].mark} ${member.name}`, fg: FRESHNESS[member.freshness].fg },
              { text: member.branch || "—", fg: branchColor(member.branch) },
              {
                text: humanCount(member.files),
                fg: magnitudeColor(
                  member.files,
                  maxOf((repo) => repo.files),
                ),
              },
              {
                text: humanCount(member.nodes),
                fg: magnitudeColor(
                  member.nodes,
                  maxOf((repo) => repo.nodes),
                ),
              },
              { text: shortPath(member.path), fg: theme.muted },
            ])}
          />
          <Blank />
          <Show when={row().members.length > 1}>
            <text fg={theme.muted}>These repos share one project slug, so the graph treats them as one unit.</text>
          </Show>
          <text fg={theme.muted}>Press W on a repo to move it to another workspace/project.</text>
        </box>
      )}
    </Show>
  )
}

// workspaces
// ---------------------------------------------------------------------------

function WorkspacesDetail() {
  const paneWidth = usePaneWidth()
  const name = createMemo(() => currentWorkspace())
  const workspace = () => (state.status.data?.workspaces ?? []).find((row) => row.workspace === name())
  const declarations = () => (state.declarations.data ?? []).filter((row) => row.workspace === name())

  return (
    <Show when={name()} fallback={<text fg={theme.dim}>no workspace</text>}>
      {(slug: Accessor<string>) => (
        <box style={{ flexDirection: "column" }}>
          <Section title={slug()} />
          <KV k="repos" v={workspace()?.repos} />
          <KV k="projects" v={workspace()?.projects} />
          <KV k="files" v={humanCount(workspace()?.files ?? 0)} />
          <KV k="nodes" v={humanCount(workspace()?.nodes ?? 0)} />
          <KV k="edges" v={humanCount(workspace()?.edges ?? 0)} />
          <Blank />

          <Section title="declarations" />
          <ErrorLine error={state.declarations.error} />
          <Table
            width={paneWidth()}
            columns={[
              { header: "repo" },
              { header: "project" },
              { header: "declared in" },
              { header: "path", max: 44 },
            ]}
            rows={declarations().map((row) => [
              { text: row.repo, fg: theme.text },
              { text: row.project, fg: theme.info },
              { text: row.source, fg: theme.muted },
              { text: shortPath(row.path), fg: theme.dim },
            ])}
          />

          <Blank />
          <text fg={theme.muted}>Repos sharing a slug share one graph boundary.</text>
          <text fg={theme.muted}>Press W on a repo to change its slug.</text>
        </box>
      )}
    </Show>
  )
}

// ---------------------------------------------------------------------------
// sessions / savings / daemon / logs
// ---------------------------------------------------------------------------

/** Does a session's cwd sit inside a repo the daemon indexes? */
function tracked(cwd: string): boolean {
  return repoRows({ filtered: false }).some((repo) => cwd === repo.path || cwd.startsWith(`${repo.path}/`))
}

function SessionsDetail() {
  const paneWidth = usePaneWidth()
  const sessions = () => state.status.data?.mcpSessions ?? []
  const session = () => sessions()[Math.min(state.cursor.sessions, Math.max(0, sessions().length - 1))]

  return (
    <Show when={session()} fallback={<text fg={theme.dim}>no MCP client connected</text>}>
      {(row: Accessor<DaemonSession>) => (
        <box style={{ flexDirection: "column" }}>
          <Section title={row().client} />
          <KV k="id" v={row().id} />
          <KV k="version" v={row().version} />
          <KV k="connected" v={row().connected} fg={uptimeColor(row().connected)} />
          <KV k="cwd" v={shortPath(row().cwd)} fg={tracked(row().cwd) ? theme.ok : theme.warn} />
          <Show when={!tracked(row().cwd)}>
            <Row
              parts={[c(theme.dim, "".padEnd(16)), c(theme.muted, "this directory is not part of a tracked repo")]}
            />
          </Show>
          <Blank />
          <Section title={`all sessions (${sessions().length})`} />
          <Table
            width={paneWidth()}
            columns={[
              { header: "client" },
              { header: "version" },
              { header: "connected", align: "right" },
              { header: "cwd", max: 46 },
            ]}
            rows={sessions().map((other) => [
              { text: other.client, fg: other.id === row().id ? theme.text : theme.muted },
              { text: other.version, fg: theme.dim },
              { text: other.connected, fg: uptimeColor(other.connected) },
              { text: shortPath(other.cwd), fg: tracked(other.cwd) ? theme.muted : theme.warn },
            ])}
            highlight={(index) => (sessions()[index]?.id === row().id ? theme.selectionBg : undefined)}
          />
        </box>
      )}
    </Show>
  )
}

function SavingsDetail() {
  const paneWidth = usePaneWidth()
  const savings = () => state.savings.data
  return (
    <box style={{ flexDirection: "column" }}>
      <ErrorLine error={state.savings.error} />
      <Show when={savings()} fallback={<text fg={theme.dim}>loading…</text>}>
        <Section title="token savings" />
        <Table
          width={paneWidth()}
          columns={[
            { header: "window" },
            { header: "share" },
            { header: "saved", align: "right" },
            { header: "of", align: "right" },
            { header: "cost avoided", align: "right" },
          ]}
          rows={(savings()?.buckets ?? []).map((bucket) => [
            { text: bucket.label, fg: theme.text },
            {
              text: `${bar(bucket.percent, 14)} ${String(bucket.percent).padStart(5)}%`,
              fg: shareColor(bucket.percent),
            },
            { text: humanCount(bucket.saved), fg: theme.text },
            { text: humanCount(bucket.total), fg: theme.dim },
            { text: `$${bucket.usd}`, fg: theme.accent },
          ])}
        />
        <Blank />

        <Section title="dashboard" />
        <For each={(savings()?.text ?? "").split("\n").slice(3)}>
          {(row) => <text fg={theme.muted}>{row || " "}</text>}
        </For>
      </Show>
    </box>
  )
}

/** `alloc=39.9 MiB sys=384.4 MiB gc=391` -> [["alloc", "39.9 MiB"], …] */
function runtimePairs(runtime: string | undefined): Array<[string, string]> {
  if (!runtime) return []
  const pairs: Array<[string, string]> = []
  for (const match of runtime.matchAll(/(\w+)=(.*?)(?=\s+\w+=|$)/g)) {
    pairs.push([match[1] ?? "", (match[2] ?? "").trim()])
  }
  return pairs
}

function HealthSection(props: { health: IndexHealth }) {
  const score = () => Number(props.health["health_score"] ?? NaN)
  return (
    <box style={{ flexDirection: "column" }}>
      <KV k="health score" v={Number.isFinite(score()) ? String(score()) : "—"} fg={scoreColor(score())} />
      <KV k="indexed files" v={humanCount(Number(props.health["indexed_file_count"] ?? 0))} />
      <KV k="nodes/file" v={String(props.health["nodes_per_file"] ?? "—")} />
      <KV k="edges ok" v={String(props.health["edges_ok"] ?? "—")} fg={flagColor(props.health["edges_ok"])} />
      <KV
        k="regressions"
        v={String(props.health["resolution_regressions"] ?? "—")}
        fg={faultColor(props.health["resolution_regressions"])}
      />
      <KV k="learned tools" v={String(props.health["learned_tools"] ?? "—")} />
    </box>
  )
}

function DaemonDetail() {
  const paneWidth = usePaneWidth()
  const status = () => state.status.data
  // the ceiling a cell colours against does not depend on the cell, and maxOf
  // walks the whole repo list: computing it per cell made the table quadratic
  const maxFiles = createMemo(() => maxOf((row) => row.files))
  const maxNodes = createMemo(() => maxOf((row) => row.nodes))
  const maxEdges = createMemo(() => maxOf((row) => row.edges))
  const sum = (pick: (repo: { files: number; nodes: number; edges: number }) => number) =>
    humanCount((status()?.repos ?? []).reduce((total, repo) => total + pick(repo), 0))

  return (
    <box style={{ flexDirection: "column" }}>
      <ErrorLine error={state.status.error} />
      <Show
        when={status()?.running}
        fallback={
          <box style={{ flexDirection: "column" }}>
            <text fg={theme.error}>{`${glyph.bad} daemon not running`}</text>
            <Blank />
            <text fg={theme.muted}>Press s to start it, or run `gortex daemon start`.</text>
          </box>
        }
      >
        <Section title="daemon" />
        <KV k="version" v={status()?.version} />
        <KV k="pid" v={status()?.pid} />
        <KV k="state" v={status()?.state} fg={stateColor(status()?.state)} />
        <KV k="uptime" v={status()?.uptime} />
        <KV k="socket" v={status()?.socket} fg={theme.dim} />
        <KV k="sessions" v={status()?.sessions} />
        <KV k="memory" v={status()?.memory} />
        <Blank />
        <Section title="index" />
        <KV k="search" v={status()?.search} />
        <KV k="trigram" v={status()?.trigram} />
        <KV k="repos" v={status()?.repos.length} />
        <KV k="files" v={sum((repo) => repo.files)} />
        <KV k="nodes" v={sum((repo) => repo.nodes)} />
        <KV k="edges" v={sum((repo) => repo.edges)} />
        <Blank />
        <Section title="tracked repos" />
        <Table
          width={paneWidth()}
          columns={[
            { header: "repo" },
            { header: "workspace" },
            { header: "files", align: "right" },
            { header: "nodes", align: "right" },
            { header: "edges", align: "right" },
            { header: "on disk", align: "right" },
          ]}
          rows={(status()?.repos ?? []).map((repo) => [
            { text: repo.repo, fg: theme.text },
            { text: repo.workspace, fg: theme.info },
            { text: humanCount(repo.files), fg: magnitudeColor(repo.files, maxFiles()) },
            { text: humanCount(repo.nodes), fg: magnitudeColor(repo.nodes, maxNodes()) },
            { text: humanCount(repo.edges), fg: magnitudeColor(repo.edges, maxEdges()) },
            { text: repo.total, fg: theme.dim },
          ])}
        />
        <Blank />

        <Section title="index health" />
        <ErrorLine error={state.index.error} />
        <Loading when={state.index.loading && !state.index.data}>
          <Show when={state.index.data}>{(health: Accessor<IndexHealth>) => <HealthSection health={health()} />}</Show>
        </Loading>
        <Blank />
        <Section title="runtime" />
        <For each={runtimePairs(status()?.runtime)}>{([key, value]) => <KV k={key} v={value} />}</For>
      </Show>
    </box>
  )
}

interface LogLine {
  level: string
  time: string
  message: string
  caller: string
}

function parseLogLine(raw: string): LogLine {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const ts = typeof parsed["ts"] === "number" ? new Date((parsed["ts"] as number) * 1000) : null
    return {
      level: String(parsed["level"] ?? ""),
      time: ts ? ts.toTimeString().slice(0, 8) : "",
      message: String(parsed["msg"] ?? ""),
      caller: String(parsed["caller"] ?? ""),
    }
  } catch {
    return { level: "", time: "", message: raw, caller: "" }
  }
}

/**
 * How many log lines are rendered at once. The buffer runs to 5000 and a poll
 * replaces it every three seconds, so the view keeps the newest slice and says
 * what it left out. Windowing to the visible height instead would need the
 * scroll offset, which the scrollbox owns and does not report.
 */
export const LOG_WINDOW = 500

/** The newest `limit` entries, and how many older ones were left out. */
export function windowLines<T>(lines: T[], limit: number = LOG_WINDOW): { visible: T[]; hidden: number } {
  if (lines.length <= limit) return { visible: lines, hidden: 0 }
  return { visible: lines.slice(lines.length - limit), hidden: lines.length - limit }
}

function LogsDetail() {
  const view = createMemo(() => {
    const raw = (state.logs.data ?? []).filter((row) => row.trim().length > 0)
    const { visible, hidden } = windowLines(raw)
    return { lines: visible.map(parseLogLine), hidden, total: raw.length }
  })
  return (
    <box style={{ flexDirection: "column" }}>
      <ErrorLine error={state.logs.error} />
      <Show when={view().total === 0}>
        <text fg={theme.dim}>{state.logs.loading ? "loading…" : "no log lines"}</text>
      </Show>
      <Show when={view().hidden > 0}>
        <text fg={theme.dim}>{`… ${view().hidden} older of ${view().total} buffered lines not shown`}</text>
      </Show>
      <For each={view().lines}>
        {(row) => (
          <Row
            parts={[
              row.time && c(theme.dim, `${row.time} `),
              row.level && c(LEVEL_COLOR[row.level] ?? theme.muted, row.level.padEnd(6)),
              c(logColor(row.level), row.message),
              row.caller && c(theme.dim, `  ${row.caller}`),
            ]}
          />
        )}
      </For>
    </box>
  )
}

// ---------------------------------------------------------------------------

function paneTitle(): string {
  switch (state.panel) {
    case "repos": {
      const repo = currentRepo()
      return repo ? `${repo.name} ${glyph.bullet} ${shortPath(repo.path)}` : "Repos"
    }
    case "workspaces": {
      const workspace = currentWorkspace()
      return workspace ? `Workspace ${glyph.bullet} ${workspace}` : "Workspaces"
    }
    case "projects": {
      const project = currentProject()
      return project ? `Project ${glyph.bullet} ${project.project} (${project.workspace})` : "Projects"
    }

    case "logs":
      return `Daemon logs ${glyph.bullet} last ${state.logTail}`
    default:
      return PANEL_TITLES[state.panel]
  }
}

export function MainPane() {
  let scrollbox: ScrollBoxRenderable | undefined

  onMount(() => {
    setScroller((delta) => scrollbox?.scrollBy(delta))
  })

  return (
    <box
      title={` ${truncate(paneTitle(), 60)} `}
      titleColor={state.focus === "main" ? theme.borderFocus : theme.muted}
      border
      borderStyle="rounded"
      borderColor={state.focus === "main" ? theme.borderFocus : theme.border}
      onMouseDown={() => setState("focus", "main")}
      style={{ flexGrow: 1, flexDirection: "column", backgroundColor: theme.panel }}
    >
      <scrollbox
        ref={scrollbox}
        stickyScroll={state.panel === "logs"}
        stickyStart="bottom"
        style={{
          flexGrow: 1,
          paddingLeft: 1,
          paddingRight: 1,
          rootOptions: { backgroundColor: theme.panel },
          wrapperOptions: { backgroundColor: theme.panel },
          viewportOptions: { backgroundColor: theme.panel },
          contentOptions: { backgroundColor: theme.panel, flexDirection: "column" },
        }}
      >
        <Show when={state.panel === "repos"}>
          <ReposDetail />
        </Show>
        <Show when={state.panel === "projects"}>
          <ProjectsDetail />
        </Show>

        <Show when={state.panel === "workspaces"}>
          <WorkspacesDetail />
        </Show>
        <Show when={state.panel === "sessions"}>
          <SessionsDetail />
        </Show>
        <Show when={state.panel === "savings"}>
          <SavingsDetail />
        </Show>
        <Show when={state.panel === "daemon"}>
          <DaemonDetail />
        </Show>
        <Show when={state.panel === "logs"}>
          <LogsDetail />
        </Show>
      </scrollbox>
    </box>
  )
}
