/**
 * What `r` actually runs, per panel. The panel's own data has to be in the set,
 * and the 1.2-second index-health call has to stay out of panels that never
 * display it.
 *
 * Each panel runs in its own process against a fake binary that logs its argv;
 * see fixtures/fake-gortex.ts for why the process boundary is not optional.
 */

import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { fakeGortex } from "./fixtures/fake-gortex.ts"

const fake = await fakeGortex("refresh-current")
const scenario = new URL("fixtures/refresh-current-scenario.ts", import.meta.url).pathname

async function refreshOn(panel: string): Promise<string[]> {
  await Bun.$`bun ${scenario} ${panel}`
    .env({ ...process.env, GORTEX_BIN: fake.bin, LAZYGORTEX_STATE_FILE: "off" })
    .quiet()
  return fake.calls()
}

beforeEach(() => fake.clear())
afterAll(() => fake.remove())

describe("refresh.current", () => {
  test("Projects reloads the declarations it is grouped by, and nothing expensive", async () => {
    const calls = await refreshOn("projects")

    expect(calls).toContain("workspace list")
    expect(calls).toContain("repos --json")
    // `r` used to burn a 1.2s index-health call the panel does not display, and
    // never reload the slot an external .gortex.yaml edit had invalidated
    expect(calls.some((call) => call.includes("operation=index"))).toBe(false)
  }, 30_000)

  test("Sessions asks only for the status it displays", async () => {
    const calls = await refreshOn("sessions")

    expect(calls).toContain("daemon status")
    expect(calls.some((call) => call.includes("operation=index"))).toBe(false)
  }, 30_000)

  test("Daemon still pays for index health, because it shows it", async () => {
    const calls = await refreshOn("daemon")

    expect(calls.some((call) => call.includes("operation=index"))).toBe(true)
  }, 30_000)

  test("Repos still fetches the graph summary its bars come from", async () => {
    const calls = await refreshOn("repos")

    expect(calls.some((call) => call.includes("operation=graph"))).toBe(true)
    expect(calls.some((call) => call.includes("operation=index"))).toBe(false)
  }, 30_000)
})
