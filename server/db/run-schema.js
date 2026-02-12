const fs = require("fs");
const Database = require("better-sqlite3");

const db = new Database("database.sqlite");

const schema = fs.readFileSync("schema.sql", "utf8");

db.exec(schema);

console.log("Schema ejecutado OK");
