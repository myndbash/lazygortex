/**
 * How often Table reads the row expression it is handed.
 *
 * Every rule, the header and each row need the column widths, and the widths
 * are derived from the rows — so an unmemoised Table evaluated its caller's
 * `rows={…}` expression once per row plus six times more. The Daemon table's
 * expression rebuilds the whole repo list three times per row, which is how a
 * 50-repo daemon spent about 4.8 seconds of blocking JS on every 3-second poll.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import type { TestRendererSetup } from "@opentui/core/testing"
import { Table, type TableRow } from "../src/ui/Table.tsx"

process.env["LAZYGORTEX_STATE_FILE"] = "off"

const COLUMNS = [{ header: "repo" }, { header: "nodes", align: "right" as const }]

let setup: TestRendererSetup
let reads = 0

/** Counts every read of the rows prop, exactly as the audit's instrument did. */
function countedRows(count: number): TableRow[] {
  reads++
  return Array.from({ length: count }, (_, index) => [`repo-${index}`, String(index * 100)])
}

beforeAll(async () => {
  setup = await testRender(() => <Table columns={COLUMNS} rows={countedRows(20)} width={60} />, {
    width: 80,
    height: 30,
  })
})

afterAll(() => setup?.renderer.destroy())

describe("Table", () => {
  test("materialises the rows expression once per pass, not once per row", async () => {
    await setup.flush()

    // pre-fix this was N + 6 = 26
    expect(reads).toBeLessThanOrEqual(2)
  })

  test("still draws every row, the header and both rules", () => {
    const frame = setup.captureCharFrame()

    expect(frame).toContain("repo-0")
    expect(frame).toContain("repo-19")
    expect(frame).toContain("nodes")
    expect(frame).toContain("┌")
    expect(frame).toContain("┘")
  })

  test("columns are still sized from the widest cell", () => {
    const row = setup
      .captureCharFrame()
      .split("\n")
      .find((line) => line.includes("repo-19"))
    // `repo-19` is 7 characters and `1900` is 4: │ + space + 7 + space + │ + …
    expect(row?.trim()).toBe("│ repo-19 │  1900 │")
  })
})
