#!/usr/bin/env bun
/**
 * Compile lazygortex into a standalone executable at `dist/lazygortex`.
 *
 * The Solid plugin has to run at build time: OpenTUI's Solid binding relies on
 * Solid's universal JSX transform, which Bun does not apply on its own.
 */

import solidPlugin from "@opentui/solid/bun-plugin"

const outfile = new URL("../dist/lazygortex", import.meta.url).pathname

const result = await Bun.build({
  entrypoints: [new URL("../src/index.tsx", import.meta.url).pathname],
  target: "bun",
  plugins: [solidPlugin],
  compile: { outfile },
})

if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}

console.log(`built ${outfile}`)
