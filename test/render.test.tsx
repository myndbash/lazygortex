/**
 * Frame tests: boot the real app against the real gortex CLI in a memory
 * renderer and assert on what lands on screen. They skip themselves when no
 * gortex binary is reachable.
 *
 * One renderer serves the whole file — the native renderer does not like being
 * torn down and rebuilt repeatedly inside a single process — and `resetState()`
 * puts the app back to its start-up state between tests.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import type { TestRendererSetup } from "@opentui/core/testing"
import { App } from "../src/ui/App.tsx"
import { GORTEX_BIN } from "../src/gortex/client.ts"
import { refresh, resetState, state } from "../src/state/store.ts"

const available = await Bun.file(GORTEX_BIN)
  .exists()
  .catch(() => false)

const maybe = available ? describe : describe.skip

const PASSES = { maxPasses: 800 }

/**
 * Wait until the CLI-backed slots hold data. Render-pass budgets are useless
 * here: 800 passes go by in under a tenth of a second while a daemon read takes
 * a few hundred milliseconds.
 */
async function settle(timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (state.status.data && state.repos.data && state.logs.data && state.savings.data) return
    await Bun.sleep(25)
  }
  throw new Error("gortex data never arrived")
}

maybe("lazygortex", () => {
  let setup: TestRendererSetup

  beforeAll(async () => {
    setup = await testRender(() => <App />, { width: 110, height: 34 })
    void refresh.all()
    await settle()
    await setup.flush()
    await setup.waitForFrame((frame) => frame.includes("pid"), PASSES)
  })

  afterAll(() => setup?.renderer.destroy())

  beforeEach(async () => {
    resetState()
    void refresh.all()
    await settle()
    await setup.flush()
  })

  test("renders the panel column, the header and the daemon detail", () => {
    const frame = setup.captureCharFrame()

    expect(frame).toContain("lazygortex")
    for (const panel of ["Daemon", "Repos", "Workspaces", "Sessions", "Savings", "Logs"]) {
      expect(frame).toContain(panel)
    }
    expect(frame).toContain("── daemon")
    expect(frame).toContain("uptime")
  })

  test("tab moves to the repos panel and shows the selected repository", async () => {
    setup.mockInput.pressKey("TAB")
    await setup.flush()
    expect(state.panel).toBe("repos")

    await setup.waitForFrame((frame) => frame.includes("── index size"), PASSES)
    const frame = setup.captureCharFrame()
    expect(frame).toContain("freshness")
    expect(frame).toContain("untrack the selected repository")
  })

  test("j and k move the selection inside the focused panel", async () => {
    setup.mockInput.pressKey("2")
    await setup.flush()
    expect(state.panel).toBe("repos")

    setup.mockInput.pressKey("j")
    await setup.flush()
    expect(state.cursor.repos).toBe(1)

    setup.mockInput.pressKey("k")
    await setup.flush()
    expect(state.cursor.repos).toBe(0)
  })

  test("? opens the help overlay and escape closes it", async () => {
    setup.mockInput.pressKey("?")
    await setup.flush()
    await setup.renderOnce()

    const frame = setup.captureCharFrame()
    expect(frame).toContain("refresh everything")
    expect(frame).toContain("jump straight to a panel")

    setup.mockInput.pressKey("ESCAPE")
    // the parser holds a lone ESC briefly to tell it apart from a sequence
    await Bun.sleep(150)
    await setup.flush()
    expect(state.overlay).toBeNull()
  })

  test("a destructive action asks for confirmation first", async () => {
    // `S` on the daemon panel must not stop anything on its own
    setup.mockInput.pressKey("S", { shift: true })
    await setup.flush()
    await setup.renderOnce()

    expect(state.overlay?.kind).toBe("confirm")
    expect(state.busy).toBeNull()
    expect(setup.captureCharFrame()).toContain("Stop daemon")

    setup.mockInput.pressKey("n")
    await setup.flush()
    expect(state.overlay).toBeNull()
    expect(state.busy).toBeNull()
  })

  test("the logs panel renders daemon log lines", async () => {
    setup.mockInput.pressKey("6")
    await setup.flush()
    expect(state.panel).toBe("logs")

    await setup.waitForFrame((frame) => frame.includes("Daemon logs"), PASSES)
    expect(state.logs.data?.length ?? 0).toBeGreaterThan(0)
  })
})
