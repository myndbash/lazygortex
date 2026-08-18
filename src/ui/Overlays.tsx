/**
 * Modal overlays: help, confirm, prompt and menu. They render into the
 * renderer root through a Portal so they float above the two columns.
 */

import { For, Match, Show, Switch, createSignal, type Accessor } from "solid-js"
import { closeOverlay, PANEL_TITLES, state, type Overlay } from "../state/store.ts"
import { globalBindings, panelBindings, type Binding } from "./keymap.ts"
import { c, Row } from "./Row.tsx"
import { glyph, theme, truncate } from "./theme.ts"

/**
 * Modals are absolutely positioned inside the app root rather than portalled
 * into the renderer root: an absolute child of a sized box lays out against
 * that box, which is exactly the centring behaviour a modal wants.
 */
function Frame(props: { title: string; width: number; children: unknown }) {
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
          width: props.width,
          maxHeight: "90%",
          flexDirection: "column",
          padding: 1,
          backgroundColor: theme.panelAlt,
          zIndex: 101,
        }}
      >
        <box style={{ flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>{props.children as never}</box>
      </box>
    </box>
  )
}

function KeyList(props: { bindings: Binding[] }) {
  return (
    <box style={{ flexDirection: "column", flexShrink: 0 }}>
      <For each={props.bindings}>
        {(binding) => <Row parts={[c(theme.info, binding.label.padEnd(8)), c(theme.text, binding.description)]} />}
      </For>
    </box>
  )
}

function HelpOverlay() {
  const scoped = () => panelBindings().filter((binding) => !binding.panels || binding.panels.includes(state.panel))
  // digits are summarised as one line instead of six
  const global = () => globalBindings().filter((binding) => !/^\d$/.test(binding.label))
  const half = () => Math.ceil(global().length / 2)

  return (
    <Frame title={`Keys ${glyph.bullet} ${PANEL_TITLES[state.panel]}`} width={78}>
      <text fg={theme.accent}>{`── ${PANEL_TITLES[state.panel]} panel `}</text>
      <Show when={scoped().length > 0} fallback={<text fg={theme.dim}>no panel-specific keys</text>}>
        <KeyList bindings={scoped()} />
      </Show>
      <text> </text>
      <text fg={theme.accent}>{"── global "}</text>
      <box style={{ flexDirection: "row", gap: 4, flexShrink: 0 }}>
        <KeyList bindings={global().slice(0, half())} />
        <KeyList bindings={global().slice(half())} />
      </box>
      <Row parts={[c(theme.info, "1…6".padEnd(8)), c(theme.text, "jump straight to a panel")]} />
      <text> </text>
      <text fg={theme.dim}>esc or ? to close</text>
    </Frame>
  )
}

function ConfirmOverlay(props: { title: string; body: string; confirmLabel: string }) {
  return (
    <Frame title={props.title} width={64}>
      <For each={props.body.split("\n")}>{(row) => <text fg={theme.text}>{row || " "}</text>}</For>
      <text> </text>
      <Row
        parts={[
          c(theme.ok, "y/enter"),
          c(theme.muted, ` ${props.confirmLabel} `),
          c(theme.error, "n/esc"),
          c(theme.muted, " cancel"),
        ]}
      />
    </Frame>
  )
}

function PromptOverlay(props: { title: string; body: string; initial: string; onSubmit: (value: string) => void }) {
  const [value, setValue] = createSignal(props.initial)
  return (
    <Frame title={props.title} width={72}>
      <text fg={theme.muted}>{props.body}</text>
      <text> </text>
      <input
        focused
        value={value()}
        onInput={setValue}
        onSubmit={
          ((submitted: string) => {
            closeOverlay()
            props.onSubmit(submitted)
          }) as never
        }
        style={{
          backgroundColor: theme.panel,
          focusedBackgroundColor: theme.panel,
          textColor: theme.text,
          cursorColor: theme.borderFocus,
        }}
      />
      <text> </text>
      <text fg={theme.dim}>enter to accept {glyph.bullet} esc to cancel</text>
    </Frame>
  )
}

function MenuOverlay(props: { title: string; options: Array<{ label: string; value: string }> }) {
  return (
    <Frame title={props.title} width={54}>
      <For each={props.options}>
        {(option, index) => <Row parts={[c(theme.accent, `${index() + 1} `), c(theme.text, option.label)]} />}
      </For>
      <text> </text>
      <text fg={theme.dim}>press a number {glyph.bullet} esc to cancel</text>
    </Frame>
  )
}

type OverlayOf<K extends Overlay["kind"]> = Extract<Overlay, { kind: K }>

function pick<K extends Overlay["kind"]>(kind: K): OverlayOf<K> | undefined {
  const overlay = state.overlay
  return overlay?.kind === kind ? (overlay as OverlayOf<K>) : undefined
}

export function Overlays() {
  return (
    <Switch>
      <Match when={pick("help")}>
        <HelpOverlay />
      </Match>
      <Match when={pick("confirm")}>
        {(data: Accessor<OverlayOf<"confirm">>) => (
          <ConfirmOverlay title={data().title} body={data().body} confirmLabel={data().confirmLabel} />
        )}
      </Match>
      <Match when={pick("prompt")}>
        {(data: Accessor<OverlayOf<"prompt">>) => (
          <PromptOverlay title={data().title} body={data().body} initial={data().initial} onSubmit={data().onSubmit} />
        )}
      </Match>
      <Match when={pick("menu")}>
        {(data: Accessor<OverlayOf<"menu">>) => <MenuOverlay title={data().title} options={data().options} />}
      </Match>
    </Switch>
  )
}
