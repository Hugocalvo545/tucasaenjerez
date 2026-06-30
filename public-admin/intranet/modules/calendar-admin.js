export function createCalendarAdmin({
  auth,
  db,
  serverTimestamp,
  escapeHtml,
  goToReservasTab,
  openChatForReserva,
  subscribeToReservasForPropertyMonth,
}) {
  const calTitle = document.getElementById("calTitle");
  const calPrev = document.getElementById("calPrev");
  const calNext = document.getElementById("calNext");
  const calToday = document.getElementById("calToday");
  const calGrid = document.getElementById("calGrid");
  const calMonthLabel = document.getElementById("calMonthLabel");
  const calInfo = document.getElementById("calInfo");
  const calBlockBtn = document.getElementById("calBlockBtn");
  const calUnblockBtn = document.getElementById("calUnblockBtn");

  let calCurrentMonth = monthStart(new Date());
  let calPropertyId = null;
  let calReservasPropertyId = null;
  let calBasePrice = 0;

  let selStart = null;
  let selEnd = null;

  let calBusySet = new Set();
  let calHoldSet = new Set();
  let calBlocks = [];
  let calPriceMap = new Map();

  // turnover + info para tooltip
  let calCheckInMap = new Map();   // iso -> reservaId
  let calCheckOutMap = new Map();  // iso -> reservaId
  let calTurnoverInfoByReservaId = new Map(); // reservaId -> info (name, email, checkInISO, checkOutISO, totalPrice, propertyName)

  let unsubReservasMonth = null;
  let unsubBloqueos = null;
  let unsubPrices = null;

  let reservasStoreCache = [];

  // Tooltip singleton
  let tipEl = null;
  let tipHideTimer = null;

  function setInfo(t) {
    if (calInfo) calInfo.textContent = t || "";
  }
  
  const events = new AbortController();
  let wired = false;

  window.addEventListener("scroll", () => hideTip(0), { capture: true, signal: events.signal });
  window.addEventListener("resize", () => hideTip(0), { signal: events.signal });

  function destroy() {
    stopLiveListeners();
    clearSelection?.();
    events.abort();
    try { tipEl?.remove?.(); } catch (_) {}
    tipEl = null;
  }

  function resetCalendarUI() {
    if (calInfo) calInfo.textContent = "Selecciona un alojamiento con “Editar” para ver su calendario.";
    if (calTitle) calTitle.textContent = "Calendario";
    stopLiveListeners();
    clearSelection();
    renderCalendar();
  }

  function stopLiveListeners() {
    if (unsubReservasMonth) unsubReservasMonth();
    if (unsubBloqueos) unsubBloqueos();
    if (unsubPrices) unsubPrices();
    unsubReservasMonth = null;
    unsubBloqueos = null;
    unsubPrices = null;
  }

  function moveCalendarTo() {
    const calWrap = document.querySelector(".intranet-cal-wrap");
    const hostA = document.getElementById("alojamientosCalendarHost");
    if (calWrap && hostA && !hostA.contains(calWrap)) hostA.appendChild(calWrap);
  }

  function getMode() {
    const checked = document.querySelector('input[name="calMode"]:checked');
    return checked?.value || "block";
  }

  function isBlockedDay(iso) {
    return calBlocks.some((b) => iso >= b.startISO && iso <= b.endISO);
  }

  function clearSelection() {
    selStart = null;
    selEnd = null;
  }

  function ensureTooltip() {
    if (tipEl) return tipEl;
    tipEl = document.createElement("div");
    tipEl.className = "cal-tip";
    tipEl.style.display = "none";
    document.body.appendChild(tipEl);

    // si el ratón entra al tooltip, no lo ocultes (para que no parpadee)
    tipEl.addEventListener("mouseenter", () => {
      if (tipHideTimer) clearTimeout(tipHideTimer);
      tipHideTimer = null;
    });
    tipEl.addEventListener("mouseleave", () => hideTip());

    return tipEl;
  }

  function showTip({ anchorEl, html }) {
    const el = ensureTooltip();
    if (tipHideTimer) clearTimeout(tipHideTimer);
    tipHideTimer = null;

    el.innerHTML = html;
    el.style.display = "block";

    // posicionamiento: debajo del badge, y si no cabe, arriba
    const r = anchorEl.getBoundingClientRect();
    const pad = 10;
    const tipRect = el.getBoundingClientRect();

    let left = r.left + r.width / 2 - tipRect.width / 2;
    left = Math.max(pad, Math.min(left, window.innerWidth - tipRect.width - pad));

    let top = r.bottom + 10;
    if (top + tipRect.height + pad > window.innerHeight) {
      top = r.top - tipRect.height - 10;
    }
    top = Math.max(pad, Math.min(top, window.innerHeight - tipRect.height - pad));

    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
  }

  function hideTip(delayMs = 80) {
    const el = ensureTooltip();
    if (tipHideTimer) clearTimeout(tipHideTimer);
    tipHideTimer = setTimeout(() => {
      el.style.display = "none";
      el.innerHTML = "";
    }, delayMs);
  }

  function buildReservaTooltip(reservaId) {
    const info = calTurnoverInfoByReservaId.get(reservaId);
    if (!info) return null;

    const guest = escapeHtml(info.guest || info.email || "Huésped");
    const ci = escapeHtml(info.checkInISO || "");
    const co = escapeHtml(info.checkOutISO || "");
    const prop = escapeHtml(info.propertyName || "");
    const total = (info.totalPrice === 0 || info.totalPrice) ? `${escapeHtml(String(info.totalPrice))}€` : "";

    return `
      <div class="cal-tip-title">${guest}</div>
      <div class="cal-tip-row"><span class="cal-tip-k">Alojamiento</span><span class="cal-tip-v">${prop}</span></div>
      <div class="cal-tip-row"><span class="cal-tip-k">Entrada</span><span class="cal-tip-v">${ci}</span></div>
      <div class="cal-tip-row"><span class="cal-tip-k">Salida</span><span class="cal-tip-v">${co}</span></div>
      ${total ? `<div class="cal-tip-row"><span class="cal-tip-k">Total</span><span class="cal-tip-v">${total}</span></div>` : ""}
      <div class="cal-tip-hint">Click para abrir chat</div>
    `;
  }

  function renderCalendar() {
    if (!calGrid || !calMonthLabel) return;

    moveCalendarTo();
    calGrid.innerHTML = "";

    const year = calCurrentMonth.getFullYear();
    const month = calCurrentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDow = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const monthName = calCurrentMonth.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
    calMonthLabel.textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);

    const dows = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    dows.forEach((d) => {
      const h = document.createElement("div");
      h.className = "cal-dow";
      h.textContent = d;
      calGrid.appendChild(h);
    });

    for (let i = 0; i < startDow; i++) {
      const empty = document.createElement("div");
      empty.className = "calendar-day empty";
      calGrid.appendChild(empty);
    }

    const todayISO = toISODate(new Date());

    for (let day = 1; day <= daysInMonth; day++) {
      const dt = new Date(year, month, day);
      const iso = toISODate(dt);

      const isBusy = calBusySet.has(iso);
      const isHold = calHoldSet.has(iso);
      const isBlocked = isBlockedDay(iso);

      const inResCheckIn = calCheckInMap.has(iso);
      const inResCheckOut = calCheckOutMap.has(iso);

      const inRange = selStart && selEnd && iso >= selStart && iso <= selEnd;
      const isStart = selStart && iso === selStart;
      const isEnd = selEnd && iso === selEnd;

      const effectivePrice = calPriceMap.has(iso) ? calPriceMap.get(iso) : calBasePrice;

      const cls = [
        "calendar-day",
        isBusy ? "occupied" : (isHold ? "hold" : "available"),
        isBlocked ? "blocked" : "",
        iso === todayISO ? "today" : "",
        inRange ? "in-range" : "",
        isStart ? "range-start" : "",
        isEnd ? "range-end" : "",
        (inResCheckIn || inResCheckOut) ? "has-turnover" : "",
      ].join(" ").trim();

      const el = document.createElement("div");
      el.className = cls;
      el.setAttribute("data-iso", iso);

      // turnover UI (si coinciden IN y OUT el mismo día, se apilan bonito)
      let turnoverHtml = "";
      if (inResCheckIn || inResCheckOut) {
        const inId = calCheckInMap.get(iso);
        const outId = calCheckOutMap.get(iso);

        const inTip = inId ? buildReservaTooltip(inId) : null;
        const outTip = outId ? buildReservaTooltip(outId) : null;

        turnoverHtml = `
          <div class="cal-turnovers ${inResCheckIn && inResCheckOut ? "both" : ""}">
            ${inResCheckIn ? `<button type="button" class="cal-badge cal-badge-in" data-reserva-id="${escapeHtml(inId)}">Entrada</button>` : ""}
            ${inResCheckOut ? `<button type="button" class="cal-badge cal-badge-out" data-reserva-id="${escapeHtml(outId)}">Salida</button>` : ""}
          </div>
        `;
      }

      el.innerHTML = `
        <div class="cal-daynum">${day}</div>
        <div class="cal-price">${Number(effectivePrice || 0).toFixed(0)}€</div>
        ${turnoverHtml}
      `;

      el.addEventListener("click", () => onCalendarDayClick(iso));

      el.querySelectorAll(".cal-badge").forEach((badge) => {
        const reservaId = badge.getAttribute("data-reserva-id");

        badge.addEventListener("mouseenter", () => {
          if (!reservaId) return;
          const html = buildReservaTooltip(reservaId);
          if (!html) return;
          showTip({ anchorEl: badge, html });
        });

        badge.addEventListener("mouseleave", () => hideTip(120));

        badge.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();

          // si estabas seleccionando rango, lo cancelamos (lo pedías)
          clearSelection();
          renderCalendar();

          if (reservaId) {
            goToReservasTab?.();
            openChatForReserva?.(reservaId);
          }
        });
      });

      calGrid.appendChild(el);
    }
  }

  function rangeHasBusyOrTurnover(startISO, endISO) {
    if (!startISO || !endISO) return false;
    const a = startISO <= endISO ? startISO : endISO;
    const b = startISO <= endISO ? endISO : startISO;

    // cualquier noche reservada => no permitimos selección
    for (const d of eachNightISO(a, addDaysISO(b, 1))) {
      if (calBusySet.has(d)) return true;
    }

    // si incluye día marcado como check-in/out, también lo tratamos como “no seleccionar”
    // (esto hace que al caer en un check-in/out te deseleccione)
    const curDays = eachNightISO(a, addDaysISO(b, 1));
    for (const d of curDays) {
      if (calCheckInMap.has(d) || calCheckOutMap.has(d)) return true;
    }

    return false;
  }

  function pickRange(iso) {
    // Si clickas un día con turnover, cancelamos selección (tu requisito)
    if (calCheckInMap.has(iso) || calCheckOutMap.has(iso)) {
      clearSelection();
      setInfo("ℹ️ Ese día es Entrada/Salida de una reserva. No se puede usar para bloquear. (Click en la etiqueta para abrir chat)");
      renderCalendar();
      return;
    }

    // Si clickas un día reservado, cancelamos selección
    if (calBusySet.has(iso)) {
      clearSelection();
      setInfo("ℹ️ Ese día ya está reservado. No se puede usar para bloquear.");
      renderCalendar();
      return;
    }

    if (!selStart || (selStart && selEnd)) {
      selStart = iso;
      selEnd = null;
      setInfo(`Rango: inicio ${selStart}. Elige fin.`);
      renderCalendar();
      return;
    }

    const a = selStart;
    const b = iso;
    if (isNaN(Date.parse(a)) || isNaN(Date.parse(b))) {
      setInfo("❌ Fechas inválidas.");
      return;
    }

    const start = a <= b ? a : b;
    const end = a <= b ? b : a;

    // Si el rango pisa reservas o turnover => cancelamos (tu requisito)
    if (rangeHasBusyOrTurnover(start, end)) {
      clearSelection();
      setInfo("❌ Ese rango incluye días reservados o entradas/salidas. Selección cancelada.");
      renderCalendar();
      return;
    }

    selStart = start;
    selEnd = end;

    setInfo(`Rango seleccionado: ${selStart} → ${selEnd}`);
    renderCalendar();
  }

  async function onCalendarDayClick(iso) {
    if (!calPropertyId) return;
    const mode = getMode();

    if (mode === "block") {
      pickRange(iso);
      return;
    }

    if (mode === "price") {
      setInfo("ℹ️ Para precios avanzados usa la pestaña Precios especiales (calendario editable).");
      return;
    }
  }

  function clearData() {
    calBusySet = new Set();
    calHoldSet = new Set();
    calBlocks = [];
    calPriceMap = new Map();
    calCheckInMap = new Map();
    calCheckOutMap = new Map();
    calTurnoverInfoByReservaId = new Map();
  }

  async function reloadMonth() {
    clearData();
    await loadCalendarDataForMonth();
    renderCalendar();
  }

  function applyReservasFromStoreForCurrentMonth() {
    if (!calPropertyId || !calReservasPropertyId) return;

    const start = monthStart(calCurrentMonth);
    const end = monthEnd(calCurrentMonth);
    const startISO = toISODate(start);
    const endISO = toISODate(end);

    // Limpia SOLO lo que viene de reservas (no bloqueos ni precios)
    calBusySet = new Set();
    calHoldSet = new Set();
    calCheckInMap = new Map();
    calCheckOutMap = new Map();
    calTurnoverInfoByReservaId = new Map();

    for (const r of reservasStoreCache) {
      if (!r) continue;
      if (String(r.propertyId || "") !== String(calReservasPropertyId || "")) continue;

      const st = String(r.status || "").toLowerCase();
      if (st === "cancelled" || st === "canceled" || r.cancelled === true) continue;

      const checkInISO = r.checkInISO || parseEsDateToISO(r.checkIn);
      const checkOutISO = r.checkOutISO || parseEsDateToISO(r.checkOut);
      const reservaId = r.reservaId || r.id;

      if (!checkInISO || !checkOutISO || !reservaId) continue;

      // Tooltip info
      const name = String(r.name || r.nombre || "").trim();
      const surname = String(r.surname || "").trim();
      const guest = `${name} ${surname}`.trim() || String(r.email || "").trim() || "Huésped";

      calTurnoverInfoByReservaId.set(reservaId, {
        reservaId,
        guest,
        email: r.email || "",
        checkInISO,
        checkOutISO,
        totalPrice: r.totalPrice > 0 ? r.totalPrice : null,
        propertyName: r.propertyName || r.propertyId || "",
      });

      // Noches ocupadas (checkout NO incluido)
      eachNightISO(checkInISO, checkOutISO).forEach((d) => {
        if (d >= startISO && d <= endISO) calBusySet.add(d);
      });

      // Turnovers visibles en el mes
      if (checkInISO >= startISO && checkInISO <= endISO) calCheckInMap.set(checkInISO, reservaId);
      if (checkOutISO >= startISO && checkOutISO <= endISO) calCheckOutMap.set(checkOutISO, reservaId);
    }
  }

  async function loadCalendarDataForMonth() {
    if (!calPropertyId || !calReservasPropertyId) return;

    const start = monthStart(calCurrentMonth);
    const end = monthEnd(calCurrentMonth);

    const startISO = toISODate(start);
    const endISO = toISODate(end);

    clearData();

    applyReservasFromStoreForCurrentMonth();

    const bl = await db
      .collection("bloqueos")
      .where("propertyId", "==", calPropertyId)
      .get();

    calBlocks = bl.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((b) => b.startISO && b.endISO);

    const prices = await db
      .collection("apartamentos").doc(calPropertyId)
      .collection("prices")
      .where("dateISO", ">=", startISO)
      .where("dateISO", "<=", endISO)
      .get();

    prices.forEach((d) => {
      const data = d.data();
      if (data?.dateISO && typeof data.price === "number") {
        calPriceMap.set(data.dateISO, data.price);
      }
    });
  }

  function getMonthWindowISO() {
    const start = monthStart(calCurrentMonth);
    const end = monthEnd(calCurrentMonth);
    return { startISO: toISODate(start), endISO: toISODate(end) };
  }

  function startLiveListeners() {
    stopLiveListeners();
    if (!calPropertyId || !calReservasPropertyId) return;

    const { startISO, endISO } = getMonthWindowISO();

    if (typeof subscribeToReservasForPropertyMonth === "function") {
      unsubReservasMonth = subscribeToReservasForPropertyMonth(
        { propertyId: String(calReservasPropertyId), startISO, endISO },
        (reservas) => {
          reservasStoreCache = Array.isArray(reservas) ? reservas : [];
          applyReservasFromStoreForCurrentMonth();
          renderCalendar();
        },
        (err) => console.error("CalendarAdmin reservas-month error:", err)
      );
    } else {
      console.warn("CalendarAdmin: subscribeToReservasForPropertyMonth no inyectado");
    }

    unsubBloqueos = db
      .collection("bloqueos")
      .where("propertyId", "==", calPropertyId)
      .where("startISO", "<=", endISO)
      .orderBy("startISO")
      .onSnapshot(
        (snap) => {
          const raw = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
          calBlocks = raw.filter((b) => b?.startISO && b?.endISO && b.endISO >= startISO);
          renderCalendar();
        },
        (err) => console.error("CalendarAdmin bloqueos error:", err)
      );

    unsubPrices = db
      .collection("apartamentos")
      .doc(calPropertyId)
      .collection("prices")
      .where("dateISO", ">=", startISO)
      .where("dateISO", "<=", endISO)
      .onSnapshot(
        (snap) => {
          calPriceMap = new Map();
          snap.docs.forEach((d) => {
            const data = d.data() || {};
            if (data?.dateISO && typeof data.price === "number") calPriceMap.set(data.dateISO, data.price);
          });
          renderCalendar();
        },
        (err) => console.error("CalendarAdmin prices error:", err)
      );
  }

  async function ensureCalendarForProperty({ apartmentId, reservasPropertyId, basePrice, propertyName }) {
    calPropertyId = apartmentId;
    calReservasPropertyId = reservasPropertyId;
    calBasePrice = basePrice || 0;

    clearSelection();

    if (calTitle) calTitle.textContent = `Calendario · ${propertyName || apartmentId}`;

    await loadCalendarDataForMonth();
    renderCalendar();
    startLiveListeners();
  }

  async function createBlockRange() {
    if (!calPropertyId || !selStart || !selEnd) {
      setInfo("Selecciona un rango primero.");
      return;
    }

    // doble seguridad: si pisa ocupación o turnover, cancelamos
    if (rangeHasBusyOrTurnover(selStart, selEnd)) {
      clearSelection();
      renderCalendar();
      setInfo("❌ Ese rango incluye reservas o entradas/salidas. Selección cancelada.");
      return;
    }

    const checkoutISO = addDaysISO(selEnd, 1);
    const dates = eachNightISO(selStart, checkoutISO);

    await db.collection("bloqueos").add({
      propertyId: calPropertyId,
      startISO: selStart,
      endISO: selEnd,
      checkInISO: selStart,
      checkOutISO: checkoutISO,
      dates,
      tipo: "bloqueo",
      createdAt: serverTimestamp(),
      createdBy: auth?.currentUser?.uid || null,
    });

    setInfo("✅ Bloqueo creado.");
    clearSelection();
    await reloadMonth();
  }

  async function deleteBlocksInRange() {
    if (!calPropertyId || !selStart || !selEnd) {
      setInfo("Selecciona un rango primero.");
      return;
    }

    const toDelete = calBlocks.filter((b) => !(b.endISO < selStart || b.startISO > selEnd));
    if (!toDelete.length) {
      setInfo("No hay bloqueos en ese rango.");
      return;
    }

    const batch = db.batch();
    toDelete.forEach((b) => batch.delete(db.collection("bloqueos").doc(b.id)));
    await batch.commit();

    setInfo("✅ Bloqueos eliminados.");
    clearSelection();
    await reloadMonth();
  }

  calPrev?.addEventListener("click", async () => {
    calCurrentMonth = monthStart(new Date(calCurrentMonth.getFullYear(), calCurrentMonth.getMonth() - 1, 1));
    await reloadMonth();
    startLiveListeners();
  });

  calNext?.addEventListener("click", async () => {
    calCurrentMonth = monthStart(new Date(calCurrentMonth.getFullYear(), calCurrentMonth.getMonth() + 1, 1));
    await reloadMonth();
    startLiveListeners();
  });

  calToday?.addEventListener("click", async () => {
    calCurrentMonth = monthStart(new Date());
    await reloadMonth();
    startLiveListeners();
  });

  calBlockBtn?.addEventListener("click", async () => {
    try {
      calBlockBtn.disabled = true;
      await createBlockRange();
    } catch (_) {
      setInfo("❌ Error creando bloqueo.");
    } finally {
      calBlockBtn.disabled = false;
    }
  });

  calUnblockBtn?.addEventListener("click", async () => {
    try {
      calUnblockBtn.disabled = true;
      await deleteBlocksInRange();
    } catch (_) {
      setInfo("❌ Error eliminando bloqueos.");
    } finally {
      calUnblockBtn.disabled = false;
    }
  });

  return {
    resetCalendarUI,
    ensureCalendarForProperty,
    setInfo,
    moveCalendarTo,
    refresh: () => reloadMonth(),
    destroy,
  };
}

function pad2(n) { return String(n).padStart(2, "0"); }
function toISODate(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function monthStart(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function monthEnd(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }

function parseEsDateToISO(es) {
  if (!es || typeof es !== "string") return null;
  const parts = es.split("/");
  if (parts.length !== 3) return null;
  const dd = parseInt(parts[0], 10);
  const mm = parseInt(parts[1], 10);
  const yyyy = parseInt(parts[2], 10);
  if (!yyyy || !mm || !dd) return null;
  return `${yyyy}-${pad2(mm)}-${pad2(dd)}`;
}

function addDaysISO(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toISODate(dt);
}

function eachNightISO(startISO, endISOExclusive) {
  const out = [];
  let cur = startISO;
  while (cur && endISOExclusive && cur < endISOExclusive) {
    out.push(cur);
    cur = addDaysISO(cur, 1);
  }
  return out;
}