// require("dotenv").config(); <-- No es necesario con dotenvx
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

// Admin
app.get("/admin/login", (req, res) =>
  res.sendFile(path.join(__dirname, "../public/admin/login.html"))
);

app.get("/admin", (req, res) =>
  res.sendFile(path.join(__dirname, "../public/admin/index.html"))
);

// Static
app.use(express.static(path.join(__dirname, "../public")));

// Admin API
app.use("/api/admin", adminRoutes);

app.get("/health", (req, res) => res.json({ status: "ok" }));

// routes API
app.use("/api/lawyers", require("./routes/lawyers"));
app.use("/api/clients", require("./routes/clients"));
app.use("/api/cases", require("./routes/cases"));
app.use("/api/documents", require("./routes/documents"));
app.use("/api/appointments", require("./routes/appointments"));

// Fallback HTML (sin wildcard "*")
app.use((req, res, next) => {
  if (req.method !== "GET") return next();
  const accept = req.headers.accept || "";
  if (!accept.includes("text/html")) return next();
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
