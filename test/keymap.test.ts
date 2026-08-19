/**
 * Which keys act on the list and which act on the detail pane.
 *
 * Every movement binding branches on `state.focus`; `g` and `G` did not, so on
 * Logs they did nothing at all — the panel has no list to jump in — and on
 * Repos they moved the hidden side cursor, silently swapping the repository the
 * user was reading in the pane beside it.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { globalBindings, setScroller } from "../src/ui/keymap.ts"
import { resetState, setState, state } from "../src/state/store.ts"
import type { Repo } from "../src/gortex/types.ts"

process.env["LAZYGORTEX_STATE_FILE"] = "off"

let scrolled: number[] = []

function binding(label: string) {
  const found = globalBindings().find((entry) => entry.label === label)
  expect(found).toBeTruthy()
  return found!
}

beforeEach(() => {
  resetState()
  scrolled = []
  setScroller((delta) => scrolled.push(delta))
  setState(
    "repos",
    "data",
    Array.from<unknown, Repo>({ length: 5 }, (_, index) => ({
      name: `repo-${index}`,
      path: `/home/u/repo-${index}`,
      head_commit: "abc1234",
      branch: "main",
      stale: false,
      indexed: true,
    })),
  )
})

afterEach(() => setScroller(() => {}))

describe("g and G with the detail pane focused", () => {
  beforeEach(() => setState("focus", "main"))

  test("scroll the pane instead of moving the list cursor", () => {
    binding("G").run()
    binding("g").run()

    expect(scrolled).toHaveLength(2)
    expect(scrolled[0]).toBeGreaterThan(0)
    expect(scrolled[1]).toBeLessThan(0)
    expect(state.cursor.repos).toBe(0)
  })

  test("work on Logs, which has no list to jump in at all", () => {
    setState("panel", "logs")
    binding("G").run()

    expect(scrolled).toHaveLength(1)
  })

  test("j and k still branch the same way", () => {
    binding("j/↓").run()
    binding("k/↑").run()

    expect(scrolled).toEqual([3, -3])
  })
})

describe("g and G with the panel list focused", () => {
  beforeEach(() => setState("focus", "side"))

  test("jump the cursor and leave the pane alone", () => {
    binding("G").run()
    expect(state.cursor.repos).toBe(4)

    binding("g").run()
    expect(state.cursor.repos).toBe(0)
    expect(scrolled).toEqual([])
  })
})
