/**
 * Modal overlays: help, confirm, prompt and menu. They render into the
 * renderer root through a Portal so they float above the two columns.
 */

import { For, Match, Show, Switch, createMemo, createSignal, type Accessor } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { closeOverlay, PANELS, PANEL_TITLES, state, type Overlay } from "../state/store.ts"
import { globalBindings, panelBindings, type Binding } from "./keymap.ts"
import { FRESHNESS } from "./SidePanel.tsx"
import { c, Row, type Piece } from "./Row.tsx"
import { glyph, padTo, theme, truncate } from "./theme.ts"

/**
 * Modals are absolutely positioned inside the app root rather than portalled
 * into the renderer root: an absolute child of a sized box lays out against
 * that box, which is exactly the centring behaviour a modal wants.
 */
function Frame(props: { title: string; width: number; children: unknown; footer?: string }) {
  const dimensions = useTerminalDimensions()
  // a centred modal wider than the terminal loses its left columns, border
  // included, and the surviving text reads as a different, plausible key
  const width = () => Math.max(20, Math.min(props.width, dimensions().width - 2))

  return (
    <box
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <box
        title={` ${props.title} `}
        titleColor={theme.borderFocus}
        border
        borderStyle="rounded"
        borderColor={theme.borderFocus}
        style={{
          width: width(),
          maxHeight: "90%",
          flexDirection: "column",
          padding: 1,
          backgroundColor: theme.panelAlt,
          zIndex: 101,
        }}
      >
        {/* shrinks and clips inside the frame: at 80x24 the content used to
            spill past the bottom border and paint over the status bar */}
        <box style={{ flexDirection: "column", flexShrink: 1, overflow: "hidden" }}>{props.children as never}</box>
        <Show when={props.footer}>
          {/* pinned, so the line telling the user how to close the dialog is
              the one thing truncation cannot take away */}
          <box style={{ flexDirection: "column", flexShrink: 0 }}>
            <text fg={theme.dim}>{truncate(props.footer ?? "", width() - 4)}</text>
          </box>
        </Show>
      </box>
    </box>
  )
}

const HELP_WIDTH = 78
/** Frame chrome the content does not get: two borders, two paddings, a footer. */
const HELP_CHROME = 5

/** Every key that runs a binding, not the abbreviation the status bar needs. */
function keysOf(binding: Binding): string {
  return binding.keys.join(" ")
}

function keyRow(binding: Binding, room: number): Piece[] {
  return [c(theme.info, padTo(truncate(keysOf(binding), 15), 16)), c(theme.text, truncate(binding.description, room))]
}

/**
 * The help is built as a list of single lines rather than a tree of boxes, so
 * it can be measured against the terminal and cut to fit.
 *
 * An overflowing modal does not simply spill: opentui clamps the children that
 * do not fit back inside the frame, and they paint on top of the lines already
 * there — at 80x24 this dialog used to render `t─ Repostrackla repository` and
 * drop the only line that says how to close it.
 */
function HelpOverlay() {
  const dimensions = useTerminalDimensions()
  const frameWidth = () => Math.max(20, Math.min(HELP_WIDTH, dimensions().width - 2))
  const room = () => frameWidth() - 4
  // two columns need the width for two columns
  const columns = () => (room() >= 68 ? 2 : 1)

  const rows = createMemo<Piece[][]>(() => {
    const scoped = panelBindings().filter((binding) => !binding.panels || binding.panels.includes(state.panel))
    // digits are summarised as one line instead of six
    const global = globalBindings().filter((binding) => !/^\d$/.test(binding.label))
    const out: Piece[][] = [[c(theme.accent, `── ${PANEL_TITLES[state.panel]} panel `)]]

    if (scoped.length === 0) out.push([c(theme.dim, "no panel-specific keys")])
    else for (const binding of scoped) out.push(keyRow(binding, room() - 16))

    out.push([], [c(theme.accent, "── global ")])
    if (columns() === 2) {
      const half = Math.ceil(global.length / 2)
      const column = Math.floor((room() - 4) / 2)
      for (let index = 0; index < half; index++) {
        const left = global[index]!
        const right = global[index + half]
        out.push([
          c(theme.info, padTo(truncate(keysOf(left), 15), 16)),
          c(theme.text, padTo(truncate(left.description, column - 16), column - 12)),
          ...(right ? keyRow(right, column - 16) : []),
        ])
      }
    } else {
      for (const binding of global) out.push(keyRow(binding, room() - 16))
    }
    out.push([c(theme.info, padTo(`1…${PANELS.length}`, 16)), c(theme.text, "jump straight to a panel")])

    // generated from the same table the marks are drawn from, so a mark can
    // never appear on screen without a line here explaining it
    out.push([], [c(theme.accent, "── repository marks ")])
    for (const [name, mark] of Object.entries(FRESHNESS)) {
      const hint = name === "stale" ? " — press R to re-index" : ""
      out.push([
        c(mark.fg, `${mark.mark} ${name.padEnd(12)}`),
        c(theme.text, truncate(`${mark.label}${hint}`, room() - 14)),
      ])
    }
    return out
  })

  const visible = createMemo(() => {
    const available = Math.max(3, Math.floor(dimensions().height * 0.9) - HELP_CHROME)
    if (rows().length <= available) return rows()
    const kept = rows().slice(0, available - 1)
    return [...kept, [c(theme.dim, `… ${rows().length - kept.length} more lines — grow the terminal`)]]
  })

  return (
    <Frame
      title={`Keys ${glyph.bullet} ${PANEL_TITLES[state.panel]}`}
      width={HELP_WIDTH}
      footer="esc or ? to close · panels, rows and buttons also respond to the mouse"
    >
      <For each={visible()}>{(parts) => <Row parts={parts} />}</For>
    </Frame>
  )
}

function ConfirmOverlay(props: { title: string; body: string; confirmLabel: string; onConfirm: () => void }) {
  return (
    <Frame title={props.title} width={64}>
      <For each={props.body.split("\n")}>{(row) => <text fg={theme.text}>{row || " "}</text>}</For>
      <text> </text>
      <box style={{ flexDirection: "row", flexShrink: 0 }}>
        <box style={{ flexShrink: 0 }} onMouseDown={props.onConfirm}>
          <Row parts={[c(theme.ok, "y/enter"), c(theme.muted, `  ${props.confirmLabel}    `)]} />
        </box>
        <box style={{ flexShrink: 0 }} onMouseDown={closeOverlay}>
          <Row parts={[c(theme.error, "n/esc"), c(theme.muted, "  cancel")]} />
        </box>
      </box>
    </Frame>
  )
}

function PromptOverlay(props: { title: string; body: string; initial: string; onSubmit: (value: string) => void }) {
  const [value, setValue] = createSignal(props.initial)
  return (
    <Frame title={props.title} width={72} footer={`enter to accept ${glyph.bullet} esc to cancel`}>
      <text fg={theme.muted}>{props.body}</text>
      <text> </text>
      <input
        focused
        value={value()}
        onInput={setValue}
        onSubmit={((submitted: string) => props.onSubmit(submitted)) as never}
        style={{
          backgroundColor: theme.panel,
          focusedBackgroundColor: theme.panel,
          textColor: theme.text,
          cursorColor: theme.borderFocus,
        }}
      />
    </Frame>
  )
}

function MenuOverlay(props: {
  title: string
  options: Array<{ label: string; value: string }>
  onPick: (value: string) => void
}) {
  return (
    <Frame title={props.title} width={54} footer={`press a number ${glyph.bullet} esc to cancel`}>
      <For each={props.options}>
        {(option, index) => (
          <box style={{ height: 1, flexShrink: 0 }} onMouseDown={() => props.onPick(option.value)}>
            <Row parts={[c(theme.accent, `${index() + 1}  `), c(theme.text, option.label)]} />
          </box>
        )}
      </For>
    </Frame>
  )
}

type OverlayOf<K extends Overlay["kind"]> = Extract<Overlay, { kind: K }>

function pick<K extends Overlay["kind"]>(kind: K): OverlayOf<K> | undefined {
  const overlay = state.overlay
  return overlay?.kind === kind ? (overlay as OverlayOf<K>) : undefined
}

/**
 * Tear the overlay down, then run what it asked for.
 *
 * The order matters both ways round. Closing first is what the keyboard path
 * does, so a callback that opens a second overlay is not immediately undone —
 * but `closeOverlay()` falsifies the `<Match>` condition these components live
 * under, and any read of the overlay record after that throws
 * `Stale read from <Match>.`, which opentui swallows into a hidden console.
 * So every call site reads the callback out of the overlay record as this
 * function's argument — evaluated while the match still holds — and the close
 * happens in here, after it. Children never call `closeOverlay()` before
 * reading a prop; the parent owns the teardown, so the trap cannot come back
 * with the next overlay someone adds.
 */
function fire<A extends unknown[]>(callback: (...args: A) => void, ...args: A): void {
  closeOverlay()
  callback(...args)
}

export function Overlays() {
  return (
    <Switch>
      <Match when={pick("help")}>
        <HelpOverlay />
      </Match>
      <Match when={pick("confirm")}>
        {(data: Accessor<OverlayOf<"confirm">>) => (
          <ConfirmOverlay
            title={data().title}
            body={data().body}
            confirmLabel={data().confirmLabel}
            onConfirm={() => fire(data().onConfirm)}
          />
        )}
      </Match>
      <Match when={pick("prompt")}>
        {(data: Accessor<OverlayOf<"prompt">>) => (
          <PromptOverlay
            title={data().title}
            body={data().body}
            initial={data().initial}
            onSubmit={(value) => fire(data().onSubmit, value)}
          />
        )}
      </Match>
      <Match when={pick("menu")}>
        {(data: Accessor<OverlayOf<"menu">>) => (
          <MenuOverlay title={data().title} options={data().options} onPick={(value) => fire(data().onPick, value)} />
        )}
      </Match>
    </Switch>
  )
}
