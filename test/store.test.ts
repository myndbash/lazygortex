/**
 * Unit tests for the two store helpers the Track prompt depends on. Both are
 * pure `.ts`, so they need no Solid preload, no renderer and no gortex binary.
 */

import { beforeEach, describe, expect, test } from "bun:test"
import { resolve } from "node:path"
import { isTracked, normalizePath, repoRows, resetState, setState } from "../src/state/store.ts"
import type { Repo } from "../src/gortex/types.ts"

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
