(() => {
  "use strict";

  // ===== Helpers =====
  const $ = (sel, root = document) => root.querySelector(sel);

  function setMsg(el, text, type = "info") {
    if (!el) return;
    el.textContent = text || "";
    // clases "tipo" (opcional, si no existen igual no rompe)
    el.classList.remove("text-green-700", "text-red-700", "text-slate-600");
    if (type === "ok") el.classList.add("text-green-700");
    else if (type === "err") el.classList.add("text-red-700");
    else el.classList.add("text-slate-600");
  }

  function serializeForm(form) {
    const fd = new FormData(form);
    const obj = {};
    for (const [k, v] of fd.entries()) obj[k] = String(v ?? "").trim();
    return obj;
  }

  function normalizePayload(payload) {
    // Asegura campos esperados por backend (y unifica nombre+apellido si corresponde)
    const nombre = payload.nombre || "";
    const apellido = payload.apellido || "";

    // Si el form separa nombre/apellido, unificamos en nombre
    const fullName = `${nombre} ${apellido}`.trim();

    return {
      nombre: fullName || nombre,
      email: payload.email || "",
      telefono: payload.telefono || "",
      area: payload.area || "",
      mensaje: payload.mensaje || "",
    };
  }

  async function postConsulta(data, signal) {
    const res = await fetch("/api/consultas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal,
    });

    // Intentar parsear JSON siempre
    let json = null;
    try {
      json = await res.json();
    } catch (_) {}

    if (!res.ok) {
      const msg = (json && (json.error || json.message)) || `Error HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      err.payload = json;
      throw err;
    }

    return json || { ok: true };
  }

  function attachFormHandler({
    formId,
    msgId,
    submitSelector = 'button[type="submit"]',
  }) {
    const form = document.getElementById(formId);
    const msgEl = document.getElementById(msgId);
    if (!form) return;

    const btn = form.querySelector(submitSelector);

    let controller = null;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      // Cancelar envío anterior si todavía estaba en vuelo
      if (controller) controller.abort();
      controller = new AbortController();

      const raw = serializeForm(form);
      const payload = normalizePayload(raw);

      // Validación mínima client-side (backend igual valida)
      if (!payload.nombre || !payload.email || !payload.area || !payload.mensaje) {
        setMsg(msgEl, "Por favor completá nombre, email, área y mensaje.", "err");
        return;
      }

      try {
        if (btn) {
          btn.disabled = true;
          btn.classList.add("opacity-70", "cursor-not-allowed");
        }
        setMsg(msgEl, "Enviando...", "info");

        const result = await postConsulta(payload, controller.signal);

        // Si el backend devuelve urgencia, podés mostrarla
        const urgency = result?.urgency ? ` (Urgencia: ${result.urgency})` : "";
        setMsg(msgEl, `¡Listo! Recibimos tu consulta. Te contactaremos a la brevedad.${urgency}`, "ok");

        form.reset();
      } catch (err) {
        if (err.name === "AbortError") return;
        setMsg(
          msgEl,
          err?.message || "Ocurrió un error al enviar. Probá de nuevo en unos minutos.",
          "err"
        );
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.classList.remove("opacity-70", "cursor-not-allowed");
        }
      }
    });
  }

  // ===== UI: year =====
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ===== UI: mobile menu =====
  const btnMenu = document.getElementById("btnMenu");
  const mobileMenu = document.getElementById("mobileMenu");
  btnMenu?.addEventListener("click", () => mobileMenu?.classList.toggle("hidden"));

  // ===== Forms =====
  attachFormHandler({ formId: "quickForm", msgId: "quickFormMsg" });
  attachFormHandler({ formId: "contactForm", msgId: "contactFormMsg" });
})();
