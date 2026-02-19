PRAGMA foreign_keys = ON;

-- Users (abogados/admin)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','abogado','asistente')) DEFAULT 'abogado',
  password_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sessions: guardamos hash del token (no el token en claro)
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  ip TEXT,
  user_agent TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- Consultas (MVP)
CREATE TABLE IF NOT EXISTS consultations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  area TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('new','review','answered','closed')) DEFAULT 'new',
  urgency TEXT NOT NULL CHECK (urgency IN ('low','medium','high')) DEFAULT 'medium',
  assigned_to INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_consultations_status ON consultations(status);
CREATE INDEX IF NOT EXISTS idx_consultations_urgency ON consultations(urgency);
CREATE INDEX IF NOT EXISTS idx_consultations_created_at ON consultations(created_at);

-- Notas internas
CREATE TABLE IF NOT EXISTS consultation_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  consultation_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_notes_consultation_id ON consultation_notes(consultation_id);

-- Auditoría mínima
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  meta_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at);

-- Trigger para updated_at
CREATE TRIGGER IF NOT EXISTS trg_users_updated_at
AFTER UPDATE ON users
FOR EACH ROW
BEGIN
  UPDATE users SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_consultations_updated_at
AFTER UPDATE ON consultations
FOR EACH ROW
BEGIN
  UPDATE consultations SET updated_at = datetime('now') WHERE id = NEW.id;
END;
-- CLIENTS
CREATE TABLE IF NOT EXISTS clients (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name       TEXT NOT NULL,
  dni             TEXT,                  -- opcional (si aplica a AR)
  email           TEXT,
  phone           TEXT,
  address         TEXT,
  notes           TEXT,

  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','inactive','prospect')),

  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_clients_name    ON clients(full_name);
CREATE INDEX IF NOT EXISTS idx_clients_email   ON clients(email);
CREATE INDEX IF NOT EXISTS idx_clients_phone   ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_clients_deleted ON clients(deleted_at);


-- CASES
CREATE TABLE IF NOT EXISTS cases (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id       INTEGER NOT NULL,
  title           TEXT NOT NULL,               -- “Divorcio contencioso”, etc
  area            TEXT,                        -- “Familia”, “Laboral”, etc
  status          TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','pending','closed','archived')),
  priority        TEXT NOT NULL DEFAULT 'normal'
                  CHECK (priority IN ('low','normal','high','urgent')),

  description     TEXT,
  opened_at       TEXT NOT NULL DEFAULT (date('now')),
  closed_at       TEXT,

  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at      TEXT,

  FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE INDEX IF NOT EXISTS idx_cases_client     ON cases(client_id);
CREATE INDEX IF NOT EXISTS idx_cases_status     ON cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_deleted    ON cases(deleted_at);


-- DOCUMENTS (metadata + ruta del archivo)
CREATE TABLE IF NOT EXISTS documents (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id         INTEGER NOT NULL,

  filename        TEXT NOT NULL,     -- nombre original o normalizado
  storage_path    TEXT NOT NULL,     -- ruta relativa en VPS
  mime_type       TEXT,
  size_bytes      INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),

  doc_type        TEXT NOT NULL DEFAULT 'other'
                  CHECK (doc_type IN ('contract','evidence','court_filing','id','power_of_attorney','other')),

  description     TEXT,

  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at      TEXT,

  FOREIGN KEY (case_id) REFERENCES cases(id)
);

CREATE INDEX IF NOT EXISTS idx_docs_case        ON documents(case_id);
CREATE INDEX IF NOT EXISTS idx_docs_type        ON documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_docs_deleted     ON documents(deleted_at);
-- Tabla abogados
CREATE TABLE IF NOT EXISTS lawyers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL CHECK(length(full_name) BETWEEN 3 AND 120),
  email TEXT UNIQUE,
  specialty TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);


-- APPOINTMENTS
CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  client_id INTEGER NOT NULL,
  case_id   INTEGER,

  lawyer_id INTEGER,

  start_at TEXT NOT NULL,
  end_at   TEXT NOT NULL,

  channel TEXT NOT NULL DEFAULT 'in_person'
          CHECK (channel IN ('in_person','phone','video')),

  status TEXT NOT NULL DEFAULT 'scheduled'
          CHECK (status IN ('scheduled','confirmed','cancelled','done','no_show')),

  title TEXT,
  notes TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,

  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (case_id) REFERENCES cases(id),
  FOREIGN KEY (lawyer_id) REFERENCES lawyers(id),

  CHECK (end_at > start_at)
);


CREATE INDEX IF NOT EXISTS idx_appt_client   ON appointments(client_id);
CREATE INDEX IF NOT EXISTS idx_appt_case     ON appointments(case_id);
CREATE INDEX IF NOT EXISTS idx_appt_start    ON appointments(start_at);
CREATE INDEX IF NOT EXISTS idx_appt_status   ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appt_deleted  ON appointments(deleted_at);


-- Índices
CREATE INDEX IF NOT EXISTS idx_appointments_lawyer
ON appointments(lawyer_id);

CREATE INDEX IF NOT EXISTS idx_appointments_lawyer_start
ON appointments(lawyer_id, start_at);
