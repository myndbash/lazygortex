/** Top-level layout, key routing and the polling lifecycle. */

import { Show, createEffect, createMemo, onCleanup, onMount } from "solid-js"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid"
import type { KeyEvent } from "@opentui/core"
import {
  clearMessage,
  closeOverlay,
  listLength,
  PANELS,
  refresh,
  restoreView,
  startPolling,
  state,
  setState,
} from "../state/store.ts"
import { handleKey, keyId } from "./keymap.ts"
import { MainPane } from "./MainPane.tsx"
import { Overlays } from "./Overlays.tsx"
import { SidePanel } from "./SidePanel.tsx"
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
    if (state.status.error && !status()) return { mark: glyph.bad, text: "unreachable", fg: theme.error }
    if (!status()) return { mark: glyph.warn, text: "connecting…", fg: theme.dim }
    if (!status()?.running) return { mark: glyph.bad, text: "stopped", fg: theme.error }
    return { mark: glyph.ok, text: status()?.state ?? "running", fg: theme.ok }
  }

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
      <text fg={theme.dim}>
        {truncate(
          `${status()?.repos.length ?? 0} repos ${glyph.bullet} ${status()?.mcpSessions.length ?? 0} sessions ${
            status()?.version ? `${glyph.bullet} ${status()?.version}` : ""
          }`,
          Math.max(10, Math.floor(props.width / 2)),
        )}
      </text>
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
    if (routeOverlayKey(key)) return
    if (state.message && Date.now() - state.message.at > 400) clearMessage()
    handleKey(key)
  })

  onMount(() => {
    // the saved panel/selection can only be restored once the lists exist
    void refresh
      .fast()
      .then(restoreView)
      .then(() => refresh.all())
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
      <box style={{ flexGrow: 1, flexDirection: "row" }}>
        <SidePanel capacity={capacity()} compact={compact()} />
        <MainPane />
      </box>
      <StatusBar width={dimensions().width} />
      <Show when={state.overlay}>
        <Overlays />
      </Show>
    </box>
  )
}
