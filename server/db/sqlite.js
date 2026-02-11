const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

const DB_FILE = process.env.SQLITE_FILE || path.join(__dirname, "../../data/app.sqlite");
const SCHEMA_FILE = path.join(__dirname, "schema.sql");

let db;

function getDb() {
  if (db) return db;

  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

  db = new Database(DB_FILE);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Aplicar schema (idempotente)
  const schema = fs.readFileSync(SCHEMA_FILE, "utf-8");
  db.exec(schema);

  return db;
}

function nowIso() {
  return new Date().toISOString();
}

module.exports = {
  getDb,
  nowIso,
};
