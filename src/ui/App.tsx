/** Top-level layout, key routing and the polling lifecycle. */

import { ErrorBoundary, Show, createEffect, createMemo, onCleanup, onMount } from "solid-js"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid"
import type { KeyEvent } from "@opentui/core"
import {
  checkBinary,
  clearMessage,
  closeOverlay,
  listLength,
  PANELS,
  refresh,
  repoRows,
  restoreView,
  startPolling,
  state,
  setState,
} from "../state/store.ts"
import { handleKey, keyId } from "./keymap.ts"
import { stateColor } from "./semantics.ts"
import { MainPane } from "./MainPane.tsx"
import { Overlays } from "./Overlays.tsx"
import { SidePanel } from "./SidePanel.tsx"
import { Setup } from "./Setup.tsx"
import { StatusBar } from "./StatusBar.tsx"
import { c, Row } from "./Row.tsx"
import { glyph, theme, truncate } from "./theme.ts"

const HEADER_ROWS = 1
const STATUS_ROWS = 2
const BOXED_ROWS = 3
/** rows the focused panel needs before collapsing the others to bare headers */
const FOCUS_MIN_ROWS = 6

function Header(props: { width: number }) {
  const status = () => state.status.data
  const health = () => {
    if (state.binary.ok === false) return { mark: glyph.bad, text: "gortex not found", fg: theme.error }
    if (state.binary.ok === null) return { mark: glyph.warn, text: "starting…", fg: theme.dim }
    if (state.status.error && !status()) return { mark: glyph.bad, text: "unreachable", fg: theme.error }
    if (!status()) return { mark: glyph.warn, text: "connecting…", fg: theme.dim }
    if (!status()?.running) return { mark: glyph.bad, text: "stopped", fg: theme.error }
    return { mark: glyph.ok, text: status()?.state ?? "running", fg: stateColor(status()?.state) }
  }
  const stale = () => repoRows({ filtered: false }).filter((repo) => repo.freshness === "stale").length

  return (
    <box
      style={{
        height: HEADER_ROWS,
        flexDirection: "row",
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: theme.panelAlt,
        justifyContent: "space-between",
      }}
    >
      <Row
        parts={[
          c(theme.title, "lazygortex"),
          c(theme.dim, ` ${glyph.sep} `),
          c(health().fg, `${health().mark} daemon ${health().text}`),
          status()?.uptime ? c(theme.dim, ` ${glyph.bullet} up ${status()?.uptime}`) : "",
        ]}
      />
      <Row
        parts={[
          state.binary.ok !== true ? "" : c(stale() ? theme.warn : theme.muted, `${status()?.repos.length ?? 0} repos`),
          stale() ? c(theme.warn, ` (${stale()} stale)`) : "",
          state.binary.ok !== true ? "" : c(theme.dim, `  ${glyph.bullet}  `),
          state.binary.ok !== true ? "" : c(theme.muted, `${status()?.mcpSessions.length ?? 0} sessions`),
          state.binary.ok === true && status()?.version ? c(theme.dim, `  ${glyph.bullet}  ${status()?.version}`) : "",
        ]}
      />
    </box>
  )
}

/** Keys that belong to an open overlay never reach the panel keymap. */
function routeOverlayKey(key: KeyEvent): boolean {
  const overlay = state.overlay
  if (!overlay) return false
  const id = keyId(key)

  if (overlay.kind === "prompt") {
    // the focused <input> owns everything except escape
    if (id === "escape") closeOverlay()
    return true
  }

  if (id === "escape") {
    closeOverlay()
    return true
  }

  switch (overlay.kind) {
    case "help":
      if (id === "?" || id === "q" || id === "return") closeOverlay()
      return true
    case "confirm":
      if (id === "y" || id === "return") {
        closeOverlay()
        overlay.onConfirm()
      } else if (id === "n") {
        closeOverlay()
      }
      return true
    case "menu": {
      const index = Number(id) - 1
      const option = Number.isInteger(index) ? overlay.options[index] : undefined
      if (option) {
        closeOverlay()
        overlay.onPick(option.value)
      }
      return true
    }
  }
  return true
}

export function App() {
  const renderer = useRenderer()
  const dimensions = useTerminalDimensions()

  const sideRows = () => dimensions().height - HEADER_ROWS - STATUS_ROWS
  /** seven boxed panels do not fit a short terminal; collapse to headers then */
  const compact = createMemo(() => sideRows() - BOXED_ROWS * (PANELS.length - 1) < FOCUS_MIN_ROWS)
  const capacity = createMemo(() => {
    const others = compact() ? PANELS.length - 1 : BOXED_ROWS * (PANELS.length - 1)
    return Math.max(1, sideRows() - others - 3)
  })

  useKeyboard((key) => {
    if (state.binary.ok === false) {
      const id = keyId(key)
      if (id === "q" || id === "ctrl+c") setState("quitting", true)
      if (id === "r") void start()
      return
    }
    if (routeOverlayKey(key)) return
    if (state.message && Date.now() - state.message.at > 400) clearMessage()
    // A binding that opens a prompt mounts a focused <input> inside this very
    // dispatch, and opentui collects the renderable handlers *after* the global
    // ones have run — so the key that opened the prompt would be typed into it
    // (`/` filtering for `/needle`). preventDefault stops the second delivery;
    // keys meant for an open prompt never reach here, they leave above.
    if (handleKey(key)) key.preventDefault()
  })

  /** Probe the CLI first; every panel is meaningless without it. */
  async function start(): Promise<void> {
    if (!(await checkBinary())) return
    // the saved panel/selection can only be restored once the lists exist
    await refresh.fast()
    await restoreView()
    await refresh.all()
  }

  onMount(() => {
    void start()
    const stop = startPolling()
    onCleanup(stop)
  })

  createEffect(() => {
    if (!state.quitting) return
    renderer.destroy()
    // give the renderer a tick to restore the terminal before exiting
    setTimeout(() => process.exit(0), 10)
  })

  // keep the cursor inside the list when the underlying data shrinks
  createEffect(() => {
    const panel = state.panel
    const length = listLength(panel)
    const ceiling = Math.max(0, length - 1)
    if (state.cursor[panel] > ceiling) setState("cursor", panel, ceiling)
  })

  return (
    <box
      style={{
        width: "100%",
        height: "100%",
        // flexGrow keeps the layout full-screen even in the tick before the
        // renderer reports its size, when "100%" still resolves to nothing
        flexGrow: 1,
        flexDirection: "column",
        backgroundColor: theme.bg,
      }}
    >
      <Header width={dimensions().width} />
      <Show when={state.binary.ok !== false} fallback={<Setup />}>
        <ErrorBoundary
          fallback={(error: unknown) => (
            <box style={{ flexGrow: 1, flexDirection: "column", padding: 1 }}>
              <text fg={theme.error}>{`${glyph.bad} a panel failed to render`}</text>
              <text fg={theme.muted}>{error instanceof Error ? error.message : String(error)}</text>
              <text fg={theme.dim}>press q to quit, or report this at the issue tracker</text>
            </box>
          )}
        >
          <box style={{ flexGrow: 1, flexDirection: "row" }}>
            <SidePanel capacity={capacity()} compact={compact()} />
            <MainPane />
          </box>
        </ErrorBoundary>
      </Show>
      <StatusBar width={dimensions().width} />
      <Show when={state.overlay}>
        <Overlays />
      </Show>
    </box>
  )
}
