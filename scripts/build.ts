#!/usr/bin/env bun
/**
 * Build lazygortex.
 *
 *   bun run scripts/build.ts            bundle + a binary for this machine
 *   bun run scripts/build.ts --bundle   just dist/cli.js (what npm ships)
 *   bun run scripts/build.ts --outfile dist/lazygortex-linux-x64   name the binary
 *
 * There is no cross-compilation: OpenTUI resolves its renderer from a native
 * module chosen per platform, and only the host's is installed, so release
 * binaries are built on a runner of each architecture.
 *
 * The Solid plugin has to run at build time: OpenTUI's Solid binding relies on
 * Solid's universal JSX transform, which Bun does not apply on its own. The
 * bundle is what the npm package ships, so an installed copy never depends on
 * this repo's bunfig.toml or tsconfig.json.
 */

import solidPlugin from "@opentui/solid/bun-plugin"
import { chmod } from "node:fs/promises"

const root = new URL("..", import.meta.url).pathname
const entrypoint = `${root}src/index.tsx`

const args = process.argv.slice(2)
const bundleOnly = args.includes("--bundle")
const outfile = args.includes("--outfile") ? args[args.indexOf("--outfile") + 1] : undefined

function fail(result: { logs: unknown[] }): never {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}

/**
 * The npm artefact: plain JS with a shebang, run by the user's own Bun.
 *
 * The runtime packages stay external — OpenTUI picks its native module per
 * platform through optional dependencies, which cannot be bundled — so the
 * published package installs them as normal dependencies.
 */
// Only the native core stays external: it picks a platform-specific optional
// dependency at runtime, which cannot be bundled. Solid and the Solid binding
// are bundled so an installed copy cannot resolve solid-js to its server build,
// which is what happens without this repo's bun configuration.
const RUNTIME_DEPS = ["@opentui/core"]

async function buildBundle(): Promise<void> {
  const result = await Bun.build({
    entrypoints: [entrypoint],
    target: "bun",
    outdir: `${root}dist`,
    naming: "cli.js",
    plugins: [solidPlugin],
    external: RUNTIME_DEPS,
    banner: "#!/usr/bin/env bun",
  })
  if (!result.success) fail(result)
  await chmod(`${root}dist/cli.js`, 0o755)
  console.log(`built ${root}dist/cli.js`)
}

/** A standalone executable with the Bun runtime embedded, for this platform. */
async function buildBinary(): Promise<void> {
  const out = outfile ?? `${root}dist/lazygortex`
  const result = await Bun.build({
    entrypoints: [entrypoint],
    plugins: [solidPlugin],
    compile: { outfile: out },
  })
  if (!result.success) fail(result)
  console.log(`built ${out}`)
}

await buildBundle()
if (!bundleOnly) await buildBinary()
