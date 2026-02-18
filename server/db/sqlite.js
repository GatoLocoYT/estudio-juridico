/*
 Sistema Web Estudio Jurídico
 Autor: Ramiro Rahman Rintoul
 Copyright © 2026
 Uso restringido - No redistribuir
*/
const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

// ✅ Si tenés volumen, seteá SQLITE_FILE=/data/app.sqlite (o el mount real)
// ✅ Si no está seteado, usamos un default local estable dentro del repo
const DEFAULT_DB = path.join(__dirname, "app.sqlite");

// ⚠️ Resolve a absoluto para evitar sorpresas en Railway
const DB_FILE = path.resolve(process.env.SQLITE_FILE || DEFAULT_DB);
const SCHEMA_FILE = path.join(__dirname, "schema.sql");

let db;

function initDb(instance) {
  // Pragmas: buen balance para server
  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");
  instance.pragma("busy_timeout = 5000");

  // Opcionales útiles (si querés más performance/menos locks)
  instance.pragma("synchronous = NORMAL");
  instance.pragma("temp_store = MEMORY");
}

function applySchema(instance) {
  const schema = fs.readFileSync(SCHEMA_FILE, "utf-8");
  instance.exec(schema);
}

function getDb() {
  if (db) return db;

  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

  db = new Database(DB_FILE);

  initDb(db);
  applySchema(db);

  // ✅ Debug único: confirma dónde está la DB (clave en Railway)
  console.log("[DB] SQLite file:", DB_FILE);

  return db;
}

function getDbFile() {
  return DB_FILE;
}

function nowIso() {
  return new Date().toISOString();
}

module.exports = {
  getDb,
  getDbFile,
  nowIso,
};
