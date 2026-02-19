// server/middleware/auth.js
/*
 Sistema Web Estudio Jurídico
 Autor: Ramiro Rahman Rintoul
 Copyright © 2026
 Uso restringido - No redistribuir
*/

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ ok: false, error: "Unauthorized" });
  return next();
}

function requireRole(roles = []) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ ok: false, error: "Unauthorized" });
    const role = req.user.role;
    if (!roles.includes(role)) return res.status(403).json({ ok: false, error: "Forbidden" });
    return next();
  };
}

// Compat: lo que hoy llamás requireAdmin en las rutas
const requireAdmin = requireRole(["admin", "abogado", "asistente"]);

module.exports = { requireAuth, requireRole, requireAdmin };
