/**
 * What `run()` does when the child misbehaves.
 *
 * The caller takes the busy lock before awaiting, so an invocation that never
 * returns refuses every later action until the app is restarted. Reading the
 * pipes blocks until every holder of them exits, which a child that ignores
 * SIGTERM — or one that leaves a grandchild on the pipes — can stretch without
 * limit.
 *
 * Nothing here runs the real gortex: each case points GORTEX_BIN at a small
 * shell script, in a process of its own (see fixtures/run-scenario.ts).
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test"

const dir = `${process.env["TMPDIR"] ?? "/tmp"}/lazygortex-run-${process.pid}`
const scenario = new URL("fixtures/run-scenario.ts", import.meta.url).pathname

interface Outcome {
  ok: boolean
  code: number
  failure: string | null
  stdout: string
  message: string
  ms: number
  /** wall-clock time the caller waited, measured out here */
  waited: number
}

async function write(name: string, body: string, mode = 0o755): Promise<string> {
  const path = `${dir}/${name}`
  await Bun.write(path, body)
  await Bun.$`chmod ${mode.toString(8)} ${path}`.quiet()
  return path
}

async function runWith(bin: string, timeoutMs: number, args: string[] = []): Promise<Outcome> {
  const started = performance.now()
  const result = await Bun.$`bun ${scenario} ${String(timeoutMs)} ${args}`
    .env({ ...process.env, GORTEX_BIN: bin, LAZYGORTEX_STATE_FILE: "off" })
    .quiet()
  const waited = performance.now() - started
  const line = result.stdout.toString().trim().split("\n").at(-1) ?? "{}"
  return { ...(JSON.parse(line) as Omit<Outcome, "waited">), waited }
}

let ignoresTerm = ""
let grandchild = ""
let works = ""
let notExecutable = ""

beforeAll(async () => {
  ignoresTerm = await write("ignores-term", "#!/usr/bin/env bash\ntrap '' TERM\nsleep 5\necho done\n")
  // the wrapper exits when its child does, and the child holds the pipes
  grandchild = await write("grandchild", "#!/usr/bin/env bash\nsleep 30\n")
  works = await write("works", "#!/usr/bin/env bash\necho hello\n")
  notExecutable = await write("not-executable", "#!/usr/bin/env bash\necho hello\n", 0o644)
})

afterAll(async () => {
  await Bun.$`rm -rf ${dir}`.quiet()
})

describe("run", () => {
  test("returns what the command said when it behaves", async () => {
    const outcome = await runWith(works, 5_000)

    expect(outcome.ok).toBe(true)
    expect(outcome.code).toBe(0)
    expect(outcome.failure).toBeNull()
    expect(outcome.stdout.trim()).toBe("hello")
  })

  test("bounds a child that ignores SIGTERM, and says it timed out", async () => {
    // this used to return after the full 5 seconds, reporting ok:true code:0
    const outcome = await runWith(ignoresTerm, 300)

    expect(outcome.ok).toBe(false)
    expect(outcome.failure).toBe("timedOut")
    expect(outcome.message).toContain("timed out")
    expect(outcome.ms).toBeLessThan(3_000)
  }, 30_000)

  test("bounds a grandchild that is still holding the pipes", async () => {
    // the real repro: a wrapper-script GORTEX_BIN, which the README invites.
    // The pipe reads outlive the child, so this ran for the full 30 seconds.
    const outcome = await runWith(grandchild, 300)

    expect(outcome.failure).toBe("timedOut")
    expect(outcome.waited).toBeLessThan(10_000)
  }, 30_000)

  test("tells a missing binary from one that cannot be executed", async () => {
    const missing = await runWith(`${dir}/nowhere`, 2_000)
    expect(missing.failure).toBe("notFound")
    expect(missing.message).toContain("not found")

    const blocked = await runWith(notExecutable, 2_000)
    // `not found` sent people looking for a file that was sitting right there
    expect(blocked.failure).toBe("notExecutable")
    expect(blocked.message).toContain("not executable")
  }, 30_000)
})
