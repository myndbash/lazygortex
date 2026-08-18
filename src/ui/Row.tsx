/**
 * Multi-coloured text rows.
 *
 * OpenTUI 0.5.3 drops colour on inline text nodes: `<span fg>`, `<b fg>` and a
 * custom `TextNodeRenderable` all render in the default foreground, and a
 * `StyledText` handed to `content` is stringified while one handed to
 * `children` accumulates chunks on every update. Only `<text fg>` paints, so a
 * row is a flex line of small `<text>` elements, and the highlight is the
 * background of the box holding them.
 */

import { For } from "solid-js"
import { TextAttributes } from "@opentui/core"
import { theme } from "./theme.ts"

export interface Piece {
  text: string
  fg?: string
  bold?: boolean
}

export type MaybePiece = Piece | false | null | undefined | ""

/** A coloured fragment of a row. */
export function c(fg: string, text: string | number, options: { bold?: boolean } = {}): Piece {
  return { text: String(text), fg, ...options }
}

/**
 * One line built from coloured fragments; falsy fragments are dropped.
 * A row is exactly one line tall — overflowing content is clipped, never
 * wrapped, so lists and tables stay aligned.
 */
export function Row(props: { parts: MaybePiece[]; bg?: string }) {
  const parts = () => props.parts.filter((part): part is Piece => Boolean(part))
  return (
    <box
      style={{
        flexDirection: "row",
        flexShrink: 0,
        height: 1,
        overflow: "hidden",
        backgroundColor: props.bg,
      }}
    >
      <For each={parts()}>
        {(part) => (
          <text
            fg={part.fg ?? theme.text}
            bg={props.bg}
            attributes={part.bold ? TextAttributes.BOLD : undefined}
            style={{ flexShrink: 0 }}
          >
            {part.text}
          </text>
        )}
      </For>
    </box>
  )
}
