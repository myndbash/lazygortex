/**
 * Deduplication of in-flight loads.
 *
 * One load per slot at a time is the rule, but a slot fetched with parameters —
 * `logs` takes a tail size — needs those in the key, and a load that was in the
 * air when the state was reset belongs to the state that was thrown away.
 *
 * The fake gortex answers slowly on purpose, so the second call really does
 * arrive mid-flight.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test"

const dir = `${process.env["TMPDIR"] ?? "/tmp"}/lazygortex-load-${process.pid}`
const log = `${dir}/argv.log`
const bin = `${dir}/gortex`
const scenario = new URL("fixtures/load-scenario.ts", import.meta.url).pathname

beforeAll(async () => {
  await Bun.write(
    bin,
    `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> ${JSON.stringify(log)}\nsleep 0.3\necho "a log line"\n`,
  )
  await Bun.$`chmod +x ${bin}`.quiet()
})

beforeEach(async () => {
  await Bun.file(log)
    .unlink()
    .catch(() => {})
})

afterAll(async () => {
  await Bun.$`rm -rf ${dir}`.quiet()
})

async function run(name: string): Promise<{ calls: string[]; out: Record<string, unknown> }> {
  const result = await Bun.$`bun ${scenario} ${name}`
    .env({ ...process.env, GORTEX_BIN: bin, LAZYGORTEX_STATE_FILE: "off" })
    .quiet()
  const line = result.stdout.toString().trim().split("\n").at(-1) ?? "{}"
  const argv = await Bun.file(log)
    .text()
    .catch(() => "")
  return { calls: argv.split("\n").filter(Boolean), out: JSON.parse(line) as Record<string, unknown> }
}

describe("load", () => {
  test("a second read with different parameters is not handed the first one's result", async () => {
    const { calls } = await run("logs-fingerprint")

    // keyed on the slot alone, the 400-line read waited for the 200-line one
    expect(calls.some((call) => call.includes("-n 200"))).toBe(true)
    expect(calls.some((call) => call.includes("-n 400"))).toBe(true)
  }, 30_000)

  test("a load in flight when the state resets does not write into the new state", async () => {
    const { out } = await run("reset-midflight")

    expect(out["dataAfterReset"]).toBe(true)
    expect(out["errorAfterReset"]).toBeNull()
    expect(out["loadingAfterReset"]).toBe(false)
    // and the slot still loads afterwards
    expect(out["dataAfterSecondLoad"]).toBe(true)
  }, 30_000)
})
