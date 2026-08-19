/**
 * One `run()` invocation against whatever GORTEX_BIN points at, printed as JSON.
 *
 * Its own process, because client.ts resolves GORTEX_BIN once at import and
 * `bun test` shares one module registry across files.
 *
 * Usage: bun run-scenario.ts <timeoutMs> [args...]
 */

import { failureMessage, run } from "../../src/gortex/client.ts"

const [timeout, ...args] = process.argv.slice(2)
const result = await run(args, { timeoutMs: Number(timeout) })

console.log(
  JSON.stringify({
    ok: result.ok,
    code: result.code,
    failure: result.failure ?? null,
    stdout: result.stdout,
    message: failureMessage(result),
    ms: Math.round(result.ms),
  }),
)
process.exit(0)
