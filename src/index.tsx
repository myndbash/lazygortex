/**
 * lazygortex — a terminal UI for the Gortex daemon, in the spirit of
 * lazygit and lazydocker.
 */

import { render } from "@opentui/solid"
import { App } from "./ui/App.tsx"
import { GORTEX_BIN } from "./gortex/client.ts"
// imported rather than read at runtime so it survives `bun build --compile`
import { version } from "../package.json"

const KNOWN_FLAGS = ["--help", "-h", "--version", "-v", "--check-renderer"]

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`lazygortex — terminal UI for the Gortex daemon

usage: lazygortex [--help] [--version] [--check-renderer]

keys:
  1…6 / tab   switch panel      j k        move
  enter       focus detail      esc        back
  r / ctrl+r  refresh           ?          all keybindings
  q           quit

environment:
  GORTEX_BIN             path to the gortex binary (default: ${GORTEX_BIN})
  LAZYGORTEX_STATE_FILE  where the remembered view is stored; "off" disables it

https://github.com/myndbash/lazygortex
`)
  process.exit(0)
}

if (process.argv.includes("--version") || process.argv.includes("-v")) {
  console.log(`lazygortex ${version}`)
  process.exit(0)
}

/**
 * Load the native renderer and exit, without drawing anything.
 *
 * `--version` never reaches the renderer, and opentui defers a failed
 * native-module import until the first render, so a build whose platform
 * package cannot be loaded used to pass every smoke test green and then crash
 * on the user's first run. This is the gate that actually touches it.
 */
if (process.argv.includes("--check-renderer")) {
  try {
    const { resolveRenderLib } = await import("@opentui/core")
    resolveRenderLib()
    console.log(`lazygortex ${version} — renderer ok`)
    process.exit(0)
  } catch (error) {
    console.error(`renderer unavailable: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

// A typo'd flag used to start the TUI, so a scripted `lazygortex --verison`
// hung on a full-screen renderer instead of failing.
const unknown = process.argv.slice(2).find((arg) => arg.startsWith("-") && !KNOWN_FLAGS.includes(arg))
if (unknown) {
  console.error(`lazygortex: unknown option: ${unknown}`)
  console.error(`usage: lazygortex [--help] [--version] [--check-renderer]`)
  process.exit(2)
}

render(App, {
  targetFps: 30,
  exitOnCtrlC: true,
})
