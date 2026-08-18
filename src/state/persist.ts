/**
 * Remember where the user was.
 *
 * A tiny JSON file under `$XDG_STATE_HOME/lazygortex` (or `~/.local/state`)
 * holds the last panel, the last selected repository and the log tail size.
 * Every read and write is best-effort: a missing, unreadable or malformed file
 * simply means "start fresh".
 */

const HOME = process.env["HOME"] ?? "."

/** `LAZYGORTEX_STATE_FILE` overrides the location; `=off` disables persistence. */
function stateFile(): string | null {
  const override = process.env["LAZYGORTEX_STATE_FILE"]
  if (override === "off") return null
  if (override) return override
  const dir = `${process.env["XDG_STATE_HOME"] ?? `${HOME}/.local/state`}/lazygortex`
  return `${dir}/state.json`
}

export interface PersistedState {
  panel?: string
  /** absolute path of the repository that was selected */
  repo?: string
  logTail?: number
}

export async function loadPersisted(): Promise<PersistedState> {
  const path = stateFile()
  if (!path) return {}
  try {
    const file = Bun.file(path)
    if (!(await file.exists())) return {}
    const parsed: unknown = await file.json()
    return parsed && typeof parsed === "object" ? (parsed as PersistedState) : {}
  } catch {
    return {}
  }
}

let pending: PersistedState | null = null
let timer: ReturnType<typeof setTimeout> | null = null

/** Debounced write — navigation keys fire far faster than a disk write. */
export function savePersisted(next: PersistedState): void {
  pending = next
  if (timer) return
  timer = setTimeout(() => {
    timer = null
    const snapshot = pending
    pending = null
    if (snapshot) void write(snapshot)
  }, 500)
}

async function write(state: PersistedState): Promise<void> {
  const path = stateFile()
  if (!path) return
  try {
    await Bun.write(path, `${JSON.stringify(state, null, 2)}\n`)
  } catch {
    // an unwritable state dir is not worth interrupting the UI for
  }
}

export { stateFile }
