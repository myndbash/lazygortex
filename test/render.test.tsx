/**
 * Frame tests: boot the real app against the real gortex CLI in a memory
 * renderer and assert on what lands on screen. They skip themselves when no
 * gortex binary is reachable.
 *
 * One renderer serves the whole file — the native renderer does not like being
 * torn down and rebuilt repeatedly inside a single process — and `resetState()`
 * puts the app back to its start-up state between tests.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import type { TestRendererSetup } from "@opentui/core/testing"
import { App } from "../src/ui/App.tsx"
import { projectRows, repoRows } from "../src/state/store.ts"
import { theme } from "../src/ui/theme.ts"
import { daemonStatus, GORTEX_BIN, run } from "../src/gortex/client.ts"
import { STATUS_CAPTURE } from "./fixtures/daemon-status.ts"
import type { Repo } from "../src/gortex/types.ts"
import { closeOverlay, refresh, resetState, restoreView, setState, state } from "../src/state/store.ts"

// the frame tests must start from a known view, never from a previous session
process.env["LAZYGORTEX_STATE_FILE"] = "off"

/**
 * These need a daemon that answers, not merely a binary on disk. Gating on the
 * file meant a contributor with gortex installed and the daemon stopped got a
 * 30-second stall and seventeen red tests blaming their data.
 */
const reachable = await daemonStatus()
  .then((status) => status.running)
  .catch(() => false)

if (!reachable) {
  const binary = await Bun.file(GORTEX_BIN)
    .exists()
    .catch(() => false)
  console.log(
    binary
      ? `skipping the frame tests: ${GORTEX_BIN} is installed but its daemon is not answering`
      : `skipping the frame tests: no gortex binary at ${GORTEX_BIN}`,
  )
}

const maybe = reachable ? describe : describe.skip

/** Repositories with known shapes, so an assertion cannot depend on this machine. */
const FIXTURE_REPOS: Repo[] = [
  {
    name: "alpha",
    path: "/home/u/alpha",
    head_commit: "1111111",
    branch: "main",
    stale: false,
    indexed: true,
    last_indexed: "2026-08-19T09:00:00+02:00",
  },
  {
    name: "beta",
    path: "/home/u/beta",
    head_commit: "2222222",
    branch: "main",
    stale: true,
    indexed: true,
    last_indexed: "2026-08-18T09:00:00+02:00",
  },
  {
    name: "gamma",
    path: "/home/u/gamma",
    head_commit: "3333333",
    branch: "main",
    stale: false,
    indexed: true,
    last_indexed: "2026-08-19T08:00:00+02:00",
  },
]

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

  // an overlay left open outlives this file: its <input> keeps a handler on the
  // key-handler singleton, and it would then swallow another file's keystrokes
  afterEach(async () => {
    closeOverlay()
    await setup.flush()
  })

  test("renders every panel, in order, with Repos focused first", () => {
    const frame = setup.captureCharFrame()

    expect(frame).toContain("lazygortex")
    const positions = ["Repos", "Workspaces", "Projects", "Sessions", "Savings", "Daemon", "Logs"].map((panel) =>
      frame.indexOf(panel),
    )
    expect(positions.every((index) => index >= 0)).toBe(true)
    // the whole column, in order: comparing only the last pair would miss a
    // Sessions/Savings swap
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
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

    setState("declarations", "data", [
      { repo: "alpha", workspace: "org", project: "alpha", source: ".gortex.yaml", path: "/home/u/alpha" },
    ])
    setState("cursor", "workspaces", 0)
    await setup.flush()

    await setup.waitForFrame((frame) => frame.includes("declarations"), PASSES)
    const frame = setup.captureCharFrame()
    // declarations render as a real box-drawing table
    expect(frame).toContain("┌")
    expect(frame).toContain("declared in")
  })

  test("clicking a row selects it, clicking another panel switches to it", async () => {
    // fixtures, so the assertion does not depend on how many repos this machine
    // happens to track
    setState("repos", "data", FIXTURE_REPOS)
    await setup.flush()

    // rows of the focused Repos panel start on the line under its top border
    setup.mockMouse.click(6, 3)
    await setup.flush()
    expect(state.panel).toBe("repos")
    expect(state.cursor.repos).toBe(1)
    expect(repoRows()[1]?.name).toBeTruthy()

    // wherever the Sessions box header happens to sit in the column
    const frame = setup.captureCharFrame().split("\n")
    const sessionsRow = frame.findIndex((line) => line.includes("Sessions"))
    expect(sessionsRow).toBeGreaterThan(0)
    setup.mockMouse.click(6, sessionsRow)
    await setup.flush()
    expect(state.panel).toBe("sessions")
  })

  test("the projects panel groups repos by their declared slug", async () => {
    setup.mockInput.pressKey("3")
    await setup.flush()
    expect(state.panel).toBe("projects")

    await setup.waitForFrame((frame) => frame.includes("── members"), PASSES)
    const frame = setup.captureCharFrame()
    expect(frame).toContain("declared in")
    expect(frame).toContain("┌")

    // every tracked repo belongs to exactly one project
    const grouped = projectRows().reduce((total, project) => total + project.members.length, 0)
    expect(grouped).toBe(repoRows().length)
  })

  test("row fragments carry their own colour", async () => {
    setup.mockInput.pressKey("1")
    await setup.flush()
    await setup.renderOnce()

    // a fresh repo's row is green — inline fragments used to lose their colour
    // entirely, which is the regression this guards. The fixture guarantees one
    // exists; a machine whose repos are all stale used to fail here.
    setState("repos", "data", FIXTURE_REPOS)
    await setup.flush()
    await setup.renderOnce()
    const fresh = repoRows().find((repo) => repo.freshness === "fresh")
    expect(fresh).toBeTruthy()

    const spans = setup.captureSpans().lines.flatMap((line) => line.spans)
    const row = spans.find((span) => span.text.includes(`● ${fresh!.name}`))
    expect(row).toBeTruthy()
    const hex = (span: (typeof spans)[number]) =>
      `#${[0, 1, 2].map((index) => (span.fg.buffer[index] ?? 0).toString(16).padStart(2, "0")).join("")}`
    expect(hex(row!)).toBe(theme.ok)
  })

  test("the selected row is painted, not just marked", async () => {
    setup.mockInput.pressKey("1")
    await setup.flush()
    setup.mockInput.pressKey("j")
    await setup.flush()
    await setup.renderOnce()

    const selected = repoRows()[state.cursor.repos]
    expect(selected).toBeTruthy()

    // captureSpans reads resolved cells, so every span inside an opaque panel
    // has an alpha of 255: the question is which background, on which row.
    // "some cell somewhere is painted" stayed green with rowBackground deleted.
    const hexOf = (channel: { buffer: ArrayLike<number> }): string =>
      `#${[0, 1, 2].map((index) => (channel.buffer[index] ?? 0).toString(16).padStart(2, "0")).join("")}`

    const spans = setup.captureSpans().lines.flatMap((line) => line.spans)
    const painted = spans.filter((span) => span.text.includes(selected!.name)).map((span) => hexOf(span.bg))
    expect(painted).toContain(state.focus === "side" ? theme.activeSelectionBg : theme.selectionBg)

    // and the rows that are not selected are not painted with it
    const others = spans
      .filter((span) => span.text.includes("●") && !span.text.includes(selected!.name))
      .map((span) => hexOf(span.bg))
    expect(others).not.toContain(theme.activeSelectionBg)
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
    for (const panel of ["1 Repos", "2 Workspaces", "3 Projects", "6 Daemon", "7 Logs"]) {
      expect(frame).toContain(panel)
    }
    // only the focused panel keeps its box
    expect(frame).not.toContain("╭─ 7 Logs")
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
    setup.mockInput.pressKey("6")
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
    setup.mockInput.pressKey("7")
    await setup.flush()
    expect(state.panel).toBe("logs")

    await setup.waitForFrame((frame) => frame.includes("Daemon logs"), PASSES)
    expect(state.logs.data?.length ?? 0).toBeGreaterThan(0)
  })

  test("a machine without gortex gets an explanation, not seven broken panels", async () => {
    setState("binary", { ok: false, path: "/nowhere/gortex", reason: "not found" })
    await setup.flush()
    await setup.renderOnce()

    const frame = setup.captureCharFrame()
    expect(frame).toContain("gortex not found")
    expect(frame).toContain("/nowhere/gortex")
    expect(frame).toContain("GORTEX_BIN=")
    expect(frame).toContain("check again")
    // the panel column is replaced, not merely covered
    expect(frame).not.toContain("── index size")

    setState("binary", { ok: true, path: "/usr/bin/gortex" })
    await setup.flush()
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

  test("the / prompt filters the repo list, and says so on screen", async () => {
    const tracked = repoRows({ filtered: false }).length
    expect(tracked).toBeGreaterThan(0)

    setup.mockInput.pressKey("/")
    await setup.flush()
    expect(state.overlay?.kind).toBe("prompt")

    await setup.mockInput.typeText("zzz")
    setup.mockInput.pressEnter()
    await setup.flush()

    expect(state.filter.repos).toBe("zzz")
    expect(state.overlay).toBeNull()
    expect(repoRows()).toHaveLength(0)

    // the needle rides on the panel title, and the empty list says why it is empty
    let frame = setup.captureCharFrame()
    expect(frame).toContain("Repos /zzz")
    expect(frame).toContain("no match for /zzz")

    // and once the panel collapses to its summary, both counts are shown
    setup.mockInput.pressKey("2")
    await setup.flush()
    frame = setup.captureCharFrame()
    expect(frame).toContain(`0 of ${tracked} tracked`)

    // clearing it through the same prompt puts the list back
    setup.mockInput.pressKey("1")
    await setup.flush()
    setup.mockInput.pressKey("/")
    await setup.flush()
    for (let index = 0; index < 8; index++) setup.mockInput.pressBackspace()
    setup.mockInput.pressEnter()
    await setup.flush()

    expect(state.filter.repos).toBe("")
    expect(repoRows()).toHaveLength(tracked)
    expect(setup.captureCharFrame()).not.toContain("Repos /")
  })

  test("the committed status capture still matches the shape the CLI emits", async () => {
    // the fixture this replaced pinned a table four columns narrower than
    // today's and paths the CLI never truncated; nothing failed when it drifted
    const headers = (text: string, section: string): string[] => {
      const lines = text.split("\n")
      const start = lines.findIndex((line) => line.trim().toLowerCase() === section)
      expect(start).toBeGreaterThanOrEqual(0)
      const header = lines.slice(start).find((line) => line.trim().startsWith("│"))
      return (header ?? "")
        .split("│")
        .map((cell) => cell.trim())
        .filter(Boolean)
    }

    const live = await run(["daemon", "status"], { timeoutMs: 10_000 })
    expect(live.ok).toBe(true)

    for (const section of ["workspaces:", "tracked repos:", "mcp sessions:"]) {
      expect(headers(live.stdout, section)).toEqual(headers(STATUS_CAPTURE, section))
    }
  }, 20_000)

  test("a failed repo listing is reported, not painted green", async () => {
    setState("repos", "error", "timeout after 20000ms")
    await setup.flush()

    // the repos slot was the one async slot with no ErrorLine anywhere
    expect(setup.captureCharFrame()).toContain("timeout after 20000ms")
  })

  test("the logs view renders a bounded window and says what it left out", async () => {
    setup.mockInput.pressKey("7")
    await setup.flush()
    expect(state.panel).toBe("logs")

    // the tail key can reach 5000 lines, and every one used to become a live
    // renderable that the 3-second poll tore down and rebuilt
    setState(
      "logs",
      "data",
      Array.from({ length: 1000 }, (_, index) => `log line number ${index}`),
    )
    await setup.flush()

    const frame = setup.captureCharFrame()
    expect(frame).toContain("500 older of 1000 buffered lines not shown")
    // the window starts at 500: the pane is showing the top of what it rendered
    expect(frame).toContain("log line number 500")
    expect(frame).not.toContain("log line number 499")
  })

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
