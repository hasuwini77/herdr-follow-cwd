# herdr-follow-cwd

Keep [Herdr](https://github.com/herdrdev/herdr) workspace labels in sync with
the directory their panes actually live in.

Herdr names a workspace after the source pane's directory once, at creation.
If your agent then scaffolds a new project and `cd`s into it, the workspace
keeps the old name — open a few workspaces from `~/dev` and the sidebar reads
`dev`, `dev`, `dev`. This plugin closes that gap: when a workspace's pane
moves to a different project, the label follows.

```
before                    after
──────                    ─────
1 dev                     1 tidepool
2 dev                     2 lantern-api
3 🟩 dev                  3 🟩 moss-cli
```

## Install

```bash
herdr plugin install hasuwini77/herdr-follow-cwd
```

Requires Herdr ≥ 0.7.5, Linux or macOS, `sh`, and a Node.js binary
(found via `PATH`, nvm's install dir, or the `HERDR_FOLLOW_CWD_NODE` env var).

## How it names workspaces

For each workspace the plugin looks at the root pane's tracked cwd and derives
a name:

1. **Git repo root** — inside a repo, the repo directory's name
   (`~/dev/tidepool/backend` → `tidepool`).
2. **Ceilings** — project-container directories configured by you (plus
   `$HOME`, always). When the enclosing repo root *is* a ceiling — a projects
   folder that happens to be a git repo, a dotfiles-managed home — the first
   path segment below the ceiling names the workspace instead
   (`~/dev/new-project/src` → `new-project`).
3. **Fallback** — the cwd's own directory name.

Configure ceilings in `config.json` inside the plugin config dir
(`herdr plugin config-dir hasuwini77.follow-cwd`):

```json
{ "ceilings": ["~/dev"] }
```

## What it will and won't touch

- **Preserves your decorations.** A label like `🟩 api` keeps its `🟩 ` prefix
  and only the text part is updated.
- **Never clobbers a manual name.** A label is only replaced when the plugin
  set it before, when it is empty, or when it matches an *ancestor* directory
  of the pane's cwd — the signature of a stale creation-time label (`dev` on a
  workspace whose pane sits in `~/dev/some-project`). Anything else is treated
  as user-chosen and left alone.
- **Skips** workspaces at `$HOME` or `/`.

## When it runs

Herdr plugin hooks deliberately exclude high-volume events, so renames trigger
on: agent status changes (`working` → `idle` after your agent scaffolds and
enters a project), pane create/focus, and workspace focus. A `cd` in an
agent-free background pane is picked up on the next such event — or
immediately via the manual action:

```toml
[[keys.command]]
key = "prefix+shift+f"
type = "plugin_action"
command = "hasuwini77.follow-cwd.sync"
description = "sync workspace name to cwd"
```

The manual action (`--force`) also *adopts* the focused workspace: it renames
it to the current cwd's derived name even if the existing label was manual.

## Pairs well with

Herdr's native workspace-switching shortcuts — jumping by number is only
useful when the names mean something:

```toml
[keys]
switch_workspace = ["alt+1..9"]
```

## Development

```bash
git clone https://github.com/hasuwini77/herdr-follow-cwd
herdr plugin link ./herdr-follow-cwd
sh run.sh --dry-run   # print what would be renamed, change nothing
```

State (label ownership, rate-limit stamp) lives in the plugin state dir, never
in the repo.

## License

MIT
