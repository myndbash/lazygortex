/**
 * One copyToClipboard() call, printed as JSON.
 *
 * Run with an empty PATH to reach the OSC 52 fallback, which is the branch that
 * cannot be acknowledged and used to be reported as success.
 */

import { copyToClipboard } from "../../src/ui/clipboard.ts"

const result = await copyToClipboard(process.argv[2] ?? "text")
console.error(JSON.stringify(result))
process.exit(0)
