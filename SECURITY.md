# Security

## Reporting a vulnerability

Please report security issues privately through
[GitHub's advisory form](https://github.com/myndbash/lazygortex/security/advisories/new) rather than
a public issue. You can expect an acknowledgement within a week.

## What lazygortex does on your machine

Being a front end for a local daemon, the honest scope matters more than a promise:

- **It runs one binary: `gortex`.** Every read and every action is a subprocess call to the CLI
  resolved from `$GORTEX_BIN`, then `PATH`, then `~/.local/bin/gortex`. There is no other executable
  and no shell interpolation — arguments are passed as an argv array, never through a shell.
- **It makes no network connections of its own.** It has no HTTP client and no telemetry. What
  `gortex` itself does when you ask it to index, enrich or upgrade is gortex's business.
- **It writes exactly one file on its own initiative:** `$XDG_STATE_HOME/lazygortex/state.json`
  (default `~/.local/state/lazygortex/state.json`), holding the last panel, the last selected
  repository path and the log tail size. Set `LAZYGORTEX_STATE_FILE=off` to disable that, or to a
  path to move it.
- **Everything else that writes asks first.** Untracking a repository, stopping or restarting the
  daemon, re-indexing, and `gortex init` (which writes MCP and instruction files _into your
  repository_) all go through a confirmation dialog.
- **Clipboard**: pressing `y` shells out to `wl-copy`, `pbcopy`, `xclip` or `xsel` if present, and
  otherwise emits an OSC 52 sequence, which your terminal may or may not honour.

## Supply chain

The published package has one runtime dependency, `@opentui/core` (plus the platform-specific native
module it selects). `solid-js` and `@opentui/solid` are bundled at build time. Releases are built by
GitHub Actions from a tagged commit, npm publishes carry
[provenance](https://docs.npmjs.com/generating-provenance-statements), and every release asset ships
with a SHA256 checksum.
