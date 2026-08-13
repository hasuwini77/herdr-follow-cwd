# PROGRESS

## 2026-08-13

- Project born. Edwin wanted to contribute a "workspace name follows the
  directory" feature to Herdr itself, but Herdr closes unsolicited PRs by
  policy (CONTRIBUTING.md) and its maintainer bot had already classified the
  identical report (issue #2763) as a product change, pointing to Ideas
  discussions. Herdr's sanctioned extension path is plugins, so the feature
  ships as one.
- Built `hasuwini77.follow-cwd` v0.1.0: manifest event hooks
  (`pane.agent_status_changed`, `pane.agent_detected`, `pane.created`,
  `pane.focused`, `workspace.focused`), a one-shot startup reconcile, and a
  manual `sync` action (`--force`). No daemon — Herdr's plugin contract
  requires hooks to exit.
- Design decisions that mattered:
  - `pane.updated` is deliberately excluded from plugin hooks upstream
    (high-volume); agent status changes are the trigger that matches the real
    workflow (agent scaffolds project → goes idle → rename fires).
  - Naming = enclosing git repo root, with "ceilings" for container repos:
    `~/dev` is itself a git repo, so without ceilings every non-repo project
    under it would resolve to "dev" — the very bug being fixed. Below a
    ceiling, the first path segment names the workspace.
  - Labels split into decoration prefix + text (`🟩 dev` → keeps `🟩 `);
    manual labels are never touched unless owned by the plugin, empty, or
    matching an ancestor dir of the cwd (stale creation-label signature).
  - Entrypoint is `sh run.sh`, which resolves a real Node binary — bare
    `node` on Edwin's machine is a zsh lazy-load function that hangs.
- Verified live end-to-end: scratch workspace created from `~/dev` (label
  "dev"), pane `cd` into a fresh directory, `pane.created` hook fired →
  autonomous rename, exit 0, ~110ms. Real stale workspace `🟩 dev` →
  `🟩 herdr-hub` fixed on the running session, prefix preserved.

- Published: public repo hasuwini77/herdr-follow-cwd (main + v0.1.0 tag),
  `herdr-plugin` topic set — auto-indexed into the Herdr marketplace.
