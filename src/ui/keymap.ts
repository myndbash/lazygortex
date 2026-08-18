/**
 * The keymap is data, so the help overlay, the status-bar hints and the key
 * handler can never drift apart: they all read the same table.
 */

import type { KeyEvent } from "@opentui/core"
import {
  actions,
  analyzeKinds,
  currentKind,
  currentRepo,
  currentWorkspace,
  cyclePanel,
  isTracked,
  jumpCursor,
  moveCursor,
  normalizePath,
  notify,
  openOverlay,
  PANELS,
  refresh,
  runAnalysis,
  selectPanel,
  setState,
  state,
} from "../state/store.ts"
import { ENRICH_KINDS } from "../gortex/client.ts"
import { copyToClipboard } from "./clipboard.ts"

/** Normalised, printable identity of a key event: `ctrl+r`, `S`, `?`, `tab`. */
export function keyId(key: KeyEvent): string {
  const printable = key.sequence && key.sequence.length === 1 && key.sequence >= " " && key.sequence !== ""
  const base = !key.ctrl && !key.meta && printable ? key.sequence : key.name || key.sequence || ""
  const parts: string[] = []
  if (key.ctrl) parts.push("ctrl")
  if (key.meta) parts.push("alt")
  if (key.shift && base.length > 1) parts.push("shift")
  parts.push(base)
  return parts.join("+")
}

export interface Binding {
  /** every key that triggers this action */
  keys: string[]
  /** how the help overlay and status bar label it */
  label: string
  description: string
  /** panels this binding applies to; omitted means global */
  panels?: readonly PanelName[]
  /** shown in the compact status-bar hint line */
  hint?: boolean
  run: () => void
}

type PanelName = (typeof PANELS)[number]

const quit = (): void => {
  setState("quitting", true)
}

export function globalBindings(): Binding[] {
  return [
    { keys: ["q", "ctrl+c"], label: "q", description: "quit", hint: true, run: quit },
    { keys: ["?"], label: "?", description: "help", hint: true, run: () => openOverlay({ kind: "help" }) },
    { keys: ["tab", "]"], label: "tab", description: "next panel", hint: true, run: () => cyclePanel(1) },
    { keys: ["shift+tab", "["], label: "S-tab", description: "previous panel", run: () => cyclePanel(-1) },
    {
      keys: ["j", "down"],
      label: "j/↓",
      description: "move down",
      hint: true,
      run: () => (state.focus === "main" ? scrollMain(3) : moveCursor(1)),
    },
    {
      keys: ["k", "up"],
      label: "k/↑",
      description: "move up",
      run: () => (state.focus === "main" ? scrollMain(-3) : moveCursor(-1)),
    },
    {
      keys: ["pagedown", "ctrl+d"],
      label: "PgDn",
      description: "page down",
      run: () => (state.focus === "main" ? scrollMain(15) : moveCursor(10)),
    },
    {
      keys: ["pageup", "ctrl+u"],
      label: "PgUp",
      description: "page up",
      run: () => (state.focus === "main" ? scrollMain(-15) : moveCursor(-10)),
    },
    { keys: ["g", "home"], label: "g", description: "jump to top", run: () => jumpCursor("top") },
    { keys: ["G", "end"], label: "G", description: "jump to bottom", run: () => jumpCursor("bottom") },
    {
      keys: ["return", "l", "right"],
      label: "↵",
      description: "focus detail pane",
      hint: true,
      run: () => setState("focus", "main"),
    },
    {
      keys: ["escape", "h", "left"],
      label: "esc",
      description: "back to panel list",
      run: () => setState("focus", "side"),
    },
    { keys: ["r"], label: "r", description: "refresh this panel", hint: true, run: () => void refresh.current() },
    { keys: ["ctrl+r"], label: "C-r", description: "refresh everything", run: () => void refresh.all() },
    ...PANELS.map<Binding>((panel, index) => ({
      keys: [String(index + 1)],
      label: String(index + 1),
      description: `go to ${panel}`,
      run: () => selectPanel(panel),
    })),
  ]
}

function filterPrompt(panel: PanelName, what: string): Binding {
  return {
    keys: ["/"],
    panels: [panel],
    label: "/",
    description: `filter ${what}`,
    hint: true,
    run: () =>
      openOverlay({
        kind: "prompt",
        title: `Filter ${what}`,
        body: "Empty clears the filter.",
        initial: state.filter[panel],
        onSubmit: (value) => {
          setState("filter", panel, value.trim())
          setState("cursor", panel, 0)
        },
      }),
  }
}

export function panelBindings(): Binding[] {
  return [
    // ----- repos -----
    {
      keys: ["t"],
      panels: ["repos"],
      label: "t",
      description: "track a repository",
      hint: true,
      run: () =>
        openOverlay({
          kind: "prompt",
          title: "Track repository",
          body: "Absolute path to the repository the daemon should index.",
          initial: process.cwd(),
          onSubmit: (value) => {
            const path = normalizePath(value)
            if (!path) return
            // the CLI happily re-adds an already-tracked repo without a word,
            // so the check that makes the action meaningful lives here
            if (isTracked(path)) {
              notify("error", `already tracked: ${path} — press R to re-index it`)
              return
            }
            void actions.track(path)
          },
        }),
    },
    {
      keys: ["u"],
      panels: ["repos"],
      label: "u",
      description: "untrack the selected repository",
      hint: true,
      run: () => {
        const repo = currentRepo()
        if (!repo) return notify("error", "no repository selected")
        if (!isTracked(repo.path)) return notify("error", `not tracked: ${repo.path}`)
        openOverlay({
          kind: "confirm",
          title: `Untrack ${repo.name}`,
          body: `${repo.path}\n\nThe index for this repo is dropped. Source files are untouched.`,
          confirmLabel: "untrack",
          onConfirm: () => void actions.untrack(repo.path),
        })
      },
    },
    {
      keys: ["R"],
      panels: ["repos"],
      label: "R",
      description: "re-index (clears a stale index)",
      hint: true,
      run: () => {
        const repo = currentRepo()
        if (!repo) return notify("error", "no repository selected")
        openOverlay({
          kind: "confirm",
          title: `Re-index ${repo.name}`,
          body: `${repo.path}\n\nRuns \`gortex track --wait\`, which rebuilds the graph for this repo.\nLarge repos can take minutes.`,
          confirmLabel: "re-index",
          onConfirm: () => void actions.reindex(repo.path),
        })
      },
    },
    {
      keys: ["e"],
      panels: ["repos"],
      label: "e",
      description: "run an enrichment",
      run: () => {
        const repo = currentRepo()
        if (!repo) return notify("error", "no repository selected")
        openOverlay({
          kind: "menu",
          title: `Enrich ${repo.name}`,
          options: ENRICH_KINDS.map((kind) => ({ label: kind, value: kind })),
          onPick: (value) => void actions.enrich(value as (typeof ENRICH_KINDS)[number], repo.path),
        })
      },
    },
    {
      keys: ["W"],
      panels: ["repos"],
      label: "W",
      description: "set the repo's workspace[/project]",
      hint: true,
      run: () => {
        const repo = currentRepo()
        if (!repo) return notify("error", "no repository selected")
        openOverlay({
          kind: "prompt",
          title: `Workspace for ${repo.name}`,
          body: "workspace[/project] — repos sharing a workspace slug share a graph boundary.\nWritten to the repo's .gortex.yaml.",
          initial: repo.project ? `${repo.workspace}/${repo.project}` : repo.workspace,
          onSubmit: (value) => {
            const [workspace = "", project] = value.trim().split("/")
            if (!workspace) return notify("error", "workspace slug required")
            void actions.workspaceSet(repo.path, workspace, project)
          },
        })
      },
    },
    {
      keys: ["i"],
      panels: ["repos"],
      label: "i",
      description: "gortex init (wire up AI assistants)",
      run: () => {
        const repo = currentRepo()
        if (!repo) return notify("error", "no repository selected")
        openOverlay({
          kind: "confirm",
          title: `Init ${repo.name}`,
          body: `${repo.path}\n\nWrites MCP config and instruction files (.mcp.json, .claude/, CLAUDE.md, …)\ninto the repository for every detected assistant.`,
          confirmLabel: "init",
          onConfirm: () => void actions.init(repo.path),
        })
      },
    },
    filterPrompt("repos", "repositories"),
    {
      keys: ["y"],
      panels: ["repos"],
      label: "y",
      description: "yank the repository path to the clipboard",
      run: () => {
        const repo = currentRepo()
        if (!repo) return notify("error", "no repository selected")
        void copyToClipboard(repo.path).then(
          (via) => notify("success", `copied ${repo.path} (${via})`),
          (error: unknown) => notify("error", `copy failed: ${error instanceof Error ? error.message : error}`),
        )
      },
    },

    // ----- analyze -----
    {
      keys: ["a", "return"],
      panels: ["analyze"],
      label: "a/↵",
      description: "run the selected analyzer",
      hint: true,
      run: () => {
        const kind = currentKind()
        if (!kind) return notify("error", "no analyzer selected")
        if (kind.writes) {
          openOverlay({
            kind: "confirm",
            title: `Run ${kind.name}`,
            body: `${kind.description}\n\nThis analyzer writes metadata into the graph.`,
            confirmLabel: "run",
            onConfirm: () => void runAnalysis(kind.name),
          })
          return
        }
        void runAnalysis(kind.name)
      },
    },
    filterPrompt("analyze", "analyzers"),

    // ----- workspaces -----
    {
      keys: ["y"],
      panels: ["workspaces"],
      label: "y",
      description: "yank the workspace slug",
      run: () => {
        const workspace = currentWorkspace()
        if (!workspace) return notify("error", "no workspace selected")
        void copyToClipboard(workspace).then((via) => notify("success", `copied ${workspace} (${via})`))
      },
    },

    // ----- daemon -----
    {
      keys: ["s"],
      panels: ["daemon"],
      label: "s",
      description: "start the daemon",
      hint: true,
      run: () => void actions.daemonStart(),
    },
    {
      keys: ["S"],
      panels: ["daemon"],
      label: "S",
      description: "stop the daemon",
      hint: true,
      run: () =>
        openOverlay({
          kind: "confirm",
          title: "Stop daemon",
          body: "Every MCP client loses the graph until the daemon is started again.",
          confirmLabel: "stop",
          onConfirm: () => void actions.daemonStop(),
        }),
    },
    {
      keys: ["x"],
      panels: ["daemon"],
      label: "x",
      description: "restart the daemon",
      hint: true,
      run: () =>
        openOverlay({
          kind: "confirm",
          title: "Restart daemon",
          body: "Tracked repos are preserved; connected sessions reconnect.",
          confirmLabel: "restart",
          onConfirm: () => void actions.daemonRestart(),
        }),
    },
    {
      keys: ["w"],
      panels: ["daemon"],
      label: "w",
      description: "reload config (pick up new repos)",
      hint: true,
      run: () => void actions.daemonReload(),
    },

    // ----- logs -----
    {
      keys: ["+", "="],
      panels: ["logs"],
      label: "+",
      description: "tail more lines",
      hint: true,
      run: () => {
        setState("logTail", Math.min(5_000, state.logTail * 2))
        void refresh.logs()
      },
    },
    {
      keys: ["-"],
      panels: ["logs"],
      label: "-",
      description: "tail fewer lines",
      hint: true,
      run: () => {
        setState("logTail", Math.max(50, Math.floor(state.logTail / 2)))
        void refresh.logs()
      },
    },
  ]
}

/** Bindings that apply right now, panel-specific ones first. */
export function activeBindings(): Binding[] {
  const panel = state.panel
  const scoped = panelBindings().filter((binding) => !binding.panels || binding.panels.includes(panel))
  return [...scoped, ...globalBindings()]
}

export function handleKey(key: KeyEvent): boolean {
  const id = keyId(key)
  for (const binding of activeBindings()) {
    if (binding.keys.includes(id)) {
      binding.run()
      return true
    }
  }
  return false
}

/** Analyzer count, used by the panel summary. */
export function analyzerCount(): number {
  return analyzeKinds().length
}

// The main pane owns a scrollbox; the keymap talks to it through this hook so
// it does not need a reference to the renderer tree.
type Scroller = (delta: number) => void
let scroller: Scroller = () => {}

export function setScroller(fn: Scroller): void {
  scroller = fn
}

function scrollMain(delta: number): void {
  scroller(delta)
}
