# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-08-19

First public release.

### Added

- Seven panels — Repos, Workspaces, Projects, Sessions, Savings, Daemon, Logs — in a lazydocker-style
  column, with a detail pane driven by the selection.
- Repository actions: track, untrack, re-index, enrich, `gortex init`, set workspace/project, filter,
  yank path. Destructive actions confirm first; setting a workspace asks for the slug.
- Daemon actions: start, stop, restart, reload config.
- Freshness marks that separate "stale" from "not a git repository" and from "the repo listing did not
  answer", with a legend and a re-index key.
- Selection that survives the three-second poll: the row you chose stays chosen when the list re-sorts.
- An active filter is visible: the panel title carries the needle, the summary counts the filtered rows
  against the tracked ones, and an empty list says which needle excluded everything.
- Mouse support for panels, rows, the detail pane and dialog buttons.
- Colour as signal: freshness, severity thresholds, magnitude, recency; structure stays grey.
- Box-drawing tables for declarations, sessions, savings, index sizes and the repo roster, sized to the
  pane they are drawn in and measured in terminal columns, so CJK and emoji stay aligned.
- A layout that holds at 80x24 and below: overlays clamp to the terminal, the help overlay keeps the
  line that says how to close it, and a terminal too short for seven panels says how many it left out.
- A Logs panel that renders the newest 500 lines of a buffer that reaches 5000, and says how many older
  ones are held.
- The last panel and repository are remembered between runs, and are written before the app exits.
- A setup screen explaining how to fix things when the `gortex` binary cannot be found.
- `--check-renderer`, which loads the terminal renderer and exits non-zero if it cannot — `--version`
  exits before the renderer is constructed, so it cannot tell a working build from a broken one.
- `THIRD-PARTY-NOTICES.txt`, generated at build time from the licences of the code the bundle inlines.

[Unreleased]: https://github.com/myndbash/lazygortex/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/myndbash/lazygortex/releases/tag/v0.1.0
