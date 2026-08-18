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
import { repoRows } from "../src/state/store.ts"
import { GORTEX_BIN } from "../src/gortex/client.ts"
import { refresh, resetState, restoreView, state } from "../src/state/store.ts"

const available = await Bun.file(GORTEX_BIN)
  .exists()
  .catch(() => false)

// the frame tests must start from a known view, never from a previous session
process.env["LAZYGORTEX_STATE_FILE"] = "off"

const maybe = available ? describe : describe.skip

const PASSES = { maxPasses: 800 }

/**
 * Wait until the CLI-backed slots hold data. Render-pass budgets are useless
 * here: 800 passes go by in under a tenth of a second while a daemon read takes
 * a few hundred milliseconds.
 */
/** Poll a predicate on the store; render-pass budgets are far too short here. */
async function until(predicate: () => boolean, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await Bun.sleep(25)
  }
  throw new Error("condition never became true")
}

async function settle(timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (
      state.status.data &&
      state.repos.data &&
      state.logs.data &&
      state.savings.data &&
      state.graph.data &&
      state.declarations.data
    ) {
      return
    }
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
    await setup.waitForFrame((frame) => frame.includes("── index size"), PASSES)
  })

  afterAll(() => setup?.renderer.destroy())

  beforeEach(async () => {
    resetState()
    void refresh.all()
    await settle()
    await setup.flush()
  })

  test("renders every panel, in order, with Repos focused first", () => {
    const frame = setup.captureCharFrame()

    expect(frame).toContain("lazygortex")
    const positions = ["Repos", "Workspaces", "Sessions", "Savings", "Daemon", "Logs"].map((panel) =>
      frame.indexOf(panel),
    )
    expect(positions.every((index) => index >= 0)).toBe(true)
    // Daemon sits immediately before Logs, at the end of the column
    expect(positions[4]).toBeLessThan(positions[5]!)
    expect(state.panel).toBe("repos")
    expect(frame).toContain("freshness")
  })

  test("the repos panel carries a legend for the freshness marks", () => {
    const frame = setup.captureCharFrame()
    // the legend rides on the Repos panel's bottom border
    expect(frame).toContain("no git")
    expect(frame).toContain("stale")
    // and the selected repo spells its own state out in words
    expect(frame).toMatch(/freshness\s+[●▲◌○]/)
  })

  test("per-repo graph bars come from the cached index-wide summary", async () => {
    // the detail pane must not fire a fresh call per selection
    const before = state.graph.at
    setup.mockInput.pressKey("j")
    await setup.flush()
    setup.mockInput.pressKey("k")
    await setup.flush()
    expect(state.graph.at).toBe(before)
    expect(setup.captureCharFrame()).toContain("by kind")
  })

  test("tab moves to the next panel", async () => {
    setup.mockInput.pressKey("TAB")
    await setup.flush()
    expect(state.panel).toBe("workspaces")

    await setup.waitForFrame((frame) => frame.includes("declarations"), PASSES)
    const frame = setup.captureCharFrame()
    // declarations render as a real box-drawing table
    expect(frame).toContain("┌")
    expect(frame).toContain("declared in")
    expect(frame).toContain(".gortex.yaml")
  })

  test("clicking a row selects it, clicking another panel switches to it", async () => {
    // rows of the focused Repos panel start on the line under its top border
    setup.mockMouse.click(6, 3)
    await setup.flush()
    expect(state.panel).toBe("repos")
    expect(state.cursor.repos).toBe(1)

    // wherever the Sessions box header happens to sit in the column
    const frame = setup.captureCharFrame().split("\n")
    const sessionsRow = frame.findIndex((line) => line.includes("Sessions"))
    expect(sessionsRow).toBeGreaterThan(0)
    setup.mockMouse.click(6, sessionsRow)
    await setup.flush()
    expect(state.panel).toBe("sessions")
  })

  test("the selected row is painted, not just marked", async () => {
    setup.mockInput.pressKey("1")
    await setup.flush()
    setup.mockInput.pressKey("j")
    await setup.flush()
    await setup.renderOnce()

    const rows = setup.captureSpans().lines
    const painted = rows.filter((line) =>
      line.spans.some((span) => span.bg.buffer[3] !== 0 && span.text.trim().length > 0 && span.text.includes("●")),
    )
    expect(painted.length).toBeGreaterThan(0)
  })

  test("clicking the detail pane moves the focus to it", async () => {
    setup.mockMouse.click(70, 5)
    await setup.flush()
    expect(state.focus).toBe("main")
  })

  test("a short terminal collapses the unfocused panels to header rows", async () => {
    setup.resize(100, 20)
    await setup.flush()
    await setup.renderOnce()

    const frame = setup.captureCharFrame()
    for (const panel of ["1 Repos", "2 Workspaces", "5 Daemon", "6 Logs"]) {
      expect(frame).toContain(panel)
    }
    // only the focused panel keeps its box
    expect(frame).not.toContain("╭─ 6 Logs")
    setup.resize(110, 34)
    await setup.flush()
  })

  test("j and k move the selection inside the focused panel", async () => {
    setup.mockInput.pressKey("1")
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
    setup.mockInput.pressKey("5")
    await setup.flush()
    expect(state.panel).toBe("daemon")

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

  test("the last view is restored, and restoring does not overwrite what it read", async () => {
    const fixture = `${process.env["TMPDIR"] ?? "/tmp"}/lazygortex-restore-test.json`
    const saved = { panel: "savings", repo: state.repos.data?.at(-1)?.path, logTail: 150 }
    await Bun.write(fixture, JSON.stringify(saved))
    process.env["LAZYGORTEX_STATE_FILE"] = fixture

    try {
      await restoreView()
      await setup.flush()

      expect(state.panel).toBe("savings")
      expect(state.logTail).toBe(150)
      // the panel restored through selectPanel, so its data loaded too
      expect(state.savings.data).toBeTruthy()
      expect(repoRows()[state.cursor.repos]?.path).toBe(saved.repo!)

      // a save fired mid-restore would have clobbered the file with defaults
      await Bun.sleep(700)
      expect(await Bun.file(fixture).json()).toEqual(saved)
    } finally {
      process.env["LAZYGORTEX_STATE_FILE"] = "off"
      await Bun.file(fixture)
        .unlink()
        .catch(() => {})
    }
  }, 40_000)

  test("tracking a repo the daemon already has is refused, not re-run", async () => {
    const tracked = state.repos.data?.[0]?.path
    expect(tracked).toBeTruthy()

    setup.mockInput.pressKey("t")
    await setup.flush()
    expect(state.overlay?.kind).toBe("prompt")

    const overlay = state.overlay as Extract<typeof state.overlay, { kind: "prompt" }>
    overlay.onSubmit(tracked!)
    await setup.flush()

    expect(state.busy).toBeNull()
    expect(state.message?.kind).toBe("error")
    expect(state.message?.text).toContain("already tracked")
  })
})
