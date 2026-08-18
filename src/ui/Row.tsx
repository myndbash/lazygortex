/**
 * Multi-coloured text rows.
 *
 * The Solid binding's built-in `<span>` has no colour props in its types, and a
 * `StyledText` passed as a child accumulates chunks on every update instead of
 * replacing them. Registering a plain `TextNodeRenderable` as `styled_span`
 * sidesteps both problems and reconciles like any other element.
 */

import { For } from "solid-js"
import { TextAttributes, TextNodeRenderable, type TextNodeOptions } from "@opentui/core"
import { extend } from "@opentui/solid"
import { theme } from "./theme.ts"

class StyledSpanRenderable extends TextNodeRenderable {
  constructor(_ctx: unknown, options: TextNodeOptions) {
    super(options)
  }
}

extend({ styled_span: StyledSpanRenderable as never })

declare module "@opentui/solid" {
  interface OpenTUIComponents {
    styled_span: typeof StyledSpanRenderable
  }
}

export interface Piece {
  text: string
  fg?: string
  bg?: string
  bold?: boolean
}

export type MaybePiece = Piece | false | null | undefined | ""

/** A coloured fragment of a row. */
export function c(fg: string, text: string | number, options: { bg?: string; bold?: boolean } = {}): Piece {
  return { text: String(text), fg, ...options }
}

/** One line built from coloured fragments; falsy fragments are dropped. */
export function Row(props: { parts: MaybePiece[]; bg?: string }) {
  const parts = () => props.parts.filter((part): part is Piece => Boolean(part))
  return (
    <text bg={props.bg} style={{ flexShrink: 0 }}>
      <For each={parts()}>
        {(part) => (
          <styled_span
            fg={part.fg ?? theme.text}
            bg={part.bg ?? props.bg}
            attributes={part.bold ? TextAttributes.BOLD : undefined}
          >
            {part.text}
          </styled_span>
        )}
      </For>
    </text>
  )
}
