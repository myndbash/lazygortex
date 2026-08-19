/**
 * The lazydocker-style left column: every panel is always visible, the focused
 * one expands to fill the leftover height and shows its rows, the others
 * collapse to a summary line — or, when the terminal is too short for seven
 * boxes, to a single borderless header row.
 */

import { For, Show } from "solid-js"
import {
  cursorIndex,
  PANELS,
  projectRows,
  PANEL_TITLES,
  repoRows,
  selectPanel,
  setCursor,
  state,
  type Freshness,
  type PanelId,
} from "../state/store.ts"
import { c, Row, type Piece } from "./Row.tsx"
import { ageColor, magnitudeColor, shareColor, stateColor, uptimeColor } from "./semantics.ts"
import { displayWidth, glyph, humanCount, theme, truncate } from "./theme.ts"

export const SIDE_WIDTH = 38
const BOXED_HEIGHT = 3
const BARE_HEIGHT = 1
/** Rows the focused panel's box needs before its list has anywhere to go. */
export const FOCUSED_HEIGHT = 4

/** What a freshness mark means. Rendered as the Repos panel's bottom title. */
export const FRESHNESS: Record<Freshness, { mark: string; label: string; fg: string }> = {
  fresh: { mark: glyph.ok, label: "index matches HEAD", fg: theme.ok },
  stale: { mark: glyph.stale, label: "HEAD moved past the index", fg: theme.warn },
  unversioned: { mark: glyph.unversioned, label: "not a git repo — freshness unknown", fg: theme.info },
  unindexed: { mark: glyph.bad, label: "no index yet", fg: theme.error },
  unknown: { mark: glyph.warn, label: "the repo listing did not answer", fg: theme.dim },
}

/** Kept short on purpose: a bottom title longer than the box is dropped. */
export const FRESHNESS_LEGEND = ` ${FRESHNESS.fresh.mark} ok ${FRESHNESS.stale.mark} stale ${FRESHNESS.unversioned.mark} no git ${FRESHNESS.unindexed.mark} none `

export interface PanelRow {
  /** left-hand label */
  text: string
  /** right-aligned suffix */
  meta?: string
  fg?: string
  /** colour for the suffix; defaults to a quiet grey */
  metaFg?: string
}

export function panelRows(panel: PanelId): PanelRow[] {
  switch (panel) {
    case "repos": {
      const rows = repoRows()
      const biggest = rows.reduce((max, row) => Math.max(max, row.nodes), 0)
      return rows.map((row) => {
        const mark = FRESHNESS[row.freshness]
        return {
          text: `${mark.mark} ${row.name}`,
          meta: row.nodes ? humanCount(row.nodes) : "—",
          fg: mark.fg,
          metaFg: magnitudeColor(row.nodes, biggest),
        }
      })
    }
    case "workspaces":
      return (state.status.data?.workspaces ?? []).map((workspace) => ({
        text: workspace.workspace,
        meta: `${workspace.repos} repos`,
      }))
    case "projects": {
      const projects = projectRows()
      const biggest = projects.reduce((max, project) => Math.max(max, project.nodes), 0)
      return projects.map((project) => ({
        text: project.project,
        meta: `${project.members.length} repo${project.members.length === 1 ? "" : "s"}`,
        fg: project.members.length > 1 ? theme.info : theme.text,
        metaFg: magnitudeColor(project.nodes, biggest),
      }))
    }
    case "sessions":
      return (state.status.data?.mcpSessions ?? []).map((session) => ({
        text: `${session.client} ${session.version}`,
        meta: session.connected,
        metaFg: uptimeColor(session.connected),
      }))
    case "savings":
      return (state.savings.data?.buckets ?? []).map((bucket) => ({
        text: bucket.label,
        meta: `${bucket.percent}%`,
        metaFg: shareColor(bucket.percent),
      }))
    case "daemon": {
      const status = state.status.data
      if (!status) return [{ text: state.status.error ?? "loading…", fg: theme.dim }]
      return status.fields.map(([key, value]) => ({ text: key, meta: truncate(value, 22) }))
    }
    case "logs":
      return [{ text: `tail ${state.logTail}`, meta: `${state.logs.data?.length ?? 0} lines` }]
  }
}

function summary(panel: PanelId): { text: string; fg: string } {
  switch (panel) {
    case "repos": {
      const rows = repoRows()
      const stale = rows.filter((row) => row.freshness === "stale").length
      const newest = rows.reduce((latest, row) => (row.lastIndexed > latest ? row.lastIndexed : latest), "")
      // with a filter on, `N tracked` would be a count of the view reported as a
      // count of the daemon; say both numbers instead
      const needle = state.filter.repos.trim()
      const count = needle
        ? `${rows.length} of ${repoRows({ filtered: false }).length} tracked`
        : `${rows.length} tracked`
      return {
        text: `${count}${stale ? ` ${glyph.bullet} ${stale} stale` : ""}`,
        fg: stale ? theme.warn : ageColor(newest),
      }
    }
    case "workspaces":
      return { text: `${state.status.data?.workspaces.length ?? 0} workspaces`, fg: theme.muted }
    case "projects": {
      const projects = projectRows()
      const shared = projects.filter((project) => project.members.length > 1).length
      return {
        text: `${projects.length} projects${shared ? ` ${glyph.bullet} ${shared} multi-repo` : ""}`,
        fg: theme.muted,
      }
    }
    case "sessions":
      return { text: `${state.status.data?.mcpSessions.length ?? 0} connected`, fg: theme.muted }
    case "savings": {
      const all = state.savings.data?.buckets.find((bucket) => bucket.label === "All time")
      if (!all) return { text: state.savings.data ? "no data" : "loading…", fg: theme.dim }
      return { text: `${all.percent}% saved ${glyph.bullet} $${all.usd}`, fg: theme.ok }
    }
    case "daemon": {
      const status = state.status.data
      if (state.status.error && !status) return { text: state.status.error, fg: theme.error }
      if (!status) return { text: "loading…", fg: theme.dim }
      if (!status.running) return { text: truncate(status.reason ?? "stopped", SIDE_WIDTH - 6), fg: theme.error }
      return {
        text: `${status.state ?? "running"} ${glyph.bullet} ${status.uptime ?? ""}`,
        fg: stateColor(status.state),
      }
    }
    case "logs":
      return { text: `${state.logs.data?.length ?? 0} lines buffered`, fg: theme.muted }
  }
}

function rowParts(row: PanelRow, width: number, selected: boolean): Piece[] {
  const meta = row.meta ?? ""
  // columns, not code units: a CJK repo name is twice as wide as its length
  const label = truncate(row.text, Math.max(4, width - displayWidth(meta) - 1))
  const pad = " ".repeat(Math.max(1, width - displayWidth(label) - displayWidth(meta)))
  const fg = selected ? theme.selectionFg : (row.fg ?? theme.text)
  const metaFg = selected ? theme.selectionFg : (row.metaFg ?? theme.dim)
  return [c(fg, label), c(theme.dim, pad), c(metaFg, meta)]
}

/** The highlight lives on the row, because a text node ignores `bg`. */
function rowBackground(selected: boolean, active: boolean): string | undefined {
  if (!selected) return undefined
  return active ? theme.activeSelectionBg : theme.selectionBg
}

/** An empty list because a filter excluded everything reads very differently. */
function emptyLabel(panel: PanelId): string {
  const needle = state.filter[panel].trim()
  if (needle) return `no match for /${needle}`
  return state.status.loading ? "loading…" : "nothing here"
}

function PanelList(props: { panel: PanelId; capacity: number }) {
  const rows = () => panelRows(props.panel)
  const cursor = () => cursorIndex(props.panel)
  // keep the cursor inside the window without tracking scroll state separately
  const start = () => {
    const capacity = Math.max(1, props.capacity)
    const total = rows().length
    if (total <= capacity) return 0
    return Math.max(0, Math.min(total - capacity, cursor() - Math.floor(capacity / 2)))
  }
  const visible = () => rows().slice(start(), start() + Math.max(1, props.capacity))
  /**
   * What is off-screen in each direction. The old line subtracted a `start()`
   * already clamped to the bottom, so it read `0 more` for the whole of the
   * bottom of every list.
   */
  const overflow = () => {
    const above = start()
    const below = rows().length - start() - visible().length
    const parts = [above > 0 ? `${glyph.up} ${above}` : "", below > 0 ? `${glyph.down} ${below} more` : ""]
    return parts.filter(Boolean).join("  ")
  }

  return (
    <box style={{ flexDirection: "column", flexGrow: 1 }}>
      <Show when={rows().length === 0}>
        <text fg={theme.dim}>{emptyLabel(props.panel)}</text>
      </Show>
      <For each={visible()}>
        {(row, index) => {
          const absolute = () => start() + index()
          return (
            <box
              style={{ height: 1, flexShrink: 0 }}
              onMouseDown={() => {
                selectPanel(props.panel)
                setCursor(props.panel, absolute())
              }}
            >
              <Row
                parts={rowParts(row, SIDE_WIDTH - 4, absolute() === cursor())}
                bg={rowBackground(absolute() === cursor(), state.focus === "side")}
              />
            </box>
          )
        }}
      </For>
      <Show when={overflow() !== ""}>
        <text fg={theme.dim}>{overflow()}</text>
      </Show>
    </box>
  )
}

export function SidePanel(props: { capacity: number; compact: boolean; panels: PanelId[]; hidden: number }) {
  return (
    <box style={{ width: SIDE_WIDTH, flexDirection: "column", flexShrink: 0 }}>
      <For each={props.panels}>
        {(panel) => {
          const focused = () => state.panel === panel
          const info = () => summary(panel)
          // the digit is the panel's own number, which stays put even when the
          // roster shows a window into the list
          const index = () => PANELS.indexOf(panel)
          // an accessor, not a constant: the filter suffix has to appear and
          // disappear with state.filter
          const title = () => {
            const needle = state.filter[panel].trim()
            return `${index() + 1} ${PANEL_TITLES[panel]}${needle ? ` /${needle}` : ""}`
          }

          return (
            <Show
              when={focused() || !props.compact}
              fallback={
                <box style={{ height: BARE_HEIGHT, flexShrink: 0 }} onMouseDown={() => selectPanel(panel)}>
                  <Row
                    parts={[
                      c(theme.muted, ` ${title().padEnd(15)}`),
                      c(info().fg, truncate(info().text, SIDE_WIDTH - 18)),
                    ]}
                  />
                </box>
              }
            >
              <box
                title={` ${title()} `}
                titleColor={focused() ? theme.borderFocus : theme.muted}
                bottomTitle={focused() && panel === "repos" ? FRESHNESS_LEGEND : undefined}
                bottomTitleAlignment="center"
                border
                borderStyle="rounded"
                borderColor={focused() ? theme.borderFocus : theme.border}
                onMouseDown={() => selectPanel(panel)}
                style={{
                  flexDirection: "column",
                  backgroundColor: theme.panel,
                  paddingLeft: 1,
                  paddingRight: 1,
                  flexGrow: focused() ? 1 : 0,
                  flexShrink: focused() ? 1 : 0,
                  height: focused() ? undefined : BOXED_HEIGHT,
                  minHeight: focused() ? FOCUSED_HEIGHT : BOXED_HEIGHT,
                }}
              >
                <Show when={focused()} fallback={<text fg={info().fg}>{truncate(info().text, SIDE_WIDTH - 4)}</text>}>
                  <PanelList panel={panel} capacity={props.capacity} />
                </Show>
              </box>
            </Show>
          )
        }}
      </For>
      <Show when={props.hidden > 0}>
        <text fg={theme.dim}>{` ${glyph.down} ${props.hidden} more panels · press their digit`}</text>
      </Show>
    </box>
  )
}
