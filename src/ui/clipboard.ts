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

export async function copyToClipboard(text: string): Promise<string> {
  for (const [command, args] of CANDIDATES) {
    const binary = Bun.which(command)
    if (!binary) continue
    try {
      const proc = Bun.spawn([binary, ...args], { stdin: "pipe", stdout: "ignore", stderr: "ignore" })
      proc.stdin.write(text)
      await proc.stdin.end()
      if ((await proc.exited) === 0) return command
    } catch {
      // try the next one
    }
  }

  // OSC 52: ESC ] 52 ; c ; <base64> BEL
  const payload = Buffer.from(text, "utf8").toString("base64")
  process.stdout.write(`\u001b]52;c;${payload}\u0007`)
  return "OSC 52"
}
