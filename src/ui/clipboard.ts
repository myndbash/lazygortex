/**
 * Yank helper: try the platform clipboard tools, then fall back to OSC 52,
 * which most terminals honour and which costs nothing when they do not.
 */

const CANDIDATES: Array<[string, string[]]> = [
  ["wl-copy", []],
  ["pbcopy", []],
  ["xclip", ["-selection", "clipboard"]],
  ["xsel", ["--clipboard", "--input"]],
]

export interface CopyResult {
  /** `copied` only when a clipboard tool confirmed it; `sent` is best-effort */
  kind: "copied" | "sent" | "failed"
  /** the tool that took it, or why nothing did */
  detail: string
}

/**
 * Copy, or say honestly that we could not.
 *
 * The OSC 52 fallback writes an escape sequence and cannot be acknowledged:
 * reporting it as success told users the path was on their clipboard when their
 * terminal may have discarded it.
 */
export async function copyToClipboard(text: string): Promise<CopyResult> {
  for (const [command, args] of CANDIDATES) {
    const binary = Bun.which(command)
    if (!binary) continue
    try {
      const proc = Bun.spawn([binary, ...args], { stdin: "pipe", stdout: "ignore", stderr: "ignore" })
      proc.stdin.write(text)
      await proc.stdin.end()
      if ((await proc.exited) === 0) return { kind: "copied", detail: command }
    } catch {
      // try the next one
    }
  }

  try {
    // OSC 52: ESC ] 52 ; c ; <base64> BEL
    const payload = Buffer.from(text, "utf8").toString("base64")
    process.stdout.write(`\u001b]52;c;${payload}\u0007`)
    return { kind: "sent", detail: "OSC 52" }
  } catch (error) {
    return { kind: "failed", detail: error instanceof Error ? error.message : String(error) }
  }
}
