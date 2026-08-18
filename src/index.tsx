#!/usr/bin/env bun
/**
 * lazygortex — a terminal UI for the Gortex daemon, in the spirit of
 * lazygit and lazydocker.
 */

import { render } from "@opentui/solid"
import { App } from "./ui/App.tsx"
import { GORTEX_BIN } from "./gortex/client.ts"
// imported rather than read at runtime so it survives `bun build --compile`
import { version } from "../package.json"

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`lazygortex — terminal UI for the Gortex daemon

usage: lazygortex [--help] [--version]

keys:
  1…6 / tab   switch panel      j k        move
  enter       focus detail      esc        back
  r / ctrl+r  refresh           ?          all keybindings
  q           quit

environment:
  GORTEX_BIN  path to the gortex binary (default: ${GORTEX_BIN})
`)
  process.exit(0)
}

if (process.argv.includes("--version") || process.argv.includes("-v")) {
  console.log(`lazygortex ${version}`)
  process.exit(0)
}

render(App, {
  targetFps: 30,
  exitOnCtrlC: true,
})
