/**
 * The command-line surface of the app itself.
 *
 * A typo'd flag used to start the full-screen TUI, so a scripted version query
 * hung instead of failing, and the build script took `--outfile` with nothing
 * after it as "use the default name".
 */

import { describe, expect, test } from "bun:test"

const root = new URL("..", import.meta.url).pathname
const entry = `${root}src/index.tsx`
const build = `${root}scripts/build.ts`

async function runCli(...args: string[]): Promise<{ code: number; out: string; err: string }> {
  const proc = Bun.spawn(["bun", "--preload", "@opentui/solid/preload", entry, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    env: { ...process.env, LAZYGORTEX_STATE_FILE: "off" },
  })
  const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
  return { code: await proc.exited, out, err }
}

describe("the CLI", () => {
  test("--version prints and exits", async () => {
    const result = await runCli("--version")

    expect(result.code).toBe(0)
    expect(result.out).toContain("lazygortex")
  }, 30_000)

  test("an unknown flag fails instead of starting the renderer", async () => {
    const result = await runCli("--verison")

    expect(result.code).toBe(2)
    expect(result.err).toContain("unknown option: --verison")
    expect(result.err).toContain("usage:")
  }, 30_000)

  test("--check-renderer reports the renderer it would draw with", async () => {
    const result = await runCli("--check-renderer")

    expect(result.code).toBe(0)
    expect(result.out).toContain("renderer ok")
  }, 30_000)
})

describe("the build script", () => {
  test("--outfile with no path is an error, not the default name", async () => {
    const proc = Bun.spawn(["bun", build, "--bundle", "--outfile"], { stdout: "pipe", stderr: "pipe", stdin: "ignore" })
    const err = await new Response(proc.stderr).text()

    expect(await proc.exited).toBe(2)
    expect(err).toContain("--outfile needs a path")
  }, 60_000)
})
