// Precio de pack derivado (espejo solo-display; canónico en public/shared/pack-pricing.js)
import { packBasePrice, resolvePackPct, PACK_PCT_DEFAULT } from "./pack-pricing.js";

export function createPriceCalendar({ db, serverTimestamp, escapeHtml }) {
  const calTitle = document.getElementById("pcalTitle");
  const calPrev = document.getElementById("pcalPrev");
  const calNext = document.getElementById("pcalNext");
  const calToday = document.getElementById("pcalToday");
  const calGrid = document.getElementById("pcalGrid");
  const calMonthLabel = document.getElementById("pcalMonthLabel");
  const calInfo = document.getElementById("pcalInfo");

  const pcalSaveSelBtn = document.getElementById("pcalSaveSelBtn");
  const pcalRestoreSelBtn = document.getElementById("pcalRestoreSelBtn");
  const pcalClearSelBtn = document.getElementById("pcalClearSelBtn");
  const pcalClearSavedSelBtn = document.getElementById("pcalClearSavedSelBtn");

  const editor = document.getElementById("priceEditor");
  const peDate = document.getElementById("peDate");
  const peCurrent = document.getElementById("peCurrent");
  const peInput = document.getElementById("peInput");
  const peSave = document.getElementById("peSave");
  const peReset = document.getElementById("peReset");
  const peClose = document.getElementById("peClose");
  const peMsg = document.getElementById("peMsg");

  let currentMonth = monthStart(new Date());
  let apartmentId = null;
  let reservasPropertyId = null;
  let basePrice = 0;
  let propertyName = "";
  let packState = null; // { packId, autoPrice, packPct } cuando estamos en modo pack

  let busySet = new Set();
  let holdSet = new Set();
  let priceMap = new Map();
  let previewMap = new Map();

  let rangeSelectionHandler = null;

  // Selección de días (click toggle | shift rango | arrastrar)
  let selectedDays = new Set();
  let lastAnchorISO = null;
  let isDragging = false;
  let dragMode = "add";

  let dragLastISO = null;       // evita repintar varias veces el mismo día al arrastrar
  let suppressClickUntil = 0;   // evita el click sintético después del touch

  const persistKey = "pcal_saved_selection_v1";

  let editorISO = null;
  let precioHastaLocal = null;

  let unsubReservas = null;
  let unsubBloqueos = null;
  let unsubPrices = null;


  function setInfo(t, html = false) {
    if (!calInfo) return;
    if (html) calInfo.innerHTML = t || "";
    else calInfo.textContent = t || "";
  }

  function stopLiveListeners() {
    if (unsubReservas) unsubReservas();
    if (unsubBloqueos) unsubBloqueos();
    if (unsubPrices) unsubPrices();
    unsubReservas = null;
    unsubBloqueos = null;
    unsubPrices = null;
  }

  async function ensureCalendarForProperty({ apartmentId: aId, reservasPropertyId: rId, basePrice: bp, propertyName: pn }) {
    packState = null;
    apartmentId = aId;
    reservasPropertyId = rId;
    basePrice = Number(bp || 0);
    propertyName = pn || aId || "";

    try {
      const parentDoc = await db.collection("apartamentos").doc(aId).get();
      precioHastaLocal = parentDoc.data()?.precioHasta || null;
    } catch (_) { precioHastaLocal = null; }

    if (calTitle) calTitle.textContent = `Precios · ${propertyName}`;
    await loadCalendarDataForMonth();
    renderCalendar();
    startLiveListeners();
  }

  async function ensureCalendarForPack({ packId: pid, sourceProperties: sp, packName: pn } = {}) {
    stopLiveListeners();
    apartmentId = null;
    reservasPropertyId = null;
    packState = null;

    if (!pid || !Array.isArray(sp) || !sp.length) {
      if (calTitle) calTitle.textContent = "Precios";
      setInfo("Pack sin apartamentos configurados.");
      return;
    }

    if (calTitle) calTitle.textContent = `Precios · ${pn || pid}`;

    let packPct = PACK_PCT_DEFAULT;
    try {
      const parentDoc = await db.collection("packs").doc(pid).get();
      precioHastaLocal = parentDoc.data()?.precioHasta || null;
      packPct = resolvePackPct(parentDoc.data());
    } catch (_) { precioHastaLocal = null; }

    let precio1 = 0, precio2 = 0;
    let nombreA = sp[0], nombreB = sp[1] || "";

    try {
      const docA = await db.collection("apartamentos").doc(sp[0]).get();
      precio1 = Number(docA.data()?.precioBase || 0);
      nombreA = docA.data()?.nombre || sp[0];
    } catch (_) {}

    if (sp[1]) {
      try {
        const docB = await db.collection("apartamentos").doc(sp[1]).get();
        precio2 = Number(docB.data()?.precioBase || 0);
        nombreB = docB.data()?.nombre || sp[1];
      } catch (_) {}
    }

    const suma = precio1 + precio2;
    // Fórmula derivada vía el espejo canónico (packPct × (A + B)).
    const autoPrice = packBasePrice(precio1, precio2, packPct) ?? Math.round(suma * packPct / 100);

    packState = { packId: pid, autoPrice, packPct, sourceProperties: sp };
    basePrice = autoPrice;
    propertyName = pn || pid;

    const dot = `<span class="price-auto-dot" style="display:inline-block;position:relative;vertical-align:middle;margin-right:6px;"></span>`;
    const esc = (s) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const infoHTML = sp[1]
      ? `${dot}Precio automático: [${esc(nombreA)}] ${precio1}€ + [${esc(nombreB)}] ${precio2}€ = ${suma}€ × ${packPct}% = ${autoPrice}€`
      : `${dot}Precio automático: [${esc(nombreA)}] ${precio1}€ × ${packPct}% = ${autoPrice}€`;

    setInfo(infoHTML, true);

    await loadCalendarDataForMonth();
    renderCalendar();
    startLiveListeners();
  }

  function setPreviewMap(map) {
    previewMap = map instanceof Map ? map : new Map();
    renderCalendar();
  }

  function clearPreview() {
    previewMap = new Map();
    renderCalendar();
  }

  function setRangeSelectionHandler(fn) {
    rangeSelectionHandler = typeof fn === "function" ? fn : null;
  }

  function clearRangeSelection() {
    selectedDays.clear();
    lastAnchorISO = null;
    dragLastISO = null;
    setInfo("");
    renderCalendar();
    notifySelection();
  }

  async function loadCalendarDataForMonth() {
    if (packState) {
      const ms = monthStart(currentMonth);
      const me = monthEnd(currentMonth);
      const rangeStartISO = toISODate(ms);
      const rangeEndISO = toISODate(me);

      busySet = new Set();
      holdSet = new Set();
      priceMap = new Map();

      const pricesSnap = await db
        .collection("packs")
        .doc(packState.packId)
        .collection("prices")
        .where("dateISO", ">=", rangeStartISO)
        .where("dateISO", "<=", rangeEndISO)
        .get();

      pricesSnap.docs.forEach((doc) => {
        const p = doc.data() || {};
        const dateISO = p.dateISO || doc.id;
        if (!dateISO) return;
        priceMap.set(dateISO, Number(p.price));
      });

      return;
    }

    if (!apartmentId || !reservasPropertyId) return;

    const ms = monthStart(currentMonth);
    const me = monthEnd(currentMonth);

    const rangeStartISO = toISODate(ms);
    const rangeEndExISO = toISODate(new Date(me.getFullYear(), me.getMonth(), me.getDate() + 1));

    busySet = new Set();

    const reservasSnap = await db
      .collection("reservas")
      .where("propertyId", "==", reservasPropertyId)
      .get();

    reservasSnap.docs.forEach((doc) => {
      const r = doc.data() || {};
      if (r.status === "cancelled" || r.cancelled === true) return;

      const ciISO = r.checkInISO || parseEsDateToISO(r.checkIn);
      const coISO = r.checkOutISO || parseEsDateToISO(r.checkOut);
      if (!ciISO || !coISO) return;

      eachNightISO(ciISO, coISO).forEach((nightISO) => {
        if (nightISO >= rangeStartISO && nightISO < rangeEndExISO) busySet.add(nightISO);
      });
    });

    holdSet = new Set();

    const bloqueosSnap = await db
      .collection("bloqueos")
      .where("propertyId", "==", apartmentId)
      .get();

    bloqueosSnap.docs.forEach((doc) => {
      const b = doc.data() || {};
      const s = b.startISO;
      const e = b.endISO;
      if (!s || !e) return;

      const endEx = addDaysISO(e, 1);
      eachNightISO(s, endEx).forEach((nightISO) => {
        if (nightISO >= rangeStartISO && nightISO < rangeEndExISO) holdSet.add(nightISO);
      });
    });

    priceMap = new Map();

    const pricesSnap = await db
      .collection("apartamentos")
      .doc(apartmentId)
      .collection("prices")
      .where("dateISO", ">=", rangeStartISO)
      .where("dateISO", "<=", toISODate(me))
      .get();

    pricesSnap.docs.forEach((doc) => {
      const p = doc.data() || {};
      const dateISO = p.dateISO || doc.id;
      if (!dateISO) return;
      priceMap.set(dateISO, Number(p.price));
    });
  }

  function startLiveListeners() {
    stopLiveListeners();

    if (packState) {
      const ms = monthStart(currentMonth);
      const me = monthEnd(currentMonth);
      const startISO = toISODate(ms);
      const endISO = toISODate(me);

      unsubPrices = db
        .collection("packs")
        .doc(packState.packId)
        .collection("prices")
        .where("dateISO", ">=", startISO)
        .where("dateISO", "<=", endISO)
        .onSnapshot(
          () => refresh().catch(() => {}),
          () => {}
        );
      return;
    }

    if (!apartmentId || !reservasPropertyId) return;

    unsubReservas = db
      .collection("reservas")
      .where("propertyId", "==", reservasPropertyId)
      .onSnapshot(
        () => refresh().catch(() => {}),
        () => {}
      );

    unsubBloqueos = db
      .collection("bloqueos")
      .where("propertyId", "==", apartmentId)
      .onSnapshot(
        () => refresh().catch(() => {}),
        () => {}
      );

    const ms = monthStart(currentMonth);
    const me = monthEnd(currentMonth);
    const startISO = toISODate(ms);
    const endISO = toISODate(me);

    unsubPrices = db
      .collection("apartamentos")
      .doc(apartmentId)
      .collection("prices")
      .where("dateISO", ">=", startISO)
      .where("dateISO", "<=", endISO)
      .onSnapshot(
        () => refresh().catch(() => {}),
        () => {}
      );
  }

  async function refresh() {
    await loadCalendarDataForMonth();
    renderCalendar();
    if (editorISO) openEditor(editorISO);
  }

  function renderCalendar() {
    if (!calGrid || !calMonthLabel) return;

    const todayISO = toISODate(new Date());

    const ms = monthStart(currentMonth);
    const me = monthEnd(currentMonth);

    const monthName = ms.toLocaleString("es-ES", { month: "long", year: "numeric" });
    calMonthLabel.textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);

    const dayHeaders = ["L", "M", "X", "J", "V", "S", "D"]
      .map((d) => `<div class="day-header">${d}</div>`)
      .join("");

    const first = new Date(ms);
    const startDow = (first.getDay() + 6) % 7;

    const gridDays = [];
    for (let i = 0; i < startDow; i++) gridDays.push({ type: "empty" });

    for (let d = 1; d <= me.getDate(); d++) {
      const date = new Date(ms.getFullYear(), ms.getMonth(), d);
      gridDays.push({ type: "day", date, iso: toISODate(date) });
    }

    while (gridDays.length % 7 !== 0) gridDays.push({ type: "empty" });

    const htmlDays = gridDays
      .map((item) => {
        if (item.type === "empty") return `<div class="day-cell empty"></div>`;

        const iso = item.iso;
        const dayNum = item.date.getDate();

        const isBusy = busySet.has(iso);
        const isHold = holdSet.has(iso);

        const isPreview = previewMap.has(iso);
        const hasOverride = priceMap.has(iso);

        const effectivePrice = isPreview
          ? previewMap.get(iso)
          : (hasOverride ? priceMap.get(iso) : basePrice);

        const isSelected = selectedDays.has(iso);
        const isPackAuto = !!packState && !hasOverride && !isPreview;

        const cls = [
          "calendar-day",
          iso === todayISO ? "today" : "",
          isBusy ? "occupied" : (isHold ? "hold" : "available"),
          isPreview ? "preview" : "",
          hasOverride ? "special" : "",
          isPackAuto ? "pack-auto" : "",
          isSelected ? "selected" : "",
        ].join(" ").trim();

        const priceVal = Number(effectivePrice || 0).toFixed(0);

        return `
          <div class="${cls}" data-iso="${iso}">
            <div class="cal-daynum">${dayNum}</div>
            <div class="cal-price">${priceVal}€</div>
            ${isPackAuto ? `<span class="price-auto-dot" title="Precio automático"></span>` : ""}
          </div>
        `;
      })
      .join("");

    calGrid.innerHTML = dayHeaders + htmlDays;

    calGrid.querySelectorAll("[data-iso]").forEach((el) => {
      const iso = el.getAttribute("data-iso");
      el.addEventListener("click", (e) => onDayClick(iso, e));
      el.addEventListener("mousedown", (e) => { e.preventDefault(); onDayMouseDown(iso); });
      el.addEventListener("touchstart", (e) => onDayTouchStart(iso, e), { passive: false });
      el.addEventListener("mouseenter", () => onDayMouseEnter(iso));
      el.addEventListener("dblclick", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openEditor(iso);
      });
    });
  }

  // Selección de días (click = toggle | Shift+click = rango | arrastrar = multi)

  function getSelectedDays() {
    return Array.from(selectedDays).sort();
  }

  function setSelectedDays(daysArray) {
    selectedDays = new Set((daysArray || []).filter(Boolean));
    lastAnchorISO = null;
    dragLastISO = null;
    setInfo(selectedDays.size ? `Seleccionados: ${selectedDays.size} día(s)` : "");
    renderCalendar();
    notifySelection();
  }

  function notifySelection() {
    if (!rangeSelectionHandler) return;

    const days = getSelectedDays();
    if (!days.length) {
      rangeSelectionHandler(null);
      return;
    }

    rangeSelectionHandler({
      startISO: days[0],
      endISO: days[days.length - 1],
      days,
    });
  }

  function getCalendarIsoFromPoint(clientX, clientY) {
    const el = document.elementFromPoint(clientX, clientY)?.closest?.("[data-iso]");
    if (!el) return null;
    if (calGrid && !calGrid.contains(el)) return null;
    return el.getAttribute("data-iso");
  }

  function onDayTouchStart(iso, e) {
    if (!apartmentId && !packState) {
      setInfo("Selecciona un alojamiento para editar precios.");
      return;
    }

    // Evita scroll/zoom mientras arrastras dentro del calendario
    e?.preventDefault?.();

    // El navegador puede lanzar un click sintético después del touch
    suppressClickUntil = Date.now() + 450;

    onDayMouseDown(iso);
  }

  function onTouchMoveDocument(e) {
    if (!isDragging) return;

    const t = e.touches?.[0];
    if (!t) return;

    const iso = getCalendarIsoFromPoint(t.clientX, t.clientY);
    if (!iso) return;

    // Si seguimos sobre el mismo día, evita trabajo/repaint extra
    if (iso === dragLastISO) {
      e.preventDefault();
      return;
    }

    onDayMouseEnter(iso);
    e.preventDefault();
  }

  function finishDragSelection() {
    if (!isDragging) return;
    isDragging = false;
    dragLastISO = null;
    notifySelection();
  }

  function onDayClick(iso, e) {
    // Ignora el click sintético que llega tras un touch
    if (Date.now() < suppressClickUntil) return;

    if (!apartmentId && !packState) {
      setInfo("Selecciona un alojamiento para editar precios.");
      return;
    }

    // Shift = añade rango desde el último anchor hasta el día clicado
    if (e?.shiftKey && lastAnchorISO) {
      const a = lastAnchorISO <= iso ? lastAnchorISO : iso;
      const b = lastAnchorISO <= iso ? iso : lastAnchorISO;

      let cur = a;
      while (cur <= b) {
        selectedDays.add(cur);
        cur = addDaysISO(cur, 1);
      }

      lastAnchorISO = iso;
      setInfo(`Seleccionados: ${selectedDays.size} día(s) (rango ${a} → ${b})`);
      renderCalendar();
      notifySelection();
      return;
    }

    if (selectedDays.has(iso)) selectedDays.delete(iso);
    else selectedDays.add(iso);

    lastAnchorISO = iso;
    dragLastISO = iso;
    setInfo(`Seleccionados: ${selectedDays.size} día(s)`);
    renderCalendar();
    notifySelection();
  }

  function onDayMouseDown(iso) {
    if (!apartmentId && !packState) return;
    isDragging = true;

    // Si el día ya estaba, arrastrar "quita". Si no, "añade".
    dragMode = selectedDays.has(iso) ? "remove" : "add";

    if (dragMode === "remove") selectedDays.delete(iso);
    else selectedDays.add(iso);

    lastAnchorISO = iso;
    dragLastISO = iso;
    setInfo(`Seleccionados: ${selectedDays.size} día(s)`);
    renderCalendar();
  }

  function onDayMouseEnter(iso) {
    if (!isDragging) return;
    if (iso === dragLastISO) return;

    dragLastISO = iso;

    if (dragMode === "remove") selectedDays.delete(iso);
    else selectedDays.add(iso);

    setInfo(`Seleccionados: ${selectedDays.size} día(s)`);
    renderCalendar();
  }

  document.addEventListener("mouseup", finishDragSelection);

  // Arrastre táctil global (document) para poder seguir seleccionando aunque el dedo pase entre celdas
  window.addEventListener("touchmove", onTouchMoveDocument, { passive: false });
  window.addEventListener("touchend", finishDragSelection, { passive: true });
  window.addEventListener("touchcancel", finishDragSelection, { passive: true });

  function saveSelectedDaysToStorage() {
    try {
      const days = getSelectedDays();
      if (!days.length) {
        setInfo("No hay selección para guardar.");
        return false;
      }
      localStorage.setItem(persistKey, JSON.stringify(days));
      setInfo(`✅ Selección guardada (${days.length} día(s))`);
      return true;
    } catch (e) {
      console.warn("No se pudo guardar selección:", e);
      setInfo("❌ No se pudo guardar la selección.");
      return false;
    }
  }

  function restoreSelectedDaysFromStorage() {
    try {
      const raw = localStorage.getItem(persistKey);
      if (!raw) {
        setInfo("No hay selección guardada.");
        return false;
      }
      const days = JSON.parse(raw);
      if (!Array.isArray(days) || !days.length) {
        setInfo("Selección guardada vacía.");
        return false;
      }
      setSelectedDays(days);
      setInfo(`✅ Selección restaurada (${days.length} día(s))`);
      return true;
    } catch (e) {
      console.warn("No se pudo restaurar selección:", e);
      setInfo("❌ No se pudo restaurar la selección.");
      return false;
    }
  }

  function clearSavedSelection() {
    try {
      localStorage.removeItem(persistKey);
      setInfo("✅ Selección guardada borrada.");
      return true;
    } catch (e) {
      console.warn("No se pudo borrar selección guardada:", e);
      setInfo("❌ No se pudo borrar la selección guardada.");
      return false;
    }
  }

  pcalSaveSelBtn?.addEventListener("click", () => saveSelectedDaysToStorage());
  pcalRestoreSelBtn?.addEventListener("click", () => restoreSelectedDaysFromStorage());
  pcalClearSelBtn?.addEventListener("click", () => clearRangeSelection());
  pcalClearSavedSelBtn?.addEventListener("click", () => clearSavedSelection());

  function openEditor(iso) {
    if (!apartmentId && !packState) return;

    editorISO = iso;
    if (editor) editor.classList.add("open");

    if (peDate) peDate.textContent = iso;

    const current = priceMap.has(iso) ? priceMap.get(iso) : basePrice;
    const modeLabel = priceMap.has(iso) ? "manual" : (packState ? `auto (${packState.packPct}%)` : "base");
    if (peCurrent) peCurrent.textContent = `${Number(current || 0).toFixed(0)}€ (${modeLabel})`;

    // MODO PACK: SOLO-LECTURA. El precio del pack se DERIVA de las unidades (packPct × (A + B));
    // aquí no se editan overrides del pack. Se oculta la edición y se explica al usuario.
    const readOnlyPack = !!packState;

    if (peInput) {
      peInput.value = priceMap.has(iso) ? String(priceMap.get(iso)) : "";
      peInput.placeholder = packState ? `${packState.autoPrice}€ (auto)` : "";
      peInput.readOnly = readOnlyPack;
      peInput.disabled = readOnlyPack;
      peInput.style.display = readOnlyPack ? "none" : "";
    }
    if (peSave)  peSave.style.display  = readOnlyPack ? "none" : "";
    if (peReset) peReset.style.display = readOnlyPack ? "none" : "";

    if (peMsg) peMsg.textContent = readOnlyPack
      ? `Precio automático ${packState.autoPrice}€ (${packState.packPct}% × precio de las dos unidades). `
        + `El precio del pack no se edita aquí: ajusta el precio de cada apartamento o el % del pack. `
        + `Si en una fecha falta el precio de alguna unidad, el pack NO es reservable esa noche.`
      : (busySet.has(iso)
          ? "⚠️ Nota: este día está reservado. Puedes cambiar el precio igualmente, pero solo afectará a futuro."
          : "Doble click en un día para editar. Click normal para seleccionar rango.");
  }

  async function saveOverride() {
    if (packState) return; // pack: solo-lectura; el precio se deriva de las unidades, no se guardan overrides
    if ((!apartmentId && !packState) || !editorISO) return;
    const val = String(peInput?.value || "").trim();

    const ref = packState
      ? db.collection("packs").doc(packState.packId).collection("prices").doc(editorISO)
      : db.collection("apartamentos").doc(apartmentId).collection("prices").doc(editorISO);

    if (!val) {
      await ref.delete().catch(() => {});
      priceMap.delete(editorISO);
      openEditor(editorISO);
      renderCalendar();
      return;
    }

    const num = Number(val);
    if (!Number.isFinite(num) || num < 0) {
      if (peMsg) peMsg.textContent = "❌ Precio inválido.";
      return;
    }

    await ref.set(
      {
        dateISO: editorISO,
        price: num,
        updatedAt: serverTimestamp(),
        ruleType: "manual_day",
      },
      { merge: true }
    );

    if (!precioHastaLocal || editorISO > precioHastaLocal) {
      const parentRef = packState
        ? db.collection("packs").doc(packState.packId)
        : db.collection("apartamentos").doc(apartmentId);
      await parentRef.set({ precioHasta: editorISO }, { merge: true }).catch(() => {});
      precioHastaLocal = editorISO;
    }

    priceMap.set(editorISO, num);
    openEditor(editorISO);
    renderCalendar();
  }

  async function resetToBase() {
    if (packState) return; // pack: solo-lectura; nada que resetear (el precio se deriva de las unidades)
    if ((!apartmentId && !packState) || !editorISO) return;
    const ref = packState
      ? db.collection("packs").doc(packState.packId).collection("prices").doc(editorISO)
      : db.collection("apartamentos").doc(apartmentId).collection("prices").doc(editorISO);
    await ref.delete().catch(() => {});
    priceMap.delete(editorISO);
    openEditor(editorISO);
    renderCalendar();
  }

  function closeEditor() {
    if (editor) editor.classList.remove("open");
    editorISO = null;
  }

  peSave?.addEventListener("click", saveOverride);
  peReset?.addEventListener("click", resetToBase);
  peClose?.addEventListener("click", closeEditor);

  calPrev?.addEventListener("click", async () => {
    currentMonth = monthStart(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    await refresh();
    startLiveListeners();
  });

  calNext?.addEventListener("click", async () => {
    currentMonth = monthStart(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
    await refresh();
    startLiveListeners();
  });

  calToday?.addEventListener("click", async () => {
    currentMonth = monthStart(new Date());
    await refresh();
    startLiveListeners();
  });

  return {
    ensureCalendarForProperty,
    ensureCalendarForPack,
    setPreviewMap,
    clearPreview,
    setRangeSelectionHandler,
    clearRangeSelection,
    getSelectedDays,
    setSelectedDays,
    refresh,
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
