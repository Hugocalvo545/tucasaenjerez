export function createDashboardUI({ db, escapeHtml, getPropertiesCache }) {
  const dashReservas = document.getElementById("dashReservas");
  const dashLlegadas = document.getElementById("dashLlegadas");
  const dashSalidas = document.getElementById("dashSalidas");
  const dashComentarios = document.getElementById("dashComentarios");
  const dashCancelaciones = document.getElementById("dashCancelaciones");

  const dash48Btn = document.getElementById("dash48Btn");
  const dash7Btn = document.getElementById("dash7Btn");
  const dashNextBtn = document.getElementById("dashNextBtn");
  const dashSearchInput = document.getElementById("dashSearchInput");
  const dashPropertyFilter = document.getElementById("dashPropertyFilter");
  const dashTableBody = document.getElementById("dashTableBody");
  const dashHint = document.getElementById("dashHint");
  const dashColLlegadas = document.getElementById("dashColLlegadas");
  const dashColSalidas = document.getElementById("dashColSalidas");

  let modeDays = 2; // 2=48h, 7=7 días
  let reservasCache = [];
  let chatsCache = new Map(); // chatId -> data

  let unsubReservas = null;
  let unsubChatsIndex = null;

  const events = new AbortController();
  let wired = false;
  let running = false;

  function parseEsDate(es) {
    if (!es || typeof es !== "string") return null;
    const parts = es.split("/");
    if (parts.length !== 3) return null;
    const dd = Number(parts[0]);
    const mm = Number(parts[1]);
    const yy = Number(parts[2]);
    if (!dd || !mm || !yy) return null;
    const d = new Date(yy, mm - 1, dd);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function getTodayStart() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function getWindowEnd(days) {
    const t = getTodayStart();
    const end = new Date(t);
    end.setDate(end.getDate() + days);
    return end;
  }

  function isCancelled(r) {
    const st = String(r?.status || "").toLowerCase();
    return st === "cancelled" || st === "canceled" || r?.cancelled === true;
  }

  // Doc-sombra que el webhook crea por cada unidad de un pack (id "<reservaId>__<unidad>", campo packId).
  // Existen solo para bloquear los calendarios de las unidades; NO deben contarse como reservas
  // independientes (evita el triple conteo pack + unidad A + unidad B). El pack se cuenta 1 vez vía su doc principal.
  function isPackShadow(r) {
    return !!r?.packId || String(r?.reservaId || r?.id || "").includes("__");
  }

  function setCounters({ reservas, llegadas, salidas, comentarios, cancelaciones }) {
    if (dashReservas) dashReservas.textContent = String(reservas || 0);
    if (dashLlegadas) dashLlegadas.textContent = String(llegadas || 0);
    if (dashSalidas) dashSalidas.textContent = String(salidas || 0);
    if (dashComentarios) dashComentarios.textContent = String(comentarios || 0);
    if (dashCancelaciones) dashCancelaciones.textContent = String(cancelaciones || 0);
  }

  function fillPropertyFilter() {
    if (!dashPropertyFilter) return;

    const props = (typeof getPropertiesCache === "function" ? getPropertiesCache() : []) || [];
    const current = dashPropertyFilter.value;

    dashPropertyFilter.innerHTML =
      `<option value="">Todos los alojamientos</option>` +
      props
        .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.nombre || p.id)}</option>`)
        .join("");

    if (current) dashPropertyFilter.value = current;
  }

  function computeMetrics() {
    const props = (typeof getPropertiesCache === "function" ? getPropertiesCache() : []) || [];
    fillPropertyFilter();

    const filterProp = dashPropertyFilter?.value || "";
    const term = (dashSearchInput?.value || "").trim().toLowerCase();

    const start = getTodayStart();
    const end = getWindowEnd(modeDays);

    let llegadas = 0;
    let salidas = 0;
    let reservas = 0;

    const byProp = new Map();
    props.forEach((p) => {
      byProp.set(p.id, {
        id: p.id,
        nombre: p.nombre || p.id,
        ciudad: p.ciudad || "",
        activa: !!p.activa,
        llegadas: 0,
        salidas: 0,
        unreadHost: 0,
      });
    });

    for (const r of reservasCache) {
      if (isCancelled(r)) continue;
      if (isPackShadow(r)) continue;

      const propId = String(r.propertyId || "");
      if (!propId) continue;

      const checkIn = parseEsDate(r.checkIn);
      const checkOut = parseEsDate(r.checkOut);

      const inRangeArrival = checkIn && checkIn >= start && checkIn < end;
      const inRangeDeparture = checkOut && checkOut >= start && checkOut < end;

      if (inRangeArrival) {
        llegadas++;
        reservas++;
      }
      if (inRangeDeparture) salidas++;

      if (!byProp.has(propId)) {
        byProp.set(propId, {
          id: propId,
          nombre: r.propertyName || propId,
          ciudad: "",
          activa: true,
          llegadas: 0,
          salidas: 0,
          unreadHost: 0,
        });
      }

      const row = byProp.get(propId);

      if (inRangeArrival) row.llegadas++;
      if (inRangeDeparture) row.salidas++;

      const chatId = r.reservaId || r.id;
      const chat = chatsCache.get(chatId);
      const u = Number(chat?.unreadHost || 0);
      if (u > 0) row.unreadHost += u;
    }

    const cancelaciones = 0;
    setCounters({ reservas, llegadas, salidas, comentarios: 0, cancelaciones });

    if (!dashTableBody) return;

    let rows = Array.from(byProp.values());

    if (filterProp) rows = rows.filter((x) => x.id === filterProp);

    if (term) {
      rows = rows.filter((x) => {
        const s = `${x.id} ${x.nombre} ${x.ciudad}`.toLowerCase();
        return s.includes(term);
      });
    }

    if (!rows.length) {
      dashTableBody.innerHTML = `<tr><td colspan="7">No hay datos para mostrar.</td></tr>`;
      return;
    }

    dashTableBody.innerHTML = rows
      .map((p) => {
        const estado = p.activa
          ? `<span class="dot ok"></span> Abierto`
          : `<span class="dot off"></span> Inactivo`;

        const unread = p.unreadHost > 0 ? `<strong>${p.unreadHost}</strong>` : "0";

        return `
          <tr class="dash-prop-row" data-prop-id="${escapeHtml(p.id)}">
            <td>${escapeHtml(p.id)}</td>
            <td>
              <div style="font-weight:700">${escapeHtml(p.nombre)}</div>
              ${p.ciudad ? `<div class="muted" style="font-size:0.85rem">${escapeHtml(p.ciudad)}</div>` : ""}
            </td>
            <td>${estado}</td>
            <td>${p.llegadas}</td>
            <td>${p.salidas}</td>
            <td>${unread}</td>
            <td>0</td>
          </tr>
        `;
      })
      .join("");

    if (dashHint) {
      dashHint.textContent =
        modeDays === 2 ? "Mostrando ventana próximas 48 horas." : "Mostrando ventana próximos 7 días.";
    }
    if (dashColLlegadas) {
      dashColLlegadas.textContent = modeDays === 2 ? "Llegadas próximas 48h" : "Llegadas próximos 7 días";
    }
    if (dashColSalidas) {
      dashColSalidas.textContent = modeDays === 2 ? "Salidas próximas 48h" : "Salidas próximos 7 días";
    }
  }

  function findNextReserva() {
    const start = getTodayStart();
    const upcoming = reservasCache
      .filter((r) => !isCancelled(r) && !isPackShadow(r))
      .map((r) => ({ r, d: parseEsDate(r.checkIn) }))
      .filter((x) => x.d && x.d >= start)
      .sort((a, b) => a.d - b.d);

    if (!upcoming.length) return null;
    return upcoming[0].r;
  }

  function wireUIOnce() {
    if (wired) return;
    wired = true;

    dash48Btn?.addEventListener(
      "click",
      () => {
        modeDays = 2;
        dash48Btn.classList.add("active");
        dash7Btn?.classList.remove("active");
        computeMetrics();
      },
      { signal: events.signal }
    );

    dash7Btn?.addEventListener(
      "click",
      () => {
        modeDays = 7;
        dash7Btn.classList.add("active");
        dash48Btn?.classList.remove("active");
        computeMetrics();
      },
      { signal: events.signal }
    );

    dashNextBtn?.addEventListener(
      "click",
      () => {
        const next = findNextReserva();
        if (!next) {
          alert("No hay reservas futuras detectadas.");
          return;
        }
        const prop = next.propertyName || next.propertyId || "";
        const guest =
          `${String(next.name || next.nombre || "").trim()} ${String(next.surname || "").trim()}`.trim() ||
          next.email ||
          "Cliente";

        alert(`Próxima reserva:\n${prop}\n${guest}\n${next.checkIn} → ${next.checkOut}`);
      },
      { signal: events.signal }
    );

    dashSearchInput?.addEventListener("input", computeMetrics, { signal: events.signal });
    dashPropertyFilter?.addEventListener("change", computeMetrics, { signal: events.signal });
  }

  function start({ subscribeToReservas, subscribeToChatsIndex } = {}) {
    wireUIOnce();
    running = true;

    if (typeof subscribeToReservas === "function") {
      if (unsubReservas) unsubReservas();
      unsubReservas = subscribeToReservas(
        (reservas) => {
          reservasCache = Array.isArray(reservas) ? reservas : [];
          computeMetrics();
        },
        (err) => console.error("Dashboard reservas error:", err)
      );
    }

    // Chats desde store (NO onSnapshot directo aquí)
    if (typeof subscribeToChatsIndex === "function") {
      if (unsubChatsIndex) unsubChatsIndex();
      unsubChatsIndex = subscribeToChatsIndex((map) => {
        chatsCache = map instanceof Map ? map : new Map();
        computeMetrics();
      });
    }

    computeMetrics();
  }

  function stop() {
    running = false;

    if (unsubReservas) {
      unsubReservas();
      unsubReservas = null;
    }
    if (unsubChatsIndex) {
      unsubChatsIndex();
      unsubChatsIndex = null;
    }
  }

  function destroy() {
    stop();
    events.abort();
    wired = false;
  }

  return { start, stop, destroy };
}