/**
 * End-to-end tests for the Track prompt: the real `t` binding, the real overlay
 * component, a real keypress — and a fake `gortex` that logs the argv it was
 * handed instead of indexing anything.
 *
 * Each case runs in its own process (see fixtures/track-prompt-scenario.tsx for
 * why), so this file spawns rather than renders.
 */

import { afterAll, beforeEach, describe, expect, test } from "bun:test"

const dir = `${process.env["TMPDIR"] ?? "/tmp"}/lazygortex-track-prompt-${process.pid}`
const log = `${dir}/argv.log`
const fake = `${dir}/gortex`
const scenario = new URL("fixtures/track-prompt-scenario.tsx", import.meta.url).pathname

await Bun.write(fake, `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> ${JSON.stringify(log)}\nexit 0\n`)
await Bun.$`chmod +x ${fake}`.quiet()

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
    .env({ ...process.env, GORTEX_BIN: fake, LAZYGORTEX_STATE_FILE: "off" })
    .quiet()
  const line = result.stdout.toString().trim().split("\n").at(-1) ?? "{}"
  const file = Bun.file(log)
  const argv = (await file.exists()) ? await file.text() : ""
  return {
    ...(JSON.parse(line) as Omit<Outcome, "tracked">),
    tracked: argv.split("\n").filter((entry) => entry.startsWith("track ")),
  }
}

beforeEach(async () => {
  await Bun.file(log)
    .unlink()
    .catch(() => {})
})

afterAll(async () => {
  await Bun.$`rm -rf ${dir}`.quiet()
})

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
