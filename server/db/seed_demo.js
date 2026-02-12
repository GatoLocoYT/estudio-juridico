// server/db/seed_demo.js
// Seed DEMO para app.sqlite (no se entrega en producción)

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

// === Ajustes ===

const DB_PATH = process.env.SQLITE_FILE || path.join(__dirname, "app.sqlite"); // <- DB en prod para Railway
// const DB_PATH = path.join(__dirname, "app.sqlite");       // <- tu DB local
const SCHEMA_PATH = path.join(__dirname, "schema.sql");   // <- tu schema.sql

function pad2(n) {
    return String(n).padStart(2, "0");
}

function toSqliteDateTime(d) {
    // "YYYY-MM-DD HH:MM:SS"
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function addMinutes(d, mins) {
    return new Date(d.getTime() + mins * 60000);
}

function randomPick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function ensureDirExists(p) {
    fs.mkdirSync(p, { recursive: true });
}

function run() {
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
      DELETE FROM documents;
      DELETE FROM appointments;
      DELETE FROM cases;
      DELETE FROM clients;
      DELETE FROM lawyers;
    `);
    });
    wipe();

    // === DATA ===
    const lawyers = [
        { full_name: "Dra. Valentina Rojas", email: "vrojas@estudio.cl", specialty: "Civil", status: "active" },
        { full_name: "Dr. Matías Fuentes", email: "mfuentes@estudio.cl", specialty: "Penal", status: "active" },
        { full_name: "Dra. Camila Torres", email: "ctorres@estudio.cl", specialty: "Laboral", status: "active" },
        { full_name: "Dr. Ignacio Herrera", email: "iherrera@estudio.cl", specialty: "Familia", status: "active" },
    ];

    const clientFirst = ["Juan", "María", "Pedro", "Sofía", "Diego", "Valeria", "Nicolás", "Fernanda", "Tomás", "Catalina"];
    const clientLast = ["González", "Pérez", "Rojas", "Torres", "Muñoz", "Herrera", "Díaz", "Soto", "Vargas", "Silva"];

    const caseTitles = [
        "Asesoría contrato arriendo",
        "Despido injustificado",
        "Divorcio y alimentos",
        "Cobranza y deuda",
        "Accidente de tránsito",
        "Herencia y posesión efectiva",
        "Constitución de sociedad",
        "Reclamo consumidor / SERNAC",
    ];

    // === INSERTS ===
    const insertLawyer = db.prepare(`
    INSERT INTO lawyers (full_name, email, specialty, status, created_at, updated_at, deleted_at)
    VALUES (@full_name, @email, @specialty, @status, datetime('now'), datetime('now'), NULL)
  `);

    const insertClient = db.prepare(`
    INSERT INTO clients (full_name, email, phone, dni, status, created_at, updated_at, deleted_at)
    VALUES (@full_name, @email, @phone, @dni, @status, datetime('now'), datetime('now'), NULL)
  `);

    const insertCase = db.prepare(`
    INSERT INTO cases (client_id, title, description, status, priority, opened_at, closed_at, created_at, updated_at, deleted_at)
    VALUES (@client_id, @title, @description, @status, @priority, @opened_at, @closed_at, datetime('now'), datetime('now'), NULL)
  `);

    const insertDoc = db.prepare(`
    INSERT INTO documents (case_id, filename, storage_path, doc_type, size_bytes, created_at, updated_at, deleted_at)
    VALUES (@case_id, @filename, @storage_path, @doc_type, @size_bytes, datetime('now'), datetime('now'), NULL)
  `);

    const insertAppt = db.prepare(`
    INSERT INTO appointments (client_id, case_id, lawyer_id, start_at, end_at, channel, status, notes, created_at, updated_at, deleted_at)
    VALUES (@client_id, @case_id, @lawyer_id, @start_at, @end_at, @channel, @status, @notes, datetime('now'), datetime('now'), NULL)
  `);

    const txn = db.transaction(() => {
        // Lawyers
        lawyers.forEach(l => insertLawyer.run(l));
        const lawyerRows = db.prepare(`SELECT id, full_name FROM lawyers WHERE deleted_at IS NULL`).all();

        // Clients (25)
        const clients = [];
        for (let i = 0; i < 25; i++) {
            const fn = randomPick(clientFirst);
            const ln = randomPick(clientLast);
            const full_name = `${fn} ${ln}`;
            const email = `${fn.toLowerCase()}.${ln.toLowerCase()}${i}@mail.com`;
            const phone = `+56 9 ${randomInt(1000, 9999)} ${randomInt(1000, 9999)}`;
            const dni = String(10000000 + i); // demo, pero único
            const status = Math.random() < 0.85 ? "active" : "inactive";
            const info = { full_name, email, phone, dni, status };
            const res = insertClient.run(info);
            clients.push({ id: res.lastInsertRowid, full_name });
        }

        // Cases (18)
        const cases = [];
        for (let i = 0; i < 18; i++) {
            const cl = randomPick(clients);
            const title = randomPick(caseTitles);
            const status = randomPick(["open", "open", "pending", "closed"]);
            const priority = randomPick(["low", "normal", "high", "urgent"]);
            const now = new Date();
            const opened = new Date(now.getTime() - randomInt(5, 120) * 24 * 60 * 60 * 1000);
            opened.setHours(10, 0, 0, 0);

            const opened_at = toSqliteDateTime(opened);

            // si closed, requiere closed_at (por tu validator)
            let closed_at = null;
            if (status === "closed") {
                const closed = new Date(opened.getTime() + randomInt(2, 30) * 24 * 60 * 60 * 1000);
                closed.setHours(17, 0, 0, 0);
                closed_at = toSqliteDateTime(closed);
            }

            const description = `Caso demo: ${title}`;
            const res = insertCase.run({
                client_id: cl.id,
                title,
                description,
                status,
                priority,
                opened_at,
                closed_at,
            });
            cases.push({ id: res.lastInsertRowid, client_id: cl.id, title });
        }

        // Documents (24)
        const docTypes = ["contract", "evidence", "court_filing", "id", "power_of_attorney", "other"];

        const filenames = ["escrito.pdf", "prueba.jpg", "contrato.docx", "informe.pdf", "anexo.pdf"];

        for (let i = 0; i < 24; i++) {
            const cs = randomPick(cases);
            const doc_type = randomPick(docTypes);
            const filename = randomPick(filenames);
            insertDoc.run({
                case_id: cs.id,
                filename,
                storage_path: `/uploads/demo/${cs.id}/${Date.now()}_${i}_${filename}`,
                doc_type,
                size_bytes: randomInt(10_000, 2_500_000),
            });
        }

        // Appointments (agenda realista, 30 min, Lun–Vie 09:00–19:30)
        const channels = ["in_person", "phone", "video"];
        const apptStatuses = ["scheduled", "confirmed", "cancelled", "done"];

        // Vamos a crear slots por abogado sin solaparse:
        // Generamos turnos en los próximos 14 días hábiles.
        const base = new Date();
        base.setHours(9, 0, 0, 0);

        // helper: siguiente día hábil
        function nextBusinessDay(d) {
            const x = new Date(d);
            while (x.getDay() === 0 || x.getDay() === 6) { // domingo 0, sábado 6
                x.setDate(x.getDate() + 1);
            }
            return x;
        }

        const usedByLawyer = new Map(); // lawyer_id -> Set("start_at|end_at")
        for (const lw of lawyerRows) usedByLawyer.set(lw.id, new Set());

        let created = 0;
        while (created < 36) { // cantidad de turnos demo
            const lw = randomPick(lawyerRows);

            // día random dentro de 14 días
            const d = new Date(base);
            d.setDate(d.getDate() + randomInt(0, 14));
            const day = nextBusinessDay(d);

            // slot random 09:00..19:00 (porque 19:30 es el cierre, turno 30 min)
            const hour = randomInt(9, 19);
            const minute = randomPick([0, 30]);

            // si 19:30 sería inicio inválido para 30 min (terminaría 20:00), así que lo evitamos
            if (hour === 19 && minute === 30) continue;

            day.setHours(hour, minute, 0, 0);
            const start = day;
            const end = addMinutes(start, 30);

            // validación horario laboral: end <= 19:30?
            // Si empieza 19:00 termina 19:30 OK.
            const endCheck = new Date(end);
            const close = new Date(day);
            close.setHours(19, 30, 0, 0);
            if (endCheck > close) continue;

            const start_at = toSqliteDateTime(start);
            const end_at = toSqliteDateTime(end);

            const key = `${start_at}|${end_at}`;
            if (usedByLawyer.get(lw.id).has(key)) continue; // evitar repetidos exactos

            // elegir client/case compatible (case opcional, pero si viene debe pertenecer al cliente)
            const cl = randomPick(clients);
            const casesOfClient = cases.filter(c => c.client_id === cl.id);
            const useCase = Math.random() < 0.65 && casesOfClient.length ? randomPick(casesOfClient) : null;

            const status = randomPick(apptStatuses);
            const channel = randomPick(channels);

            insertAppt.run({
                client_id: cl.id,
                case_id: useCase ? useCase.id : null,
                lawyer_id: lw.id,
                start_at,
                end_at,
                channel,
                status,
                notes: `Turno demo (${channel})`,
            });

            usedByLawyer.get(lw.id).add(key);
            created++;
        }
    });

    txn();

    const counts = {
        lawyers: db.prepare("SELECT COUNT(*) c FROM lawyers").get().c,
        clients: db.prepare("SELECT COUNT(*) c FROM clients").get().c,
        cases: db.prepare("SELECT COUNT(*) c FROM cases").get().c,
        documents: db.prepare("SELECT COUNT(*) c FROM documents").get().c,
        appointments: db.prepare("SELECT COUNT(*) c FROM appointments").get().c,
    };

    console.log("✅ Seed DEMO listo:", counts);
    db.close();
}

run();
