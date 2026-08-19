/**
 * A verbatim `gortex daemon status` capture, and the CLI version it came from.
 *
 * Hand-authored fixtures drift: the previous one pinned truncated paths the CLI
 * does not emit and a tracked-repos table four columns narrower than today's.
 * Anything asserting on the shape of this output should assert on this file, and
 * the contract test in render.test.tsx fails when the live CLI stops matching it.
 */

export const STATUS_VERSION = "v0.63.3+d4801638"

/** Captured 19 August 2026, gortex v0.63.3+d4801638, five tracked repos. */
export const STATUS_CAPTURE = ` daemon    v0.63.3+d4801638
 pid       1257
 socket    /run/user/1000/gortex.sock
 uptime    1h48m
 state     ready (warmup 43s)
 sessions  9
 memory    173.5 MiB
 search    sqlite-fts5  docs=53782  disk-resident (indexed in the graph store)
 trigram   live=0/3  heap=0 B/256.0 MiB  idle_ttl=10m0s  evictions=2
 runtime   alloc=173.5 MiB  sys=775.1 MiB  heap_inuse=197.0 MiB  heap_idle=546.0 MiB  heap_released=514.7 MiB  stacks=5.0 MiB  gc=267  goroutines=79

workspaces:
┌───────────┬───────┬──────────────────────┬───────┬────────┬────────┐
│ workspace │ repos │ projects             │ files │  nodes │  edges │
├───────────┼───────┼──────────────────────┼───────┼────────┼────────┤
│ org       │     2 │ gamma01, beta        │   759 │  12207 │  49009 │
│ demouser  │     3 │ conf, ledger, parser │  3988 │ 195520 │ 474477 │
└───────────┴───────┴──────────────────────┴───────┴────────┴────────┘

tracked repos:
┌─────────┬─────────────────┬──────────┬───────┬────────┬────────┬───────────┬──────────┬──────────┬───────────┬──────────────────────────────────────────────┐
│ repo    │ workspace       │ total    │ files │  nodes │  edges │ nodes_b   │ edges_b  │ search_b │ vectors_b │ path                                         │
├─────────┼─────────────────┼──────────┼───────┼────────┼────────┼───────────┼──────────┼──────────┼───────────┼──────────────────────────────────────────────┤
│ .config │ demouser/conf   │ 95.0 MiB │  3617 │ 180966 │ 416076 │  44.2 MiB │ 50.8 MiB │      0 B │       0 B │ /home/demouser/.config                       │
│ parser  │ demouser/parser │  8.7 MiB │   270 │  11762 │  48085 │   2.9 MiB │  5.9 MiB │      0 B │       0 B │ /home/demouser/Sandbox/parser                │
│ beta    │ org/beta        │  6.6 MiB │   672 │   9229 │  35852 │   2.3 MiB │  4.4 MiB │      0 B │       0 B │ /home/demouser/Work/beta                     │
│ gamma01 │ org/gamma01     │  2.3 MiB │    87 │   2978 │  13157 │ 744.5 KiB │  1.6 MiB │      0 B │       0 B │ /home/demouser/Work/gamma01                  │
│ ledger  │ demouser/ledger │  1.9 MiB │   101 │   2792 │  10316 │ 698.0 KiB │  1.3 MiB │      0 B │       0 B │ /home/demouser/Development/Dev/ledger        │
├─────────┼─────────────────┼──────────┼───────┼────────┼────────┼───────────┼──────────┼──────────┼───────────┼──────────────────────────────────────────────┤
│ other   │                 │ 58.9 MiB │       │        │        │           │          │          │           │ embedder + runtime + caches (not attributed) │
└─────────┴─────────────────┴──────────┴───────┴────────┴────────┴───────────┴──────────┴──────────┴───────────┴──────────────────────────────────────────────┘

MCP sessions:
┌──────────────────────────────────┬─────────────┬─────────┬───────────┬───────────────────────────────────────────┐
│ id                               │ client      │ version │ connected │ cwd                                       │
├──────────────────────────────────┼─────────────┼─────────┼───────────┼───────────────────────────────────────────┤
│ 0132e5a4a667565632d67d5f428ce3e8 │ claude-code │ 2.1.235 │     1h41m │ /home/demouser/Development/Dev/lazygortex │
│ 2d7c0c88ab6d865567b9410f504fb5f3 │ claude-code │ 2.1.235 │     1h41m │ /home/demouser/Work/gamma01               │
│ d5c7b178a160c224fffecd3eb0a46dda │ claude-code │ 2.1.235 │     1h12m │ /home/demouser/.config                    │
│ 2431c736585695cf83b62456ec297baa │ claude-code │ 2.1.235 │     1m36s │ /home/demouser/Work/sample                │
│ fe76714da848ee9a8829c6faf12b2faf │ claude-code │ 2.1.235 │     1h20m │ /home/demouser/Work/sample                │
│ sess_3fd7d7ac152398f6            │ cli         │         │        0s │                                           │
│ 65c559ae79d8485734a9927ae50d9240 │ claude-code │ 2.1.235 │     1h41m │ /home/demouser/Sandbox/parser             │
│ 82549c0f9d3da043011af040127d6bfc │ claude-code │ 2.1.235 │     1h41m │ /home/demouser/Development/Dev/ledger     │
│ 35005fd0b4f617c0b7a3ba7ca2fc4a09 │ claude-code │ 2.1.235 │     1h41m │ /home/demouser/Work/beta                  │
└──────────────────────────────────┴─────────────┴─────────┴───────────┴───────────────────────────────────────────┘
`
