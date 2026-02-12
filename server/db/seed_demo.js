/*
 Sistema Web Estudio Jurídico - Seed DEMO
 Autor: Ramiro Rahman Rintoul
 Copyright © 2026
*/

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const bcrypt = require("bcrypt");

// === Ajustes de Ruta ===
// Prioriza la variable SQLITE_FILE de Railway (ej: /data/app.sqlite)
const DB_PATH = process.env.SQLITE_FILE || path.join(__dirname, "../../data/app.sqlite");
const SCHEMA_PATH = path.join(__dirname, "schema.sql");

function pad2(n) { return String(n).padStart(2, "0"); }

function toSqliteDateTime(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function addMinutes(d, mins) { return new Date(d.getTime() + mins * 60000); }
function randomPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function ensureDirExists(p) { fs.mkdirSync(p, { recursive: true }); }

function run() {
    console.log("🚀 Iniciando Seed en:", DB_PATH);
    ensureDirExists(path.dirname(DB_PATH));

    const db = new Database(DB_PATH);

    // PRAGMAs recomendados
    db.pragma("foreign_keys = ON");
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 5000");

    // Ejecutar schema
    const schema = fs.readFileSync(SCHEMA_PATH, "utf8");
    db.exec(schema);

    // Limpiar tablas (en orden por FK)
    const wipe = db.transaction(() => {
        db.exec(`
            DELETE FROM audit_log;
            DELETE FROM consultation_notes;
            DELETE FROM consultations;
            DELETE FROM sessions;
            DELETE FROM documents;
            DELETE FROM appointments;
            DELETE FROM cases;
            DELETE FROM clients;
            DELETE FROM lawyers;
            DELETE FROM users;
        `);
    });
    wipe();

    // === INSERTS ===
    const insertUser = db.prepare(`
        INSERT INTO users (email, full_name, role, password_hash, is_active)
        VALUES (@email, @full_name, @role, @password_hash, 1)
    `);

    const insertLawyer = db.prepare(`
        INSERT INTO lawyers (full_name, email, specialty, status, created_at, updated_at)
        VALUES (@full_name, @email, @specialty, @status, datetime('now'), datetime('now'))
    `);

    const insertClient = db.prepare(`
        INSERT INTO clients (full_name, email, phone, dni, status, created_at, updated_at)
        VALUES (@full_name, @email, @phone, @dni, @status, datetime('now'), datetime('now'))
    `);

    const insertCase = db.prepare(`
        INSERT INTO cases (client_id, title, description, status, priority, opened_at)
        VALUES (@client_id, @title, @description, @status, @priority, @opened_at)
    `);

    const insertAppt = db.prepare(`
        INSERT INTO appointments (client_id, case_id, lawyer_id, start_at, end_at, channel, status, notes)
        VALUES (@client_id, @case_id, @lawyer_id, @start_at, @end_at, @channel, @status, @notes)
    `);

    const txn = db.transaction(() => {
        // 1. CREAR USUARIO ADMIN (Para que el login funcione)
        const hash = bcrypt.hashSync("CambiarEsto123!", 10);
        insertUser.run({
            email: "admin@estudio.cl",
            full_name: "Administrador Demo",
            role: "admin",
            password_hash: hash
        });

        // 2. Abogados
        const lawyersData = [
            { full_name: "Elizabeth Araya", email: "Elizabeth@estudio.cl", specialty: "Civil", status: "active" },
            { full_name: "Yuri Cubillos", email: "Yuri@estudio.cl", specialty: "Penal", status: "active" },
            { full_name: "Barbara Ramos", email: "Barbara@estudio.cl", specialty: "Laboral", status: "active" },
            { full_name: "Dr. Ignacio Herrera", email: "Ignacio@estudio.cl", specialty: "Familia", status: "active" },
        ];
        lawyersData.forEach(l => insertLawyer.run(l));
        const lawyerRows = db.prepare(`SELECT id FROM lawyers WHERE status = 'active'`).all();

        // 3. Clientes (15 para demo)
        const clientFirst = ["Juan", "María", "Pedro", "Sofía", "Diego", "Valeria"];
        const clientLast = ["González", "Pérez", "Rojas", "Torres", "Muñoz", "Herrera"];
        const clients = [];
        for (let i = 0; i < 15; i++) {
            const fn = randomPick(clientFirst);
            const ln = randomPick(clientLast);
            const res = insertClient.run({
                full_name: `${fn} ${ln}`,
                email: `${fn.toLowerCase()}${i}@mail.com`,
                phone: `+56 9 ${randomInt(1000, 9999)}`,
                dni: String(10000000 + i),
                status: "active"
            });
            clients.push({ id: res.lastInsertRowid });
        }

        // 4. Casos y Citas básicos
        clients.forEach((cl, idx) => {
            const resCase = insertCase.run({
                client_id: cl.id,
                title: `Caso Demo ${idx + 1}`,
                description: "Descripción de prueba",
                status: "open",
                priority: "normal",
                opened_at: toSqliteDateTime(new Date())
            });

            if (idx < 5) { // Solo algunas citas
                const start = new Date();
                start.setDate(start.getDate() + idx + 1);
                start.setHours(10, 0, 0, 0);
                insertAppt.run({
                    client_id: cl.id,
                    case_id: resCase.lastInsertRowid,
                    lawyer_id: randomPick(lawyerRows).id,
                    start_at: toSqliteDateTime(start),
                    end_at: toSqliteDateTime(addMinutes(start, 30)),
                    channel: "in_person",
                    status: "scheduled",
                    notes: "Cita inicial generada por seed"
                });
            }
        });
    });

    txn();

    const counts = {
        users: db.prepare("SELECT COUNT(*) c FROM users").get().c,
        lawyers: db.prepare("SELECT COUNT(*) c FROM lawyers").get().c,
        clients: db.prepare("SELECT COUNT(*) c FROM clients").get().c,
        cases: db.prepare("SELECT COUNT(*) c FROM cases").get().c
    };

    console.log("✅ Seed DEMO listo:", counts);
    db.close();
}

try {
    run();
} catch (err) {
    console.error("❌ Error ejecutando el seed:", err);
}