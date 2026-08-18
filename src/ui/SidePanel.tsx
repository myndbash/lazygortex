/**
 * The lazydocker-style left column: every panel is always visible, the focused
 * one expands to fill the leftover height and shows its rows, the others
 * collapse to a single summary line.
 */

import { For, Show } from "solid-js"
import { PANELS, PANEL_TITLES, repoRows, state, type PanelId } from "../state/store.ts"
import { glyph, humanCount, shortPath, theme, truncate } from "./theme.ts"

export const SIDE_WIDTH = 38
const COLLAPSED_HEIGHT = 3

export interface Row {
  /** left-hand label */
  text: string
  /** right-aligned suffix, dimmed */
  meta?: string
  fg?: string
}

function repoGlyph(row: { stale: boolean; indexed: boolean }): { mark: string; fg: string } {
  if (!row.indexed) return { mark: glyph.bad, fg: theme.error }
  if (row.stale) return { mark: glyph.stale, fg: theme.warn }
  return { mark: glyph.ok, fg: theme.ok }
}

export function panelRows(panel: PanelId): Row[] {
  switch (panel) {
    case "daemon": {
      const status = state.status.data
      if (!status) return [{ text: state.status.error ?? "loading…", fg: theme.dim }]
      return status.fields.map(([key, value]) => ({
        text: key,
        meta: truncate(value, 22),
      }))
    }
    case "repos":
      return repoRows().map((row) => {
        const mark = repoGlyph(row)
        return {
          text: `${mark.mark} ${row.name}`,
          meta: row.nodes ? humanCount(row.nodes) : "—",
          fg: mark.fg,
        }
      })
    case "workspaces":
      return (state.status.data?.workspaces ?? []).map((workspace) => ({
        text: workspace.workspace,
        meta: `${workspace.repos} repos`,
      }))
    case "sessions":
      return (state.status.data?.mcpSessions ?? []).map((session) => ({
        text: `${session.client} ${session.version}`,
        meta: session.connected,
      }))
    case "savings":
      return (state.savings.data?.buckets ?? []).map((bucket) => ({
        text: bucket.label,
        meta: `${bucket.percent}%`,
      }))
    case "logs":
      return [{ text: `tail ${state.logTail}`, meta: `${state.logs.data?.length ?? 0} lines` }]
  }
}

function summary(panel: PanelId): { text: string; fg: string } {
  switch (panel) {
    case "daemon": {
      const status = state.status.data
      if (state.status.error && !status) return { text: state.status.error, fg: theme.error }
      if (!status) return { text: "loading…", fg: theme.dim }
      if (!status.running) return { text: "stopped", fg: theme.error }
      return { text: `${status.state ?? "running"} ${glyph.bullet} ${status.uptime ?? ""}`, fg: theme.ok }
    }
    case "repos": {
      const rows = repoRows()
      const stale = rows.filter((row) => row.stale).length
      return {
        text: `${rows.length} tracked${stale ? ` ${glyph.bullet} ${stale} stale` : ""}`,
        fg: stale ? theme.warn : theme.muted,
      }
    }
    case "workspaces": {
      const workspaces = state.status.data?.workspaces ?? []
      return { text: `${workspaces.length} workspaces`, fg: theme.muted }
    }
    case "sessions": {
      const sessions = state.status.data?.mcpSessions ?? []
      return { text: `${sessions.length} connected`, fg: theme.muted }
    }
    case "savings": {
      const all = state.savings.data?.buckets.find((bucket) => bucket.label === "All time")
      if (!all) return { text: state.savings.data ? "no data" : "loading…", fg: theme.dim }
      return { text: `${all.percent}% saved ${glyph.bullet} $${all.usd}`, fg: theme.ok }
    }
    case "logs":
      return { text: `${state.logs.data?.length ?? 0} lines buffered`, fg: theme.muted }
  }
}

function PanelList(props: { panel: PanelId; capacity: number }) {
  const rows = () => panelRows(props.panel)
  const cursor = () => Math.min(state.cursor[props.panel], Math.max(0, rows().length - 1))
  // keep the cursor inside the window without tracking scroll state separately
  const start = () => {
    const capacity = Math.max(1, props.capacity)
    const total = rows().length
    if (total <= capacity) return 0
    return Math.max(0, Math.min(total - capacity, cursor() - Math.floor(capacity / 2)))
  }
  const visible = () => rows().slice(start(), start() + Math.max(1, props.capacity))

  return (
    <box style={{ flexDirection: "column", flexGrow: 1 }}>
      <Show when={rows().length === 0}>
        <text fg={theme.dim}>{state.status.loading ? "loading…" : "nothing here"}</text>
      </Show>
      <For each={visible()}>
        {(row, index) => {
          const absolute = () => start() + index()
          const selected = () => absolute() === cursor()
          const width = SIDE_WIDTH - 4
          const meta = row.meta ?? ""
          const label = truncate(row.text, Math.max(4, width - meta.length - 1))
          const pad = " ".repeat(Math.max(1, width - label.length - meta.length))
          return (
            <text
              bg={selected() ? (state.focus === "side" ? theme.activeSelectionBg : theme.selectionBg) : undefined}
              fg={selected() ? theme.selectionFg : (row.fg ?? theme.text)}
              style={{ flexShrink: 0 }}
            >
              {label}
              {pad}
              {meta}
            </text>
          )
        }}
      </For>
      <Show when={rows().length > props.capacity}>
        <text fg={theme.dim}>
          {glyph.down} {rows().length - start() - Math.max(1, props.capacity)} more
        </text>
      </Show>
    </box>
  )
}

export function SidePanel(props: { capacity: number }) {
  return (
    <box style={{ width: SIDE_WIDTH, flexDirection: "column", flexShrink: 0 }}>
      <For each={PANELS}>
        {(panel, index) => {
          const focused = () => state.panel === panel
          const info = () => summary(panel)
          return (
            <box
              title={` ${index() + 1} ${PANEL_TITLES[panel]} `}
              titleColor={focused() ? theme.borderFocus : theme.muted}
              border
              borderStyle="rounded"
              borderColor={focused() ? theme.borderFocus : theme.border}
              style={{
                flexDirection: "column",
                backgroundColor: theme.panel,
                paddingLeft: 1,
                paddingRight: 1,
                flexGrow: focused() ? 1 : 0,
                flexShrink: focused() ? 1 : 0,
                height: focused() ? undefined : COLLAPSED_HEIGHT,
                minHeight: focused() ? 4 : COLLAPSED_HEIGHT,
              }}
            >
              <Show when={focused()} fallback={<text fg={info().fg}>{truncate(info().text, SIDE_WIDTH - 4)}</text>}>
                <PanelList panel={panel} capacity={props.capacity} />
              </Show>
            </box>
          )
        }}
      </For>
    </box>
  )
}
