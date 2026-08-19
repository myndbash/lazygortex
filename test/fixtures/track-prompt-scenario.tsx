/**
 * One Track-prompt scenario, run in its own process by test/track-prompt.test.ts.
 *
 * It lives outside the test files on purpose. `GORTEX_BIN` is resolved once,
 * when src/gortex/client.ts is first imported, and `bun test` shares one module
 * registry across every test file — so a test file that sets the variable for
 * itself would still get the real binary whenever another file imported the
 * client first. A separate process is the only way the fake binary is
 * guaranteed to win, and `gortex track` is not something to fire at a live
 * daemon by accident.
 *
 * Usage: bun --preload @opentui/solid/preload track-prompt-scenario.tsx <case>
 * Prints one JSON line describing where the store ended up.
 */

import { testRender } from "@opentui/solid"
import { panelBindings } from "../../src/ui/keymap.ts"
import { Overlays } from "../../src/ui/Overlays.tsx"
import { setState, state } from "../../src/state/store.ts"

const scenario = process.argv[2] ?? ""

const setup = await testRender(() => <Overlays />, { width: 90, height: 30 })

/** The `t` binding, taken from the keymap rather than rebuilt here. */
function openTrackPrompt(): void {
  const binding = panelBindings().find((entry) => entry.keys.includes("t") && entry.panels?.includes("repos"))
  if (!binding) throw new Error("no `t` binding on the repos panel")
  binding.run()
}

/** Empty the prefilled input the way a user does. */
function clearInput(): void {
  for (let index = 0; index < process.cwd().length + 8; index++) setup.mockInput.pressBackspace()
}

if (scenario === "filtered-out") {
  setState("repos", "data", [
    { name: "alpha", path: "/home/u/alpha", head_commit: "abc1234", branch: "main", stale: false, indexed: true },
  ])
  setState("filter", "repos", "zzz")
}

openTrackPrompt()
await setup.flush()
const opened = state.overlay?.kind ?? null

clearInput()
if (scenario === "resolves") await setup.mockInput.typeText("/home/u/beta/../alpha")
if (scenario === "filtered-out") await setup.mockInput.typeText("/home/u/alpha")
setup.mockInput.pressEnter()
await setup.flush()
// long enough for the spawn the guard is supposed to prevent
await Bun.sleep(300)

console.log(
  JSON.stringify({
    opened,
    overlay: state.overlay?.kind ?? null,
    busy: state.busy,
    message: state.message?.text ?? null,
  }),
)

setup.renderer.destroy()
process.exit(0)
