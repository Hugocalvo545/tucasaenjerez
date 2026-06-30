export function createPackCalendar({ db, escapeHtml, goToReservasTab, openChatForReserva } = {}) {
  const esc = typeof escapeHtml === "function"
    ? escapeHtml
    : (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const calTitle = document.getElementById("packCalTitle");
  const calPrev = document.getElementById("packCalPrev");
  const calNext = document.getElementById("packCalNext");
  const calToday = document.getElementById("packCalToday");
  const calGrid = document.getElementById("packCalGrid");
  const calMonthLabel = document.getElementById("packCalMonthLabel");
  const calInfo = document.getElementById("packCalInfo");

  let calCurrentMonth = monthStart(new Date());
  let calPackId = null;
  let calPackName = "Pack";

  let sourceProperties = [];
  let apartmentNames = new Map();

  // disponibilidad: iso -> Set(propertyId)
  let busyByDay = new Map();
  let reservasByProp = new Map();
  let dayReservas = new Map(); // iso -> [{reservaId, propertyId}]
  let reservaDetailsCache = new Map(); // reservaId -> {guest, checkInISO, checkOutISO, totalPrice, propertyName}

  // precios
  let manualPriceMap = new Map(); // iso -> price (number)
  let autoPrice = 0;              // precio calculado según packPct

  let unsubList = [];
  let unsubPrices = null;
  let wired = false;
  const events = new AbortController();

  // Tooltip singleton
  let tipEl = null;
  let tipHideTimer = null;

  window.addEventListener("scroll", () => hideTip(0), { capture: true, signal: events.signal });
  window.addEventListener("resize", () => hideTip(0), { signal: events.signal });

  function setInfo(t) {
    if (calInfo) calInfo.textContent = t || "";
  }

  function pad2(n) { return String(n).padStart(2, "0"); }

  function toISODate(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function monthStart(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function monthEnd(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }

  function addDaysISO(iso, days) {
    const [y, m, day] = iso.split("-").map(Number);
    const dt = new Date(y, m - 1, day);
    dt.setDate(dt.getDate() + days);
    return toISODate(dt);
  }

  function eachNightISO(startISO, endISOExclusive) {
    const out = [];
    let cur = startISO;
    while (cur < endISOExclusive) {
      out.push(cur);
      cur = addDaysISO(cur, 1);
    }
    return out;
  }

  // --- Tooltip ---
  function ensureTooltip() {
    if (tipEl) return tipEl;
    tipEl = document.createElement("div");
    tipEl.className = "cal-tip";
    tipEl.style.display = "none";
    document.body.appendChild(tipEl);
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

    const r = anchorEl.getBoundingClientRect();
    const pad = 10;
    const tipRect = el.getBoundingClientRect();

    let left = r.left + r.width / 2 - tipRect.width / 2;
    left = Math.max(pad, Math.min(left, window.innerWidth - tipRect.width - pad));

    let top = r.bottom + 10;
    if (top + tipRect.height + pad > window.innerHeight) top = r.top - tipRect.height - 10;
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

  function buildPackTooltip(iso) {
    const list = dayReservas.get(iso) || [];
    const parts = [];

    for (const { reservaId } of list.slice(0, 2)) {
      const info = reservaDetailsCache.get(reservaId);
      if (!info) continue;
      const guest = esc(info.guest || "Huésped");
      const ci = esc(info.checkInISO || "");
      const co = esc(info.checkOutISO || "");
      const prop = esc(info.propertyName || "");
      const total = (info.totalPrice != null) ? `${esc(String(info.totalPrice))}€` : "";
      parts.push(`
        <div class="cal-tip-title">${guest}</div>
        <div class="cal-tip-row"><span class="cal-tip-k">Alojamiento</span><span class="cal-tip-v">${prop}</span></div>
        <div class="cal-tip-row"><span class="cal-tip-k">Entrada</span><span class="cal-tip-v">${ci}</span></div>
        <div class="cal-tip-row"><span class="cal-tip-k">Salida</span><span class="cal-tip-v">${co}</span></div>
        ${total ? `<div class="cal-tip-row"><span class="cal-tip-k">Total</span><span class="cal-tip-v">${total}</span></div>` : ""}
        <div class="cal-tip-hint">Click para abrir chat</div>
      `);
    }

    if (!parts.length) {
      return `<div class="cal-tip-title">${esc(getBusyLabel(iso) || "Ocupado")}</div>`;
    }

    return parts.join('<hr style="border:none;border-top:1px solid rgba(255,255,255,.25);margin:6px 0">');
  }

  // --- Fetch detalles de reserva desde /reservas/{id} ---
  async function fetchReservaDetails(rows) {
    const toFetch = rows.filter((r) => r.id && !reservaDetailsCache.has(r.id));
    if (!toFetch.length) return;

    await Promise.allSettled(
      toFetch.map(async (r) => {
        try {
          const doc = await db.collection("reservas").doc(r.id).get();
          if (!doc.exists) return;
          const data = doc.data() || {};
          reservaDetailsCache.set(r.id, {
            guest: data.name || data.guestName || data.email || "",
            checkInISO: data.checkInISO || r.checkInISO || "",
            checkOutISO: data.checkOutISO || r.checkOutISO || "",
            totalPrice: data.totalPrice ?? data.total ?? null,
            propertyName: data.propertyName || apartmentNames.get(r.propertyId) || r.propertyId || "",
          });
        } catch (_) {}
      })
    );
  }

  // --- Listeners ---
  function stopReservasListeners() {
    unsubList.forEach((fn) => { try { fn?.(); } catch (_) {} });
    unsubList = [];
  }

  function stopPricesListener() {
    try { unsubPrices?.(); } catch (_) {}
    unsubPrices = null;
  }

  function stopAllListeners() {
    stopReservasListeners();
    stopPricesListener();
  }

  function clearData() {
    busyByDay = new Map();
    reservasByProp = new Map();
    dayReservas = new Map();
    manualPriceMap = new Map();
  }

  function isBusy(iso) {
    return !!(busyByDay.has(iso) && busyByDay.get(iso)?.size);
  }

  function getBusyShortLabel(iso) {
    const set = busyByDay.get(iso);
    if (!set || !set.size) return "Ocupado";
    const hasA = sourceProperties[0] && set.has(sourceProperties[0]);
    const hasB = sourceProperties[1] && set.has(sourceProperties[1]);
    if (hasA && hasB) return "Apt. A+B";
    if (hasA) return "Apt. A";
    if (hasB) return "Apt. B";
    return "Ocupado";
  }

  function getBusyLabel(iso) {
    const set = busyByDay.get(iso);
    if (!set || !set.size) return "";
    const hasA = sourceProperties[0] && set.has(sourceProperties[0]);
    const hasB = sourceProperties[1] && set.has(sourceProperties[1]);
    if (hasA && hasB) return "Apt. A+B (ambos ocupados)";
    if (hasA) return `Apt. A · ${apartmentNames.get(sourceProperties[0]) || sourceProperties[0]}`;
    if (hasB) return `Apt. B · ${apartmentNames.get(sourceProperties[1]) || sourceProperties[1]}`;
    return Array.from(set).map((pid) => apartmentNames.get(pid) || pid).join(" / ");
  }

  function getDisplayPrice(iso) {
    if (manualPriceMap.has(iso)) {
      return { price: manualPriceMap.get(iso), isAuto: false };
    }
    return { price: autoPrice, isAuto: true };
  }

  function renderCalendar() {
    if (!calGrid || !calMonthLabel) return;

    calGrid.innerHTML = "";

    const year = calCurrentMonth.getFullYear();
    const month = calCurrentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDow = (firstDay.getDay() + 6) % 7; // lunes = 0
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
      const busy = isBusy(iso);

      const el = document.createElement("div");
      el.className = [
        "calendar-day",
        busy ? "occupied" : "available",
        iso === todayISO ? "today" : "",
        busy ? "pack-busy" : "pack-free",
      ].filter(Boolean).join(" ");
      el.setAttribute("data-iso", iso);

      if (busy) {
        el.innerHTML = `
          <div class="cal-daynum">${day}</div>
          <div class="cal-pack-state">${getBusyShortLabel(iso)}</div>
        `;
        el.style.cursor = "pointer";

        el.addEventListener("mouseenter", () => {
          const html = buildPackTooltip(iso);
          if (html) showTip({ anchorEl: el, html });
        });
        el.addEventListener("mouseleave", () => hideTip(120));
        el.addEventListener("click", () => {
          const list = dayReservas.get(iso) || [];
          if (!list.length) return;
          goToReservasTab?.();
          openChatForReserva?.(list[0].reservaId);
        });
      } else {
        const { price, isAuto } = getDisplayPrice(iso);
        const priceStr = price > 0 ? `${price}€` : "—";
        el.innerHTML = `
          <div class="cal-daynum">${day}</div>
          ${price > 0
            ? `<div class="cal-price${isAuto ? " cal-price-auto" : ""}">${priceStr}${isAuto ? `<span class="cal-auto-label">(auto)</span>` : ""}</div>`
            : `<div class="cal-pack-state">Libre</div>`
          }
        `;
      }

      calGrid.appendChild(el);
    }

    if (calTitle) {
      calTitle.textContent = calPackId ? `Disponibilidad: ${calPackName || "Pack"}` : "Disponibilidad del pack";
    }
  }

  function recomputeBusyForCurrentMonth() {
    busyByDay = new Map();
    dayReservas = new Map();

    const startISO = toISODate(monthStart(calCurrentMonth));
    const endISO = toISODate(monthEnd(calCurrentMonth));

    for (const propertyId of sourceProperties) {
      const list = reservasByProp.get(propertyId) || [];
      for (const r of list) {
        if (r.status === "cancelled" || r.cancelled === true) continue;
        const { checkInISO, checkOutISO } = r;
        if (!checkInISO || !checkOutISO) continue;
        for (const nightISO of eachNightISO(checkInISO, checkOutISO)) {
          if (nightISO < startISO || nightISO > endISO) continue;
          if (!busyByDay.has(nightISO)) busyByDay.set(nightISO, new Set());
          busyByDay.get(nightISO).add(propertyId);

          if (r.id) {
            if (!dayReservas.has(nightISO)) dayReservas.set(nightISO, []);
            const existing = dayReservas.get(nightISO);
            if (!existing.some((x) => x.reservaId === r.id)) {
              existing.push({ reservaId: r.id, propertyId });
            }
          }
        }
      }
    }
  }

  function buildMonthOverlapQuery(propertyId) {
    return db
      .collection("reservas_public")
      .where("propertyId", "==", propertyId);
  }

  function startPricesListener() {
    stopPricesListener();
    if (!calPackId) return;

    const startISO = toISODate(monthStart(calCurrentMonth));
    const endISO = toISODate(monthEnd(calCurrentMonth));

    unsubPrices = db
      .collection("packs")
      .doc(calPackId)
      .collection("prices")
      .where("dateISO", ">=", startISO)
      .where("dateISO", "<=", endISO)
      .onSnapshot(
        (snap) => {
          manualPriceMap = new Map();
          snap.docs.forEach((doc) => {
            const data = doc.data() || {};
            const dateISO = data.dateISO || doc.id;
            if (dateISO) manualPriceMap.set(dateISO, Number(data.price || 0));
          });
          renderCalendar();
        },
        (err) => {
          console.error("PackCalendar prices error:", err);
        }
      );
  }

  async function reloadMonthRealtime() {
    stopAllListeners();
    busyByDay = new Map();
    reservasByProp = new Map();
    dayReservas = new Map();
    manualPriceMap = new Map();

    if (!calPackId) {
      renderCalendar();
      return;
    }

    setInfo("Cargando disponibilidad…");

    startPricesListener();

    unsubList = sourceProperties.map((propertyId) => {
      const q = buildMonthOverlapQuery(propertyId);
      return q.onSnapshot(
        (snap) => {
          const startISO = toISODate(monthStart(calCurrentMonth));
          const endISO = toISODate(monthEnd(calCurrentMonth));
          const rows = snap.docs
            .map((d) => ({ id: d.id, ...(d.data() || {}) }))
            .filter((r) => r.checkInISO <= endISO && r.checkOutISO >= startISO);
          reservasByProp.set(propertyId, rows);
          recomputeBusyForCurrentMonth();
          setInfo("");
          renderCalendar();
          fetchReservaDetails(rows).catch(() => {});
        },
        (err) => {
          console.error("PackCalendar reservas error:", err);
          setInfo("Error cargando disponibilidad.");
        }
      );
    });

    if (!sourceProperties.length) {
      setInfo("");
      renderCalendar();
    }
  }

  function wireOnce() {
    if (wired) return;
    wired = true;

    calPrev?.addEventListener("click", async () => {
      calCurrentMonth = monthStart(new Date(calCurrentMonth.getFullYear(), calCurrentMonth.getMonth() - 1, 1));
      await reloadMonthRealtime();
    }, { signal: events.signal });

    calNext?.addEventListener("click", async () => {
      calCurrentMonth = monthStart(new Date(calCurrentMonth.getFullYear(), calCurrentMonth.getMonth() + 1, 1));
      await reloadMonthRealtime();
    }, { signal: events.signal });

    calToday?.addEventListener("click", async () => {
      calCurrentMonth = monthStart(new Date());
      await reloadMonthRealtime();
    }, { signal: events.signal });
  }

  async function ensureCalendarForPack({ packId, packName, sourceProperties: sp, basePrice } = {}) {
    wireOnce();

    calPackId = packId || null;
    calPackName = packName || "Pack";
    autoPrice = 0;
    manualPriceMap = new Map();

    if (calTitle) calTitle.textContent = `Disponibilidad: ${calPackName}`;

    let packPct = 85;
    if (calPackId) {
      try {
        const packDoc = await db.collection("packs").doc(calPackId).get();
        const packData = packDoc.data() || {};
        packPct = packData.packPct ?? 85;
        if (!Array.isArray(sp) || !sp.length) {
          sourceProperties = packData.sourceProperties || [];
        } else {
          sourceProperties = sp;
        }
      } catch (_) {
        sourceProperties = Array.isArray(sp) ? sp : [];
      }
    } else {
      sourceProperties = Array.isArray(sp) ? sp : [];
    }

    if (!sourceProperties.length) {
      setInfo("Este pack no tiene apartamentos configurados (sourceProperties vacío).");
      renderCalendar();
      return;
    }

    apartmentNames = new Map();
    let precio1 = 0, precio2 = 0;

    await Promise.all(
      sourceProperties.map(async (id, idx) => {
        try {
          const doc = await db.collection("apartamentos").doc(id).get();
          const data = doc.data() || {};
          apartmentNames.set(id, data.nombre || id);
          if (idx === 0) precio1 = Number(data.precioBase || 0);
          if (idx === 1) precio2 = Number(data.precioBase || 0);
        } catch (_) {
          apartmentNames.set(id, id);
        }
      })
    );

    autoPrice = Math.round((precio1 + precio2) * packPct / 100);

    await reloadMonthRealtime();
  }

  async function start() {
    wireOnce();
    if (calPackId) await reloadMonthRealtime();
    else renderCalendar();
  }

  function stop() {
    stopAllListeners();
  }

  function resetCalendarUI() {
    stopAllListeners();
    clearData();
    autoPrice = 0;
    setInfo('Selecciona un pack con "Editar" para ver su disponibilidad.');
    if (calTitle) calTitle.textContent = "Disponibilidad del pack";
    calPackId = null;
    calPackName = "Pack";
    renderCalendar();
  }

  function destroy() {
    stop();
    events.abort();
    clearData();
    try { tipEl?.remove?.(); } catch (_) {}
    tipEl = null;
    if (calGrid) calGrid.innerHTML = "";
  }

  resetCalendarUI();

  return {
    ensureCalendarForPack,
    resetCalendarUI,
    start,
    stop,
    destroy,
    refresh: reloadMonthRealtime,
  };
}
