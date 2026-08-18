/**
 * The right-hand detail pane. Each panel gets its own view; all of them are
 * plain text rows inside one scrollbox that the keymap drives.
 */

import { For, Show, createMemo, onMount, type Accessor } from "solid-js"
import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core"
import {
  currentKind,
  currentRepo,
  currentWorkspace,
  repoGraph,
  setState,
  state,
  PANEL_TITLES,
  type Analysis,
  type RepoRow,
} from "../state/store.ts"
import type { AnalyzeKind, DaemonSession, IndexHealth } from "../gortex/types.ts"
import { setScroller } from "./keymap.ts"
import { c, Row } from "./Row.tsx"
import { FRESHNESS } from "./SidePanel.tsx"
import { bar, glyph, humanCount, relativeTime, shortPath, theme, truncate } from "./theme.ts"

function Section(props: { title: string }) {
  return (
    <text fg={theme.accent} attributes={TextAttributes.BOLD}>
      {`── ${props.title} `}
    </text>
  )
}

function KV(props: { k: string; v: string | number | undefined; fg?: string }) {
  const value = () => (props.v === undefined || props.v === "" ? "—" : String(props.v))
  return <Row parts={[c(theme.dim, props.k.padEnd(16)), c(props.fg ?? theme.text, value())]} />
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

function ReposDetail() {
  const repo = createMemo(() => currentRepo())
  const graph = () => (repo() ? repoGraph(repo()!.name) : null)

  return (
    <Show when={repo()} fallback={<text fg={theme.dim}>no repository selected</text>}>
      {(row: Accessor<RepoRow>) => (
        <box style={{ flexDirection: "column" }}>
          <Section title={row().name} />
          <KV k="path" v={shortPath(row().path)} />
          <KV k="workspace" v={row().project ? `${row().workspace}/${row().project}` : row().workspace} />
          <KV k="branch" v={row().branch} />
          <KV k="head" v={row().head ? row().head.slice(0, 12) : ""} />
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
          <KV k="last indexed" v={relativeTime(row().lastIndexed)} />
          <Blank />

          <Section title="index size" />
          <KV k="files" v={humanCount(row().files)} />
          <KV k="nodes" v={humanCount(row().nodes)} />
          <KV k="edges" v={humanCount(row().edges)} />
          <KV k="on disk" v={row().size} />
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
// analyze
// ---------------------------------------------------------------------------

/** Pull the list out of an analyzer result: the first array-valued key wins. */
function resultRows(result: unknown): { key: string; rows: unknown[] } | null {
  if (Array.isArray(result)) return { key: "results", rows: result }
  if (!result || typeof result !== "object") return null
  for (const [key, value] of Object.entries(result as Record<string, unknown>)) {
    if (Array.isArray(value)) return { key, rows: value }
  }
  return null
}

/** One result row, rendered from whichever common fields it happens to carry. */
function describe(entry: unknown): string {
  if (entry === null || typeof entry !== "object") return String(entry)
  const row = entry as Record<string, unknown>
  const name = row["name"] ?? row["symbol"] ?? row["id"] ?? row["file"] ?? ""
  const where = row["file"] && row["file"] !== name ? ` ${String(row["file"])}` : ""
  const line = row["line"] ? `:${String(row["line"])}` : ""
  const extras = ["score", "count", "total", "pct", "severity", "tag", "text", "reason"]
    .filter((key) => row[key] !== undefined)
    .map((key) => `${key}=${String(row[key])}`)
    .join("  ")
  return `${String(name)}${where}${line}${extras ? `  ${extras}` : ""}`
}

function AnalysisView(props: { analysis: Analysis }) {
  const list = () => resultRows(props.analysis.result)
  const scalars = () => {
    const result = props.analysis.result
    if (!result || typeof result !== "object" || Array.isArray(result)) return []
    return Object.entries(result as Record<string, unknown>).filter(
      ([, value]) => value === null || typeof value !== "object",
    )
  }

  return (
    <box style={{ flexDirection: "column" }}>
      <Section title={`${props.analysis.kind} result`} />
      <For each={scalars()}>{([key, value]) => <KV k={key} v={String(value)} />}</For>
      <Blank />
      <Show when={list() && list()!.rows.length > 0} fallback={<text fg={theme.dim}>no rows returned</text>}>
        <text fg={theme.muted}>{`${list()!.key} (${list()!.rows.length})`}</text>
        <For each={list()!.rows}>
          {(entry, index) => (
            <Row parts={[c(theme.dim, `${String(index() + 1).padStart(3)}  `), c(theme.text, describe(entry))]} />
          )}
        </For>
      </Show>
    </box>
  )
}

function AnalyzeDetail() {
  const kind = createMemo(() => currentKind())
  return (
    <box style={{ flexDirection: "column" }}>
      <ErrorLine error={state.kinds.error} />
      <Show when={kind()} fallback={<text fg={theme.dim}>no analyzer selected</text>}>
        {(selected: Accessor<AnalyzeKind>) => (
          <box style={{ flexDirection: "column" }}>
            <Section title={selected().name} />
            <For each={wrap(selected().description, 70)}>{(row) => <text fg={theme.text}>{row}</text>}</For>
            <Show when={selected().writes}>
              <Blank />
              <text fg={theme.warn}>{`${glyph.stale} writes metadata into the graph — asks before running`}</text>
            </Show>
            <Blank />
            <text fg={theme.muted}>press a to run it · results cover the whole index, not just this repo</text>
            <Blank />
          </box>
        )}
      </Show>
      <ErrorLine error={state.analysis.error} />
      <Show when={state.analysis.data}>{(analysis: Accessor<Analysis>) => <AnalysisView analysis={analysis()} />}</Show>
    </box>
  )
}

/** Naive word wrap for description text. */
function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ""
  for (const word of words) {
    if (current.length + word.length + 1 > width) {
      lines.push(current)
      current = word
    } else {
      current = current ? `${current} ${word}` : word
    }
  }
  if (current) lines.push(current)
  return lines
}

// ---------------------------------------------------------------------------
// workspaces
// ---------------------------------------------------------------------------

function WorkspacesDetail() {
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
          <Row
            parts={[
              c(theme.dim, "repo".padEnd(14)),
              c(theme.dim, "project".padEnd(14)),
              c(theme.dim, "declared in".padEnd(16)),
              c(theme.dim, "path"),
            ]}
          />
          <For each={declarations()}>
            {(row) => (
              <Row
                parts={[
                  c(theme.text, truncate(row.repo, 13).padEnd(14)),
                  c(theme.info, truncate(row.project, 13).padEnd(14)),
                  c(theme.muted, truncate(row.source, 15).padEnd(16)),
                  c(theme.dim, shortPath(row.path)),
                ]}
              />
            )}
          </For>
          <Blank />
          <text fg={theme.muted}>Repos that declare the same workspace slug share one graph boundary; cross-repo</text>
          <text fg={theme.muted}>contract matching stops at it. Press W on a repo to change its slug.</text>
        </box>
      )}
    </Show>
  )
}

// ---------------------------------------------------------------------------
// sessions / savings / daemon / logs
// ---------------------------------------------------------------------------

function SessionsDetail() {
  const sessions = () => state.status.data?.mcpSessions ?? []
  const session = () => sessions()[Math.min(state.cursor.sessions, Math.max(0, sessions().length - 1))]

  return (
    <Show when={session()} fallback={<text fg={theme.dim}>no MCP client connected</text>}>
      {(row: Accessor<DaemonSession>) => (
        <box style={{ flexDirection: "column" }}>
          <Section title={row().client} />
          <KV k="id" v={row().id} />
          <KV k="version" v={row().version} />
          <KV k="connected" v={row().connected} />
          <KV k="cwd" v={shortPath(row().cwd)} />
          <Blank />
          <Section title={`all sessions (${sessions().length})`} />
          <For each={sessions()}>
            {(other) => (
              <text fg={other.id === row().id ? theme.text : theme.muted}>
                {`${other.client.padEnd(13)} ${other.connected.padEnd(8)} ${shortPath(other.cwd)}`}
              </text>
            )}
          </For>
        </box>
      )}
    </Show>
  )
}

function SavingsDetail() {
  const savings = () => state.savings.data
  return (
    <box style={{ flexDirection: "column" }}>
      <ErrorLine error={state.savings.error} />
      <Show when={savings()} fallback={<text fg={theme.dim}>loading…</text>}>
        <Section title="token savings" />
        <For each={savings()?.buckets ?? []}>
          {(bucket) => (
            <Row
              parts={[
                c(theme.muted, bucket.label.padEnd(13)),
                c(theme.ok, bar(bucket.percent)),
                c(theme.text, ` ${String(bucket.percent).padStart(5)}%  `),
                c(theme.dim, `${humanCount(bucket.saved)}/${humanCount(bucket.total)} tokens  $${bucket.usd}`),
              ]}
            />
          )}
        </For>
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
      <KV
        k="health score"
        v={Number.isFinite(score()) ? String(score()) : "—"}
        fg={score() >= 90 ? theme.ok : theme.warn}
      />
      <KV k="indexed files" v={humanCount(Number(props.health["indexed_file_count"] ?? 0))} />
      <KV k="nodes/file" v={String(props.health["nodes_per_file"] ?? "—")} />
      <KV k="edges ok" v={String(props.health["edges_ok"] ?? "—")} />
      <KV k="regressions" v={String(props.health["resolution_regressions"] ?? "—")} />
      <KV k="learned tools" v={String(props.health["learned_tools"] ?? "—")} />
    </box>
  )
}

function DaemonDetail() {
  const status = () => state.status.data
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
        <KV k="state" v={status()?.state} fg={theme.ok} />
        <KV k="uptime" v={status()?.uptime} />
        <KV k="socket" v={status()?.socket} />
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

const LEVEL_COLOR: Record<string, string> = {
  debug: theme.dim,
  info: theme.info,
  warn: theme.warn,
  error: theme.error,
  fatal: theme.error,
}

function LogsDetail() {
  const lines = () => (state.logs.data ?? []).filter((row) => row.trim().length > 0).map(parseLogLine)
  return (
    <box style={{ flexDirection: "column" }}>
      <ErrorLine error={state.logs.error} />
      <Show when={lines().length === 0}>
        <text fg={theme.dim}>{state.logs.loading ? "loading…" : "no log lines"}</text>
      </Show>
      <For each={lines()}>
        {(row) => (
          <Row
            parts={[
              row.time && c(theme.dim, `${row.time} `),
              row.level && c(LEVEL_COLOR[row.level] ?? theme.muted, row.level.padEnd(6)),
              c(theme.text, row.message),
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
    case "analyze": {
      const kind = currentKind()
      return kind ? `Analyze ${glyph.bullet} ${kind.name}` : "Analyze"
    }
    case "workspaces": {
      const workspace = currentWorkspace()
      return workspace ? `Workspace ${glyph.bullet} ${workspace}` : "Workspaces"
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
        <Show when={state.panel === "analyze"}>
          <AnalyzeDetail />
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
