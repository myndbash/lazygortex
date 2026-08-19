# lazygortex

<!-- markdownlint-disable-next-line MD013 -->
<img src="https://raw.githubusercontent.com/myndbash/lazygortex/main/.github/assets/built-with-love-and-simulated-intelligence.png" alt="Built with love and simulated intelligence" align="right" width="132">

[![CI](https://github.com/myndbash/lazygortex/actions/workflows/ci.yml/badge.svg)](https://github.com/myndbash/lazygortex/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/lazygortex)](https://www.npmjs.com/package/lazygortex)
[![licence](https://img.shields.io/badge/licence-MIT-blue)](LICENSE)

A terminal UI for the Gortex code-graph daemon, in the spirit of
[lazygit](https://github.com/jesseduffield/lazygit) and
[lazydocker](https://github.com/jesseduffield/lazydocker): a column of always-visible panels on the
left, a detail pane on the right, one keystroke per action — and the mouse works too.

<br clear="right">

```text
 lazygortex │ ● daemon ready · up 4h26m                      5 repos · 9 sessions · v0.63.3
╭─ 1 Repos ──────────────────────────╮╭─ emc2 · ~/Work/emc2 ─────────────────────────────────────────╮
│ ◌ .config                   181.0k ││ ── emc2                                                      │
│ ● inline                     11.8k ││ path            ~/Work/emc2                                  │
│ ● emc2                        9.2k ││ workspace       org/beta                                     │
│ ● bridge                      2.7k ││ branch          master                                       │
│ ● ti-gerr                     2.1k ││ freshness       ● fresh — index matches HEAD                 │
│                                    ││ last indexed    16h ago                                      │
│                                    ││                                                              │
│                                    ││ ── index size                                                │
│                                    ││ ┌───────┬───────┬────────┬─────────┐                         │
╰─── ● ok ▲ stale ◌ no git ○ none ───╯│ │ files │ nodes │  edges │ on disk │                         │
╭─ 2 Workspaces ─────────────────────╮│ ├───────┼───────┼────────┼─────────┤                         │
│ 2 workspaces                       ││ │   672 │  9.2k │  35.9k │ 6.6 MiB │                         │
╰────────────────────────────────────╯│ └───────┴───────┴────────┴─────────┘                         │
╭─ 3 Projects ───────────────────────╮│                                                              │
│ ti-gerr                    2 repos ││ ── graph                                                     │
╰────────────────────────────────────╯│ by kind                                                      │
╭─ 4 Sessions ───────────────────────╮│ variable       ██████████████████ 147.2k                     │
│ 9 connected                        ││ function       ██░░░░░░░░░░░░░░░░ 16.6k                      │
╰────────────────────────────────────╯│ method         █░░░░░░░░░░░░░░░░░ 5.3k                       │
╭─ 5 Savings ────────────────────────╮│                                                              │
│ 41.4% saved · $2.54                ││                                                              │
╰────────────────────────────────────╯│                                                              │
╭─ 6 Daemon ─────────────────────────╮│                                                              │
│ ready · 4h26m                      ││                                                              │
╰────────────────────────────────────╯╰──────────────────────────────────────────────────────────────╯
 ready
 t track a repository   u untrack the selected repository   R re-index (clears a stale index)
```

## What it shows

| Panel          | Contents                                                                 | Source                                             |
| -------------- | ------------------------------------------------------------------------ | -------------------------------------------------- |
| **Repos**      | tracked repos, freshness, branch, counts, and a per-repo graph breakdown | `repos --json`, `daemon status`, `workspace graph` |
| **Workspaces** | workspace rollups plus what each repo declares, and where                | `daemon status`, `workspace list`                  |
| **Projects**   | repos grouped by the project slug they declare, with their members       | `workspace list`, `daemon status`                  |
| **Sessions**   | connected MCP clients, versions and working directories                  | `daemon status`                                    |
| **Savings**    | the token-savings dashboard                                              | `savings`                                          |
| **Daemon**     | pid, socket, uptime, memory, index health, the tracked-repo roster       | `daemon status`, `workspace index`                 |
| **Logs**       | the daemon log, parsed and level-coloured, sticky to the bottom          | `daemon logs`                                      |

Tabular data — declarations, the session roster, savings windows, index sizes — is drawn as real
box-drawing tables, the same shape the `gortex` CLI prints.

Daemon and Logs sit at the end of the column, where the plumbing belongs.

Everything is read through the `gortex` CLI — no private protocol, no socket handling. Reads that
have a `--json` flag use it; `daemon status` and `workspace list` are parsed from their tables by
[`src/gortex/parse.ts`](src/gortex/parse.ts), forgivingly: an unknown key still shows up, an
unrecognised table simply yields no rows, and a stopped daemon renders as a stopped daemon rather
than an exception.

## Colour

Colour is signal, not decoration: structure is drawn in greys, and a hue is spent only where it
tells you something.

| Where                        | What the colour means                                                |
| ---------------------------- | -------------------------------------------------------------------- |
| repository marks             | freshness — see below                                                |
| counts (nodes, files, edges) | magnitude against the largest repo, so the heavyweight reads as one  |
| `last indexed`, log times    | recency: within the hour, today, this week, older                    |
| daemon state                 | `ready` green, warming up or indexing amber, stopped or failed red   |
| health score, savings share  | good / borderline / bad thresholds                                   |
| `edges ok`, `regressions`    | a flag that should be true, a count that should be zero              |
| session `cwd`                | green inside a tracked repo, amber outside one                       |
| branches                     | `main`/`master` quiet, a topic branch highlighted                    |
| log lines                    | level colours the level; only warnings and errors colour the message |
| a missing value              | always dim, so `—` never competes with real data                     |

A caveat worth knowing if you extend the UI: OpenTUI 0.5.3 drops colour on inline text nodes —
`<span fg>`, `<b fg>` and custom `TextNodeRenderable`s all render in the default foreground — so
[`Row`](src/ui/Row.tsx) builds a line out of small `<text>` elements instead, and the selection
highlight is the background of the box that holds them. [`semantics.ts`](src/ui/semantics.ts) owns
every rule in the table above and is unit-tested.

## Repository marks

| Mark | Meaning                                                                           |
| ---- | --------------------------------------------------------------------------------- |
| `●`  | fresh — the index matches HEAD                                                    |
| `▲`  | stale — HEAD has moved past the indexed commit; press `R` to re-index             |
| `◌`  | no git — the directory is not a git repository, so freshness cannot be determined |
| `○`  | unindexed — the daemon has no index for it yet                                    |

The CLI reports a non-git directory (`~/.config`, say) as permanently "stale" because it has no
HEAD to compare against. lazygortex separates that case out, so `▲` always means something you can
act on. The legend rides on the Repos panel's bottom border, and `?` spells it out in full.

## Requirements

- the `gortex` CLI, with a daemon you can reach (`gortex daemon status`)
- for the npm install: [Bun](https://bun.sh) 1.3+ — the release binaries need nothing at all

lazygortex reads and drives that CLI; it is not useful without it. If the binary cannot be found it
says so on start-up, with the path it tried and how to point it somewhere else.

## Install

**A release binary** — one file, no runtime:

```bash
# pick your platform: linux-x64, linux-arm64, darwin-x64, darwin-arm64
curl -fsSLO https://github.com/myndbash/lazygortex/releases/latest/download/lazygortex-linux-x64
curl -fsSL  https://github.com/myndbash/lazygortex/releases/latest/download/SHA256SUMS | grep linux-x64 | shasum -a 256 -c -
chmod +x lazygortex-linux-x64 && sudo mv lazygortex-linux-x64 /usr/local/bin/lazygortex
```

**With Bun**, if you already have it:

```bash
bunx lazygortex          # one-off
bun add -g lazygortex    # or install it
```

**From source**:

```bash
git clone https://github.com/myndbash/lazygortex && cd lazygortex
bun install
bun start                # or bin/lazygortex, which works from any directory
bun run build            # dist/cli.js for npm, dist/lazygortex as a standalone binary
```

## First run

```bash
lazygortex
```

It opens on the Repos panel with whatever your daemon tracks. `?` lists every key, `q` quits. If the
daemon is not running, the Daemon panel says so and `s` starts it.

### Configuration

There is no config file. Two environment variables:

| Variable                | Effect                                                                  |
| ----------------------- | ----------------------------------------------------------------------- |
| `GORTEX_BIN`            | path to the gortex binary (default: `PATH`, then `~/.local/bin/gortex`) |
| `LAZYGORTEX_STATE_FILE` | where the remembered view lives; `off` disables writing it entirely     |

`NO_COLOR` is not honoured yet: colour is how this UI encodes freshness, severity and magnitude, and
a monochrome mode is a design job rather than a switch. The glyph marks (`●▲◌○`) stay legible
without it.

## Keys

Press `?` for the keys that apply where you are, generated from the same table the key handler
uses — panel keys for the focused panel, then the global ones.

### Global

| Key           | Action                   |
| ------------- | ------------------------ |
| `1` … `7`     | jump straight to a panel |
| `tab` / `[`   | next / previous panel    |
| `j` `k` / ↑ ↓ | move the selection       |
| `PgUp` `PgDn` | page                     |
| `g` `G`       | top / bottom             |
| `enter` / `l` | focus the detail pane    |
| `esc` / `h`   | back to the panel list   |
| `r`           | refresh this panel       |
| `ctrl+r`      | refresh everything       |
| `?`           | help                     |
| `q`           | quit                     |

With the detail pane focused, `j`/`k` and the page keys scroll it.

### Repos

| Key | Action                                                                            |
| --- | --------------------------------------------------------------------------------- |
| `t` | track a repository — refuses a path the daemon already tracks                     |
| `u` | untrack the selected repository (asks first)                                      |
| `R` | re-index: `gortex track --wait`, the lever that clears a stale index (asks first) |
| `e` | run an enrichment (churn, blame, coverage, releases, cochange)                    |
| `W` | set the repo's `workspace[/project]` in its `.gortex.yaml`                        |
| `i` | `gortex init` — write MCP and instruction files into the repo (asks first)        |
| `/` | filter by name or path                                                            |
| `y` | yank the repository path to the clipboard                                         |

### Daemon

| Key | Action                                      |
| --- | ------------------------------------------- |
| `s` | start the daemon                            |
| `S` | stop the daemon (asks first)                |
| `x` | restart the daemon (asks first)             |
| `w` | reload config, picking up new/removed repos |

### Logs

| Key       | Action                  |
| --------- | ----------------------- |
| `+` / `-` | tail more / fewer lines |

Destructive actions — stop, restart, untrack, re-index, init — ask for confirmation first. Every
command reports its outcome, duration and stderr on the message line.

### Mouse

Click a panel to focus it, a row to select it, the detail pane to scroll it, and the buttons or
menu entries in a dialog to choose them. The wheel scrolls the detail pane.

## Workspaces and projects

Neither is created; both are _declared_. Two repos that name the same `workspace:` slug in their
`.gortex.yaml` share one graph boundary, and cross-repo contract matching stops at that boundary.
Within a workspace, the `project:` slug is the finer grouping — usually one repo, but a linked git
worktree or a split front end and back end land several repos under one project.

- **Workspaces** shows the rollup and every member's declaration (workspace, project, source file).
- **Projects** shows the other axis: each slug with its member repos, their branches, freshness and
  sizes, so a multi-repo project reads as one unit.

`W` on a repo writes a new `workspace[/project]`; `/` filters the Projects panel, `y` yanks the slug.

## Layout of the code

```text
src/
  index.tsx           entry point, --help/--version
  gortex/
    client.ts         every `gortex …` invocation, typed; never throws
    parse.ts          parsers for the surfaces with no --json
    types.ts          shapes of the CLI output
  state/
    store.ts          one Solid store: async slots, polling, actions, navigation
    persist.ts        remembers the last panel and selection between runs
  ui/
    App.tsx           layout, key routing, polling lifecycle
    SidePanel.tsx     the always-visible panel column
    MainPane.tsx      the per-panel detail views
    Overlays.tsx      help, confirm, prompt and menu modals
    StatusBar.tsx     busy spinner, messages, contextual key hints
    Setup.tsx         the screen a machine without the gortex CLI gets
    Row.tsx           multi-coloured text rows (and the row highlight)
    semantics.ts      what a colour means: freshness, severity, magnitude, recency
    Table.tsx         box-drawing tables sized to the pane
    keymap.ts         the keymap as data — help and handler read the same table
    theme.ts          colours, glyphs, formatting helpers
    clipboard.ts      yank via wl-copy/pbcopy/xclip/xsel, falling back to OSC 52
```

Polling is per-slot and never overlaps itself: daemon status every 3s, repos every 6s, logs every
3s while the Logs panel is open, savings every 30s while the Savings panel is open.

`workspace graph` costs well over a second, so it is fetched **once** — not once per selected repo.
The answer already carries a `per_repo` breakdown, so every repository's bars are served from that
one cached call, and it refreshes on `r`, after a mutation, and on a two-minute timer.

Seven panels do not fit a short terminal, so when the focused panel would be squeezed below six
rows the unfocused ones collapse from boxes to single header rows.

The selected row is painted with a background colour on the row's own box: OpenTUI drops both `fg`
and `bg` set on an inline span, so `Row` never uses one.

## Tests

```bash
bun test          # unit tests, plus frame tests against the real daemon
bun run check     # typecheck + format check + markdownlint + peer check + tests
```

The frame tests boot the whole app in OpenTUI's memory renderer, drive it with synthetic key
presses and mouse clicks, and assert on the characters that land on screen. They need a daemon that
answers and skip themselves without one, saying which of the two reasons applied; everything else —
the parsers, the store, the layout, the overlays, the subprocess handling — runs anywhere.

## Not exposed

`gortex analyze` was tried as a panel and removed: picking one of 78 analyzers and reading raw JSON
rows is a CLI job, not a dashboard one. `gortex explore` / context assembly has the same problem —
it builds a working set for a coding agent, a per-task answer rather than a state you watch.

## What it does to your machine

It runs `gortex` as a subprocess, with arguments passed as an argv array and never through a shell,
and shells out to a clipboard tool when you press `y`. It makes no network calls of its own and
collects nothing. The only file it writes unprompted is the remembered view at
`$XDG_STATE_HOME/lazygortex/state.json`; everything else that writes — untrack, re-index,
`gortex init`, stopping the daemon — asks first, and `W` asks for the new slug before it writes one.
[SECURITY.md](SECURITY.md) spells this out in full.

## Contributing

Bug reports and panel ideas are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for the dev loop and
the house rules, and [CHANGELOG.md](CHANGELOG.md) for what changed when.

```bash
bun install && bun run check   # typecheck, format, markdownlint, peer check, tests — what CI runs
```

## Built with

[OpenTUI](https://github.com/sst/opentui) (Zig renderer, TypeScript bindings) with the Solid.js
binding, on [Bun](https://bun.sh).

**Built with love and simulated intelligence.** The implementation was written in collaboration with
an AI agent and reviewed screen by screen. Everything it claims is checked: panels, keys, colours and
the parsers are covered by the test suite, and each install path was installed and run before it was
documented.

## Licence

[MIT](LICENSE) © myndbash
