#!/usr/bin/env node
/**
 * build.js — Assembles browser-specific dist packages.
 *
 * Usage:
 *   node build.js                  → build all targets
 *   node build.js --target chromium → build one target
 *
 * Output: dist/<target>/  (ready to load unpacked or zip)
 */

const fs   = require('fs');
const path = require('path');

const ROOT     = __dirname;
const SRC      = path.join(ROOT, 'src');
const BROWSERS = path.join(ROOT, 'browsers');
const DIST     = path.join(ROOT, 'dist');

// Which browser targets to build (each must have a browsers/<name>/ folder)
const ALL_TARGETS = fs.readdirSync(BROWSERS).filter(f =>
  fs.statSync(path.join(BROWSERS, f)).isDirectory()
);

const args   = process.argv.slice(2);
const tIdx   = args.indexOf('--target');
const targets = tIdx !== -1 ? [args[tIdx + 1]] : ALL_TARGETS;

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

for (const target of targets) {
  const browserDir = path.join(BROWSERS, target);
  const resolvedBrowserDir = path.resolve(browserDir);
  if (!resolvedBrowserDir.startsWith(path.resolve(BROWSERS) + path.sep)) {
    console.error(`[build] Invalid target (path traversal): ${target}`);
    process.exit(1);
  }
  if (!fs.existsSync(browserDir)) {
    console.error(`[build] Unknown target: ${target}`);
    process.exit(1);
  }

  const outDir = path.join(DIST, target);
  console.log(`[build] ${target} → dist/${target}/`);

  // 1. Wipe + recreate output dir
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  // 2. Copy shared src files
  copyDir(SRC, outDir);

  // 3. Overlay browser-specific files (manifest.json etc.), overwriting src defaults
  copyDir(browserDir, outDir);

  console.log(`[build] ✓ dist/${target}/ ready`);
}

console.log('[build] Done.');
