/**
 * The remembered view. Writes are debounced 500ms on the trailing edge, and the
 * quit path exits ten milliseconds after it decides to quit, so the flush is
 * what makes the feature work at all.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { flushPersisted, loadPersisted, savePersisted } from "../src/state/persist.ts"

const fixture = `${process.env["TMPDIR"] ?? "/tmp"}/lazygortex-persist-${process.pid}.json`

beforeEach(() => {
  process.env["LAZYGORTEX_STATE_FILE"] = fixture
})

afterEach(async () => {
  process.env["LAZYGORTEX_STATE_FILE"] = "off"
  await Bun.file(fixture)
    .unlink()
    .catch(() => {})
})

describe("flushPersisted", () => {
  test("writes what the debounce is still holding", async () => {
    savePersisted({ panel: "logs", repo: "/home/u/parser", logTail: 600 })
    // the debounce has not fired: nothing is on disk yet
    expect(await Bun.file(fixture).exists()).toBe(false)

    await flushPersisted()

    expect(await loadPersisted()).toEqual({ panel: "logs", repo: "/home/u/parser", logTail: 600 })
  })

  test("keeps the newest of several rapid navigations", async () => {
    savePersisted({ panel: "repos" })
    savePersisted({ panel: "savings" })
    savePersisted({ panel: "daemon" })
    await flushPersisted()

    expect(await loadPersisted()).toEqual({ panel: "daemon" })
  })

  test("cancels the pending timer, so the flushed value is not overwritten later", async () => {
    savePersisted({ panel: "logs" })
    await flushPersisted()
    savePersisted({ panel: "repos" })
    await flushPersisted()
    await Bun.sleep(700)

    expect(await loadPersisted()).toEqual({ panel: "repos" })
  })

  test("does nothing when there is nothing pending, and never throws", async () => {
    await flushPersisted()
    expect(await Bun.file(fixture).exists()).toBe(false)

    process.env["LAZYGORTEX_STATE_FILE"] = "off"
    savePersisted({ panel: "logs" })
    await flushPersisted()
    expect(await loadPersisted()).toEqual({})
  })
})
