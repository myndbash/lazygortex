/**
 * What a machine without gortex sees.
 *
 * lazygortex is a front end for the `gortex` CLI, so when the binary is missing
 * the honest thing is one screen that says so and how to fix it — not seven
 * panels of spawn errors.
 */

import { Show } from "solid-js"
import { state } from "../state/store.ts"
import { c, Row } from "./Row.tsx"
import { glyph, theme } from "./theme.ts"

export function Setup() {
  return (
    <box
      style={{
        flexGrow: 1,
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.bg,
      }}
    >
      <box
        title=" gortex not found "
        titleColor={theme.error}
        border
        borderStyle="rounded"
        borderColor={theme.error}
        style={{ width: 74, flexDirection: "column", padding: 1, backgroundColor: theme.panel }}
      >
        <Row
          parts={[
            c(theme.text, "lazygortex is a front end for the "),
            c(theme.accent, "gortex"),
            c(theme.text, " CLI."),
          ]}
        />
        <text> </text>
        <Row parts={[c(theme.dim, "tried".padEnd(10)), c(theme.warn, state.binary.path)]} />
        <Show when={state.binary.reason}>
          <Row parts={[c(theme.dim, "error".padEnd(10)), c(theme.error, state.binary.reason ?? "")]} />
        </Show>
        <text> </text>
        <text fg={theme.muted}>Fix it with either of:</text>
        <Row parts={[c(theme.dim, "  1. "), c(theme.text, "install gortex and make sure it is on your PATH")]} />
        <Row
          parts={[
            c(theme.dim, "  2. "),
            c(theme.text, "point lazygortex at it: "),
            c(theme.info, "GORTEX_BIN=/path/to/gortex lazygortex"),
          ]}
        />
        <text> </text>
        <text fg={theme.muted}>Once it is installed, start the daemon with `gortex daemon start`.</text>
        <text> </text>
        <Row
          parts={[
            c(theme.accent, "r"),
            c(theme.muted, " check again    "),
            c(theme.accent, "q"),
            c(theme.muted, " quit"),
          ]}
        />
      </box>
      <text> </text>
      <text
        fg={theme.dim}
      >{`${glyph.bullet} lazygortex only ever runs the gortex CLI; it makes no network calls of its own.`}</text>
    </box>
  )
}
