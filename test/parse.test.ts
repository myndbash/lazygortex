import { describe, expect, test } from "bun:test"
import { errorMessage, parseDaemonStatus, parseSavings, parseWorkspaceList, stripAnsi } from "../src/gortex/parse.ts"

const STATUS = ` daemon    v0.63.3+d4801638
 pid       1237
 socket    /run/user/1000/gortex.sock
 uptime    1h39m
 state     ready (warmup 28s)
 sessions  9
 memory    39.9 MiB
 search    sqlite-fts5  docs=44710  disk-resident
 trigram   live=0/3  heap=0 B/256.0 MiB  idle_ttl=10m0s
 runtime   alloc=39.9 MiB  sys=384.4 MiB  gc=391  goroutines=112

workspaces:
┌───────────┬───────┬───────────────┬───────┬────────┬────────┐
│ workspace │ repos │ projects      │ files │  nodes │  edges │
├───────────┼───────┼───────────────┼───────┼────────┼────────┤
│ org       │     2 │ emc2, ti-gerr │   729 │  11201 │  43765 │
│ demouser  │     3 │ bridge, dots  │  3378 │ 195370 │ 473875 │
└───────────┴───────┴───────────────┴───────┴────────┴────────┘

tracked repos:
┌─────────┬───────────────┬──────────┬───────┬────────┬────────┬──────────────────────┐
│ repo    │ workspace     │ total    │ files │  nodes │  edges │ path                 │
├─────────┼───────────────┼──────────┼───────┼────────┼────────┼──────────────────────┤
│ .config │ demouser/conf │ 95.0 MiB │  3009 │ 180966 │ 416076 │ /home/demouser/.confi│
│ beta    │ org/beta      │  6.6 MiB │   672 │   9229 │  35852 │ /home/demouser/emc2  │
└─────────┴───────────────┴──────────┴───────┴────────┴────────┴──────────────────────┘

MCP sessions:
┌──────────┬─────────────┬─────────┬───────────┬──────────────────┐
│ id       │ client      │ version │ connected │ cwd              │
├──────────┼─────────────┼─────────┼───────────┼──────────────────┤
│ e8de4387 │ claude-code │ 2.1.234 │     1m38s │ /home/demouser   │
└──────────┴─────────────┴─────────┴───────────┴──────────────────┘
`

describe("parseDaemonStatus", () => {
  const status = parseDaemonStatus(STATUS)

  test("reads the key/value block", () => {
    expect(status.running).toBe(true)
    expect(status.pid).toBe("1237")
    expect(status.version).toBe("v0.63.3+d4801638")
    expect(status.uptime).toBe("1h39m")
    expect(status.state).toBe("ready (warmup 28s)")
    expect(status.memory).toBe("39.9 MiB")
    expect(status.fields.length).toBe(10)
  })

  test("reads every table", () => {
    expect(status.workspaces).toHaveLength(2)
    expect(status.workspaces[0]).toMatchObject({ workspace: "org", repos: 2, nodes: 11201 })

    expect(status.repos).toHaveLength(2)
    expect(status.repos[1]).toMatchObject({ repo: "beta", workspace: "org/beta", files: 672, edges: 35852 })

    expect(status.mcpSessions).toHaveLength(1)
    expect(status.mcpSessions[0]).toMatchObject({ client: "claude-code", version: "2.1.234" })
  })

  test("reports a stopped daemon instead of throwing", () => {
    const empty = parseDaemonStatus("Error: no daemon is running\n")
    expect(empty.running).toBe(false)
    expect(empty.repos).toHaveLength(0)
  })
})

describe("parseSavings", () => {
  const savings = parseSavings(`Gortex Token Savings
====================

Today       █████░░░░░░░░░░░   28.5%  saved 5,158 / 18,130 tokens  $0.0258
Last 7 days ███████░░░░░░░░░   43.7%  saved 492,816 / 1,127,914 tokens  $2.46
All time    ███████░░░░░░░░░   43.7%  saved 492,816 / 1,127,914 tokens  $2.46
`)

  test("reads all three buckets", () => {
    expect(savings.buckets).toHaveLength(3)
    expect(savings.buckets[0]).toEqual({ label: "Today", percent: 28.5, saved: 5158, total: 18130, usd: 0.0258 })
    expect(savings.buckets[2]?.saved).toBe(492816)
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
