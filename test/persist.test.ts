/**
 * The remembered view. Writes are debounced 500ms on the trailing edge, and the
 * quit path exits ten milliseconds after it decides to quit, so the flush is
 * what makes the feature work at all.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { flushPersisted, loadPersisted, savePersisted, stateFile } from "../src/state/persist.ts"
import { clampLogTail } from "../src/state/store.ts"

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

describe("the state-file override", () => {
  test("`off` disables persistence whatever its case or spacing", async () => {
    for (const value of ["off", "OFF", " Off ", "0", "none", ""]) {
      process.env["LAZYGORTEX_STATE_FILE"] = value
      savePersisted({ panel: "logs" })
      await flushPersisted()
      // `OFF` used to be taken as a filename and written into the cwd
      expect(await Bun.file(`${process.cwd()}/${value.trim()}`).exists()).toBe(false)
      expect(await loadPersisted()).toEqual({})
    }
  })

  test("a relative override belongs to $HOME, not to wherever the app was launched", () => {
    process.env["LAZYGORTEX_STATE_FILE"] = "state.json"
    expect(stateFile()).toBe(`${process.env["HOME"]}/state.json`)
  })

  test("an absolute override is used as given", () => {
    process.env["LAZYGORTEX_STATE_FILE"] = fixture
    expect(stateFile()).toBe(fixture)
  })
})

describe("clampLogTail", () => {
  test("keeps the tail inside the bounds the keys work within", () => {
    expect(clampLogTail(300)).toBe(300)
    expect(clampLogTail(10_000)).toBe(5_000)
    expect(clampLogTail(1)).toBe(50)
  })

  test("refuses a negative or fractional tail, which makes the CLI panic", () => {
    // `gortex daemon logs -n -5` panics; a hand-edited state file could ask for it
    expect(clampLogTail(-5)).toBe(50)
    expect(clampLogTail(300.7)).toBe(300)
    expect(clampLogTail(Number.NaN)).toBe(300)
  })
})
