/**
 * End-to-end tests for the Track prompt: the real `t` binding, the real overlay
 * component, a real keypress — and a fake `gortex` that logs the argv it was
 * handed instead of indexing anything.
 *
 * Each case runs in its own process (see fixtures/track-prompt-scenario.tsx for
 * why), so this file spawns rather than renders.
 */

import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { fakeGortex } from "./fixtures/fake-gortex.ts"

const fake = await fakeGortex("track-prompt")
const scenario = new URL("fixtures/track-prompt-scenario.tsx", import.meta.url).pathname

interface Outcome {
  opened: string | null
  overlay: string | null
  busy: string | null
  message: string | null
  /** every `gortex track …` the fake binary saw */
  tracked: string[]
}

async function run(name: string): Promise<Outcome> {
  const result = await Bun.$`bun --preload @opentui/solid/preload ${scenario} ${name}`
    .env({ ...process.env, GORTEX_BIN: fake.bin, LAZYGORTEX_STATE_FILE: "off" })
    .quiet()
  const line = result.stdout.toString().trim().split("\n").at(-1) ?? "{}"
  const calls = await fake.calls()
  return {
    ...(JSON.parse(line) as Omit<Outcome, "tracked">),
    tracked: calls.filter((entry) => entry.startsWith("track ")),
  }
}

beforeEach(() => fake.clear())

afterAll(() => fake.remove())

describe("the track prompt", () => {
  test("a path that is not tracked reaches the CLI, resolved", async () => {
    const outcome = await run("resolves")

    expect(outcome.opened).toBe("prompt")
    // this is the control: it is what a broken guard looks like in the two
    // tests below, and it also pins `..` collapsing to the canonical path
    expect(outcome.tracked).toEqual(["track /home/u/alpha"])
    expect(outcome.overlay).toBeNull()
  }, 30_000)

  test("an emptied prompt runs nothing", async () => {
    const outcome = await run("empty")

    expect(outcome.opened).toBe("prompt")
    // the guard has to fire before normalizePath, which resolves "" to the cwd
    expect(outcome.tracked).toEqual([])
    expect(outcome.busy).toBeNull()
    expect(outcome.overlay).toBeNull()
  }, 30_000)

  test("an already-tracked repo is refused even while a filter hides it", async () => {
    const outcome = await run("filtered-out")

    expect(outcome.tracked).toEqual([])
    expect(outcome.message).toContain("already tracked")
  }, 30_000)
})
