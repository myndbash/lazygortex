# lazygortex

A terminal UI for the Gortex code-graph daemon, in the spirit of
[lazygit](https://github.com/jesseduffield/lazygit) and
[lazydocker](https://github.com/jesseduffield/lazydocker): a column of always-visible panels on the
left, a detail pane on the right, one keystroke per action — and the mouse works too.

```
 lazygortex │ ● daemon ready · up 2h57m                     5 repos · 10 sessions · v0.63.3
╭─ 1 Repos ──────────────────────────╮╭─ emc2 · ~/Work/emc2 ─────────────────────────────────────────────────╮
│ ◌ .config                   181.0k ││ ── emc2                                                              │
│ ● inline                     11.8k ││ path            ~/Work/emc2                                          │
│ ● emc2                        9.2k ││ workspace       org/beta                                             │
│ ● bridge                      2.7k ││ branch          master                                               │
│ ● ti-gerr                     2.1k ││ freshness       ● fresh — index matches HEAD                         │
│                                    ││ last indexed    15h ago                                              │
│                                    ││                                                                      │
│                                    ││ ── index size                                                        │
╰──── ● ok ▲ stale ◌ no git ○ none ──╯│ files           672                                                  │
╭─ 2 Analyze ────────────────────────╮│ nodes           9.2k                                                 │
│ 78 kinds                           ││                                                                      │
╰────────────────────────────────────╯│ ── graph                                                             │
╭─ 3 Workspaces ─────────────────────╮│ by kind                                                              │
│ 2 workspaces                       ││ variable       ██████████████████ 147.2k                             │
╰────────────────────────────────────╯│ function       ██░░░░░░░░░░░░░░░░ 16.6k                              │
╭─ 4 Sessions ───────────────────────╮│ method         █░░░░░░░░░░░░░░░░░ 5.3k                               │
│ 10 connected                       ││                                                                      │
╰────────────────────────────────────╯│ by language                                                          │
╭─ 5 Savings ────────────────────────╮│ json           ██████████████████ 142.3k                             │
│ 41.4% saved · $2.54                ││ javascript     ███░░░░░░░░░░░░░░░ 21.4k                              │
╰────────────────────────────────────╯│ rust           █░░░░░░░░░░░░░░░░░ 7.6k                               │
╭─ 6 Daemon ─────────────────────────╮│                                                                      │
│ ready · 2h57m                      ││                                                                      │
╰────────────────────────────────────╯╰──────────────────────────────────────────────────────────────────────╯
 ready
 t track a repository   u untrack the selected repository   R re-index (clears a stale index)
```

## What it shows

| Panel          | Contents                                                                    | Source                                |
| -------------- | --------------------------------------------------------------------------- | ------------------------------------- |
| **Repos**      | tracked repos, freshness, branch, counts, and a per-repo graph breakdown     | `repos --json`, `daemon status`, `workspace graph` |
| **Analyze**    | the 78-analyzer catalogue; run one and read its result                       | `analyze kinds`, `analyze --kind`     |
| **Workspaces** | workspace rollups plus what each repo declares, and where                    | `daemon status`, `workspace list`     |
| **Sessions**   | connected MCP clients, versions and working directories                      | `daemon status`                       |
| **Savings**    | the token-savings dashboard                                                  | `savings`                             |
| **Daemon**     | pid, socket, uptime, memory, index health, Go runtime stats                  | `daemon status`, `workspace index`    |
| **Logs**       | the daemon log, parsed and level-coloured, sticky to the bottom              | `daemon logs`                         |

Daemon and Logs sit at the end of the column, where the plumbing belongs.

Everything is read through the `gortex` CLI — no private protocol, no socket handling. Reads that
have a `--json` flag use it; `daemon status`, `workspace list` and `analyze kinds` are parsed from
their tables by [`src/gortex/parse.ts`](src/gortex/parse.ts), forgivingly: an unknown key still
shows up, an unrecognised table simply yields no rows, and a stopped daemon renders as a stopped
daemon rather than an exception.

## Repository marks

| Mark | Meaning                                                                            |
| ---- | ---------------------------------------------------------------------------------- |
| `●`  | fresh — the index matches HEAD                                                     |
| `▲`  | stale — HEAD has moved past the indexed commit; press `R` to re-index               |
| `◌`  | no git — the directory is not a git repository, so freshness cannot be determined   |
| `○`  | unindexed — the daemon has no index for it yet                                      |

The CLI reports a non-git directory (`~/.config`, say) as permanently "stale" because it has no
HEAD to compare against. lazygortex separates that case out, so `▲` always means something you can
act on. The legend rides on the Repos panel's bottom border, and `?` spells it out in full.

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

lazygortex reopens on the panel, repository and analyzer you left it on. That lives in
`$XDG_STATE_HOME/lazygortex/state.json`; set `LAZYGORTEX_STATE_FILE` to move it, or to `off` to
disable the feature.

## Keys

Press `?` for the full list, which is generated from the same table the key handler uses.

### Global

| Key           | Action                    |
| ------------- | ------------------------- |
| `1` … `7`     | jump straight to a panel  |
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

### Repos

| Key | Action                                                                       |
| --- | ---------------------------------------------------------------------------- |
| `t` | track a repository — refuses a path the daemon already tracks                 |
| `u` | untrack the selected repository (asks first)                                 |
| `R` | re-index: `gortex track --wait`, the lever that clears a stale index (asks first) |
| `e` | run an enrichment (churn, blame, coverage, releases, cochange)                |
| `W` | set the repo's `workspace[/project]` in its `.gortex.yaml`                    |
| `i` | `gortex init` — write MCP and instruction files into the repo (asks first)    |
| `/` | filter by name or path                                                       |
| `y` | yank the repository path to the clipboard                                    |

### Analyze

| Key       | Action                                                              |
| --------- | ------------------------------------------------------------------- |
| `a` / `↵` | run the selected analyzer; the two that stamp metadata ask first     |
| `/`       | filter analyzers by name or description                              |

Analyzer results cover the whole index rather than the selected repository — `--path-prefix` does
not restrict them — and the panel says so rather than pretending otherwise.

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

Destructive actions — stop, restart, untrack, re-index, init, metadata-writing analyzers — ask for
confirmation first. Every command reports its outcome, duration and stderr on the message line.

### Mouse

Click a panel to focus it, a row to select it, the detail pane to scroll it, and the buttons or
menu entries in a dialog to choose them. The wheel scrolls the detail pane.

## Workspaces

A workspace is not created, it is *declared*: two repos that name the same `workspace:` slug in
their `.gortex.yaml` share one graph boundary, and cross-repo contract matching stops at that
boundary. The Workspaces panel shows the rollup and every member's declaration (workspace, project
and which file it came from); `W` on a repo writes a new slug.

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
    persist.ts        remembers the last panel and selection between runs
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

Polling is per-slot and never overlaps itself: daemon status every 3s, repos every 6s, logs every
3s while the Logs panel is open, savings every 30s while the Savings panel is open.

`workspace graph` costs well over a second, so it is fetched **once** — not once per selected repo.
The answer already carries a `per_repo` breakdown, so every repository's bars are served from that
one cached call, and it refreshes on `r`, after a mutation, and on a two-minute timer.

Seven panels do not fit a short terminal, so when the focused panel would be squeezed below six
rows the unfocused ones collapse from boxes to single header rows.

## Tests

```bash
bun test          # parser unit tests + frame tests against the real daemon
bun run check     # typecheck + tests
```

The frame tests boot the whole app in OpenTUI's memory renderer, drive it with synthetic key
presses and mouse clicks, and assert on the characters that land on screen. They skip themselves
when no `gortex` binary is present.

## Not exposed (yet)

`gortex explore` / context assembly builds a working set for a coding agent — a per-task answer
rather than a state you can watch, so it has no natural home in a dashboard. If you want it, the
shape that would fit is a prompt (`x`, say) whose result opens in the detail pane like an analyzer
result.

## Built with

[OpenTUI](https://github.com/sst/opentui) (Zig renderer, TypeScript bindings) with the Solid.js
binding, on Bun.
