# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
