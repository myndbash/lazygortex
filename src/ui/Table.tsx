/**
 * Box-drawing tables, the same shape the gortex CLI prints.
 *
 * Column widths come from the content, then shrink the widest column first
 * until the table fits the pane; cells are truncated, never wrapped, so a row
 * always occupies exactly one line.
 */

import { createMemo, For, Show } from "solid-js"
import { c, Row, type Piece } from "./Row.tsx"
import { theme, truncate } from "./theme.ts"

export interface Cell {
  text: string
  fg?: string
}

export interface Column {
  header: string
  align?: "left" | "right"
  /** never grow this column past `max` characters */
  max?: number
}

export type TableRow = Array<Cell | string>

function cell(value: Cell | string): Cell {
  return typeof value === "string" ? { text: value } : value
}

function pad(text: string, width: number, align: "left" | "right" | undefined): string {
  const clipped = truncate(text, width)
  return align === "right" ? clipped.padStart(width) : clipped.padEnd(width)
}

/**
 * Natural width per column, shrunk to fit `available`.
 * Each column costs `width + 3` (a space either side and one border).
 */
function layout(columns: Column[], rows: TableRow[], available: number): number[] {
  const widths = columns.map((column, index) => {
    const longest = rows.reduce((max, row) => Math.max(max, cell(row[index] ?? "").text.length), column.header.length)
    return Math.max(3, Math.min(longest, column.max ?? Infinity))
  })

  const overhead = columns.length * 3 + 1
  let total = widths.reduce((sum, width) => sum + width, 0) + overhead
  while (total > available) {
    const widest = widths.indexOf(Math.max(...widths))
    if (widths[widest]! <= 4) break
    widths[widest]! -= 1
    total -= 1
  }
  return widths
}

function rule(widths: number[], left: string, mid: string, right: string): string {
  return left + widths.map((width) => "─".repeat(width + 2)).join(mid) + right
}

export function Table(props: {
  columns: Column[]
  rows: TableRow[]
  /** characters available to the table, borders included */
  width: number
  /** highlight colour for one row, by index */
  highlight?: (index: number) => string | undefined
}) {
  // `props.rows` is a getter over the caller's row expression, and the rules,
  // the header and every row read the widths: without these memos the caller's
  // expression ran N+6 times per pass, and the Daemon table's ran repoRows()
  // three times per row on top of that
  const rows = createMemo(() => props.rows)
  const widths = createMemo(() => layout(props.columns, rows(), props.width))

  const rowParts = (row: TableRow): Piece[] => {
    const parts: Piece[] = [c(theme.border, "│")]
    widths().forEach((width, index) => {
      const value = cell(row[index] ?? "")
      parts.push(c(value.fg ?? theme.text, ` ${pad(value.text, width, props.columns[index]?.align)} `))
      parts.push(c(theme.border, "│"))
    })
    return parts
  }

  return (
    <box style={{ flexDirection: "column", flexShrink: 0 }}>
      <text fg={theme.border}>{rule(widths(), "┌", "┬", "┐")}</text>
      <Row
        parts={[
          c(theme.border, "│"),
          ...widths().flatMap((width, index) => [
            c(theme.muted, ` ${pad(props.columns[index]?.header ?? "", width, props.columns[index]?.align)} `),
            c(theme.border, "│"),
          ]),
        ]}
      />
      <text fg={theme.border}>{rule(widths(), "├", "┼", "┤")}</text>
      <Show when={rows().length > 0} fallback={<text fg={theme.dim}>{"│ no rows"}</text>}>
        <For each={rows()}>{(row, index) => <Row parts={rowParts(row)} bg={props.highlight?.(index())} />}</For>
      </Show>
      <text fg={theme.border}>{rule(widths(), "└", "┴", "┘")}</text>
    </box>
  )
}
