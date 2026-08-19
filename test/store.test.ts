/**
 * Unit tests for the two store helpers the Track prompt depends on. Both are
 * pure `.ts`, so they need no Solid preload, no renderer and no gortex binary.
 */

import { beforeEach, describe, expect, test } from "bun:test"
import { resolve } from "node:path"
import { isTracked, normalizePath, projectRows, repoRows, resetState, setState } from "../src/state/store.ts"
import type { DaemonRepo, Repo, WorkspaceDeclaration } from "../src/gortex/types.ts"

process.env["LAZYGORTEX_STATE_FILE"] = "off"

function repo(name: string, path: string): Repo {
  return { name, path, head_commit: "abc1234", branch: "main", stale: false, indexed: true }
}

beforeEach(() => resetState())

describe("normalizePath", () => {
  test("resolves an empty or blank string to the cwd", () => {
    // it does not refuse: callers that treat empty as "never mind" guard the raw value
    expect(normalizePath("")).toBe(process.cwd())
    expect(normalizePath("   ")).toBe(process.cwd())
  })

  test("collapses `..`, `.` and duplicate separators", () => {
    expect(normalizePath("/a/b/../c")).toBe("/a/c")
    expect(normalizePath("/a//b/./c")).toBe("/a/b/c")
    expect(normalizePath("/a/b/c/..")).toBe("/a/b")
  })

  test("anchors a relative path to the cwd, `..` included", () => {
    expect(normalizePath("../sibling")).toBe(resolve(process.cwd(), "../sibling"))
    expect(normalizePath("child")).toBe(`${process.cwd()}/child`)
  })

  test("expands `~` and keeps expanding after it", () => {
    const home = process.env["HOME"] ?? ""
    expect(normalizePath("~")).toBe(home)
    expect(normalizePath("~/code")).toBe(`${home}/code`)
    expect(normalizePath("~/code/../notes")).toBe(`${home}/notes`)
  })

  test("drops a trailing slash but leaves the root alone", () => {
    expect(normalizePath("/a/b/")).toBe("/a/b")
    expect(normalizePath("/a/b///")).toBe("/a/b")
    expect(normalizePath("/")).toBe("/")
  })
})

describe("isTracked", () => {
  beforeEach(() => {
    setState("repos", "data", [repo("alpha", "/home/u/alpha"), repo("beta", "/home/u/beta")])
  })

  test("answers for every tracked repo", () => {
    expect(isTracked("/home/u/alpha")).toBe(true)
    expect(isTracked("/home/u/beta")).toBe(true)
    expect(isTracked("/home/u/gamma")).toBe(false)
  })

  test("ignores the panel filter — it is a question about the daemon, not the view", () => {
    setState("filter", "repos", "alpha")
    expect(repoRows()).toHaveLength(1)
    expect(isTracked("/home/u/beta")).toBe(true)

    setState("filter", "repos", "zzz")
    expect(repoRows()).toHaveLength(0)
    expect(isTracked("/home/u/alpha")).toBe(true)
    expect(isTracked("/home/u/beta")).toBe(true)
  })

  test("a `..` path normalises to the same answer as the canonical one", () => {
    expect(isTracked(normalizePath("/home/u/beta/../alpha"))).toBe(true)
    expect(isTracked("/home/u/beta/../alpha")).toBe(false)
  })
})

describe("repoRows and the workspace slug", () => {
  function daemonRepo(repo: string, path: string, workspace: string, nodes: number): DaemonRepo {
    return { repo, path, workspace, total: "1.0 MiB", files: 10, nodes, edges: nodes * 2 }
  }

  function declaration(row: Partial<WorkspaceDeclaration>): WorkspaceDeclaration {
    return { repo: "", workspace: "", project: "", source: "", path: "", ...row }
  }

  beforeEach(() => {
    setState("repos", "data", [repo("gamma01", "/home/u/gamma01"), repo("service@org", "/home/u/service")])
    setState("status", "data", {
      running: true,
      fields: [],
      workspaces: [],
      mcpSessions: [],
      repos: [
        daemonRepo("gamma01", "/home/u/gamma01", "org/gamma01", 2860),
        daemonRepo("service@org", "/home/u/service", "org/gamma01", 2197),
      ],
    })
  })

  test("a repo that declares nothing keeps the slug the daemon inherited for it", () => {
    setState("declarations", "data", [
      declaration({
        repo: "gamma01",
        workspace: "org",
        project: "gamma01",
        source: ".gortex.yaml",
        path: "/home/u/gamma01",
      }),
      declaration({ repo: "service@org", source: "default", path: "/home/u/service" }),
    ])

    const rows = repoRows()
    expect(rows.map((row) => [row.name, row.workspace, row.project])).toEqual([
      ["gamma01", "org", "gamma01"],
      ["service@org", "org", "gamma01"],
    ])
  })

  test("so the grouping does not split when the declarations land", () => {
    const before = projectRows()
    setState("declarations", "data", [
      declaration({
        repo: "gamma01",
        workspace: "org",
        project: "gamma01",
        source: ".gortex.yaml",
        path: "/home/u/gamma01",
      }),
      declaration({ repo: "service@org", source: "default", path: "/home/u/service" }),
    ])
    const after = projectRows()

    // the panel used to redraw itself a second after start-up: one group of two
    // became one group of one plus a phantom named after the placeholder prose
    expect(before.map((row) => row.key)).toEqual(["org/gamma01"])
    expect(after.map((row) => row.key)).toEqual(["org/gamma01"])
    expect(after[0]?.members).toHaveLength(2)
    expect(after[0]?.nodes).toBe(5057)
  })

  test("a declared slug still overrides what the daemon reports", () => {
    setState("declarations", "data", [
      declaration({
        repo: "service@org",
        workspace: "org",
        project: "redmine",
        source: ".gortex.yaml",
        path: "/home/u/service",
      }),
    ])

    expect(repoRows().find((row) => row.name === "service@org")?.project).toBe("redmine")
  })
})

describe("repoRows and rows that are not repositories", () => {
  test("a daemon row whose path is prose is not merged in as a repo", () => {
    setState("repos", "data", [repo("parser", "/home/u/parser")])
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
        // the parser drops this one now; the merge loop is the second line of
        // defence, because it is what turned the row into a repository
        {
          repo: "other",
          path: "embedder + runtime + caches (not attributed)",
          workspace: "",
          total: "93.6 MiB",
          files: 0,
          nodes: 0,
          edges: 0,
        },
      ],
    })

    expect(repoRows().map((row) => row.name)).toEqual(["parser"])
    expect(isTracked("embedder + runtime + caches (not attributed)")).toBe(false)
    expect(projectRows().map((row) => row.key)).toEqual(["demouser/parser"])
  })
})
