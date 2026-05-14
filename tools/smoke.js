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

// Tags whose balance matters at the document level. Unclosed <style> or
// <script> blocks make the HTML parser swallow the rest of the body —
// the exact bug pattern that caused "dashboard shows nothing" in 2026-05.
// <body> / <html> are also checked so stray duplicates raise an alarm.
const BALANCED_TAGS = ["style", "script", "body", "html", "head"];

function countTag(html, tag, isClose) {
  // Match <tag>, <tag ...>, but not <tagFoo> — require word boundary.
  const re = new RegExp(`<${isClose ? "\\/" : ""}${tag}(?:>|\\s[^>]*>|\\/>)`, "gi");
  return (html.match(re) || []).length;
}

function checkTagBalance(html) {
  const problems = [];
  for (const tag of BALANCED_TAGS) {
    const opens = countTag(html, tag, false);
    const closes = countTag(html, tag, true);
    // For void elements you wouldn't run this — but every tag we check
    // requires explicit open + close in well-formed HTML.
    if (opens !== closes) {
      problems.push(`<${tag}>: ${opens} open / ${closes} close`);
    }
  }
  return problems;
}

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
  checked++;

  // 1. HTML tag balance — catches the unclosed-<style> class of bugs that
  //    silently make the entire body disappear in the browser.
  const tagProblems = checkTagBalance(html);
  if (tagProblems.length) {
    failed++;
    const msg = "tag balance: " + tagProblems.join(", ");
    failures.push({ file: rel, error: msg });
    process.stdout.write(`  ✗ ${rel}: ${msg}\n`);
    continue;
  }

  // 2. Inline scripts — concatenate and parse-check.
  let combined = "";
  let m;
  INLINE_SCRIPT_RE.lastIndex = 0;
  while ((m = INLINE_SCRIPT_RE.exec(html)) !== null) {
    combined += "\n;\n" + m[1];
  }
  if (!combined.trim()) {
    process.stdout.write(`  ✓ ${rel}\n`);
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
