#!/usr/bin/env node
// CI guard: fail if a Cloudflare Worker's module TOP-LEVEL code performs an
// operation workerd forbids in global scope — async I/O (fetch/connect), timers
// (setTimeout/setInterval), or random/crypto generation. These pass vitest/node
// but blow up at `wrangler deploy` with validation error 10021 (which neither
// `tsc` nor `wrangler deploy --dry-run` catch). See PR #53: a module-load
// `hashPassword(crypto.randomUUID())` broke every deploy for four batches.
//
// Approach: parse each worker entry's src with the TypeScript AST, walk only
// top-level statements, and DON'T descend into function/method/arrow bodies
// (code inside a function isn't executed at module-eval time, so it's fine).
// Report every top-level call to a denylisted primitive or known I/O helper.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// The Cloudflare Workers in this monorepo (apps/web is SvelteKit — different model).
const WORKER_SRC_DIRS = ["apps/api/src", "apps/hubspot/src", "apps/email-ingest/src"];

// Bare-identifier calls that do disallowed global-scope work.
const DENY_IDENTIFIERS = new Set([
  "fetch", "connect", "setTimeout", "setInterval", "setImmediate", "queueMicrotask",
  // app-level helpers that internally do crypto / DB / network I/O
  "hashPassword", "verifyPassword", "sha256hex", "sha1hex", "generateToken",
  "neon", "createSession", "validateSession", "invalidateUserSessions",
  "enqueueEmail", "drainEmailOutbox", "isPasswordBreached",
]);
// Member calls on these objects are disallowed (e.g. crypto.getRandomValues, crypto.subtle.*, Math.random).
const DENY_OBJECTS = new Set(["crypto"]);
const DENY_MEMBER = new Set(["Math.random"]);

function rootIdentifier(expr) {
  let e = expr;
  while (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e)) e = e.expression;
  return ts.isIdentifier(e) ? e.text : null;
}
function calleeText(node) {
  return node.expression ? node.expression.getText() : "";
}

const FUNCTIONLIKE = new Set([
  ts.SyntaxKind.FunctionDeclaration, ts.SyntaxKind.FunctionExpression,
  ts.SyntaxKind.ArrowFunction, ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.GetAccessor, ts.SyntaxKind.SetAccessor, ts.SyntaxKind.Constructor,
]);

const violations = [];

function inspectFile(file, rel) {
  const src = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);

  function checkCall(node) {
    if (!ts.isCallExpression(node) && !ts.isNewExpression(node)) return;
    const callee = node.expression;
    if (!callee) return;
    const id = ts.isIdentifier(callee) ? callee.text : null;
    if (id && DENY_IDENTIFIERS.has(id)) return flag(node, `${id}(...)`);
    if (ts.isPropertyAccessExpression(callee)) {
      const obj = rootIdentifier(callee);
      const full = calleeText(node);
      if (obj && DENY_OBJECTS.has(obj)) return flag(node, `${full}(...)`);
      if (DENY_MEMBER.has(full)) return flag(node, `${full}(...)`);
    }
  }
  function flag(node, what) {
    const { line, character } = src.getLineAndCharacterOfPosition(node.getStart());
    violations.push({ rel, line: line + 1, col: character + 1, what });
  }

  // Walk a top-level statement's subtree, but stop at function boundaries.
  function walk(node) {
    checkCall(node);
    node.forEachChild((child) => {
      if (FUNCTIONLIKE.has(child.kind)) return; // not executed at module load
      walk(child);
    });
  }

  for (const stmt of src.statements) {
    // Pure declarations never execute I/O at module load.
    if (
      ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt) ||
      ts.isInterfaceDeclaration(stmt) || ts.isTypeAliasDeclaration(stmt) ||
      ts.isImportDeclaration(stmt) || ts.isEnumDeclaration(stmt) ||
      ts.isModuleDeclaration(stmt)
    ) continue;
    walk(stmt);
  }
}

function walkDir(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walkDir(p);
    else if (/\.tsx?$/.test(name) && !/\.d\.ts$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      inspectFile(p, relative(repoRoot, p));
    }
  }
}

let scanned = 0;
for (const d of WORKER_SRC_DIRS) {
  const abs = join(repoRoot, d);
  if (existsSync(abs)) { walkDir(abs); scanned++; }
}

if (violations.length) {
  console.error("✘ Worker global-scope violations (would fail `wrangler deploy`, error 10021):\n");
  for (const v of violations) {
    console.error(`  ${v.rel}:${v.line}:${v.col}  top-level ${v.what}`);
  }
  console.error(
    "\nAsync I/O, timers, and crypto/random are NOT allowed at Worker module scope.\n" +
    "Move the call inside a handler (or lazy-init + memoize on first use).",
  );
  process.exit(1);
}
console.log(`✓ No Worker global-scope violations (${scanned} worker src trees scanned).`);
