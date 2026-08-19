# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Prompt overlays now run their callback. `/` (filter), `t` (track) and `W` (set workspace) closed
  their dialog and did nothing at all, as did any mouse click on a confirm button or a menu option.
- The key that opens a prompt is no longer typed into it, so `/` filters for `needle` and not
  `/needle`.
- An emptied Track prompt no longer starts indexing the directory lazygortex was launched from, and a
  path containing `..` is resolved before it is compared with what the daemon tracks.
- The already-tracked check ignores the panel filter, instead of reporting a hidden repository as
  untracked and re-indexing it.
- An active filter is visible: the panel title carries the needle, the summary reads `N of M tracked`,
  and an empty list says which needle excluded everything.
- The Projects panel no longer rewrites itself a second after start-up. A repo with no `.gortex.yaml`
  was taking the literal `(default: <name>)` from `workspace list` as its workspace and project, which
  split a real project's node count and added a group named after the placeholder.
- `r` on the Projects panel reloads the declarations the grouping is built from, instead of spending
  1.2 seconds on an index-health call the panel does not display. Sessions no longer pays for it either.
- The Sessions list holds still. It was emitted in the daemon's randomised map order and re-sorted on
  every 3-second poll, so the selected row changed record without a keypress, and it carried an extra
  row for the status call that was reading it.
- The daemon's `other` totals row — its unattributed memory, not a repository — no longer appears in the
  Repos panel, the repo count, or as a `/other` project.

## [0.1.0] - 2026-08-18

First public release.

### Added

- Seven panels — Repos, Workspaces, Projects, Sessions, Savings, Daemon, Logs — in a lazydocker-style
  column, with a detail pane driven by the selection.
- Repository actions: track, untrack, re-index, enrich, `gortex init`, set workspace/project, filter,
  yank path. Destructive actions confirm first.
- Daemon actions: start, stop, restart, reload config.
- Freshness marks that separate "stale" from "not a git repository", with a legend and a re-index key.
- Mouse support for panels, rows, the detail pane and dialog buttons.
- Colour as signal: freshness, severity thresholds, magnitude, recency; structure stays grey.
- Box-drawing tables for declarations, sessions, savings, index sizes and the repo roster.
- The last panel and repository are remembered between runs.
- A setup screen explaining how to fix things when the `gortex` binary cannot be found.

[Unreleased]: https://github.com/myndbash/lazygortex/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/myndbash/lazygortex/releases/tag/v0.1.0
