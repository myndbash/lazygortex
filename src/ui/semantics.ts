/**
 * Semantic colour.
 *
 * The rule for the whole UI: colour means something. Structure is drawn in
 * greys, and a hue is spent only where it carries signal — freshness, severity,
 * recency, magnitude, or a value that is false when it should be true.
 */

import { theme } from "./theme.ts"

/** Daemon state strings: `ready`, `ready (warmup 28s)`, `indexing`, … */
export function stateColor(state: string | undefined): string {
  if (!state) return theme.dim
  const value = state.toLowerCase()
  if (value.includes("error") || value.includes("failed") || value.includes("stopped")) return theme.error
  if (value.includes("warmup") || value.includes("indexing") || value.includes("starting")) return theme.warn
  if (value.includes("ready")) return theme.ok
  return theme.text
}

/** A flag that is supposed to be true: green when it is, red when it is not. */
export function flagColor(value: unknown): string {
  if (value === true || value === "true") return theme.ok
  if (value === false || value === "false") return theme.error
  return theme.text
}

/** A count that is supposed to be zero: green at zero, warm above it. */
export function faultColor(count: unknown): string {
  const value = Number(count)
  if (!Number.isFinite(value)) return theme.dim
  if (value === 0) return theme.ok
  return value > 5 ? theme.error : theme.warn
}

/** Percentages where more is better. */
export function shareColor(percent: number): string {
  if (!Number.isFinite(percent)) return theme.dim
  if (percent >= 40) return theme.ok
  if (percent >= 20) return theme.warn
  return theme.error
}

/** Health scores out of 100. */
export function scoreColor(score: number): string {
  if (!Number.isFinite(score)) return theme.dim
  if (score >= 90) return theme.ok
  if (score >= 70) return theme.warn
  return theme.error
}

/**
 * Size relative to the largest peer, so the biggest repo in a list reads as
 * the biggest at a glance.
 */
export function magnitudeColor(value: number, max: number): string {
  if (!Number.isFinite(value) || value <= 0 || max <= 0) return theme.dim
  const share = value / max
  if (share >= 0.5) return theme.accent
  if (share >= 0.15) return theme.info
  if (share >= 0.02) return theme.text
  return theme.muted
}

/** How long ago an ISO timestamp was: fresh reads bright, old reads quiet. */
export function ageColor(iso: string | undefined): string {
  if (!iso) return theme.dim
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return theme.dim
  const hours = (Date.now() - then) / 3_600_000
  if (hours < 1) return theme.ok
  if (hours < 24) return theme.text
  if (hours < 24 * 7) return theme.muted
  return theme.warn
}

/** A connection age, where "just now" is the interesting end. */
export function uptimeColor(connected: string | undefined): string {
  if (!connected) return theme.dim
  return /^\d+(\.\d+)?s$/.test(connected.trim()) ? theme.info : theme.dim
}

export const LEVEL_COLOR: Record<string, string> = {
  debug: theme.dim,
  info: theme.info,
  warn: theme.warn,
  error: theme.error,
  fatal: theme.error,
}

/** Log message colour: only warnings and errors earn one. */
export function logColor(level: string): string {
  if (level === "error" || level === "fatal") return theme.error
  if (level === "warn") return theme.warn
  return theme.text
}

/** Git branch names: the trunk is unremarkable, a topic branch is not. */
export function branchColor(branch: string): string {
  if (!branch) return theme.dim
  return branch === "main" || branch === "master" ? theme.muted : theme.info
}
