/**
 * Width arithmetic, and the yank's honesty about what it managed to do.
 */

import { describe, expect, test } from "bun:test"
import { displayWidth, padTo, truncate } from "../src/ui/theme.ts"

process.env["LAZYGORTEX_STATE_FILE"] = "off"

describe("displayWidth", () => {
  test("counts terminal columns, not UTF-16 code units", () => {
    expect(displayWidth("lazygortex")).toBe(10)
    // three code units, six columns — this is what pushed table rules right
    expect(displayWidth("日本語")).toBe(6)
    expect("日本語".length).toBe(3)
    expect(displayWidth("café")).toBe(4)
  })
})

describe("truncate", () => {
  test("leaves a string that already fits", () => {
    expect(truncate("main", 10)).toBe("main")
  })

  test("cuts by columns, so wide text is not left overflowing", () => {
    const cut = truncate("日本語プロジェクト", 8)
    expect(displayWidth(cut)).toBeLessThanOrEqual(8)
    expect(cut.endsWith("…")).toBe(true)
  })

  test("never splits a surrogate pair", () => {
    const cut = truncate("feat/rocket-🚀-launch", 14)
    expect(displayWidth(cut)).toBeLessThanOrEqual(14)
    // a lone surrogate went straight into the frame buffer
    for (const unit of cut) expect(unit.codePointAt(0)! < 0xd800 || unit.codePointAt(0)! > 0xdfff).toBe(true)
  })

  test("refuses a width that cannot hold anything", () => {
    expect(truncate("anything", 1)).toBe("")
  })
})

describe("padTo", () => {
  test("pads to columns, so a CJK cell lines up with an ASCII one", () => {
    expect(displayWidth(padTo("日本語", 10))).toBe(10)
    expect(displayWidth(padTo("abc", 10))).toBe(10)
    expect(padTo("abc", 6, "right")).toBe("   abc")
  })

  test("never trims", () => {
    expect(padTo("lazygortex", 4)).toBe("lazygortex")
  })
})

describe("the clipboard fallback", () => {
  test("does not claim success for a write it cannot have confirmed", async () => {
    const scenario = new URL("fixtures/clipboard-scenario.ts", import.meta.url).pathname
    // no PATH means no wl-copy/pbcopy/xclip/xsel, so this reaches OSC 52
    // an absolute bun, because the child's PATH is deliberately empty
    const proc = Bun.spawn([process.execPath, scenario, "/home/u/alpha"], {
      env: { PATH: "", HOME: process.env["HOME"] ?? "/tmp" },
      stdout: "ignore",
      stderr: "pipe",
      stdin: "ignore",
    })
    const reported = JSON.parse((await new Response(proc.stderr).text()).trim()) as { kind: string; detail: string }
    await proc.exited

    expect(reported.kind).toBe("sent")
    expect(reported.detail).toBe("OSC 52")
  }, 30_000)
})
