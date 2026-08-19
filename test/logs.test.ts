/**
 * The Logs view's window. The buffer is user-controlled up to 5000 lines and a
 * poll replaces it whole every three seconds, so what reaches the renderer has
 * to be bounded.
 */

import { describe, expect, test } from "bun:test"
import { LOG_WINDOW, windowLines } from "../src/ui/MainPane.tsx"

process.env["LAZYGORTEX_STATE_FILE"] = "off"

const lines = (count: number): string[] => Array.from({ length: count }, (_, index) => `line ${index}`)

describe("windowLines", () => {
  test("passes a short buffer through untouched, by reference", () => {
    const short = lines(10)
    const view = windowLines(short, 100)

    expect(view.visible).toBe(short)
    expect(view.hidden).toBe(0)
  })

  test("keeps the newest entries and counts what it dropped", () => {
    const view = windowLines(lines(1000), 500)

    expect(view.visible).toHaveLength(500)
    expect(view.visible[0]).toBe("line 500")
    expect(view.visible.at(-1)).toBe("line 999")
    expect(view.hidden).toBe(500)
  })

  test("bounds the 5000-line buffer the tail key can reach", () => {
    const view = windowLines(lines(5000))

    expect(view.visible).toHaveLength(LOG_WINDOW)
    expect(view.hidden).toBe(5000 - LOG_WINDOW)
  })

  test("is exact at the boundary", () => {
    expect(windowLines(lines(500), 500).hidden).toBe(0)
    expect(windowLines(lines(501), 500).hidden).toBe(1)
    expect(windowLines([], 500)).toEqual({ visible: [], hidden: 0 })
  })
})
