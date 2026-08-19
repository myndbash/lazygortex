/**
 * A stand-in `gortex` that records the argv it was handed and exits 0.
 *
 * Tests that want to know what lazygortex *would* run — `track`, an index
 * health call — point GORTEX_BIN at one of these instead of the real CLI, which
 * on a developer machine serves live MCP sessions and would happily start a
 * five-minute index.
 *
 * The binary is resolved once, when src/gortex/client.ts is first imported, and
 * `bun test` runs every file in one process with one module registry — so a
 * test file that sets GORTEX_BIN for itself still gets the real binary if any
 * other file imported the client first. Scenarios that use this have to run in
 * their own process; see track-prompt-scenario.tsx.
 */

export interface FakeGortex {
  /** path to pass as GORTEX_BIN */
  bin: string
  /** every invocation, one space-joined argv per line */
  calls: () => Promise<string[]>
  clear: () => Promise<void>
  remove: () => Promise<void>
}

export async function fakeGortex(name: string): Promise<FakeGortex> {
  const dir = `${process.env["TMPDIR"] ?? "/tmp"}/lazygortex-${name}-${process.pid}`
  const log = `${dir}/argv.log`
  const bin = `${dir}/gortex`

  await Bun.write(bin, `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> ${JSON.stringify(log)}\nexit 0\n`)
  await Bun.$`chmod +x ${bin}`.quiet()

  return {
    bin,
    calls: async () => {
      const file = Bun.file(log)
      if (!(await file.exists())) return []
      return (await file.text()).split("\n").filter((line) => line.trim().length > 0)
    },
    clear: async () => {
      await Bun.file(log)
        .unlink()
        .catch(() => {})
    },
    remove: async () => {
      await Bun.$`rm -rf ${dir}`.quiet()
    },
  }
}
