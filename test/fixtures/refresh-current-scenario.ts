/**
 * Runs `refresh.current()` once for one panel and exits, so the caller can read
 * off which CLI calls that panel's refresh key actually makes.
 *
 * Its own process, because it needs GORTEX_BIN pointed at a fake — see
 * fixtures/fake-gortex.ts.
 *
 * Usage: bun refresh-current-scenario.ts <panel>
 */

import { refresh, setState, type PanelId } from "../../src/state/store.ts"

const panel = (process.argv[2] ?? "repos") as PanelId

// the graph and index calls need a repo path before they will spawn anything
setState("repos", "data", [
  { name: "alpha", path: "/home/u/alpha", head_commit: "abc1234", branch: "main", stale: false, indexed: true },
])
setState("panel", panel)

await refresh.current()
process.exit(0)
