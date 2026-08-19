/** Colours and glyphs. Unicode only — no emoji. */

export const theme = {
  bg: "#1a1b26",
  panel: "#1f2335",
  panelAlt: "#24283b",
  border: "#3b4261",
  borderFocus: "#7aa2f7",
  text: "#c0caf5",
  dim: "#565f89",
  muted: "#7f88b0",
  title: "#7aa2f7",
  accent: "#bb9af7",
  ok: "#9ece6a",
  warn: "#e0af68",
  error: "#f7768e",
  info: "#7dcfff",
  selectionBg: "#2f3449",
  selectionFg: "#ffffff",
  activeSelectionBg: "#3d59a1",
} as const

export const glyph = {
  ok: "●",
  warn: "◐",
  bad: "○",
  stale: "▲",
  unversioned: "◌",
  arrow: "›",
  bullet: "·",
  sep: "│",
  up: "↑",
  down: "↓",
  spinner: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
  barFull: "█",
  barEmpty: "░",
} as const

export function bar(percent: number, width = 16): string {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0))
  const filled = Math.round((clamped / 100) * width)
  return glyph.barFull.repeat(filled) + glyph.barEmpty.repeat(Math.max(0, width - filled))
}

export function humanCount(value: number): string {
  if (!Number.isFinite(value)) return "-"
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return String(value)
}

export function relativeTime(iso: string): string {
  if (!iso) return "never"
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return iso
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h ago`
  return `${Math.round(seconds / 86_400)}d ago`
}

/**
 * How many terminal columns a string occupies.
 *
 * `String#length` counts UTF-16 code units while opentui lays out in columns, so
 * a CJK name pushed a table's rules right of the rule above it and an emoji did
 * the same by one column.
 */
export function displayWidth(value: string): number {
  return Bun.stringWidth(value)
}

/** Pad to a column width, counting columns rather than code units. */
export function padTo(value: string, width: number, align: "left" | "right" = "left"): string {
  const gap = Math.max(0, width - displayWidth(value))
  return align === "right" ? " ".repeat(gap) + value : value + " ".repeat(gap)
}

/**
 * Cut to `width` columns, on a grapheme boundary.
 *
 * Slicing by code unit could cut a surrogate pair in half and emit a lone
 * surrogate into the frame buffer.
 */
export function truncate(value: string, width: number): string {
  if (width <= 1) return ""
  if (displayWidth(value) <= width) return value

  const graphemes = [...new Intl.Segmenter().segment(value)].map((entry) => entry.segment)
  let out = ""
  let used = 0
  for (const grapheme of graphemes) {
    const cost = displayWidth(grapheme)
    if (used + cost > width - 1) break
    out += grapheme
    used += cost
  }
  return `${out}…`
}

/** Collapse $HOME to `~` the way the shell prompt does. */
export function shortPath(path: string): string {
  const home = process.env["HOME"]
  return home && path.startsWith(home) ? `~${path.slice(home.length)}` : path
}
