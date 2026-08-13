#!/usr/bin/env node
"use strict";
// herdr-follow-cwd — keep Herdr workspace labels in sync with where their
// panes actually live. Herdr snapshots the label from the source pane's cwd
// once, at workspace creation, and never updates it; this plugin closes that
// gap. Each invocation is one short reconcile pass over every workspace,
// then exit — no daemon, per Herdr's plugin contract.

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const HERDR = process.env.HERDR_BIN_PATH || "herdr";
const STATE_DIR =
  process.env.HERDR_PLUGIN_STATE_DIR || path.join(os.tmpdir(), "herdr-follow-cwd");
const CONFIG_DIR = process.env.HERDR_PLUGIN_CONFIG_DIR || STATE_DIR;
const RATE_LIMIT_MS = 1500;

const argv = new Set(process.argv.slice(2));
const FORCE = argv.has("--force");
const DRY = argv.has("--dry-run");

function herdrJson(args) {
  const r = spawnSync(HERDR, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (r.status !== 0) {
    throw new Error(`herdr ${args.join(" ")} failed: ${r.stderr || r.status}`);
  }
  return JSON.parse(r.stdout).result;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function expandHome(p) {
  if (p === "~") return os.homedir();
  return p.startsWith("~/") ? path.join(os.homedir(), p.slice(2)) : p;
}

// Ceilings are project-container directories (a junk-drawer projects folder
// that happens to be a git repo, a dotfiles-managed $HOME). A git root that
// is a ceiling never names a workspace; the first path segment below it does.
function loadCeilings() {
  const cfg = readJson(path.join(CONFIG_DIR, "config.json"), {});
  const dirs = Array.isArray(cfg.ceilings) ? cfg.ceilings.map(expandHome) : [];
  dirs.push(os.homedir());
  return dirs.map((d) => path.resolve(d));
}

function gitTop(dir) {
  let cur = path.resolve(dir);
  for (;;) {
    if (fs.existsSync(path.join(cur, ".git"))) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}

function desiredName(cwd, ceilings) {
  const dir = path.resolve(cwd);
  if (dir === os.homedir() || dir === path.parse(dir).root) return null;

  const top = gitTop(dir);
  if (top && !ceilings.includes(top)) return path.basename(top);

  const ceiling = ceilings
    .filter((c) => dir === c || dir.startsWith(c + path.sep))
    .sort((a, b) => b.length - a.length)[0];
  if (!ceiling) return path.basename(dir);
  if (dir === ceiling) return path.basename(ceiling);
  return path.relative(ceiling, dir).split(path.sep)[0];
}

// "🟩 dev" → prefix "🟩 ", text "dev". Anything before the first letter or
// digit that ends in whitespace is a decoration the user chose — keep it.
function splitLabel(label) {
  const m = /^([^\p{L}\p{N}]*\s)?([\s\S]*)$/u.exec(label || "");
  return { prefix: m[1] || "", text: m[2] || "" };
}

// Basenames of every proper ancestor of cwd. A label matching one of these is
// the signature of a stale creation-time label (workspace created from ~/dev,
// pane long since moved into ~/dev/some-project).
function ancestorSegments(cwd) {
  const segs = new Set();
  let cur = path.dirname(path.resolve(cwd));
  for (;;) {
    segs.add(path.basename(cur));
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return segs;
}

function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const stamp = path.join(STATE_DIR, "last-run");
  if (!FORCE && !DRY) {
    try {
      if (Date.now() - fs.statSync(stamp).mtimeMs < RATE_LIMIT_MS) return;
    } catch {}
    fs.writeFileSync(stamp, "");
  }

  const ceilings = loadCeilings();
  const stateFile = path.join(STATE_DIR, "state.json");
  const state = readJson(stateFile, { owned: {} });

  const workspaces = herdrJson(["workspace", "list"]).workspaces;
  const panes = herdrJson(["pane", "list"]).panes;

  // Anchor pane per workspace: the lowest-numbered pane is the root the
  // workspace was created around; splits and agent panes come and go.
  const anchors = new Map();
  for (const p of panes) {
    const n = Number(p.pane_id.split(":p")[1]);
    const prev = anchors.get(p.workspace_id);
    if (!prev || n < prev.n) anchors.set(p.workspace_id, { n, pane: p });
  }

  const forceTarget = FORCE
    ? process.env.HERDR_WORKSPACE_ID ||
      (workspaces.find((w) => w.focused) || {}).workspace_id
    : null;

  const owned = {};
  for (const ws of workspaces) {
    const anchor = anchors.get(ws.workspace_id);
    const cwd = anchor && (anchor.pane.cwd || anchor.pane.foreground_cwd);
    if (!cwd) {
      if (state.owned[ws.workspace_id]) {
        owned[ws.workspace_id] = state.owned[ws.workspace_id];
      }
      continue;
    }

    const name = desiredName(cwd, ceilings);
    if (!name) continue;

    const { prefix, text } = splitLabel(ws.label);
    if (text === name) {
      owned[ws.workspace_id] = name;
      continue;
    }

    const ours = state.owned[ws.workspace_id] === text;
    const stale = text === "" || ancestorSegments(cwd).has(text);
    const forced = ws.workspace_id === forceTarget;
    if (!ours && !stale && !forced) continue; // user-chosen label — hands off

    const label = prefix + name;
    if (DRY) {
      console.log(`would rename ${ws.workspace_id}: "${ws.label}" -> "${label}"`);
    } else {
      herdrJson(["workspace", "rename", ws.workspace_id, label]);
      console.log(`renamed ${ws.workspace_id}: "${ws.label}" -> "${label}"`);
    }
    owned[ws.workspace_id] = name;
  }

  if (!DRY) {
    fs.writeFileSync(stateFile, JSON.stringify({ owned }, null, 2) + "\n");
  }
}

try {
  main();
} catch (err) {
  console.error(`herdr-follow-cwd: ${err.message}`);
  process.exit(1);
}
