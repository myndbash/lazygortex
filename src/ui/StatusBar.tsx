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

type Hint = Pick<Binding, "label" | "description">

/** The two keys a lost user needs, whatever else the bar has room for. */
const ESSENTIAL = ["q", "?"]

const hintWidth = (hint: Hint): number => hint.label.length + hint.description.length + 4

function hintPieces(hint: Hint): Piece[] {
  return [c(theme.accent, hint.label), c(theme.muted, ` ${hint.description}   `)]
}

/**
 * Fit as many `key description` pairs as the bar can show.
 *
 * `q quit` and `? help` are reserved first: the Repos panel's own hints are
 * longer than 80 columns on their own, and stopping at the first hint that did
 * not fit dropped both of them at every realistic width. Anything skipped is
 * admitted with a marker rather than silently left out.
 */
function hintParts(bindings: Hint[], width: number): Piece[] {
  const essential = bindings.filter((hint) => ESSENTIAL.includes(hint.label))
  const rest = bindings.filter((hint) => !ESSENTIAL.includes(hint.label))
  const reserved = essential.reduce((total, hint) => total + hintWidth(hint), 0)

  const parts: Piece[] = []
  let used = 0
  let skipped = 0
  for (const hint of rest) {
    // skip past one that does not fit rather than stopping: a long description
    // in the middle of the list used to hide everything after it
    if (used + hintWidth(hint) > width - reserved - 2) {
      skipped += 1
      continue
    }
    parts.push(...hintPieces(hint))
    used += hintWidth(hint)
  }
  if (skipped > 0) parts.push(c(theme.dim, `${glyph.bullet}${glyph.bullet}  `))
  for (const hint of essential) parts.push(...hintPieces(hint))
  return parts
}

export function StatusBar(props: { width: number }) {
  const [frame, setFrame] = createSignal(0)
  const timer = setInterval(() => setFrame((f) => (f + 1) % glyph.spinner.length), 90)
  onCleanup(() => clearInterval(timer))

  // with no CLI there is nothing to act on but quitting and retrying
  const hints = () =>
    state.binary.ok === false
      ? [
          { label: "r", description: "check again" },
          { label: "q", description: "quit" },
        ]
      : activeBindings().filter((binding) => binding.hint)

  return (
    <box style={{ flexDirection: "column", flexShrink: 0, backgroundColor: theme.bg }}>
      <box style={{ flexDirection: "row", height: 1, paddingLeft: 1, paddingRight: 1 }}>
        {/* a message raised after the command started is about that command,
            and is worth more than the spinner it used to be hidden behind */}
        <Show
          when={state.busy && !(state.message && state.message.at >= state.busyAt)}
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
          {() => (
            <text fg={theme.warn}>
              {`${glyph.spinner[frame()]} ${truncate(state.busy ?? "", Math.max(10, props.width - 4))}`}
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
