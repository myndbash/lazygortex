/**
 * Layout at sizes the repo's own frame tests never ran at.
 *
 * Every one of these components renders correctly at 110x34 and degrades at
 * 80x24, the most common default — tables drawn wider than their pane, a modal
 * clipped through its own left border, a header welding two numbers into one
 * token. The components are rendered directly, so none of this needs a daemon.
 */

import { afterEach, describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import type { TestRendererSetup } from "@opentui/core/testing"
import { Header, visiblePanels } from "../src/ui/App.tsx"
import { Overlays } from "../src/ui/Overlays.tsx"
import { SidePanel } from "../src/ui/SidePanel.tsx"
import { StatusBar } from "../src/ui/StatusBar.tsx"
import { LogsDetail } from "../src/ui/MainPane.tsx"
import { Table, type Column, type TableRow } from "../src/ui/Table.tsx"
import { clearMessage, closeOverlay, notify, openOverlay, PANELS, resetState, setState } from "../src/state/store.ts"
import type { Repo } from "../src/gortex/types.ts"

process.env["LAZYGORTEX_STATE_FILE"] = "off"

let setup: TestRendererSetup | undefined

/** One renderer per test: these differ by terminal size, which is the point. */
async function render(node: () => unknown, width: number, height: number): Promise<string> {
  setup = await testRender(node as never, { width, height })
  await setup.flush()
  return setup.captureCharFrame()
}

const lines = (frame: string): string[] => frame.split("\n").filter((line) => line.trim().length > 0)

afterEach(() => {
  setup?.renderer.destroy()
  setup = undefined
  closeOverlay()
  resetState()
})

const COLUMNS: Column[] = [
  { header: "repo" },
  { header: "workspace" },
  { header: "files", align: "right" },
  { header: "nodes", align: "right" },
  { header: "edges", align: "right" },
  { header: "on disk", align: "right" },
]

const ROWS: TableRow[] = [
  ["lazygortex", "myndbash/lazygortex", "101", "2737", "10091", "1.9 MiB"],
  [".config", "demouser/conf", "3618", "180966", "416076", "95.0 MiB"],
]

describe("Table at a narrow pane", () => {
  test("never draws wider than the width it was given", async () => {
    // 36 is what an 80-column terminal leaves for the detail pane
    const frame = await render(() => <Table columns={COLUMNS} rows={ROWS} width={36} />, 40, 12)

    for (const line of lines(frame)) expect(line.trimEnd().length).toBeLessThanOrEqual(36)
  })

  test("drops trailing columns rather than emit a table it cannot draw", async () => {
    // six columns cannot fit 20 characters even at their floor
    const frame = await render(() => <Table columns={COLUMNS} rows={ROWS} width={20} />, 30, 12)

    for (const line of lines(frame)) {
      expect(line.trimEnd().length).toBeLessThanOrEqual(20)
      // every line closes: rows on a border, rules on a corner or a tee
      expect("│┐┤┘".includes(line.trimEnd().slice(-1))).toBe(true)
    }
    // the leftmost columns are the ones worth keeping
    expect(frame).not.toContain("on disk")
  })

  test("rules and rows are all the same width", async () => {
    const frame = await render(() => <Table columns={COLUMNS} rows={ROWS} width={36} />, 40, 12)
    const widths = new Set(lines(frame).map((line) => line.trimEnd().length))

    expect([...widths]).toHaveLength(1)
  })

  test("the empty table draws its `no rows` line between borders", async () => {
    const frame = await render(() => <Table columns={COLUMNS} rows={[]} width={60} />, 70, 12)
    const row = lines(frame).find((line) => line.includes("no rows"))

    expect(row?.trimEnd().startsWith("│")).toBe(true)
    expect(row?.trimEnd().endsWith("│")).toBe(true)
    expect(row?.trimEnd().length).toBe(lines(frame)[0]?.trimEnd().length)
  })
})

describe("overlays at a small terminal", () => {
  test("the help overlay keeps the line that says how to close it at 80x24", async () => {
    openOverlay({ kind: "help" })
    const frame = await render(() => <Overlays />, 80, 24)

    expect(frame).toContain("esc or ? to close")
    // content that does not fit is cut with a line saying so, not clamped back
    // inside the frame to paint over what is already there
    expect(frame).toContain("── Repos panel")
    expect(frame).toContain("more lines — grow the terminal")
    expect(frame).not.toContain("Repostrack")
  })

  test("the help overlay lists every key that runs a binding, not just its label", async () => {
    openOverlay({ kind: "help" })
    const frame = await render(() => <Overlays />, 110, 40)

    // the status bar needs `q` and `tab`; the help promised the full list
    expect(frame).toContain("q ctrl+c")
    expect(frame).toContain("tab ]")
    expect(frame).toContain("pagedown ctrl+d")
    // and the digit line counts the panels there are
    expect(frame).toContain(`1…${PANELS.length}`)
  })

  test("the help overlay stays inside a 70-column terminal, left border included", async () => {
    openOverlay({ kind: "help" })
    const frame = await render(() => <Overlays />, 70, 30)

    // clipped through its own left border, the surviving text read as other,
    // plausible keys: `b next panel`, `tab previous panel`, `Dn page down`
    expect(frame).toContain("╭─ Keys")
    for (const line of lines(frame)) expect(line.trimEnd().length).toBeLessThanOrEqual(70)
  })

  test("a prompt keeps its frame and its hint at 50 columns", async () => {
    openOverlay({ kind: "prompt", title: "Track repository", body: "Absolute path.", initial: "", onSubmit: () => {} })
    const frame = await render(() => <Overlays />, 50, 20)

    expect(frame).toContain("Track repository")
    expect(frame).toContain("esc to cancel")
    for (const line of lines(frame)) expect(line.trimEnd().length).toBeLessThanOrEqual(50)
  })
})

describe("the header at a narrow terminal", () => {
  test("does not weld the uptime and the repo count together", async () => {
    setState("binary", { ok: true, path: "/usr/bin/gortex" })
    setState("status", "data", {
      running: true,
      state: "ready",
      uptime: "3h20m",
      version: "v0.63.3+d4801638",
      fields: [],
      workspaces: [],
      mcpSessions: [],
      repos: Array.from({ length: 10 }, (_, index) => ({
        repo: `repo-${index}`,
        path: `/home/u/repo-${index}`,
        workspace: "ws/p",
        total: "1.0 MiB",
        files: 1,
        nodes: 1,
        edges: 1,
      })),
    })

    const frame = await render(() => <Header width={60} />, 60, 3)

    // `up 3h20m10 repos` — two correct numbers, one nonsense token
    expect(frame).not.toContain("3h20m10")
    expect(frame).toContain("lazygortex")
    for (const line of lines(frame)) expect(line.trimEnd().length).toBeLessThanOrEqual(60)
  })

  test("counts the same repositories the panel below it lists", async () => {
    setState("binary", { ok: true, path: "/usr/bin/gortex" })
    // `repos --json` lists a freshly tracked repo before the daemon's own table
    // does, and the header used to count the table while the panel counted this
    setState("repos", "data", [
      { name: "parser", path: "/home/u/parser", head_commit: "abc", branch: "main", stale: false, indexed: true },
      { name: "ledger", path: "/home/u/ledger", head_commit: "", stale: false, indexed: false },
    ])
    setState("status", "data", {
      running: true,
      fields: [],
      workspaces: [],
      mcpSessions: [],
      repos: [
        {
          repo: "parser",
          path: "/home/u/parser",
          workspace: "demouser/parser",
          total: "8.7 MiB",
          files: 270,
          nodes: 11762,
          edges: 48085,
        },
      ],
    })

    expect(await render(() => <Header width={80} />, 80, 3)).toContain("2 repos")
  })
})

describe("the side column", () => {
  function seedRepos(count: number): void {
    setState(
      "repos",
      "data",
      Array.from<unknown, Repo>({ length: count }, (_, index) => ({
        name: `repo-${String(index).padStart(2, "0")}`,
        path: `/home/u/repo-${index}`,
        head_commit: "abc1234",
        branch: "main",
        stale: false,
        indexed: true,
      })),
    )
  }

  test("says nothing about more rows when the list is scrolled to its end", async () => {
    seedRepos(10)
    setState("cursor", "repos", 9)
    const frame = await render(() => <SidePanel capacity={4} compact={false} panels={[...PANELS]} hidden={0} />, 40, 30)

    expect(frame).not.toContain("0 more")
    // and it says what is above instead, which the old line never did
    expect(frame).toContain("↑ 6")
  })

  test("counts what is below when the list is scrolled to its start", async () => {
    seedRepos(10)
    setState("cursor", "repos", 0)
    const frame = await render(() => <SidePanel capacity={4} compact={false} panels={[...PANELS]} hidden={0} />, 40, 30)

    expect(frame).toContain("↓ 6 more")
    expect(frame).not.toContain("↑")
  })

  test("says how many panels it had to leave out", async () => {
    const roster = visiblePanels(7, true, "repos")
    const frame = await render(
      () => <SidePanel capacity={1} compact={true} panels={roster.panels} hidden={roster.hidden} />,
      40,
      10,
    )

    expect(roster.hidden).toBeGreaterThan(0)
    expect(frame).toContain(`${roster.hidden} more panels`)
  })
})

describe("visiblePanels", () => {
  test("shows every panel when they fit", () => {
    expect(visiblePanels(34, false, "repos")).toEqual({ panels: [...PANELS], hidden: 0 })
    expect(visiblePanels(10, true, "repos")).toEqual({ panels: [...PANELS], hidden: 0 })
  })

  test("keeps the focused panel in the window whatever its number", () => {
    // a 10-row pane: three of the seven panels used to vanish with no marker
    const roster = visiblePanels(7, true, "logs")

    expect(roster.panels).toContain("logs")
    expect(roster.hidden).toBe(PANELS.length - roster.panels.length)
    expect(roster.panels.length).toBeLessThan(PANELS.length)
  })

  test("keeps the panels in their own order, so the digits still read left to right", () => {
    const roster = visiblePanels(8, true, "sessions")
    const indexes = roster.panels.map((panel) => PANELS.indexOf(panel))

    expect(indexes).toEqual([...indexes].sort((a, b) => a - b))
  })

  test("never shows nothing", () => {
    expect(visiblePanels(1, true, "repos").panels.length).toBeGreaterThan(0)
    expect(visiblePanels(0, true, "daemon").panels).toContain("daemon")
  })
})

describe("the status bar", () => {
  test("keeps q and ? at every realistic width", async () => {
    setState("binary", { ok: true, path: "/usr/bin/gortex" })
    setState("panel", "repos")

    for (const width of [80, 100, 120]) {
      const frame = await render(() => <StatusBar width={width} />, width, 3)
      // the Repos hints are longer than 80 columns on their own, and stopping at
      // the first that did not fit dropped both of these
      expect(frame).toContain("q quit")
      expect(frame).toContain("? help")
      setup?.renderer.destroy()
      setup = undefined
    }
  })

  test("says when it had to leave hints out", async () => {
    setState("binary", { ok: true, path: "/usr/bin/gortex" })
    setState("panel", "repos")
    const frame = await render(() => <StatusBar width={60} />, 60, 3)

    expect(frame).toContain("··")
    expect(frame).toContain("q quit")
  })

  test("shows a message raised while a command runs, over the spinner", async () => {
    setState("busy", "track /home/u/alpha")
    setState("busyAt", Date.now() - 100)
    notify("error", "already tracked: /home/u/alpha")

    const frame = await render(() => <StatusBar width={80} />, 80, 3)
    expect(frame).toContain("already tracked")

    clearMessage()
  })

  test("shows the running command when nothing newer has been said", async () => {
    clearMessage()
    setState("busy", "re-index /home/u/alpha")
    setState("busyAt", Date.now())

    const frame = await render(() => <StatusBar width={80} />, 80, 3)
    expect(frame).toContain("re-index /home/u/alpha")
  })
})

describe("the logs view", () => {
  test("renders a bounded window and says how many older lines it holds", async () => {
    setState("panel", "logs")
    setState(
      "logs",
      "data",
      Array.from({ length: 1000 }, (_, index) => `log line number ${index}`),
    )

    // the detail view on its own: the App starts a three-second refresh for this
    // panel that would replace the buffer under the assertion, and MainPane's
    // scrollbox sticks to the bottom, which scrolls the marker out of the frame.
    // The viewport is taller than the window because opentui clamps children
    // that do not fit back inside their parent, where they overpaint each other.
    const frame = await render(() => <LogsDetail />, 110, 520)

    expect(frame).toContain("500 older of 1000 buffered lines not shown")
    // the window starts at 500: the pane shows the top of what it rendered
    expect(frame).toContain("log line number 500")
    expect(frame).not.toContain("log line number 499")
  })

  test("renders the whole buffer when it fits inside the window", async () => {
    setState("panel", "logs")
    setState(
      "logs",
      "data",
      Array.from({ length: 12 }, (_, index) => `log line number ${index}`),
    )

    const frame = await render(() => <LogsDetail />, 110, 34)

    expect(frame).toContain("log line number 0")
    expect(frame).not.toContain("older of")
  })
})
