#!/usr/bin/env node
/**
 * MindDo smoke test — parses every HTML page's inline scripts and
 * verifies they have no syntax errors. Does NOT execute them (would
 * need jsdom + extra deps), but catches the class of errors most
 * likely to break the page after refactors: stray semicolons,
 * unclosed strings, unmatched braces, dropped chars during edits.
 *
 * Usage:
 *   node tools/smoke.js              # check every *.html
 *   node tools/smoke.js dashboard.html student-account.html
 *
 * Exit code 0 on success, 1 on any parse failure.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const targets = args.length
  ? args
  : fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"));

let failed = 0;
let checked = 0;
const failures = [];

const INLINE_SCRIPT_RE = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;

for (const rel of targets) {
  const abs = path.join(ROOT, rel);
  let html;
  try {
    html = fs.readFileSync(abs, "utf8");
  } catch (e) {
    console.log(`  ⚠  ${rel}: ${e.message}`);
    failed++;
    failures.push({ file: rel, error: e.message });
    continue;
  }
  // Concatenate every inline script so cross-IIFE references stay valid
  // when we wrap in new Function() — same trick the previous ad-hoc
  // checks used in this repo.
  let combined = "";
  let m;
  INLINE_SCRIPT_RE.lastIndex = 0;
  while ((m = INLINE_SCRIPT_RE.exec(html)) !== null) {
    combined += "\n;\n" + m[1];
  }
  checked++;
  if (!combined.trim()) {
    // No inline JS — fine.
    continue;
  }
  try {
    // new Function only parses; doesn't execute.
    // eslint-disable-next-line no-new-func
    new Function(combined);
    process.stdout.write(`  ✓ ${rel}\n`);
  } catch (e) {
    failed++;
    failures.push({ file: rel, error: e.message });
    process.stdout.write(`  ✗ ${rel}: ${e.message}\n`);
  }
}

// Also smoke-check assets/*.js
const assetsDir = path.join(ROOT, "assets");
if (fs.existsSync(assetsDir)) {
  for (const fn of fs.readdirSync(assetsDir).filter((f) => f.endsWith(".js"))) {
    const abs = path.join(assetsDir, fn);
    const code = fs.readFileSync(abs, "utf8");
    checked++;
    try {
      // eslint-disable-next-line no-new-func
      new Function(code);
      process.stdout.write(`  ✓ assets/${fn}\n`);
    } catch (e) {
      failed++;
      failures.push({ file: `assets/${fn}`, error: e.message });
      process.stdout.write(`  ✗ assets/${fn}: ${e.message}\n`);
    }
  }
}

console.log("");
if (failed === 0) {
  console.log(`smoke OK — ${checked} files parsed cleanly`);
  process.exit(0);
} else {
  console.log(`smoke FAILED — ${failed}/${checked} file(s):`);
  failures.forEach((f) => console.log(`  ${f.file}: ${f.error}`));
  process.exit(1);
}
