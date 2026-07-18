#!/usr/bin/env node
// collect.mjs — deterministic dependency data collector for DevDigest.
// Emits ONE JSON object to stdout. It gathers facts only; judgement (advice,
// diagram, prioritisation) is the model's job in SKILL.md. Keeping the data
// collection in a script means every run measures the same way instead of each
// invocation re-inventing lockfile parsing and du math.
//
// Usage:  node scripts/collect.mjs [repoRoot]   (defaults to cwd)
//
// No dependencies — Node ≥ 22 built-ins only, so it runs before any install.

import { readFileSync, existsSync, statSync, readdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.argv[2] || process.cwd();

// The six DevDigest packages, in dependency-flow order (inner → outer).
// Hardwired on purpose: this skill is grounded to this repo (see SKILL.md).
const PACKAGES = ["reviewer-core", "shared", "server", "mcp", "e2e", "client", "evals"];

// server/clones is a stale copy of the whole tree — never scan it.
const IGNORE = new Set(["node_modules", ".git", "clones", ".next", "dist", "coverage"]);

function readJSON(p) {
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; }
}

// Total bytes on disk under a dir, skipping IGNORE dirs. Cheap `du` shell-out
// with a JS fallback so it works even where du is unavailable.
function dirSize(dir) {
  if (!existsSync(dir)) return 0;
  try {
    const out = execSync(`du -sb "${dir}" 2>/dev/null`, { encoding: "utf8" });
    return parseInt(out.split("\t")[0], 10) || 0;
  } catch {
    let total = 0;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (IGNORE.has(e.name)) continue;
      const full = join(dir, e.name);
      try { total += e.isDirectory() ? dirSize(full) : statSize(full); } catch {}
    }
    return total;
  }
}
function statSize(p) { try { return statSync(p).size; } catch { return 0; } }

// Count the FULL installed transitive set from whichever lockfile the package
// uses. npm and pnpm store it differently, so parse each format explicitly.
function transitiveCount(dir) {
  const npmLock = join(dir, "package-lock.json");
  const pnpmLock = join(dir, "pnpm-lock.yaml");
  if (existsSync(npmLock)) {
    const lock = readJSON(npmLock);
    if (lock?.packages) {
      // keys look like "node_modules/foo" / "node_modules/a/node_modules/b"
      return Object.keys(lock.packages).filter((k) => k.startsWith("node_modules/")).length;
    }
  }
  if (existsSync(pnpmLock)) {
    const text = readFileSync(pnpmLock, "utf8");
    const lines = text.split("\n");
    const start = lines.findIndex((l) => l === "packages:" || l === "snapshots:");
    if (start === -1) return null;
    // count 2-space-indented keys inside the packages/snapshots block
    let n = 0;
    for (let i = start + 1; i < lines.length; i++) {
      const l = lines[i];
      if (/^\S/.test(l)) break;                 // dedented out of the block
      if (/^ {2}\S.*:$/.test(l)) n++;
    }
    return n;
  }
  return null;
}

// Per-direct-dependency install size — the practical "weight" proxy for
// packages that don't bundle (backends run from source). Top offenders feed
// the "trim the heaviest" advice.
function depSizes(dir) {
  const nm = join(dir, "node_modules");
  if (!existsSync(nm)) return {};
  const pkg = readJSON(join(dir, "package.json")) || {};
  const names = Object.keys({ ...(pkg.dependencies || {}) });
  const sizes = {};
  for (const name of names) {
    const p = name.startsWith("@") ? join(nm, ...name.split("/")) : join(nm, name);
    if (!existsSync(p)) continue;
    // pnpm installs deps as symlinks into .pnpm/<pkg>@<ver>/node_modules/<pkg>;
    // resolve the link so we measure the package's real files, not the 60-byte
    // symlink. This is the package's OWN tree (its sub-deps live elsewhere in
    // the store) — a fair per-dependency weight proxy.
    let real = p;
    try { real = realpathSync(p); } catch {}
    sizes[name] = dirSize(real);
  }
  return sizes;
}

// Client is the only package that ships a browser bundle. Read Next's static
// chunk sizes as the shipped-JS proxy. (SKILL.md notes: for exact First-Load-JS
// per route, run `pnpm build` and read the printed table.)
function clientBundle(dir) {
  const staticDir = join(dir, ".next", "static", "chunks");
  if (!existsSync(staticDir)) return null;
  let js = 0, files = 0;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(".js")) { js += statSync(full).size; files++; }
    }
  };
  try { walk(staticDir); } catch { return null; }
  return { totalJsBytes: js, chunkFiles: files };
}

const report = { root: ROOT, packages: {}, workspaceEdges: [] };

for (const name of PACKAGES) {
  const dir = name === "shared" ? join(ROOT, "server", "src", "vendor", "shared") : join(ROOT, name);
  const pkgJsonPath = join(dir, "package.json");
  if (name !== "shared" && !existsSync(pkgJsonPath)) continue;
  const pkg = readJSON(pkgJsonPath) || { name: "@devdigest/shared (vendored)" };

  report.packages[name] = {
    dir,
    pkgName: pkg.name || name,
    lockfile: existsSync(join(dir, "pnpm-lock.yaml")) ? "pnpm"
            : existsSync(join(dir, "package-lock.json")) ? "npm" : "none",
    directDeps: Object.keys(pkg.dependencies || {}),
    directDevDeps: Object.keys(pkg.devDependencies || {}),
    // version ranges kept so the model can spot drift (same lib, different major
    // across packages) and judge freshness without re-reading every package.json
    versions: { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) },
    transitiveInstalled: transitiveCount(dir),
    nodeModulesBytes: dirSize(join(dir, "node_modules")),
    heaviestDeps: Object.entries(depSizes(dir))
      .sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([n, b]) => ({ name: n, bytes: b })),
    bundle: name === "client" ? clientBundle(dir) : null,
  };
}

// Internal edges: which packages import which, via the tsconfig path aliases.
// These are the ONLY sanctioned cross-package links (@devdigest/reviewer-core,
// @devdigest/shared). Grep source for the alias specifiers.
const ALIASES = ["@devdigest/reviewer-core", "@devdigest/shared"];
for (const name of PACKAGES) {
  const src = join(ROOT, name, "src");
  if (!existsSync(src)) continue;
  for (const alias of ALIASES) {
    try {
      const hits = execSync(
        `grep -rlE "from ['\\"]${alias}" "${src}" 2>/dev/null | grep -v node_modules | head -1`,
        { encoding: "utf8" }).trim();
      if (hits) report.workspaceEdges.push({ from: name, to: alias });
    } catch {}
  }
}

process.stdout.write(JSON.stringify(report, null, 2) + "\n");
