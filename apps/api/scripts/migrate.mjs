// Applies the SQL files in ../migrations against the Neon Postgres database.
//
// Connection string resolution (first match wins):
//   1. process.env.DB_CONN
//   2. DB_CONN in the repo-root .dev.env
//
// Migrations are expected to be idempotent (CREATE ... IF NOT EXISTS), so this
// runner simply applies every file in order each time. Run: `npm run db:migrate`.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "migrations");
const repoRootEnv = join(here, "..", "..", "..", ".dev.env");

function resolveConnectionString() {
  if (process.env.DB_CONN && process.env.DB_CONN.trim() !== "") {
    return process.env.DB_CONN.trim();
  }
  try {
    const content = readFileSync(repoRootEnv, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*DB_CONN\s*=\s*(.*)\s*$/);
      if (match) {
        return match[1].trim().replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // .dev.env not present — fall through to the error below.
  }
  throw new Error(
    "DB_CONN is not set. Export it, or add it to the repo-root .dev.env file.",
  );
}

// Split a migration file into statements on top-level semicolons only.
// Aware of line comments, single-quoted strings, and dollar-quoted blocks
// ($$ … $$ or $tag$ … $tag$), so plpgsql DO blocks survive intact.
function splitStatements(sql) {
  const statements = [];
  let current = "";
  let i = 0;
  while (i < sql.length) {
    const rest = sql.slice(i);
    if (rest.startsWith("--")) {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? sql.length : nl + 1;
      current += "\n";
      continue;
    }
    if (sql[i] === "'") {
      const end = sql.indexOf("'", i + 1);
      const stop = end === -1 ? sql.length : end + 1;
      current += sql.slice(i, stop);
      i = stop;
      continue;
    }
    const dollar = rest.match(/^\$[A-Za-z_]*\$/);
    if (dollar) {
      const tag = dollar[0];
      const end = sql.indexOf(tag, i + tag.length);
      const stop = end === -1 ? sql.length : end + tag.length;
      current += sql.slice(i, stop);
      i = stop;
      continue;
    }
    if (sql[i] === ";") {
      statements.push(current);
      current = "";
      i += 1;
      continue;
    }
    current += sql[i];
    i += 1;
  }
  statements.push(current);
  return statements
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

async function main() {
  const sql = neon(resolveConnectionString());

  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.log("No migration files found.");
    return;
  }

  // The 0006 admin seed uses a :ADMIN_EMAIL placeholder; substitute it from the
  // environment (single quotes doubled for SQL). Without ADMIN_EMAIL set the
  // literal placeholder matches no row and the statement is a harmless no-op.
  const adminEmail = (process.env.ADMIN_EMAIL ?? "").trim().replace(/'/g, "''");

  for (const file of files) {
    let contents = readFileSync(join(migrationsDir, file), "utf8");
    if (adminEmail) contents = contents.replaceAll(":ADMIN_EMAIL", adminEmail);
    const statements = splitStatements(contents);
    for (const statement of statements) {
      // Ordinary (non-tagged) call form: sql(queryString, params?).
      await sql(statement);
    }
    console.log(`Applied ${file} (${statements.length} statement(s))`);
  }

  console.log("Migrations complete.");
}

main().catch((error) => {
  console.error("Migration failed:", error.message ?? error);
  process.exit(1);
});
