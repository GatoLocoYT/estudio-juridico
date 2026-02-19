/*
 Sistema Web Estudio Jurídico
 Autor: Ramiro Rahman Rintoul
 Copyright © 2026
 Uso restringido - No redistribuir
*/
// require("dotenv").config(); <-- No es necesario con dotenvx

const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");

// Middlewares propios
const { sessionMiddleware } = require("./middleware/session");

// Routers
const adminRoutes = require("./routes/admin");
const lawyersRoutes = require("./routes/lawyers");
const clientsRoutes = require("./routes/clients");
const casesRoutes = require("./routes/cases");
const documentsRoutes = require("./routes/documents");
const appointmentsRoutes = require("./routes/appointments");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const isProd = process.env.NODE_ENV === "production";

// En Railway / proxies: importante si después usás cookies secure o req.ip real
app.set("trust proxy", 1);

// =========================
// Paths
// =========================
const PUBLIC_DIR = path.join(__dirname, "../public");
const ADMIN_DIR = path.join(PUBLIC_DIR, "admin");

// =========================
// Core middleware
// =========================
app.disable("x-powered-by"); // no revelar Express

// Parse body
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

// Cookies
app.use(cookieParser());

// Sesión (carga req.user si cookie válida)
// IMPORTANTE: debe ir después de cookieParser
app.use(sessionMiddleware);

// =========================
// Logs simples (útiles en Railway)
// =========================
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    // log corto, sin ruido
    console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`);
  });
  next();
});

// =========================
// Headers básicos de seguridad (sin librerías)
// =========================
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  // Si servís contenido mixto o querés endurecer:
  // res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'");
  next();
});

// =========================
// Health
// =========================
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    env: process.env.NODE_ENV || "development",
    time: new Date().toISOString(),
  });
});

// =========================
// Admin HTML
// =========================
app.get("/admin/login", (req, res) => {
  res.sendFile(path.join(ADMIN_DIR, "login.html"));
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(ADMIN_DIR, "index.html"));
});

// =========================
// Static
// =========================
// Nota: está bien servir estáticos antes o después de APIs.
// Yo lo pongo acá, y dejo /api separado.
app.use(express.static(PUBLIC_DIR, {
  // Cache fuerte en prod para assets versionados; HTML no tanto
  maxAge: isProd ? "7d" : 0,
  etag: true,
}));

// =========================
// API
// =========================
app.use("/api/admin", adminRoutes);
app.use("/api/lawyers", require("./routes/lawyers"));
app.use("/api/clients", clientsRoutes);
app.use("/api/cases", casesRoutes);
app.use("/api/documents", documentsRoutes);
app.use("/api/appointments", appointmentsRoutes);

// 404 para API (si no matchea nada)
app.use("/api", (req, res) => {
  res.status(404).json({ ok: false, error: "Not Found" });
});

// =========================
// Fallback HTML (SPA / landing)
// =========================
app.use((req, res, next) => {
  if (req.method !== "GET") return next();
  const accept = req.headers.accept || "";
  if (!accept.includes("text/html")) return next();
  return res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

// =========================
// Error handler final (IMPORTANTE: al final)
// =========================
app.use((err, req, res, _next) => {
  console.error("[ERROR]", err);

  // Si ya se empezó a responder, delegamos
  if (res.headersSent) return;

  const isApi = req.originalUrl.startsWith("/api");
  const status = Number(err.status || err.statusCode || 500);

  if (isApi) {
    res.status(status).json({
      ok: false,
      error: status === 500 ? "Internal Server Error" : (err.message || "Error"),
    });
    return;
  }

  res.status(status).send("Error");
});

const { ensureAdminSeed } = require("./seed_admin");
ensureAdminSeed();

// =========================
// Start
// =========================
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} (NODE_ENV=${process.env.NODE_ENV || "development"})`);
});
