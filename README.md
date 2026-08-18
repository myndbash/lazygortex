# lazygortex

A terminal UI for the Gortex code-graph daemon, in the spirit of
[lazygit](https://github.com/jesseduffield/lazygit) and
[lazydocker](https://github.com/jesseduffield/lazydocker): a column of always-visible panels on the
left, a detail pane on the right, and one keystroke per action.

```
 lazygortex │ ● daemon ready · up 2h8m              5 repos · 9 sessions · v0.63.3
╭─ 1 Daemon ─────────────────────────╮╭─ emc2 · ~/Work/emc2 ───────────────────────────────────────╮
│ ready (warmup 28s) · 2h8m          ││ ── emc2                                                    │
╰────────────────────────────────────╯│ path            ~/Work/emc2                                │
╭─ 2 Repos ──────────────────────────╮│ workspace       org/beta                                   │
│ ▲ .config                    181.0k││ branch          master                                     │
│ ● inline                      11.7k││ freshness       up to date                                 │
│ ● emc2                         9.2k││ last indexed    12m ago                                    │
│ ● bridge                       2.7k││                                                            │
│ ● ti-gerr                      2.0k││ ── index size                                              │
│                                    ││ files           672                                        │
╰────────────────────────────────────╯│ nodes           9.2k                                       │
╭─ 3 Workspaces ─────────────────────╮│ edges           35.9k                                      │
│ 2 workspaces                       ││ on disk         6.6 MiB                                    │
╰────────────────────────────────────╯│                                                            │
╭─ 4 Sessions ───────────────────────╮│ ── workspace graph                                         │
│ 9 connected                        ││ by kind                                                    │
╰────────────────────────────────────╯│ variable       ██████████████████ 150.1k                   │
╭─ 5 Savings ────────────────────────╮│ function       ██░░░░░░░░░░░░░░░░ 19.7k                    │
│ 42.9% saved · $2.52                ││ param          █░░░░░░░░░░░░░░░░░ 7.4k                     │
╰────────────────────────────────────╯╰────────────────────────────────────────────────────────────╯
 ready
 t track a repository   u untrack the selected repository   e run an enrichment
```

## What it shows

| Panel          | Contents                                                                  | Source                            |
| -------------- | ------------------------------------------------------------------------- | --------------------------------- |
| **Daemon**     | pid, socket, uptime, state, memory, search index, Go runtime stats, totals | `gortex daemon status`            |
| **Repos**      | tracked repos with freshness, branch, node/edge/file counts, index health  | `gortex repos --json`, `workspace` |
| **Workspaces** | workspace rollups and their member repos                                  | `gortex daemon status`            |
| **Sessions**   | connected MCP clients, their versions and working directories             | `gortex daemon status`            |
| **Savings**    | the token-savings dashboard                                               | `gortex savings`                  |
| **Logs**       | the daemon log, parsed and level-coloured, sticky to the bottom           | `gortex daemon logs`              |

Everything is read through the `gortex` CLI — no private protocol, no socket handling. Reads that
have a `--json` flag use it; `gortex daemon status` is parsed from its tables by
[`src/gortex/parse.ts`](src/gortex/parse.ts), forgivingly: an unknown key still shows up, an
unrecognised table simply yields no rows, and a stopped daemon renders as a stopped daemon rather
than an exception.

## Requirements

- [Bun](https://bun.sh) 1.3+
- the `gortex` binary on `PATH` (or `GORTEX_BIN` pointing at it)

## Running

```bash
bun install
bun start            # inside the repo
bin/lazygortex       # from anywhere: the launcher wires up the Solid transform itself
```

Build a standalone executable (no Bun needed to run it):

```bash
bun run build        # -> dist/lazygortex
```

> The repo's `bunfig.toml` preloads the Solid transform for development. Run the compiled binary
> from another directory, or it will try to load that preload and refuse to start.

## Keys

Press `?` at any time for the list, which is generated from the same table the key handler uses.

### Global

| Key           | Action                    |
| ------------- | ------------------------- |
| `1` … `6`     | jump straight to a panel  |
| `tab` / `[`   | next / previous panel     |
| `j` `k` / ↑ ↓ | move the selection        |
| `PgUp` `PgDn` | page                      |
| `g` `G`       | top / bottom              |
| `enter` / `l` | focus the detail pane     |
| `esc` / `h`   | back to the panel list    |
| `r`           | refresh this panel        |
| `ctrl+r`      | refresh everything        |
| `?`           | help                      |
| `q`           | quit                      |

With the detail pane focused, `j`/`k` and the page keys scroll it.

### Daemon panel

| Key | Action                                     |
| --- | ------------------------------------------ |
| `s` | start the daemon                           |
| `S` | stop the daemon (asks first)               |
| `x` | restart the daemon (asks first)            |
| `w` | reload config, picking up new/removed repos |

### Repos panel

| Key | Action                                      |
| --- | ------------------------------------------- |
| `t` | track a repository (prompts for a path)     |
| `u` | untrack the selected repository (asks first) |
| `e` | run an enrichment (churn, blame, coverage, releases, cochange) |
| `/` | filter by name or path                      |
| `y` | yank the repository path to the clipboard   |

### Logs panel

| Key       | Action                    |
| --------- | ------------------------- |
| `+` / `-` | tail more / fewer lines   |

Destructive actions — stopping or restarting the daemon, untracking a repository — ask for
confirmation first. Every command reports its outcome, duration and stderr on the message line;
`s`, `w` and the enrichments run straight away.

## Layout of the code

```
src/
  index.tsx           entry point, --help/--version
  gortex/
    client.ts         every `gortex …` invocation, typed; never throws
    parse.ts          parsers for the surfaces with no --json
    types.ts          shapes of the CLI output
  state/
    store.ts          one Solid store: async slots, polling, actions, navigation
  ui/
    App.tsx           layout, key routing, polling lifecycle
    SidePanel.tsx     the always-visible panel column
    MainPane.tsx      the per-panel detail views
    Overlays.tsx      help, confirm, prompt and menu modals
    StatusBar.tsx     busy spinner, messages, contextual key hints
    Row.tsx           multi-coloured text rows
    keymap.ts         the keymap as data — help and handler read the same table
    theme.ts          colours, glyphs, formatting helpers
    clipboard.ts      yank via wl-copy/pbcopy/xclip/xsel, falling back to OSC 52
```

Polling is per-slot and never overlaps itself: daemon status every 3s, repos every 6s, logs every 3s
while the Logs panel is open, savings every 30s while the Savings panel is open. Repo detail
(workspace graph, index health) is fetched lazily for the selected repo and cancelled by token when
the selection moves.

## Tests

```bash
bun test          # parser unit tests + frame tests against the real daemon
bun run check     # typecheck + tests
```

The frame tests boot the whole app in OpenTUI's memory renderer, drive it with synthetic key
presses, and assert on the characters that land on screen. They skip themselves when no `gortex`
binary is present.

## Built with

[OpenTUI](https://github.com/sst/opentui) (Zig renderer, TypeScript bindings) with the Solid.js
binding, on Bun.
