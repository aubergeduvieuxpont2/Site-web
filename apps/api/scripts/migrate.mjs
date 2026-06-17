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

function splitStatements(sql) {
  return sql
    .replace(/--[^\n]*/g, "") // strip line comments
    .split(";")
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

  for (const file of files) {
    const statements = splitStatements(
      readFileSync(join(migrationsDir, file), "utf8"),
    );
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
