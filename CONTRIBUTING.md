# Contributing

Thanks for taking a look. Bug reports, small fixes and panel ideas are all welcome.

## Getting set up

```bash
git clone https://github.com/myndbash/lazygortex
cd lazygortex
bun install
bun start            # runs against your own gortex daemon
```

You need [Bun](https://bun.sh) 1.3+ and the `gortex` CLI. Nothing else. The published package has a
single runtime dependency, `@opentui/core` (plus the native module it picks per platform); Solid and
the Solid binding are bundled at build time, which is also why an installed copy needs no preload.

## The loop

```bash
bun run check        # typecheck + format check + tests: what CI runs
bun test             # parser and colour units, plus frame tests
bun run format       # prettier, pinned to the exact version CI uses
```

Frame tests boot the real app in OpenTUI's memory renderer, drive it with synthetic keys and mouse
clicks, and assert on the characters and colours that land on screen. They skip themselves when no
`gortex` binary is present, so CI still runs the pure units.

**Assert colour with `captureSpans()`, never `captureCharFrame()`.** A character frame cannot show
colour, which is how a bug where every fragment rendered white survived several rounds of review.

## House rules

- **Every gortex call goes through `src/gortex/client.ts`**, and nothing in there throws: a failed
  invocation comes back as a result object so a panel can render a degraded state.
- **Keybindings are data** (`src/ui/keymap.ts`). The help overlay and the status bar read the same
  table, so they cannot drift from the handler.
- **Colour means something** (`src/ui/semantics.ts`). If a new colour does not encode freshness,
  severity, magnitude or recency, it probably should not be there.
- **Destructive actions confirm first.** Anything that stops the daemon, drops an index or writes
  into a user's repository opens a confirm dialog.
- Match the surrounding style: no semicolons, 120 columns, comments that explain _why_.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/): `feat:`, `fix:`, `docs:`,
`refactor:`, `test:`, `chore:`. The subject line says what changed for a user; the body says why.

## Releasing

1. Update `CHANGELOG.md` (move items out of _Unreleased_).
2. Bump the version in `package.json`.
3. Tag: `git tag v0.2.0 && git push --tags`.

The release workflow builds the npm bundle and a standalone binary for linux and macOS on x64 and
arm64, publishes checksums, and attaches everything to the GitHub release.
