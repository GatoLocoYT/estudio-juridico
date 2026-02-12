function requireAdmin(req, res, next) {
  // sessionMiddleware (server/middleware/session.js) debe ejecutarse antes
  if (!req.user) return res.status(401).json({ ok: false, error: "Unauthorized" });

  // roles internos permitidos
  const role = req.user.role;
  if (!["admin", "abogado", "asistente"].includes(role)) {
    return res.status(403).json({ ok: false, error: "Forbidden" });
  }

  next();
}

module.exports = { requireAdmin };
