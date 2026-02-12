/* public/js/main.js
   Admin panel: carga real desde API (SQLite)
   Requiere que admin/index.html exponga window.AdminUI (helpers UI)
*/

(() => {
  if (!window.AdminUI) {
    console.warn("AdminUI no está definido (admin/index.html debe incluir el script inline que lo crea).");
    return;
  }

  // =========================
  // Config
  // =========================
  const API = {
    dashboard: "/api/dashboard", // opcional; si no existe, hacemos fallback
    clients: "/api/clients",
    cases: "/api/cases",
    documents: "/api/documents",
    appointments: "/api/appointments",
    lawyers: "/api/lawyers",
    logout: "/api/admin/logout", // si tu ruta difiere, cambiá esto
    me: "/api/admin/me",         // opcional para mostrar email
    health: "/health",       // opcional
  };

  const state = {
    view: "dashboard",
    q: "",
    filter: "",
    sort: "created_at:desc",
    page: 1,
    pageSize: 20,
  };

  // =========================
  // Helpers
  // =========================
  const $ = (sel) => document.querySelector(sel);

  function normalizeListPayload(json) {
    // soporta:
    // 1) { items, total, page, limit }
    // 2) { data, meta: { total, page, limit } }
    // 3) Array directo
    if (Array.isArray(json)) {
      return { items: json, total: json.length, page: 1, limit: json.length };
    }
    if (json && Array.isArray(json.items)) {
      return {
        items: json.items,
        total: Number(json.total ?? json.items.length),
        page: Number(json.page ?? 1),
        limit: Number(json.limit ?? json.items.length),
      };
    }
    if (json && Array.isArray(json.data)) {
      return {
        items: json.data,
        total: Number(json.meta?.total ?? json.data.length),
        page: Number(json.meta?.page ?? 1),
        limit: Number(json.meta?.limit ?? json.data.length),
      };
    }
    return { items: [], total: 0, page: 1, limit: state.pageSize };
  }

  async function apiFetch(url, opts = {}) {
    const res = await fetch(url, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...opts,
    });

    if (res.status === 401 || res.status === 403) {
      // no autorizado -> login
      window.location.href = "/admin/login";
      return null;
    }

    let json = null;
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      json = await res.json().catch(() => null);
    } else {
      json = await res.text().catch(() => null);
    }

    if (!res.ok) {
      const msg =
        (json && json.error && (json.error.message || json.error.code)) ||
        (typeof json === "string" && json) ||
        `HTTP ${res.status}`;
      throw new Error(msg);
    }

    return json;
  }

  function setHeaderByView(view) {
    const headers = {
      dashboard: ["Dashboard", "Resumen general del estudio"],
      appointments: ["Agenda (Turnos)", "Gestión de citas y horarios"],
      clients: ["Clientes", "Listado y administración de clientes"],
      cases: ["Casos", "Casos legales y prioridades"],
      documents: ["Documentos", "Archivos asociados a casos"],
      lawyers: ["Abogados", "Equipo y especialidades"],
    };
    const [t, s] = headers[view] || ["Panel", ""];
    AdminUI.setHeader(t, s);
  }

  function fmt(v) {
    if (v === null || v === undefined) return "—";
    return String(v);
  }

  function statusPill(status) {
    const map = {
      active: "bg-emerald-50 text-emerald-700 border-emerald-200",
      inactive: "bg-slate-50 text-slate-700 border-slate-200",

      open: "bg-emerald-50 text-emerald-700 border-emerald-200",
      pending: "bg-amber-50 text-amber-700 border-amber-200",
      closed: "bg-slate-50 text-slate-700 border-slate-200",

      scheduled: "bg-blue-50 text-blue-700 border-blue-200",
      confirmed: "bg-emerald-50 text-emerald-700 border-emerald-200",
      cancelled: "bg-rose-50 text-rose-700 border-rose-200",
      done: "bg-slate-50 text-slate-700 border-slate-200",

      low: "bg-emerald-50 text-emerald-700 border-emerald-200",
      normal: "bg-slate-50 text-slate-700 border-slate-200",
      high: "bg-amber-50 text-amber-700 border-amber-200",
      urgent: "bg-rose-50 text-rose-700 border-rose-200",
    };
    const cls = map[status] || "bg-slate-50 text-slate-700 border-slate-200";
    return `<span class="inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium ${cls}">${fmt(status)}</span>`;
  }

  function badge(text) {
    return `<span class="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">${text}</span>`;
  }

  function renderTableCommon({ title, count, headHtml, rowsHtml, pageInfo, canPrev, canNext }) {
    AdminUI.setTable({
      title,
      count,
      headHtml,
      bodyHtml: rowsHtml,
      pageInfo: pageInfo || "—",
      canPrev: !!canPrev,
      canNext: !!canNext,
    });
    AdminUI.showEmpty(!rowsHtml || rowsHtml.trim().length === 0);
  }

  // =========================
  // Loaders
  // =========================
  async function loadSystemStatus() {
    try {
      // si no tenés /health, esto no rompe
      const res = await apiFetch(API.health);
      if (res !== null) AdminUI.setSystemStatus({ api: "OK", db: "OK", last: new Date().toLocaleString() });
    } catch {
      AdminUI.setSystemStatus({ api: "—", db: "—", last: "—" });
    }
  }

  async function loadMe() {
    try {
      const me = await apiFetch(API.me);
      if (!me) return;
      const email = me.email || me.admin?.email;
      if (email && $("#adminEmail")) $("#adminEmail").textContent = email;
    } catch {
      // opcional
    }
  }

  // =========================
  // Dashboard
  // =========================
  async function loadDashboard() {
    // Intento 1: endpoint dedicado (si existe)
    try {
      const dash = await apiFetch(API.dashboard);
      if (dash) {
        const k = dash.kpis || {};
        AdminUI.setKpis({
          clients: k.clients ?? "—",
          cases: k.cases ?? "—",
          appointments: k.appointments ?? "—",
          documents: k.documents ?? "—",
        });

        const activity = Array.isArray(dash.recentActivity) ? dash.recentActivity : [];
        const headHtml = `
          <th class="px-4 py-3 font-semibold">Tipo</th>
          <th class="px-4 py-3 font-semibold">Detalle</th>
          <th class="px-4 py-3 font-semibold">Estado</th>
          <th class="px-4 py-3 font-semibold">Fecha</th>
          <th class="px-4 py-3 font-semibold text-right">Acciones</th>
        `;
        const rowsHtml = activity
          .slice(0, 12)
          .map((x) => {
            const type = badge(fmt(x.type));
            const detail = `<div class="font-medium">${fmt(x.title || x.detail)}</div><div class="text-xs text-slate-600">${fmt(x.subtitle || "")}</div>`;
            const st = statusPill(x.status);
            const dt = `<span class="text-xs text-slate-600">${fmt(x.at || x.created_at || x.updated_at)}</span>`;
            const actions = `<div class="flex justify-end gap-2">
              <button class="rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-slate-100" data-action="view" data-type="${fmt(x.type)}" data-id="${fmt(x.id)}">Ver</button>
            </div>`;
            return `<tr class="hover:bg-slate-50">
              <td class="px-4 py-3">${type}</td>
              <td class="px-4 py-3">${detail}</td>
              <td class="px-4 py-3">${st}</td>
              <td class="px-4 py-3">${dt}</td>
              <td class="px-4 py-3 text-right">${actions}</td>
            </tr>`;
          })
          .join("");

        renderTableCommon({
          title: "Actividad reciente",
          count: activity.length,
          headHtml,
          rowsHtml,
          pageInfo: "—",
          canPrev: false,
          canNext: false,
        });

        return;
      }
    } catch {
      // fallback
    }

    // Fallback: 4 requests
    const [clientsRaw, casesRaw, apptsRaw, docsRaw] = await Promise.all([
      apiFetch(API.clients),
      apiFetch(API.cases),
      apiFetch(API.appointments),
      apiFetch(API.documents),
    ]);

    if (!clientsRaw || !casesRaw || !apptsRaw || !docsRaw) return;

    const clients = normalizeListPayload(clientsRaw);
    const cases = normalizeListPayload(casesRaw);
    const appts = normalizeListPayload(apptsRaw);
    const docs = normalizeListPayload(docsRaw);

    AdminUI.setKpis({
      clients: clients.total,
      cases: cases.total,
      appointments: appts.total,
      documents: docs.total,
    });

    // Actividad: 6 próximos turnos (si vienen ordenados; si no, igual sirve)
    const headHtml = `
      <th class="px-4 py-3 font-semibold">Tipo</th>
      <th class="px-4 py-3 font-semibold">Detalle</th>
      <th class="px-4 py-3 font-semibold">Estado</th>
      <th class="px-4 py-3 font-semibold">Fecha</th>
      <th class="px-4 py-3 font-semibold text-right">Acciones</th>
    `;
    const rowsHtml = appts.items
      .slice(0, 10)
      .map((a) => {
        const type = badge("Turno");
        const detail = `<div class="font-medium">${fmt(a.client_name || a.client?.full_name || ("Cliente #" + a.client_id))}</div>
                        <div class="text-xs text-slate-600">${fmt(a.start_at)} · ${fmt(a.lawyer_name || ("Abogado #" + a.lawyer_id))}</div>`;
        const st = statusPill(a.status);
        const dt = `<span class="text-xs text-slate-600">${fmt(a.updated_at || a.created_at)}</span>`;
        const actions = `<div class="flex justify-end gap-2">
          <button class="rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-slate-100" data-action="view" data-type="appointment" data-id="${a.id}">Ver</button>
        </div>`;
        return `<tr class="hover:bg-slate-50">
          <td class="px-4 py-3">${type}</td>
          <td class="px-4 py-3">${detail}</td>
          <td class="px-4 py-3">${st}</td>
          <td class="px-4 py-3">${dt}</td>
          <td class="px-4 py-3 text-right">${actions}</td>
        </tr>`;
      })
      .join("");

    renderTableCommon({
      title: "Actividad reciente",
      count: appts.items.length,
      headHtml,
      rowsHtml,
      pageInfo: "—",
      canPrev: false,
      canNext: false,
    });
  }

  // =========================
  // Views: list loaders
  // =========================
  async function loadClients() {
    const json = await apiFetch(API.clients);
    if (!json) return;
    const { items, total, page, limit } = normalizeListPayload(json);

    const headHtml = `
      <th class="px-4 py-3 font-semibold">Nombre</th>
      <th class="px-4 py-3 font-semibold">Contacto</th>
      <th class="px-4 py-3 font-semibold">Estado</th>
      <th class="px-4 py-3 font-semibold">Actualizado</th>
      <th class="px-4 py-3 font-semibold text-right">Acciones</th>
    `;

    const rowsHtml = items.map((c) => {
      const name = `<div class="font-medium">${fmt(c.full_name)}</div><div class="text-xs text-slate-600">ID #${fmt(c.id)}</div>`;
      const contact = `<div class="text-sm">${fmt(c.email)}</div><div class="text-xs text-slate-600">${fmt(c.phone)}</div>`;
      return `<tr class="hover:bg-slate-50">
        <td class="px-4 py-3">${name}</td>
        <td class="px-4 py-3">${contact}</td>
        <td class="px-4 py-3">${statusPill(c.status)}</td>
        <td class="px-4 py-3"><span class="text-xs text-slate-600">${fmt(c.updated_at)}</span></td>
        <td class="px-4 py-3 text-right">
          <div class="flex justify-end gap-2">
            <button class="rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-slate-100" data-action="edit" data-type="client" data-id="${c.id}">Editar</button>
          </div>
        </td>
      </tr>`;
    }).join("");

    renderTableCommon({
      title: "Clientes",
      count: total,
      headHtml,
      rowsHtml,
      pageInfo: `Mostrando ${items.length} de ${total} (page ${page}, limit ${limit})`,
      canPrev: false,
      canNext: false,
    });
  }

  async function loadCases() {
    const json = await apiFetch(API.cases);
    if (!json) return;
    const { items, total } = normalizeListPayload(json);

    const headHtml = `
      <th class="px-4 py-3 font-semibold">Caso</th>
      <th class="px-4 py-3 font-semibold">Cliente</th>
      <th class="px-4 py-3 font-semibold">Prioridad</th>
      <th class="px-4 py-3 font-semibold">Estado</th>
      <th class="px-4 py-3 font-semibold text-right">Acciones</th>
    `;

    const rowsHtml = items.map((c) => {
      const caseCell = `<div class="font-medium">${fmt(c.title)}</div><div class="text-xs text-slate-600">ID #${fmt(c.id)}</div>`;
      const clientCell = `<span class="text-sm">${fmt(c.client_name || ("Cliente #" + c.client_id))}</span>`;
      return `<tr class="hover:bg-slate-50">
        <td class="px-4 py-3">${caseCell}</td>
        <td class="px-4 py-3">${clientCell}</td>
        <td class="px-4 py-3">${statusPill(c.priority)}</td>
        <td class="px-4 py-3">${statusPill(c.status)}</td>
        <td class="px-4 py-3 text-right">
          <div class="flex justify-end gap-2">
            <button class="rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-slate-100" data-action="edit" data-type="case" data-id="${c.id}">Editar</button>
          </div>
        </td>
      </tr>`;
    }).join("");

    renderTableCommon({
      title: "Casos",
      count: total,
      headHtml,
      rowsHtml,
      pageInfo: `Mostrando ${items.length} de ${total}`,
      canPrev: false,
      canNext: false,
    });
  }

  async function loadDocuments() {
    const json = await apiFetch(API.documents);
    if (!json) return;
    const { items, total } = normalizeListPayload(json);

    const headHtml = `
      <th class="px-4 py-3 font-semibold">Archivo</th>
      <th class="px-4 py-3 font-semibold">Tipo</th>
      <th class="px-4 py-3 font-semibold">Caso</th>
      <th class="px-4 py-3 font-semibold">Tamaño</th>
      <th class="px-4 py-3 font-semibold text-right">Acciones</th>
    `;

    const rowsHtml = items.map((d) => {
      const kb = d.size_bytes ? Math.round(Number(d.size_bytes) / 1024) : null;
      const fileCell = `<div class="font-medium">${fmt(d.filename)}</div><div class="text-xs text-slate-600">ID #${fmt(d.id)}</div>`;
      return `<tr class="hover:bg-slate-50">
        <td class="px-4 py-3">${fileCell}</td>
        <td class="px-4 py-3">${statusPill(d.doc_type)}</td>
        <td class="px-4 py-3"><span class="text-sm">${fmt(d.case_title || ("Caso #" + d.case_id))}</span></td>
        <td class="px-4 py-3"><span class="text-xs text-slate-600">${kb ? kb + " KB" : "—"}</span></td>
        <td class="px-4 py-3 text-right">
          <div class="flex justify-end gap-2">
            <button class="rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-slate-100" data-action="view" data-type="document" data-id="${d.id}">Ver</button>
          </div>
        </td>
      </tr>`;
    }).join("");

    renderTableCommon({
      title: "Documentos",
      count: total,
      headHtml,
      rowsHtml,
      pageInfo: `Mostrando ${items.length} de ${total}`,
      canPrev: false,
      canNext: false,
    });
  }

  async function loadAppointments() {
    const json = await apiFetch(API.appointments);
    if (!json) return;
    const { items, total } = normalizeListPayload(json);

    const headHtml = `
      <th class="px-4 py-3 font-semibold">Cliente</th>
      <th class="px-4 py-3 font-semibold">Abogado</th>
      <th class="px-4 py-3 font-semibold">Horario</th>
      <th class="px-4 py-3 font-semibold">Estado</th>
      <th class="px-4 py-3 font-semibold text-right">Acciones</th>
    `;

    const rowsHtml = items.map((a) => {
      const clientCell = `<div class="font-medium">${fmt(a.client_name || ("Cliente #" + a.client_id))}</div><div class="text-xs text-slate-600">${fmt(a.channel)}</div>`;
      const lawyerCell = `<div class="text-sm">${fmt(a.lawyer_name || ("Abogado #" + a.lawyer_id))}</div><div class="text-xs text-slate-600">ID #${fmt(a.lawyer_id)}</div>`;
      const timeCell = `<div class="text-sm">${fmt(a.start_at)}</div><div class="text-xs text-slate-600">${fmt(a.end_at)}</div>`;
      const actions = `<div class="flex justify-end gap-2">
        <button class="rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-slate-100" data-action="confirm" data-type="appointment" data-id="${a.id}">Confirmar</button>
        <button class="rounded-lg border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50" data-action="cancel" data-type="appointment" data-id="${a.id}">Cancelar</button>
      </div>`;
      return `<tr class="hover:bg-slate-50">
        <td class="px-4 py-3">${clientCell}</td>
        <td class="px-4 py-3">${lawyerCell}</td>
        <td class="px-4 py-3">${timeCell}</td>
        <td class="px-4 py-3">${statusPill(a.status)}</td>
        <td class="px-4 py-3 text-right">${actions}</td>
      </tr>`;
    }).join("");

    renderTableCommon({
      title: "Agenda (Turnos)",
      count: total,
      headHtml,
      rowsHtml,
      pageInfo: `Mostrando ${items.length} de ${total}`,
      canPrev: false,
      canNext: false,
    });
  }

  async function loadLawyers() {
    const json = await apiFetch(API.lawyers);
    if (!json) return;
    const { items, total } = normalizeListPayload(json);

    const headHtml = `
      <th class="px-4 py-3 font-semibold">Nombre</th>
      <th class="px-4 py-3 font-semibold">Especialidad</th>
      <th class="px-4 py-3 font-semibold">Estado</th>
      <th class="px-4 py-3 font-semibold text-right">Acciones</th>
    `;

    const rowsHtml = items.map((l) => {
      const name = `<div class="font-medium">${fmt(l.full_name)}</div><div class="text-xs text-slate-600">ID #${fmt(l.id)}</div>`;
      return `<tr class="hover:bg-slate-50">
        <td class="px-4 py-3">${name}</td>
        <td class="px-4 py-3"><span class="text-sm">${fmt(l.specialty)}</span></td>
        <td class="px-4 py-3">${statusPill(l.status)}</td>
        <td class="px-4 py-3 text-right">
          <div class="flex justify-end gap-2">
            <button class="rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-slate-100" data-action="edit" data-type="lawyer" data-id="${l.id}">Editar</button>
          </div>
        </td>
      </tr>`;
    }).join("");

    renderTableCommon({
      title: "Abogados",
      count: total,
      headHtml,
      rowsHtml,
      pageInfo: `Mostrando ${items.length} de ${total}`,
      canPrev: false,
      canNext: false,
    });
  }

  async function renderCurrentView() {
    setHeaderByView(state.view);
    AdminUI.showLoader(true);
    AdminUI.showEmpty(false);

    try {
      if (state.view === "dashboard") await loadDashboard();
      else if (state.view === "clients") await loadClients();
      else if (state.view === "cases") await loadCases();
      else if (state.view === "documents") await loadDocuments();
      else if (state.view === "appointments") await loadAppointments();
      else if (state.view === "lawyers") await loadLawyers();
      else await loadDashboard();
    } catch (err) {
      console.error(err);
      AdminUI.toast(`Error: ${err.message || err}`, "error");
      AdminUI.setTable({
        title: "Error",
        count: 0,
        headHtml: `
          <th class="px-4 py-3 font-semibold">Detalle</th>
          <th class="px-4 py-3 font-semibold">Acción</th>
        `,
        bodyHtml: `<tr>
          <td class="px-4 py-3 text-sm text-slate-700">${fmt(err.message || err)}</td>
          <td class="px-4 py-3">
            <button id="retryBtn" class="rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-slate-100">Reintentar</button>
          </td>
        </tr>`,
        pageInfo: "—",
        canPrev: false,
        canNext: false,
      });
      const btn = document.getElementById("retryBtn");
      if (btn) btn.onclick = () => renderCurrentView();
    } finally {
      AdminUI.showLoader(false);
    }
  }

  // =========================
  // Events desde admin/index.html
  // =========================
  window.addEventListener("admin:view", (e) => {
    state.view = e.detail.view;
    state.page = 1;
    renderCurrentView();
  });

  window.addEventListener("admin:search", (e) => {
    state.q = e.detail.q || "";
    // Por ahora no lo usamos en API (no tenés query params), pero lo dejamos listo
    // Podés filtrar del lado cliente en el futuro o agregar search en backend.
    renderCurrentView();
  });

  window.addEventListener("admin:filter", (e) => {
    state.filter = e.detail.filter || "";
    renderCurrentView();
  });

  window.addEventListener("admin:sort", (e) => {
    state.sort = e.detail.sort || "created_at:desc";
    renderCurrentView();
  });

  window.addEventListener("admin:page", (e) => {
    state.page = Math.max(1, state.page + e.detail.dir);
    renderCurrentView();
  });

  window.addEventListener("admin:refresh", () => {
    AdminUI.toast("Actualizando…", "info");
    renderCurrentView();
  });

  window.addEventListener("admin:health", () => loadSystemStatus());

  window.addEventListener("admin:new", () => {
    if (state.view !== "clients") {
      AdminUI.toast("Solo disponible en Clientes por ahora", "info");
      return;
    }

    AdminUI.openModal({
      title: "Nuevo Cliente",
      subtitle: "Crear cliente",

      fieldsHtml: `
      <label>
        <div class="text-xs font-semibold">Nombre</div>
        <input id="c_name" class="input" />
      </label>

      <label>
        <div class="text-xs font-semibold">Email</div>
        <input id="c_email" class="input" />
      </label>

      <label>
        <div class="text-xs font-semibold">Teléfono</div>
        <input id="c_phone" class="input" />
      </label>
    `,
    });

    const form = document.getElementById("modalForm");

    form.onsubmit = async (e) => {
      e.preventDefault();

      const data = {
        full_name: document.getElementById("c_name").value,
        email: document.getElementById("c_email").value,
        phone: document.getElementById("c_phone").value,
      };

      try {
        await apiFetch("/api/clients", {
          method: "POST",
          body: JSON.stringify(data),
        });

        AdminUI.toast("Cliente creado", "success");
        AdminUI.closeModal();
        loadClients();

      } catch (err) {
        AdminUI.toast(err.message, "error");
      }
    };
  });


  window.addEventListener("admin:logout", async () => {
    try {
      await apiFetch(API.logout, { method: "POST" });
    } catch { }
    window.location.href = "/admin/login";
  });

  // acciones dentro de tabla (confirm/cancel etc.)
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;
    const type = btn.dataset.type;
    const id = btn.dataset.id;

    // ============================
    // EDITAR CLIENTE (MVP)
    // ============================
    if (type === "client" && action === "edit") {
      try {
        // Traer cliente
        const client = await apiFetch(`/api/clients/${id}`);
        if (!client) return;

        // Abrir modal con datos
        AdminUI.openModal({
          title: "Editar cliente",
          subtitle: `ID #${id}`,
          showDelete: true,
          fieldsHtml: `
          <label class="text-sm">
            <div class="mb-1 text-xs font-semibold">Nombre</div>
            <input id="f_name" value="${client.full_name || ""}"
              class="w-full rounded-xl border px-3 py-2" />
          </label>

          <label class="text-sm">
            <div class="mb-1 text-xs font-semibold">Email</div>
            <input id="f_email" value="${client.email || ""}"
              class="w-full rounded-xl border px-3 py-2" />
          </label>

          <label class="text-sm">
            <div class="mb-1 text-xs font-semibold">Teléfono</div>
            <input id="f_phone" value="${client.phone || ""}"
              class="w-full rounded-xl border px-3 py-2" />
          </label>
        `
        });

        // Guardar
        document.getElementById("modalForm").onsubmit = async (ev) => {
          ev.preventDefault();

          const payload = {
            full_name: document.getElementById("f_name").value,
            email: document.getElementById("f_email").value,
            phone: document.getElementById("f_phone").value,
          };

          await apiFetch(`/api/clients/${id}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          });

          AdminUI.toast("Cliente actualizado", "success");
          AdminUI.closeModal();
          renderCurrentView();
        };

        // Eliminar
        document.getElementById("btnModalDelete").onclick = async () => {
          if (!confirm("¿Eliminar cliente?")) return;

          await apiFetch(`/api/clients/${id}`, {
            method: "DELETE",
          });

          AdminUI.toast("Cliente eliminado", "success");
          AdminUI.closeModal();
          renderCurrentView();
        };

      } catch (err) {
        AdminUI.toast("Error al editar cliente", "error");
        console.error(err);
      }

      return;
    }

    // ============================
    // TURNOS (lo tuyo actual)
    // ============================
    if (type === "appointment") {
      try {
        if (action === "confirm") {
          await apiFetch(`/api/appointments/${id}/confirm`, { method: "POST" });
          AdminUI.toast("Turno confirmado", "success");
          await renderCurrentView();
          return;
        }

        if (action === "cancel") {
          await apiFetch(`/api/appointments/${id}/cancel`, { method: "POST" });
          AdminUI.toast("Turno cancelado", "success");
          await renderCurrentView();
          return;
        }
      } catch (err) {
        AdminUI.toast("Error en turno", "error");
      }
    }

    // fallback
    AdminUI.toast(`Acción no implementada: ${action}`, "info");
  });


  // =========================
  // Boot
  // =========================
  (async function boot() {
    await loadMe();
    await loadSystemStatus();
    await renderCurrentView();
  })();
})();
