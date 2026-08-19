import { describe, expect, test } from "bun:test"
import { errorMessage, parseDaemonStatus, parseSavings, parseWorkspaceList, stripAnsi } from "../src/gortex/parse.ts"
import { STATUS_CAPTURE, STATUS_VERSION } from "./fixtures/daemon-status.ts"

describe("parseDaemonStatus", () => {
  const status = parseDaemonStatus(STATUS_CAPTURE)

  test("reads the key/value block", () => {
    expect(status.running).toBe(true)
    expect(status.pid).toBe("1257")
    expect(status.version).toBe(STATUS_VERSION)
    expect(status.uptime).toBe("1h48m")
    expect(status.state).toBe("ready (warmup 43s)")
    expect(status.memory).toBe("173.5 MiB")
    expect(status.fields.length).toBe(10)
  })

  test("reads every table", () => {
    expect(status.workspaces).toHaveLength(2)
    expect(status.workspaces[0]).toMatchObject({ workspace: "org", repos: 2, nodes: 12207 })

    // five tracked repos, and not the `other` totals row behind the mid-rule
    expect(status.repos).toHaveLength(5)
    expect(status.repos.map((row) => row.repo)).not.toContain("other")
    expect(status.repos[2]).toMatchObject({ repo: "beta", workspace: "org/beta", files: 672, edges: 35852 })

    // the control session this very call registered is dropped
    expect(status.mcpSessions).toHaveLength(8)
    expect(status.mcpSessions.every((session) => session.client === "claude-code")).toBe(true)
  })

  test("reads full paths, which the CLI does not truncate", () => {
    // the fixture this replaced pinned `/home/demouser/.confi`, a truncation
    // the CLI has never emitted
    expect(status.repos.map((row) => row.path)).toContain("/home/demouser/.config")
    for (const row of status.repos) expect(row.path.endsWith("…")).toBe(false)
  })

  test("keys the tracked-repos columns by header, past the four the CLI added", () => {
    // nodes_b, edges_b, search_b and vectors_b sit between `edges` and `path`
    // and no type in the repo declares them
    const config = status.repos.find((row) => row.repo === ".config")
    expect(config).toMatchObject({ nodes: 180966, edges: 416076, path: "/home/demouser/.config" })
  })

  test("reports a stopped daemon instead of throwing", () => {
    const empty = parseDaemonStatus("Error: no daemon is running\n")
    expect(empty.running).toBe(false)
    expect(empty.repos).toHaveLength(0)
  })
})

describe("parseSavings", () => {
  // a live capture: the header the old fixture assumed was three lines long is
  // six today, which is what made the detail pane draw the bars twice
  const DASHBOARD = `Gortex Token Savings
====================
Store:          /home/u/.local/share/gortex/sidecar.sqlite
Tracking since: 2026-01-04 09:00
Last updated:   2026-01-06 17:45


Today       ██░░░░░░░░░░░░░░   13.3%  saved 24,000 / 180,000 tokens  $0.1500
Last 7 days █████░░░░░░░░░░░   33.80%  saved 400,000 / 1,200,000 tokens  $2.40
All time    █████░░░░░░░░░░░   33.80%  saved 400,000 / 1,200,000 tokens  $2.40

Cost avoided per model (all time):
  claude-opus-5 $3.00   (300 calls · 600,000 tokens saved)
`
  const savings = parseSavings(DASHBOARD)

  test("reads all three buckets", () => {
    expect(savings.buckets).toHaveLength(3)
    expect(savings.buckets[0]).toEqual({
      label: "Today",
      percent: 13.3,
      percentText: "13.3",
      saved: 24000,
      total: 180000,
      usd: 0.15,
      usdText: "0.1500",
    })
    expect(savings.buckets[2]?.saved).toBe(400000)
  })

  test("keeps the figures as printed, because a cost is not a quantity to reformat", () => {
    // Number("0.1500") renders back as 0.15, and Number("33.80") as 33.8
    expect(savings.buckets[0]?.usdText).toBe("0.1500")
    expect(savings.buckets[1]?.percentText).toBe("33.80")
  })

  test("the tail is what the dashboard says after the bars", () => {
    expect(savings.tail).toContain("Cost avoided per model")
    // and never the bars themselves, which is what counting header lines gave
    expect(savings.tail).not.toContain("Last 7 days")
    expect(savings.tail).not.toContain("All time")
  })

  test("a dashboard with no bars has no tail to show", () => {
    expect(parseSavings("Gortex Token Savings\n====================\n").tail).toBe("")
  })
})

/**
 * A live capture, unlike the STATUS fixture above: the tracked-repos table
 * carries the daemon's `other` totals row behind a mid-table rule and the four
 * `_b` columns a later CLI release added, and the sessions table carries the
 * control session that reading the status registers for itself.
 */
const SESSION_ROWS = [
  "│ 0de613a0462362bc608001b995b1f9b8 │ claude-code │ 2.1.235 │    44m30s │ /home/demouser/Development/Dev/ledger │",
  "│ fd1a03ad387e2abd337e7c96f63a1a42 │ claude-code │ 2.1.235 │    44m30s │ /home/demouser/Work/beta              │",
  "│ sess_f2ce9acb66478ba4            │ cli         │         │        0s │                                       │",
  "│ a8ef1e1b7f4783b23b831c22777602bf │ claude-code │ 2.1.235 │    44m30s │ /home/demouser/Work/gamma01           │",
]

/** The daemon emits these in Go map order, which is randomised per call. */
function statusWithSessionOrder(order: number[]): string {
  return ` daemon    v0.63.3+d4801638
 pid       1257
 sessions  4

tracked repos:
┌─────────┬─────────────────┬──────────┬───────┬────────┬────────┬───────────┬──────────┬──────────┬───────────┬──────────────────────────────────────────────┐
│ repo    │ workspace       │ total    │ files │  nodes │  edges │ nodes_b   │ edges_b  │ search_b │ vectors_b │ path                                         │
├─────────┼─────────────────┼──────────┼───────┼────────┼────────┼───────────┼──────────┼──────────┼───────────┼──────────────────────────────────────────────┤
│ parser  │ demouser/parser │  8.7 MiB │   270 │  11762 │  48085 │   2.9 MiB │  5.9 MiB │      0 B │       0 B │ /home/demouser/Sandbox/parser                │
│ gamma01 │ org/gamma01     │  2.1 MiB │    87 │   3053 │  10841 │ 763.2 KiB │  1.3 MiB │      0 B │       0 B │ /home/demouser/Work/gamma01                  │
├─────────┼─────────────────┼──────────┼───────┼────────┼────────┼───────────┼──────────┼──────────┼───────────┼──────────────────────────────────────────────┤
│ other   │                 │ 93.6 MiB │       │        │        │           │          │          │           │ embedder + runtime + caches (not attributed) │
└─────────┴─────────────────┴──────────┴───────┴────────┴────────┴───────────┴──────────┴──────────┴───────────┴──────────────────────────────────────────────┘

MCP sessions:
┌──────────────────────────────────┬─────────────┬─────────┬───────────┬───────────────────────────────────────┐
│ id                               │ client      │ version │ connected │ cwd                                   │
├──────────────────────────────────┼─────────────┼─────────┼───────────┼───────────────────────────────────────┤
${order.map((index) => SESSION_ROWS[index]).join("\n")}
└──────────────────────────────────┴─────────────┴─────────┴───────────┴───────────────────────────────────────┘
`
}

describe("parseDaemonStatus, against a live capture", () => {
  const status = parseDaemonStatus(statusWithSessionOrder([0, 1, 2, 3]))

  test("the `other` totals row is not a repository", () => {
    // it arrives behind a mid-table rule, with prose where a path belongs, and
    // used to reach the Repos panel as a seventh repo that flickers in and out
    expect(status.repos.map((row) => row.repo)).toEqual(["parser", "gamma01"])
    expect(status.repos.some((row) => row.path.startsWith("embedder"))).toBe(false)
  })

  test("columns are still read by header, not by position", () => {
    // the CLI grew nodes_b/edges_b/search_b/vectors_b between repo and path
    expect(status.repos[0]).toMatchObject({
      repo: "parser",
      workspace: "demouser/parser",
      nodes: 11762,
      edges: 48085,
      path: "/home/demouser/Sandbox/parser",
    })
  })

  test("the control session the status call registers for itself is dropped", () => {
    expect(status.mcpSessions).toHaveLength(3)
    expect(status.mcpSessions.some((session) => session.client === "cli")).toBe(false)
  })

  test("sessions come out in the same order whatever order the daemon emits", () => {
    const orders = [
      [0, 1, 2, 3],
      [2, 3, 0, 1],
      [3, 2, 1, 0],
      [1, 0, 3, 2],
    ]
    const parsed = orders.map((order) => parseDaemonStatus(statusWithSessionOrder(order)).mcpSessions.map((s) => s.id))

    expect([...new Set(parsed.map((ids) => ids.join(",")))]).toHaveLength(1)
    expect(parsed[0]).toEqual([
      "0de613a0462362bc608001b995b1f9b8",
      "fd1a03ad387e2abd337e7c96f63a1a42",
      "a8ef1e1b7f4783b23b831c22777602bf",
    ])
  })

  test("the key/value block and later sections still parse around the summary row", () => {
    expect(status.version).toBe("v0.63.3+d4801638")
    expect(status.pid).toBe("1257")
    expect(status.mcpSessions[0]?.cwd).toBe("/home/demouser/Development/Dev/ledger")
  })
})

const WORKSPACE_LIST = `┌─────────────┬────────────────────────┬────────────────────────┬──────────────┬──────────────────────────┐
│ REPO        │ WORKSPACE              │ PROJECT                │ SOURCE       │ PATH                     │
├─────────────┼────────────────────────┼────────────────────────┼──────────────┼──────────────────────────┤
│ beta        │ org                    │ beta                   │ .gortex.yaml │ /home/demouser/Work/beta │
│ service@org │ (default: service@org) │ (default: service@org) │ default      │ /home/demouser/service   │
└─────────────┴────────────────────────┴────────────────────────┴──────────────┴──────────────────────────┘
`

describe("parseWorkspaceList", () => {
  const rows = parseWorkspaceList(WORKSPACE_LIST)

  test("reads a declared row as it stands", () => {
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({
      repo: "beta",
      workspace: "org",
      project: "beta",
      source: ".gortex.yaml",
      path: "/home/demouser/Work/beta",
    })
  })

  test("drops the `(default: …)` prose an undeclared repo renders", () => {
    // the cell is a rendering of "nothing declared", not a slug: adopting it
    // gave the Projects panel a phantom `(default: service@org)` group
    expect(rows[1]).toEqual({
      repo: "service@org",
      workspace: "",
      project: "",
      source: "default",
      path: "/home/demouser/service",
    })
  })
})

describe("helpers", () => {
  test("stripAnsi removes CSI sequences", () => {
    expect(stripAnsi("[38;2;1;2;3mred[0m")).toBe("red")
    expect(stripAnsi("plain [brackets] stay")).toBe("plain [brackets] stay")
  })

  test("errorMessage picks the first meaningful line", () => {
    expect(errorMessage("Error: the daemon does not track /tmp\nrun gortex track", "")).toBe(
      "the daemon does not track /tmp",
    )
    expect(errorMessage("", "", "fallback")).toBe("fallback")
  })
})
