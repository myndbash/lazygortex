/**
 * Load-dedup scenarios, run in their own process against a fake GORTEX_BIN.
 *
 * Usage: bun load-scenario.ts <case>
 * Prints one JSON line describing where the store ended up.
 */

import { refresh, resetState, setState, state } from "../../src/state/store.ts"

const scenario = process.argv[2] ?? ""
const out: Record<string, unknown> = {}

if (scenario === "logs-fingerprint") {
  // two reads of the same slot with different parameters: the second must not
  // be handed the first one's result
  setState("logTail", 200)
  const first = refresh.logs()
  setState("logTail", 400)
  const second = refresh.logs()
  await Promise.all([first, second])
  out["lines"] = state.logs.data?.length ?? 0
}

if (scenario === "reset-midflight") {
  const running = refresh.status()
  resetState()
  await running
  // the load that was in the air belongs to the state that was thrown away
  out["dataAfterReset"] = state.status.data === null
  out["errorAfterReset"] = state.status.error
  out["loadingAfterReset"] = state.status.loading

  // and the slot still works afterwards
  await refresh.status()
  out["dataAfterSecondLoad"] = state.status.data !== null
}

console.log(JSON.stringify(out))
process.exit(0)
