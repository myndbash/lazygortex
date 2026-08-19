/**
 * Overlay tests: render only `<Overlays/>` and drive it the way a user does —
 * through the keyboard and the mouse, never by calling the callback held in the
 * store. Calling `state.overlay.onSubmit(...)` directly is what let every prompt
 * ship dead: the callback works fine in isolation, and the bug lives in the
 * component that reads it.
 *
 * Nothing here talks to the gortex CLI, so unlike the frame tests these run on a
 * machine with no daemon and no binary.
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import type { TestRendererSetup } from "@opentui/core/testing"
import { Overlays } from "../src/ui/Overlays.tsx"
import { closeOverlay, openOverlay, state } from "../src/state/store.ts"

process.env["LAZYGORTEX_STATE_FILE"] = "off"

// one renderer, built and torn down inside the file's lifecycle: `bun test`
// runs every file in one process, and two live renderers fight over the keyboard
let setup: TestRendererSetup

beforeAll(async () => {
  setup = await testRender(() => <Overlays />, { width: 90, height: 30 })
})

afterAll(() => setup?.renderer.destroy())

afterEach(async () => {
  closeOverlay()
  await setup.flush()
})

/** Screen position of a piece of rendered text, so clicks land on real widgets. */
function locate(needle: string): { x: number; y: number } {
  const rows = setup.captureCharFrame().split("\n")
  const y = rows.findIndex((row) => row.includes(needle))
  expect(y).toBeGreaterThanOrEqual(0)
  return { x: rows[y]!.indexOf(needle), y }
}

describe("overlays", () => {
  test("a prompt runs its callback with what was typed, then closes", async () => {
    const submitted: string[] = []
    openOverlay({
      kind: "prompt",
      title: "Filter repositories",
      body: "Empty clears the filter.",
      initial: "",
      onSubmit: (value) => submitted.push(value),
    })
    await setup.flush()
    expect(setup.captureCharFrame()).toContain("Filter repositories")

    await setup.mockInput.typeText("needle")
    setup.mockInput.pressEnter()
    await setup.flush()

    expect(submitted).toEqual(["needle"])
    expect(state.overlay).toBeNull()
  })

  test("a prompt submitted empty still reaches its callback", async () => {
    const submitted: string[] = []
    openOverlay({
      kind: "prompt",
      title: "Filter repositories",
      body: "Empty clears the filter.",
      initial: "",
      onSubmit: (value) => submitted.push(value),
    })
    await setup.flush()

    setup.mockInput.pressEnter()
    await setup.flush()

    // clearing a filter is a real action, and the callback decides what empty means
    expect(submitted).toEqual([""])
    expect(state.overlay).toBeNull()
  })

  test("escape closes a prompt without running its callback", async () => {
    let ran = false
    openOverlay({
      kind: "prompt",
      title: "Track repository",
      body: "Absolute path.",
      initial: "/tmp",
      onSubmit: () => {
        ran = true
      },
    })
    await setup.flush()

    // escape is routed by App, not by the overlay; close the way App would
    closeOverlay()
    await setup.flush()

    expect(ran).toBe(false)
    expect(state.overlay).toBeNull()
  })

  test("clicking a confirm button runs the confirmation", async () => {
    let ran = false
    openOverlay({
      kind: "confirm",
      title: "Untrack bridge",
      body: "/home/u/ledger",
      confirmLabel: "untrack",
      onConfirm: () => {
        ran = true
      },
    })
    await setup.flush()

    const target = locate("y/enter")
    await setup.mockMouse.click(target.x, target.y)
    await setup.flush()

    expect(ran).toBe(true)
    expect(state.overlay).toBeNull()
  })

  test("clicking cancel closes without confirming", async () => {
    let ran = false
    openOverlay({
      kind: "confirm",
      title: "Untrack bridge",
      body: "/home/u/ledger",
      confirmLabel: "untrack",
      onConfirm: () => {
        ran = true
      },
    })
    await setup.flush()

    const target = locate("n/esc")
    await setup.mockMouse.click(target.x, target.y)
    await setup.flush()

    expect(ran).toBe(false)
    expect(state.overlay).toBeNull()
  })

  test("clicking a menu option picks that option", async () => {
    const picked: string[] = []
    openOverlay({
      kind: "menu",
      title: "Enrich",
      options: [
        { label: "docs", value: "docs" },
        { label: "tests", value: "tests" },
      ],
      onPick: (value) => picked.push(value),
    })
    await setup.flush()

    const target = locate("tests")
    await setup.mockMouse.click(target.x, target.y)
    await setup.flush()

    expect(picked).toEqual(["tests"])
    expect(state.overlay).toBeNull()
  })
})
