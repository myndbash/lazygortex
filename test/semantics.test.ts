import { describe, expect, test } from "bun:test"
import {
  ageColor,
  branchColor,
  faultColor,
  flagColor,
  logColor,
  magnitudeColor,
  scoreColor,
  shareColor,
  stateColor,
  uptimeColor,
} from "../src/ui/semantics.ts"
import { theme } from "../src/ui/theme.ts"

describe("semantic colour", () => {
  test("daemon state", () => {
    expect(stateColor("ready")).toBe(theme.ok)
    expect(stateColor("ready (warmup 28s)")).toBe(theme.warn)
    expect(stateColor("stopped")).toBe(theme.error)
    expect(stateColor(undefined)).toBe(theme.dim)
  })

  test("flags and fault counts", () => {
    expect(flagColor(true)).toBe(theme.ok)
    expect(flagColor(false)).toBe(theme.error)
    expect(faultColor(0)).toBe(theme.ok)
    expect(faultColor(1)).toBe(theme.warn)
    expect(faultColor(42)).toBe(theme.error)
    expect(faultColor("—")).toBe(theme.dim)
  })

  test("scores and shares run good to bad", () => {
    expect(scoreColor(100)).toBe(theme.ok)
    expect(scoreColor(80)).toBe(theme.warn)
    expect(scoreColor(10)).toBe(theme.error)
    expect(shareColor(41.4)).toBe(theme.ok)
    expect(shareColor(25)).toBe(theme.warn)
    expect(shareColor(3)).toBe(theme.error)
  })

  test("magnitude ranks a value against the largest peer", () => {
    expect(magnitudeColor(180_000, 180_000)).toBe(theme.accent)
    expect(magnitudeColor(30_000, 180_000)).toBe(theme.info)
    expect(magnitudeColor(9_000, 180_000)).toBe(theme.text)
    expect(magnitudeColor(100, 180_000)).toBe(theme.muted)
    expect(magnitudeColor(0, 180_000)).toBe(theme.dim)
  })

  test("age fades with time", () => {
    const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()
    expect(ageColor(minutesAgo(5))).toBe(theme.ok)
    expect(ageColor(minutesAgo(60 * 5))).toBe(theme.text)
    expect(ageColor(minutesAgo(60 * 48))).toBe(theme.muted)
    expect(ageColor(minutesAgo(60 * 24 * 30))).toBe(theme.warn)
    expect(ageColor("")).toBe(theme.dim)
  })

  test("only warnings and errors colour a log message", () => {
    expect(logColor("info")).toBe(theme.text)
    expect(logColor("warn")).toBe(theme.warn)
    expect(logColor("fatal")).toBe(theme.error)
  })

  test("trunk branches stay quiet, topic branches do not", () => {
    expect(branchColor("main")).toBe(theme.muted)
    expect(branchColor("master")).toBe(theme.muted)
    expect(branchColor("redmine")).toBe(theme.info)
    expect(branchColor("")).toBe(theme.dim)
  })

  test("a brand new connection stands out", () => {
    expect(uptimeColor("0s")).toBe(theme.info)
    expect(uptimeColor("4h39m")).toBe(theme.dim)
  })
})
