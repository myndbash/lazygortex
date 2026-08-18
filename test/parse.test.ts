import { describe, expect, test } from "bun:test"
import { errorMessage, parseDaemonStatus, parseSavings, stripAnsi } from "../src/gortex/parse.ts"

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
