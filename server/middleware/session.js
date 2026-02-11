const crypto = require("crypto");
const { getDb } = require("../db/sqlite");

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "sid";
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 7);

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function newToken() {
  // 32 bytes => 64 hex chars
  return crypto.randomBytes(32).toString("hex");
}

function cookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,          // en prod: true (HTTPS)
    sameSite: "lax",
    path: "/",
  };
}

function createSession(res, { userId, ip, userAgent }) {
  const db = getDb();
  const token = newToken();
  const tokenHash = hashToken(token);

  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO sessions (user_id, token_hash, expires_at, ip, user_agent)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, tokenHash, expiresAt, ip || null, userAgent || null);

  res.cookie(COOKIE_NAME, token, { ...cookieOptions(), maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000 });
}

function clearSession(res) {
  res.clearCookie(COOKIE_NAME, cookieOptions());
}

// Carga req.user si la sesión es válida
function sessionMiddleware(req, _res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return next();

  const db = getDb();
  const tokenHash = hashToken(token);

  const row = db.prepare(`
    SELECT s.id as session_id, s.expires_at, s.revoked_at,
           u.id as user_id, u.email, u.full_name, u.role, u.is_active
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
  `).get(tokenHash);

  if (!row) return next();
  if (row.revoked_at) return next();
  if (!row.is_active) return next();

  const now = Date.now();
  const exp = Date.parse(row.expires_at);
  if (!Number.isFinite(exp) || exp < now) return next();

  req.user = {
    id: row.user_id,
    email: row.email,
    full_name: row.full_name,
    role: row.role,
  };
  req.sessionId = row.session_id;

  return next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ ok: false, error: "Unauthorized" });
  return next();
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ ok: false, error: "Unauthorized" });
    if (!roles.includes(req.user.role)) return res.status(403).json({ ok: false, error: "Forbidden" });
    return next();
  };
}

function revokeCurrentSession(req) {
  if (!req.sessionId) return;
  const db = getDb();
  db.prepare(`UPDATE sessions SET revoked_at = datetime('now') WHERE id = ?`).run(req.sessionId);
}

module.exports = {
  sessionMiddleware,
  requireAuth,
  requireRole,
  createSession,
  clearSession,
  revokeCurrentSession,
};
