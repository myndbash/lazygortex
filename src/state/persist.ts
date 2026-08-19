/**
 * Remember where the user was.
 *
 * A tiny JSON file under `$XDG_STATE_HOME/lazygortex` (or `~/.local/state`)
 * holds the last panel, the last selected repository and the log tail size.
 * Every read and write is best-effort: a missing, unreadable or malformed file
 * simply means "start fresh".
 */

const HOME = process.env["HOME"] ?? "."

/**
 * `LAZYGORTEX_STATE_FILE` overrides the location; `off` disables persistence.
 *
 * The comparison is case- and whitespace-insensitive, and `0`, `none` and the
 * empty string mean the same thing: `LAZYGORTEX_STATE_FILE=OFF` used to be read
 * as a filename and wrote a file called `OFF` into the working directory. A
 * relative override is resolved against $HOME rather than wherever the app
 * happened to be launched from.
 */
function stateFile(): string | null {
  const raw = process.env["LAZYGORTEX_STATE_FILE"]
  if (raw !== undefined) {
    const override = raw.trim()
    if (["off", "0", "none", ""].includes(override.toLowerCase())) return null
    return override.startsWith("/") ? override : `${HOME}/${override}`
  }
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

/**
 * Write anything still pending, now. The quit path exits ten milliseconds after
 * it destroys the renderer, so without this every navigation in the last half
 * second is lost — and a session shorter than the debounce writes nothing at
 * all, which is why the remembered view never appeared on a first run.
 */
export async function flushPersisted(): Promise<void> {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  const snapshot = pending
  pending = null
  if (snapshot) await write(snapshot)
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
