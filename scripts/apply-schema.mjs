/**
 * Aplica db/schema.sql en Neon (CREATE IF NOT EXISTS).
 * Uso: npm run db:schema
 * Requiere DATABASE_URL en .env.local (o entorno).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function statementsFromFile(sql) {
  const noComments = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  return noComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL no está definido. Añádelo en .env.local.");
  process.exit(1);
}

const path = join(root, "db", "schema.sql");
const raw = readFileSync(path, "utf8");
const stmts = statementsFromFile(raw);

const sql = neon(url);
let n = 0;
for (const statement of stmts) {
  await sql.query(statement, []);
  n += 1;
}

console.log(`OK: ${n} sentencias ejecutadas (${path}).`);
