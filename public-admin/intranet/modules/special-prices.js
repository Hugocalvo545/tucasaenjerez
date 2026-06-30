export function createSpecialPricesUI({
  db,
  serverTimestamp,
  escapeHtml,
  priceCalendar,          // ✅ nuevo: calendario editable independiente
  calendarAdmin,          // (opcional) fallback si aún lo usas
  resolveReservasId,
  getPropertiesCache,
}) {
  // Si no existe el HTML, no rompe
  const spProperty = document.getElementById("spProperty");
  const spStart = document.getElementById("spStart");
  const spEnd = document.getElementById("spEnd");
  const spPrice = document.getElementById("spPrice");
  const spApplyBtn = document.getElementById("spApplyBtn");
  const spClearBtn = document.getElementById("spClearBtn");
  const spMsg = document.getElementById("spMsg");
  const spBaseInfo = document.getElementById("spBaseInfo");

  const seasonProperty = document.getElementById("seasonProperty");
  const seasonStart = document.getElementById("seasonStart");
  const seasonEnd = document.getElementById("seasonEnd");
  const seasonPercent = document.getElementById("seasonPercent");
  const seasonWeekendsOnly = document.getElementById("seasonWeekendsOnly");
  const seasonName = document.getElementById("seasonName");
  const seasonApplyBtn = document.getElementById("seasonApplyBtn");
  const seasonMsg = document.getElementById("seasonMsg");
  const seasonBaseInfo = document.getElementById("seasonBaseInfo");

  const clearPreviewBtn = document.getElementById("clearPreviewBtn");
  const spActivateBaseBtn = document.getElementById("spActivateBaseBtn");

  const cal = priceCalendar || calendarAdmin; // ✅ usamos el editable si existe, si no fallback
  let previewBusySet = new Set();
  let previewReqId = 0;
  let previewTimer = null;
  let selectedDaysCache = null; // ✅ selección actual del calendario (array ISO)
  let packsCache = [];

  function setSpMsg(t) { if (spMsg) spMsg.textContent = t || ""; }
  function setSeasonMsg(t) { if (seasonMsg) seasonMsg.textContent = t || ""; }

  async function updatePrecioHastaOnDoc(colName, docId, newMaxISO) {
    if (!newMaxISO || !colName || !docId) return;
    try {
      const ref = db.collection(colName).doc(docId);
      const snap = await ref.get();
      const current = snap.data()?.precioHasta || null;
      if (!current || newMaxISO > current) {
        await ref.set({ precioHasta: newMaxISO }, { merge: true });
      }
    } catch (_) {}
  }

  function getPropertyById(id) {
    return (getPropertiesCache?.() || []).find(p => p.id === id) || null;
  }

  function getSelectedDaysFromCalendar() {
    const days = selectedDaysCache;
    return Array.isArray(days) && days.length ? days : null;
  }

  function parseISO(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setHours(0,0,0,0);
    return dt;
  }

  // Tabs internas (Precio fijo / Temporada alta)
  const spTabButtons = Array.from(document.querySelectorAll("#tab-precios .sp-tab"));
  const spTabPanels = Array.from(document.querySelectorAll("#tab-precios .sp-tab-content"));

  let activeSpTab = "fixed"; // default SIN persistencia

  function setActiveSpTab(key) {
    activeSpTab = key || "fixed";

    spTabButtons.forEach((b) => {
      const isOn = b.dataset.spTab === activeSpTab;
      b.classList.toggle("active", isOn);
      b.setAttribute("aria-selected", isOn ? "true" : "false");
    });

    spTabPanels.forEach((p) => {
      p.classList.toggle("active", p.dataset.spPanel === activeSpTab);
    });

    // Limpieza + repintar preview de la tab activa
    cal?.clearPreview?.();
    setSpMsg("");
    setSeasonMsg("");

    if (activeSpTab === "fixed") updateFixedPreview();
    else updateSeasonPreview();
  }

  spTabButtons.forEach((btn) => {
    btn.addEventListener("click", () => setActiveSpTab(btn.dataset.spTab));
  });

  // init tabs
  if (spTabButtons.length && spTabPanels.length) {
    setActiveSpTab("fixed");
  }

  function refreshActivePreview() {
    if (activeSpTab === "season") updateSeasonPreview();
    else updateFixedPreview();
  }

  // ✅ Cablea los inputs Inicio/Fin con la MISMA selección que usan los clicks del calendario.
  // Los <input type="date"> dan "YYYY-MM-DD"; usamos parseISO (local) para no desplazar días.
  // Devuelve true si ha escrito la selección, false si los inputs están incompletos
  // o el rango es inválido (en ese caso deja el aviso correspondiente).
  function applyInputsToSelection(startEl, endEl, setMsg) {
    if (!cal?.setSelectedDays) return false;

    const sv = startEl?.value || "";
    const ev = endEl?.value || "";

    // Falta alguno de los dos: no tocamos la selección (que decidan otras vías).
    if (!sv || !ev) return false;

    // inicio > fin (comparación lexicográfica válida para YYYY-MM-DD): no seleccionamos nada.
    if (ev < sv) {
      setMsg?.("El rango es incorrecto: Inicio debe ser anterior o igual a Fin.");
      return false;
    }

    const days = [];
    for (const day of eachDayInclusive(parseISO(sv), parseISO(ev))) {
      days.push(toISO(day));
    }

    // setSelectedDays actualiza el contador "Seleccionados: N", repinta el resaltado
    // y dispara notifySelection() → rellena selectedDaysCache + refreshActivePreview().
    cal.setSelectedDays(days);
    return true;
  }

  async function fetchBusyNightsForRange(propertyId, startISO, endISOEx) {
    const busy = new Set();

    // ✅ IMPORTANTE: usar el id real con el que se guardan reservas
    const reservasId = resolveReservasId(propertyId);

    // ✅ Solo UNA desigualdad (checkInISO < endISOEx)
    const snap = await db
      .collection("reservas")
      .where("propertyId", "==", reservasId)
      .where("checkInISO", "<", endISOEx)
      .get();

    snap.forEach((doc) => {
      const r = doc.data() || {};
      const ci = r.checkInISO;
      const co = r.checkOutISO;
      if (!ci || !co) return;

      // ✅ segunda condición (checkOutISO > startISO) la hacemos en cliente
      if (!(co > startISO)) return;

      const nights = eachNightISO(ci, co);
      for (const n of nights) {
        if (n >= startISO && n < endISOEx) busy.add(n);
      }
    });

    return busy;
  }


  function parseDateInput(v) {
    if (!v) return null;
    const d = new Date(v);
    if (isNaN(d)) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function pad2(n){ return String(n).padStart(2, "0"); }
  function toISO(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  }

  function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }

  function* eachDayInclusive(start, end) {
    const d = new Date(start);
    while (d <= end) {
      yield new Date(d);
      d.setDate(d.getDate() + 1);
    }
  }

  function* eachNightISO(checkInISO, checkOutISO) {
    const [y1, m1, d1] = checkInISO.split("-").map(Number);
    const [y2, m2, d2] = checkOutISO.split("-").map(Number);

    let d = new Date(y1, m1 - 1, d1);
    const end = new Date(y2, m2 - 1, d2);

    while (d < end) {
      yield toISO(d);
      d.setDate(d.getDate() + 1);
    }
  }

  function countFreeNightsInRange(start, end, busySet) {
    let total = 0;
    let free = 0;

    for (const day of eachDayInclusive(start, end)) {
      total++;
      const iso = toISO(day);
      if (!busySet?.has?.(iso)) free++;
    }
    return { total, free, busy: total - free };
  }

  function countFreeDaysFromList(days, busySet, weekendsOnly = false) {
    let total = 0;
    let free = 0;

    const unique = Array.from(new Set(days || [])).sort();
    for (const iso of unique) {
      total++;
      if (busySet?.has?.(iso)) continue;

      if (weekendsOnly) {
        const d = parseISO(iso);
        if (!isWeekendES(d)) continue;
      }

      free++;
    }

    return { total, free, busy: total - free };
  }

  function buildPreviewFixedDays(days, price) {
    const map = new Map();
    const unique = Array.from(new Set(days || [])).sort();

    for (const iso of unique) {
      if (previewBusySet.has(iso)) continue;
      map.set(iso, price);
    }
    return map;
  }

  function buildPreviewSeasonDays(days, price, weekendsOnly) {
    const map = new Map();
    const unique = Array.from(new Set(days || [])).sort();

    for (const iso of unique) {
      if (previewBusySet.has(iso)) continue;

      if (weekendsOnly) {
        const d = parseISO(iso);
        if (!isWeekendES(d)) continue;
      }

      map.set(iso, price);
    }
    return map;
  }

  function buildPreviewFixed(start, end, price) {
    const map = new Map();
    for (const day of eachDayInclusive(start, end)) {
      const iso = toISO(day);
      if (previewBusySet.has(iso)) continue; // ✅ no pintar ocupados
      map.set(iso, price);
    }
    return map;
  }

  function isWeekendES(d) {
    const dow = d.getDay();
    return dow === 5 || dow === 6;
  }

  function buildPreviewSeason(start, end, price, weekendsOnly) {
    const map = new Map();
    for (const day of eachDayInclusive(start, end)) {
      const iso = toISO(day);
      if (previewBusySet.has(iso)) continue; // ✅ FIX
      if (weekendsOnly && !isWeekendES(day)) continue;
      map.set(iso, price);
    }
    return map;
  }

  async function fillSelects() {
    const props = getPropertiesCache?.() || [];
    const apartOpts = props.length
      ? props.map(p => `<option value="${p.id}">${escapeHtml(p.nombre || p.id)}</option>`).join("")
      : `<option value="">(Primero crea/carga alojamientos)</option>`;

    try {
      const packsSnap = await db.collection("packs").where("activa", "==", true).orderBy("orden").get();
      packsCache = packsSnap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
    } catch (_) {
      packsCache = [];
    }

    const packGroup = packsCache.length
      ? `<optgroup label="Packs">${packsCache.map(p => `<option value="pack:${p.id}">${escapeHtml(p.nombre || p.id)}</option>`).join("")}</optgroup>`
      : "";

    const fullOpts = apartOpts + packGroup;

    if (spProperty) spProperty.innerHTML = fullOpts;
    if (seasonProperty) seasonProperty.innerHTML = fullOpts;

    updateBaseInfo();
  }

  function getPackAutoPrice(pack) {
    if (!pack?.sourceProperties?.length) return 0;
    const props = getPropertiesCache?.() || [];
    const p1 = props.find(p => p.id === pack.sourceProperties[0]);
    const p2 = pack.sourceProperties[1] ? props.find(p => p.id === pack.sourceProperties[1]) : null;
    const precio1 = Number(p1?.precioBase || 0);
    const precio2 = Number(p2?.precioBase || 0);
    return Math.round((precio1 + precio2) * (pack.packPct ?? 85) / 100);
  }

  function updateBaseInfo() {
    const spVal = spProperty?.value || "";
    if (spVal.startsWith("pack:")) {
      const pack = packsCache.find(p => p.id === spVal.slice(5));
      if (spBaseInfo) {
        const autoPrice = pack ? getPackAutoPrice(pack) : 0;
        spBaseInfo.textContent = pack
          ? `Precio base actual (auto): ${autoPrice}€`
          : "";
      }
    } else {
      const p1 = getPropertyById(spVal);
      if (spBaseInfo) spBaseInfo.textContent = p1 ? `Precio base actual: ${Number(p1.precioBase||0).toFixed(0)}€` : "";
    }

    const seasonVal = seasonProperty?.value || "";
    if (seasonVal.startsWith("pack:")) {
      const pack = packsCache.find(p => p.id === seasonVal.slice(5));
      if (seasonBaseInfo) {
        const autoPrice = pack ? getPackAutoPrice(pack) : 0;
        seasonBaseInfo.textContent = pack
          ? `Precio base actual (auto): ${autoPrice}€`
          : "";
      }
    } else {
      const p2 = getPropertyById(seasonVal);
      if (seasonBaseInfo) seasonBaseInfo.textContent = p2 ? `Precio base actual: ${Number(p2.precioBase||0).toFixed(0)}€` : "";
    }
  }

  async function ensureCalendarForSelectedProperty(apartmentId) {
    if (!cal?.ensureCalendarForProperty) return; // ✅ evita crashes
    const prop = getPropertyById(apartmentId);
    if (!prop) return;

    const reservasId = resolveReservasId(apartmentId);

    await cal.ensureCalendarForProperty({
      apartmentId,
      reservasPropertyId: reservasId,
      basePrice: Number(prop.precioBase || 0),
      propertyName: prop.nombre || apartmentId,
    });
  }

  function updateFixedPreview() {
    if (!cal?.setPreviewMap || !cal?.clearPreview) return;

    const propertyId = spProperty?.value;
    if (propertyId?.startsWith("pack:")) return;
    const price = Number(spPrice?.value);

    const selectedDays = getSelectedDaysFromCalendar(); // ✅
    const start = parseDateInput(spStart?.value);
    const end = parseDateInput(spEnd?.value);

    const prop = getPropertyById(propertyId);
    const base = Number(prop?.precioBase || 0);

    // Si no hay property o price válido, limpiamos
    if (!propertyId || !Number.isFinite(price)) {
      cal.clearPreview();
      setSpMsg("");
      return;
    }

    // Si hay selección => preview por selección (no exige inputs)
    if (selectedDays) {
      const minISO = selectedDays[0];
      const maxISO = selectedDays[selectedDays.length - 1];

      const diff = (price - base);

      schedulePreviewBusyLoad(propertyId, parseISO(minISO), parseISO(maxISO), () => {
        const { total, free, busy } = countFreeDaysFromList(selectedDays, previewBusySet, false);

        setSpMsg(
          `Vista previa (selección): ${free} día(s) se actualizarán`
          + (busy ? ` · ${busy} ocupada(s) no se tocan` : "")
          + ` · ${price}€ / noche · base ${base}€ (${diff >= 0 ? "+" : ""}${diff}€)`
        );

        const previewMap = buildPreviewFixedDays(selectedDays, price);
        cal.setPreviewMap(previewMap);
      });

      return;
    }

    // Si NO hay selección => modo rango por inputs (como antes)
    if (!start || !end || end < start) {
      cal.clearPreview();
      setSpMsg("");
      return;
    }

    const diff = (price - base);

    schedulePreviewBusyLoad(propertyId, start, end, () => {
      const { total, free, busy } = countFreeNightsInRange(start, end, previewBusySet);

      setSpMsg(
        `Vista previa: ${free} noche(s) se actualizarán`
        + (busy ? ` · ${busy} ocupada(s) no se tocan` : "")
        + ` · ${price}€ / noche · base ${base}€ (${diff >= 0 ? "+" : ""}${diff}€)`
      );

      const previewMap = buildPreviewFixed(start, end, price);
      cal.setPreviewMap(previewMap);
    });
  }

  function schedulePreviewBusyLoad(propertyId, start, end, onReady) {
    if (!propertyId || !start || !end || end < start) return;

    const reqId = ++previewReqId;
    clearTimeout(previewTimer);

    previewTimer = setTimeout(async () => {
      try {
        const startISO = toISO(start);
        const endISOEx = toISO(addDays(end, 1));
        const busy = await fetchBusyNightsForRange(propertyId, startISO, endISOEx);

        // si hubo otra petición después, ignoramos esta
        if (reqId !== previewReqId) return;

        previewBusySet = busy;
        onReady?.();
      } catch (e) {
        console.error("Error cargando busySet para preview:", e);
        previewBusySet = new Set();
        onReady?.();
      }
    }, 250);
  }

  function updateSeasonPreview() {
    if (!cal?.setPreviewMap || !cal?.clearPreview) return;

    const propertyId = seasonProperty?.value;
    if (propertyId?.startsWith("pack:")) return;
    const percent = Number(seasonPercent?.value);
    const weekendsOnly = !!seasonWeekendsOnly?.checked;

    const selectedDays = getSelectedDaysFromCalendar(); // ✅ NUEVO
    const start = parseDateInput(seasonStart?.value);
    const end = parseDateInput(seasonEnd?.value);

    const prop = getPropertyById(propertyId);
    const base = Number(prop?.precioBase || 0);

    // Si no hay property, % válido o base, limpiamos y salimos
    if (!propertyId || !Number.isFinite(percent) || !base) {
      cal.clearPreview();
      setSeasonMsg("");
      return;
    }

    const finalPrice = Math.round(base * (1 + percent / 100));

    // ✅ Si hay selección => preview por selección
    if (selectedDays) {
      const minISO = selectedDays[0];
      const maxISO = selectedDays[selectedDays.length - 1];

      schedulePreviewBusyLoad(propertyId, parseISO(minISO), parseISO(maxISO), () => {
        const previewMap = buildPreviewSeasonDays(selectedDays, finalPrice, weekendsOnly);
        const { total, free, busy } = countFreeDaysFromList(selectedDays, previewBusySet, weekendsOnly);

        setSeasonMsg(
          `Vista previa (selección): ${previewMap.size} día(s) se actualizarán`
          + (busy ? ` · ${busy} ocupada(s) no se tocan` : "")
          + ` · base ${base}€ → ${finalPrice}€ (+${percent}%)`
          + (weekendsOnly ? " · solo vie/sáb" : "")
        );

        cal.setPreviewMap(previewMap);
      });

      return;
    }

    // ✅ Si NO hay selección => modo rango por inputs
    if (!start || !end || end < start) {
      cal.clearPreview();
      setSeasonMsg("");
      return;
    }

    schedulePreviewBusyLoad(propertyId, start, end, () => {
      const previewMap = buildPreviewSeason(start, end, finalPrice, weekendsOnly);
      const { total, free, busy } = countFreeNightsInRange(start, end, previewBusySet);

      setSeasonMsg(
        `Vista previa: ${previewMap.size} noche(s) se actualizarán`
        + (busy ? ` · ${busy} ocupada(s) no se tocan` : "")
        + ` · base ${base}€ → ${finalPrice}€ (+${percent}%)`
        + (weekendsOnly ? " · solo vie/sáb" : "")
      );

      cal.setPreviewMap(previewMap);
    });
  }

  async function applyFixedPriceRange({ propertyId, start, end, price, busySet }) {
    const col = db.collection("apartamentos").doc(propertyId).collection("prices");
    let batch = db.batch();
    let ops = 0;
    let skipped = 0;

    for (const day of eachDayInclusive(start, end)) {
      const iso = toISO(day);
      if (busySet?.has?.(iso)) { skipped++; continue; } // ✅ saltar ocupados + añadir cuantos se saltan
      batch.set(col.doc(iso), {
        dateISO: iso,
        price,
        updatedAt: serverTimestamp(),
        ruleType: "manual_fixed",
      }, { merge: true });

      ops++;
      if (ops >= 450) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }
    if (ops > 0) await batch.commit();
    return { skipped };
  }

  async function clearPriceOverridesRange({ propertyId, start, end, busySet }) {
    const col = db.collection("apartamentos").doc(propertyId).collection("prices");
    let batch = db.batch();
    let ops = 0;
    let skipped = 0;

    for (const day of eachDayInclusive(start, end)) {
      const iso = toISO(day);
      if (busySet?.has?.(iso)) { skipped++; continue; } // ✅ no tocar ocupados

      batch.delete(col.doc(iso));
      ops++;

      if (ops >= 450) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }

    if (ops > 0) await batch.commit();
    return { skipped };
  }

  async function applyFixedPriceDays({ propertyId, days, price, busySet }) {
    const col = db.collection("apartamentos").doc(propertyId).collection("prices");
    let batch = db.batch();
    let ops = 0;
    let skipped = 0;

    const unique = Array.from(new Set(days)).sort();
    for (const iso of unique) {
      if (busySet?.has?.(iso)) { skipped++; continue; }

      batch.set(col.doc(iso), {
        dateISO: iso,
        price,
        updatedAt: serverTimestamp(),
        ruleType: "manual_fixed_selection",
      }, { merge: true });

      ops++;
      if (ops >= 450) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }

    if (ops > 0) await batch.commit();
    return { skipped, applied: unique.length - skipped };
  }

  async function clearPriceOverridesDays({ propertyId, days, busySet }) {
    const col = db.collection("apartamentos").doc(propertyId).collection("prices");
    let batch = db.batch();
    let ops = 0;
    let skipped = 0;

    const unique = Array.from(new Set(days)).sort();
    for (const iso of unique) {
      if (busySet?.has?.(iso)) { skipped++; continue; }

      batch.delete(col.doc(iso));
      ops++;

      if (ops >= 450) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }

    if (ops > 0) await batch.commit();
    return { skipped, applied: unique.length - skipped };
  }

  async function applySeasonPercentDays({ propertyId, days, percent, weekendsOnly, name, busySet }) {
    const prop = getPropertyById(propertyId);
    const base = Number(prop?.precioBase || 0);
    if (!base || base <= 0) throw new Error("El alojamiento no tiene precioBase válido.");

    const multiplier = 1 + (percent / 100);
    const col = db.collection("apartamentos").doc(propertyId).collection("prices");

    let batch = db.batch();
    let ops = 0;
    let skipped = 0;
    let applied = 0;

    const unique = Array.from(new Set(days || [])).sort();
    for (const iso of unique) {
      if (busySet?.has?.(iso)) { skipped++; continue; }

      if (weekendsOnly) {
        const d = parseISO(iso);
        if (!isWeekendES(d)) continue;
      }

      const price = Math.round(base * multiplier);

      batch.set(col.doc(iso), {
        dateISO: iso,
        price,
        updatedAt: serverTimestamp(),
        ruleType: "season_percent_selection",
        ruleName: name || "",
      }, { merge: true });

      applied++;
      ops++;

      if (ops >= 450) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }

    if (ops > 0) await batch.commit();
    return { skipped, applied };
  }

  spProperty?.addEventListener("change", async () => {
    const val = spProperty.value;
    updateBaseInfo();
    if (val.startsWith("pack:")) {
      const packId = val.slice(5);
      const pack = packsCache.find(p => p.id === packId);
      if (pack && cal?.ensureCalendarForPack) {
        await cal.ensureCalendarForPack({
          packId,
          sourceProperties: pack.sourceProperties || [],
          packName: pack.nombre || packId,
        });
      }
    } else {
      await ensureCalendarForSelectedProperty(val);
      updateFixedPreview();
    }
  });
  spStart?.addEventListener("change", () => {
    if (activeSpTab !== "fixed") return;
    if (!applyInputsToSelection(spStart, spEnd, setSpMsg)) updateFixedPreview();
  });
  spEnd?.addEventListener("change", () => {
    if (activeSpTab !== "fixed") return;
    if (!applyInputsToSelection(spStart, spEnd, setSpMsg)) updateFixedPreview();
  });
  spPrice?.addEventListener("input", () => { if (activeSpTab === "fixed") updateFixedPreview(); });

  seasonProperty?.addEventListener("change", async () => {
    const val = seasonProperty.value;
    updateBaseInfo();
    if (val.startsWith("pack:")) {
      const packId = val.slice(5);
      const pack = packsCache.find(p => p.id === packId);
      if (pack && cal?.ensureCalendarForPack) {
        await cal.ensureCalendarForPack({
          packId,
          sourceProperties: pack.sourceProperties || [],
          packName: pack.nombre || packId,
        });
      }
    } else {
      await ensureCalendarForSelectedProperty(val);
      updateSeasonPreview();
    }
  });
  seasonStart?.addEventListener("change", () => {
    if (activeSpTab !== "season") return;
    if (!applyInputsToSelection(seasonStart, seasonEnd, setSeasonMsg)) updateSeasonPreview();
  });
  seasonEnd?.addEventListener("change", () => {
    if (activeSpTab !== "season") return;
    if (!applyInputsToSelection(seasonStart, seasonEnd, setSeasonMsg)) updateSeasonPreview();
  });
  seasonPercent?.addEventListener("input", () => { if (activeSpTab === "season") updateSeasonPreview(); });
  seasonWeekendsOnly?.addEventListener("change", () => { if (activeSpTab === "season") updateSeasonPreview(); });

  clearPreviewBtn?.addEventListener("click", () => {
    cal?.clearPreview?.();
    setSpMsg("");
    setSeasonMsg("");
  });

  spApplyBtn?.addEventListener("click", async () => {
    try {
      setSpMsg("");

      const propertyId = spProperty?.value;
      const price = Number(spPrice?.value);

      const selectedDays = getSelectedDaysFromCalendar();
      const start = parseDateInput(spStart?.value);
      const end = parseDateInput(spEnd?.value);

      if (!propertyId) return setSpMsg("Selecciona un alojamiento.");
      if (!Number.isFinite(price) || price < 0) return setSpMsg("Precio inválido.");

      if (!selectedDays) {
        if (!start || !end) return setSpMsg("Selecciona fechas válidas.");
        if (end < start) return setSpMsg("El rango es incorrecto.");
      }

      spApplyBtn.disabled = true;
      spApplyBtn.textContent = "Aplicando…";

      if (propertyId.startsWith("pack:")) {
        const packId = propertyId.slice(5);
        const pack = packsCache.find(p => p.id === packId);
        const sourceProps = pack?.sourceProperties || [];

        const days = selectedDays || (() => {
          const out = [];
          for (const day of eachDayInclusive(start, end)) out.push(toISO(day));
          return out;
        })();

        let batch = db.batch();
        let ops = 0;
        for (const iso of days) {
          batch.set(db.collection("packs").doc(packId).collection("prices").doc(iso), {
            dateISO: iso, price, updatedAt: serverTimestamp(), ruleType: "manual_fixed",
          }, { merge: true });
          ops++;
          if (ops >= 450) { await batch.commit(); batch = db.batch(); ops = 0; }
        }
        if (ops > 0) await batch.commit();

        const maxDay = days[days.length - 1];
        await updatePrecioHastaOnDoc("packs", packId, maxDay);

        setSpMsg(`✅ Aplicado a pack: ${days.length} día(s) · ${price}€`);

        if (pack && cal?.ensureCalendarForPack) {
          await cal.ensureCalendarForPack({ packId, sourceProperties: sourceProps, packName: pack.nombre || packId });
        }
        cal?.clearPreview?.();
        return;
      }

      if (selectedDays) {
        const minISO = selectedDays[0];
        const maxISO = selectedDays[selectedDays.length - 1];
        const endISOEx = toISO(addDays(parseISO(maxISO), 1));
        const busySet = await fetchBusyNightsForRange(propertyId, minISO, endISOEx);
        previewBusySet = busySet;

        const { skipped, applied } = await applyFixedPriceDays({ propertyId, days: selectedDays, price, busySet });
        await updatePrecioHastaOnDoc("apartamentos", propertyId, selectedDays[selectedDays.length - 1]);

        setSpMsg(
          `✅ Aplicado a selección: ${applied} día(s)` +
          (skipped ? ` · ${skipped} ocupada(s) no se tocan` : "")
        );
      } else {
        const startISO = toISO(start);
        const endISOEx = toISO(addDays(end, 1));
        const busySet = await fetchBusyNightsForRange(propertyId, startISO, endISOEx);
        previewBusySet = busySet;

        const { skipped } = await applyFixedPriceRange({ propertyId, start, end, price, busySet });
        await updatePrecioHastaOnDoc("apartamentos", propertyId, toISO(end));
        setSpMsg(skipped ? `✅ Aplicado. (${skipped} ocupada(s) no se tocan)` : "✅ Precio fijo aplicado al rango.");
      }

      await ensureCalendarForSelectedProperty(propertyId);
      cal?.clearPreview?.();
    } catch (e) {
      console.error(e);
      setSpMsg("❌ Error aplicando precio fijo.");
    } finally {
      spApplyBtn.disabled = false;
      spApplyBtn.textContent = "Aplicar precio fijo";
    }
  });

  spClearBtn?.addEventListener("click", async () => {
    try {
      setSpMsg("");

      const propertyId = spProperty?.value;
      if (propertyId?.startsWith("pack:")) {
        return setSpMsg("Para packs, edita los precios directamente en el calendario (doble clic en el día).");
      }

      const selectedDays = getSelectedDaysFromCalendar();
      const start = parseDateInput(spStart?.value);
      const end = parseDateInput(spEnd?.value);

      if (!propertyId) return setSpMsg("Selecciona un alojamiento.");

      if (!selectedDays) {
        if (!start || !end) return setSpMsg("Selecciona fechas válidas.");
        if (end < start) return setSpMsg("El rango es incorrecto.");
      }

      spClearBtn.disabled = true;
      spClearBtn.textContent = "Borrando…";

      if (selectedDays) {
        const minISO = selectedDays[0];
        const maxISO = selectedDays[selectedDays.length - 1];
        const endISOEx = toISO(addDays(parseISO(maxISO), 1));
        const busySet = await fetchBusyNightsForRange(propertyId, minISO, endISOEx);
        previewBusySet = busySet;

        const { skipped, applied } = await clearPriceOverridesDays({
          propertyId,
          days: selectedDays,
          busySet
        });

        setSpMsg(
          `✅ Overrides borrados en selección: ${applied} día(s)` +
          (skipped ? ` · ${skipped} ocupada(s) no se tocan` : "")
        );
      } else {
        const startISO = toISO(start);
        const endISOEx = toISO(addDays(end, 1));
        const busySet = await fetchBusyNightsForRange(propertyId, startISO, endISOEx);
        previewBusySet = busySet;

        const { skipped } = await clearPriceOverridesRange({ propertyId, start, end, busySet });
        setSpMsg(skipped ? `✅ Hecho. (${skipped} ocupada(s) no se tocan)` : "✅ Hecho.");
      }

      await ensureCalendarForSelectedProperty(propertyId);
      cal?.clearPreview?.();
    } catch (e) {
      console.error(e);
      setSpMsg("❌ Error borrando overrides.");
    } finally {
      spClearBtn.disabled = false;
      spClearBtn.textContent = "Borrar overrides del rango";
    }
  });

  seasonApplyBtn?.addEventListener("click", async () => {
    try {
      setSeasonMsg("");

      const propertyId = seasonProperty?.value;
      if (propertyId?.startsWith("pack:")) {
        return setSeasonMsg("Para packs, edita los precios directamente en el calendario (doble clic en el día).");
      }
      const percent = Number(seasonPercent?.value);
      const weekendsOnly = !!seasonWeekendsOnly?.checked;
      const name = (seasonName?.value || "").trim();

      const selectedDays = getSelectedDaysFromCalendar(); // ✅
      const start = parseDateInput(seasonStart?.value);
      const end = parseDateInput(seasonEnd?.value);

      if (!propertyId) return setSeasonMsg("Selecciona un alojamiento.");
      if (!Number.isFinite(percent)) return setSeasonMsg("Porcentaje inválido.");

      // Si NO hay selección, exigimos rango
      if (!selectedDays) {
        if (!start || !end) return setSeasonMsg("Selecciona fechas válidas.");
        if (end < start) return setSeasonMsg("El rango es incorrecto.");
      }

      seasonApplyBtn.disabled = true;
      seasonApplyBtn.textContent = "Aplicando…";

      if (selectedDays) {
        // ✅ aplicar SOLO a selección
        const minISO = selectedDays[0];
        const maxISO = selectedDays[selectedDays.length - 1];
        const endISOEx = toISO(addDays(parseISO(maxISO), 1));
        const busySet = await fetchBusyNightsForRange(propertyId, minISO, endISOEx);
        previewBusySet = busySet;

        const { skipped, applied } = await applySeasonPercentDays({
          propertyId,
          days: selectedDays,
          percent,
          weekendsOnly,
          name,
          busySet
        });
        await updatePrecioHastaOnDoc("apartamentos", propertyId, selectedDays[selectedDays.length - 1]);

        setSeasonMsg(
          `✅ Aplicado a selección: ${applied} día(s)` +
          (skipped ? ` · ${skipped} ocupada(s) no se tocan` : "") +
          (weekendsOnly ? " · solo vie/sáb" : "")
        );
      } else {
        // ✅ fallback: rango
        const startISO = toISO(start);
        const endISOEx = toISO(addDays(end, 1));
        const busySet = await fetchBusyNightsForRange(propertyId, startISO, endISOEx);
        previewBusySet = busySet;

        const { skipped } = await applySeasonPercentRange({
          propertyId,
          start,
          end,
          percent,
          weekendsOnly,
          name,
          busySet
        });
        await updatePrecioHastaOnDoc("apartamentos", propertyId, toISO(end));

        setSeasonMsg(
          skipped
            ? `✅ Aplicado. (${skipped} ocupada(s) no se tocan)` + (weekendsOnly ? " · solo vie/sáb" : "")
            : `✅ Temporada alta aplicada.` + (weekendsOnly ? " · solo vie/sáb" : "")
        );
      }

      await ensureCalendarForSelectedProperty(propertyId);
      cal?.clearPreview?.();
    } catch (e) {
      console.error(e);
      setSeasonMsg(`❌ ${e?.message || "Error aplicando temporada."}`);
    } finally {
      seasonApplyBtn.disabled = false;
      seasonApplyBtn.textContent = "Aplicar temporada alta";
    }
  });

  spActivateBaseBtn?.addEventListener("click", async () => {
    try {
      setSpMsg("");

      const days = cal?.getSelectedDays?.();
      if (!days?.length) {
        setSpMsg("Selecciona días en el calendario primero.");
        return;
      }

      const propertyId = spProperty?.value;
      if (!propertyId) {
        setSpMsg("Selecciona un alojamiento.");
        return;
      }

      const isPackSel = propertyId.startsWith("pack:");
      let price = 0;

      if (isPackSel) {
        const pack = packsCache.find(p => p.id === propertyId.slice(5));
        price = pack ? getPackAutoPrice(pack) : 0;
      } else {
        const prop = getPropertyById(propertyId);
        price = Number(prop?.precioBase || 0);
      }

      if (!price || price <= 0) {
        setSpMsg("No se puede calcular el precio base (precioBase no configurado).");
        return;
      }

      spActivateBaseBtn.disabled = true;
      spActivateBaseBtn.textContent = "Activando…";

      const realId = isPackSel ? propertyId.slice(5) : propertyId;

      let batch = db.batch();
      let ops = 0;

      if (isPackSel) {
        for (const iso of days) {
          batch.set(db.collection("packs").doc(realId).collection("prices").doc(iso), {
            dateISO: iso, price, updatedAt: serverTimestamp(), ruleType: "manual_fixed",
          }, { merge: true });
          ops++;
          if (ops >= 450) { await batch.commit(); batch = db.batch(); ops = 0; }
        }
      } else {
        const col = db.collection("apartamentos").doc(realId).collection("prices");
        for (const iso of days) {
          batch.set(col.doc(iso), {
            dateISO: iso, price, updatedAt: serverTimestamp(), ruleType: "manual_fixed",
          }, { merge: true });
          ops++;
          if (ops >= 450) { await batch.commit(); batch = db.batch(); ops = 0; }
        }
      }
      if (ops > 0) await batch.commit();

      const maxActivated = days[days.length - 1];
      if (isPackSel) {
        await updatePrecioHastaOnDoc("packs", realId, maxActivated);
      } else {
        await updatePrecioHastaOnDoc("apartamentos", realId, maxActivated);
      }

      setSpMsg(`✅ ${days.length} día(s) activados con precio base (${price}€)`);

      if (isPackSel) {
        const packId = propertyId.slice(5);
        const pack = packsCache.find(p => p.id === packId);
        if (pack && cal?.ensureCalendarForPack) {
          await cal.ensureCalendarForPack({
            packId,
            sourceProperties: pack.sourceProperties || [],
            packName: pack.nombre || packId,
          });
        }
      } else {
        await ensureCalendarForSelectedProperty(propertyId);
      }
      cal?.clearPreview?.();
    } catch (err) {
      console.error(err);
      setSpMsg(`❌ Error activando días: ${err?.message || err}`);
    } finally {
      if (spActivateBaseBtn) {
        spActivateBaseBtn.disabled = false;
        spActivateBaseBtn.textContent = "Activar con precio base";
      }
    }
  });

  // ✅ IMPORTANTE: cuando carguen propiedades de Firestore, hay que repoblar selects
  function refreshProperties() {
    fillSelects();
    // Si ya hay algo seleccionado y no es un pack, intenta cargar calendario
    const current = spProperty?.value || seasonProperty?.value;
    if (current && !current.startsWith("pack:")) {
      ensureCalendarForSelectedProperty(current).catch(() => {});
    }
  }

  // init (no rompe si está vacío)
  fillSelects();

  // 🔁 Recalcular preview cuando cambia la selección del calendario
    if (cal?.setRangeSelectionHandler) {
      cal.setRangeSelectionHandler((payload) => {
        // payload puede traer { startISO, endISO, days, ... }
        selectedDaysCache = Array.isArray(payload?.days) && payload.days.length
          ? payload.days.slice().sort()
          : null;

        refreshActivePreview();
      });
    }


  return {
    refreshProperties,
  };
}