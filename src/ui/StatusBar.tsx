/** Bottom bar: running command, last message, and the keys that apply here. */

import { For, Show, createSignal, onCleanup, type Accessor } from "solid-js"
import { state, type Message } from "../state/store.ts"
import { activeBindings, type Binding } from "./keymap.ts"
import { c, Row, type Piece } from "./Row.tsx"
import { glyph, theme, truncate } from "./theme.ts"

const MESSAGE_COLOR = {
  info: theme.info,
  success: theme.ok,
  error: theme.error,
} as const

/** Fit as many `key description` pairs as the bar can show. */
function hintParts(bindings: Binding[], width: number): Piece[] {
  const parts: Piece[] = []
  let used = 0
  for (const binding of bindings) {
    const label = binding.label
    const description = ` ${binding.description}   `
    if (used + label.length + description.length > width) break
    parts.push(c(theme.accent, label), c(theme.muted, description, { bg: theme.panelAlt }))
    used += label.length + description.length
  }
  return parts
}

export function StatusBar(props: { width: number }) {
  const [frame, setFrame] = createSignal(0)
  const timer = setInterval(() => setFrame((f) => (f + 1) % glyph.spinner.length), 90)
  onCleanup(() => clearInterval(timer))

  const hints = () => activeBindings().filter((binding) => binding.hint)

  return (
    <box style={{ flexDirection: "column", flexShrink: 0, backgroundColor: theme.bg }}>
      <box style={{ flexDirection: "row", height: 1, paddingLeft: 1, paddingRight: 1 }}>
        <Show
          when={state.busy}
          fallback={
            <Show when={state.message} fallback={<text fg={theme.dim}>ready</text>}>
              {(message: Accessor<Message>) => (
                <text fg={MESSAGE_COLOR[message().kind]}>
                  {truncate(`${glyph.arrow} ${message().text}`, Math.max(10, props.width - 2))}
                </text>
              )}
            </Show>
          }
        >
          {(busy: Accessor<string>) => (
            <text fg={theme.warn}>
              {`${glyph.spinner[frame()]} ${truncate(busy(), Math.max(10, props.width - 4))}`}
            </text>
          )}
        </Show>
      </box>
      <box
        style={{
          flexDirection: "row",
          height: 1,
          paddingLeft: 1,
          paddingRight: 1,
          backgroundColor: theme.panelAlt,
          overflow: "hidden",
        }}
      >
        <Row parts={hintParts(hints(), props.width - 2)} bg={theme.panelAlt} />
      </box>
    </box>
  )
}
