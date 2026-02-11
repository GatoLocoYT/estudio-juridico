require("dotenv").config();
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");

const { sessionMiddleware } = require("./middleware/session");

const adminRoutes = require("./routes/admin");
// (después agregamos publicRoutes para /api/consultas con DB real)

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Carga req.user si hay sesión válida
app.use(sessionMiddleware);

// Static
app.use(express.static(path.join(__dirname, "../public")));

// Admin API
app.use("/api/admin", adminRoutes);

app.get("/health", (req, res) => res.json({ status: "ok" }));

// Fallback HTML (sin wildcard "*")
app.use((req, res, next) => {
  if (req.method !== "GET") return next();
  const accept = req.headers.accept || "";
  if (!accept.includes("text/html")) return next();
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
