import { auth, db, storage, serverTimestamp, increment } from "../shared/firebase.js";
import { fetchProperties } from "./properties-service-intranet.js";
import { fetchPacks, savePack } from "./packs-service.js";
import { subscribeToChat } from "./reservas-service-intranet.js";

const loginView = document.getElementById("loginView");
const noAccessView = document.getElementById("noAccessView");
const mainView = document.getElementById("mainView");

const loginForm = document.getElementById("loginForm");
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const loginError = document.getElementById("loginError");

const userEmailSpan = document.getElementById("userEmail");
const logoutBtn = document.getElementById("logoutBtn");
const noAccessLogoutBtn = document.getElementById("noAccessLogoutBtn");

const tabButtons = document.querySelectorAll(".tab");
const tabContents = document.querySelectorAll(".tab-content");

const propertiesBody = document.getElementById("propertiesBody");
const newPropertyBtn = document.getElementById("newPropertyBtn");
const propertyForm = document.getElementById("propertyForm");
const formTitle = document.getElementById("formTitle");
const resetFormBtn = document.getElementById("resetFormBtn");
const formMessage = document.getElementById("formMessage");
const propertyPhotosInput = document.getElementById("propertyPhotos");
const photoPreview = document.getElementById("photoPreview");

const propertyIdInput = document.getElementById("propertyId");
const nombreInput = document.getElementById("nombre");
const direccionInput = document.getElementById("direccion");
const ciudadInput = document.getElementById("ciudad");
const capacidadInput = document.getElementById("capacidad");
const dormitoriosInput = document.getElementById("dormitorios");
const banosInput = document.getElementById("banos");
const descripcionInput = document.getElementById("descripcion");
const descripcionLargaInput = document.getElementById("descripcionLarga");
const precioBaseInput = document.getElementById("precioBase");
const activaInput = document.getElementById("activa");
const serviciosInput = document.getElementById("servicios");

const latInput = document.getElementById("lat");
const lngInput = document.getElementById("lng");
const taglineInput = document.getElementById("tagline");
const highlightsInput = document.getElementById("highlights");
const checkInTimeInput = document.getElementById("checkInTime");
const checkOutTimeInput = document.getElementById("checkOutTime");
const normasInput = document.getElementById("normas");

const packsBody = document.getElementById("packsBody");
const newPackBtn = document.getElementById("newPackBtn");
const packForm = document.getElementById("packForm");
const packFormTitle = document.getElementById("packFormTitle");
const resetPackFormBtn = document.getElementById("resetPackFormBtn");
const packFormMessage = document.getElementById("packFormMessage");

const packIdInput = document.getElementById("packId");
const packNombreInput = document.getElementById("packNombre");
const packGroupKeyInput = document.getElementById("packGroupKey");
const packDescripcionInput = document.getElementById("packDescripcion");
const packDescripcionLargaInput = document.getElementById("packDescripcionLarga");
const packCapacidadInput = document.getElementById("packCapacidad");
const packPrecioBaseInput = document.getElementById("packPrecioBase");
const packActivaInput = document.getElementById("packActiva");
const packServiciosInput = document.getElementById("packServicios");

// Apartamento (docId) -> propertyId usado en reservas
const RESERVA_ID_ALIAS = {
  "atico-centro": "atico-jerez",
  // "rendona-1": "rendona-1",
  // "rendona-2": "rendona-2"
};
const reservasBody = document.getElementById("reservasBody");
const reservasBadge = document.getElementById("reservasBadge");
const reservaDetailBox = document.getElementById("reservaDetail");
const chatMessagesBox = document.getElementById("chatMessages");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");

const calTitle = document.getElementById("calTitle");
const calPrev = document.getElementById("calPrev");
const calNext = document.getElementById("calNext");
const calToday = document.getElementById("calToday");
const calGrid = document.getElementById("calGrid");
const calMonthLabel = document.getElementById("calMonthLabel");
const calInfo = document.getElementById("calInfo");
const calBlockBtn = document.getElementById("calBlockBtn");
const calUnblockBtn = document.getElementById("calUnblockBtn");

let currentUser = null;
let isAdmin = false;

let propertiesCache = [];
let packsCache = [];
let calReservasPropertyId = null; // id real usado en reservas/blocks

let reservasCache = [];
let reservasUnsubscribe = null;
let chatUnsubscribe = null;
let currentChatReservaId = null;
let firstReservasSnapshot = true;

let toastTimer = null;

function showSuccess(msg = "✅ Guardado correctamente.") {
  clearTimeout(toastTimer);
  if (!formMessage) return;
  formMessage.textContent = msg;
  formMessage.classList.remove("error-msg");
  formMessage.classList.add("info-msg");
  toastTimer = setTimeout(() => {
    formMessage.textContent = "";
  }, 2500);
}

function showError(msg = "❌ Ha ocurrido un error.") {
  clearTimeout(toastTimer);
  if (!formMessage) return;
  formMessage.textContent = msg;
  formMessage.classList.remove("info-msg");
  formMessage.classList.add("error-msg");
}

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;

    tabButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    tabContents.forEach((c) => c.classList.toggle("active", c.id === `tab-${tab}`));

    if (tab === "reservas") {
      const badge = document.getElementById("hostMsgBadge");
      if (badge) badge.style.display = "none";
    }
    moveCalendarTo(tab);
  });
});

function clearCalendarPreview() {
  calPreviewMap.clear();
  renderCalendar();
}

function buildPreviewFixed(start, end, price) {
  const map = new Map();
  for (const day of eachDayInclusive(start, end)) {
    map.set(isoDate(day), price);
  }
  return map;
}

function buildPreviewSeason(start, end, price, weekendsOnly) {
  const map = new Map();
  for (const day of eachDayInclusive(start, end)) {
    if (weekendsOnly) {
      const dow = day.getDay(); // 0 dom, 5 vie, 6 sab
      if (!(dow === 5 || dow === 6)) continue;
    }
    map.set(isoDate(day), price);
  }
  return map;
}

function previewFixedPriceUI({ start, end, price, base }) {
  const days = Math.floor((end - start) / (1000*60*60*24)) + 1;
  const diff = (price - base);
  return `Vista previa: ${days} noche(s) · ${price}€ / noche · base ${base}€ (${diff >= 0 ? "+" : ""}${diff}€)`;
}

function previewSeasonUI({ start, end, base, percent, finalPrice, count }) {
  return `Vista previa: ${count} noche(s) · base ${base}€ → ${finalPrice}€ (+${percent}%)`;
}

function updateFixedPreview() {
  const propertyId = spProperty?.value;
  const start = parseDateInput(spStart?.value);
  const end = parseDateInput(spEnd?.value);
  const price = Number(spPrice?.value);

  const prop = propertiesCache.find(p => p.id === propertyId);
  const base = Number(prop?.precioBase || 0);

  if (!propertyId || !start || !end || end < start || !Number.isFinite(price)) {
    calPreviewMap.clear();
    renderCalendar();
    setSpMsg("");
    return;
  }

  setSpMsg(previewFixedPriceUI({ start, end, price, base }));

  calPreviewMap = buildPreviewFixed(start, end, price);
  renderCalendar();
}

function updateSeasonPreview() {
  const propertyId = seasonProperty?.value;
  const start = parseDateInput(seasonStart?.value);
  const end = parseDateInput(seasonEnd?.value);
  const percent = Number(seasonPercent?.value);
  const weekendsOnly = !!seasonWeekendsOnly?.checked;

  const prop = propertiesCache.find(p => p.id === propertyId);
  const base = Number(prop?.precioBase || 0);

  if (!propertyId || !start || !end || end < start || !Number.isFinite(percent) || !base) {
    setSeasonMsg("");
    return;
  }

  const finalPrice = Math.round(base * (1 + percent / 100));

  const previewMap = buildPreviewSeason(start, end, finalPrice, weekendsOnly);
  setSeasonMsg(
    previewSeasonUI({
      start,
      end,
      base,
      percent,
      finalPrice,
      count: previewMap.size
    })
  );

  calPreviewMap = previewMap;
  renderCalendar();
}

auth.onAuthStateChanged(async (user) => {
  currentUser = user;

  if (!user) {
    isAdmin = false;
    showView("login");
    return;
  }

  userEmailSpan.textContent = user.email || "";

  const adminEmails = ["hugocalvogarcia123@gmail.com"];
  isAdmin = adminEmails.includes(user.email);

  if (!isAdmin) {
    showView("noAccess");
    return;
  }

  showView("main");

  // data
  await loadProperties();
  await loadPacks();
  initReservasListener();

  // Push (si lo tienes configurado)
  enableHostPush();
});

function showView(view) {
  if (loginView) loginView.style.display = view === "login" ? "flex" : "none";
  if (noAccessView) noAccessView.style.display = view === "noAccess" ? "flex" : "none";
  if (mainView) mainView.style.display = view === "main" ? "block" : "none";

  if (logoutBtn) logoutBtn.style.display = currentUser ? "inline-flex" : "none";
  if (userEmailSpan) userEmailSpan.textContent = currentUser?.email || "";
}

loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (loginError) loginError.textContent = "";

  const email = loginEmail.value.trim();
  const pass = loginPassword.value.trim();

  try {
    await auth.signInWithEmailAndPassword(email, pass);
  } catch (err) {
    console.error(err);
    if (loginError) loginError.textContent = "Error al iniciar sesión.";
  }
});

logoutBtn?.addEventListener("click", async () => {
  await auth.signOut();
});
noAccessLogoutBtn?.addEventListener("click", async () => {
  await auth.signOut();
});

let selectedPhotoFiles = [];
propertyPhotosInput?.addEventListener("change", () => {
  selectedPhotoFiles = Array.from(propertyPhotosInput.files || []);
  renderSelectedPhotoPreview();
});

function renderSelectedPhotoPreview() {
  if (!photoPreview) return;
  if (!selectedPhotoFiles.length) {
    photoPreview.innerHTML = "";
    return;
  }
  photoPreview.innerHTML = selectedPhotoFiles
    .map((f) => {
      const url = URL.createObjectURL(f);
      return `<div class="photo-item"><img src="${url}" alt="foto" /></div>`;
    })
    .join("");
}

async function loadProperties() {
  try {
    propertiesCache = await fetchProperties();
    renderPropertiesTable();
    fillPreciosSelects();

    // Calendario: estado inicial
    if (calInfo) calInfo.textContent = "Selecciona un alojamiento con “Editar” para ver su calendario.";
    if (calTitle) calTitle.textContent = "Calendario";
    renderCalendar();
  } catch (err) {
    console.error(err);
  }
}

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

const presetSummer = document.getElementById("presetSummer");
const presetXmas = document.getElementById("presetXmas");
const presetEaster = document.getElementById("presetEaster");

function setSpMsg(t) { if (spMsg) spMsg.textContent = t || ""; }
function setSeasonMsg(t) { if (seasonMsg) seasonMsg.textContent = t || ""; }

function moveCalendarTo(tab) {
  const calWrap = document.querySelector(".intranet-cal-wrap");
  const hostA = document.getElementById("alojamientosCalendarHost");
  const hostP = document.getElementById("preciosCalendarHost");

  if (!calWrap || !hostA || !hostP) return;

  if (tab === "precios") {
    hostP.appendChild(calWrap);

    // en precios: modo precio por defecto
    document.querySelector('input[name="calMode"][value="price"]')?.click();
    if (calInfo) calInfo.textContent = "Modo precios: usa preview por rango o click en un día.";
  }

  if (tab === "alojamientos") {
    hostA.appendChild(calWrap);
  }
}

function parseDateInput(v) {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d)) return null;
  d.setHours(0,0,0,0);
  return d;
}

function* eachDayInclusive(start, end) {
  const d = new Date(start);
  while (d <= end) {
    yield new Date(d);
    d.setDate(d.getDate() + 1);
  }
}

function getPropertyById(id) {
  return (propertiesCache || []).find(p => p.id === id) || null;
}

function fillPreciosSelects() {
  const options = (propertiesCache || [])
    .map(p => `<option value="${p.id}">${escapeHtml(p.nombre || p.id)}</option>`)
    .join("");

  if (spProperty) spProperty.innerHTML = options;
  if (seasonProperty) seasonProperty.innerHTML = options;

  updateBaseInfo();
}

function updateBaseInfo() {
  const p1 = getPropertyById(spProperty?.value);
  if (spBaseInfo) spBaseInfo.textContent = p1 ? `Precio base actual: ${Number(p1.precioBase||0).toFixed(0)}€` : "";

  const p2 = getPropertyById(seasonProperty?.value);
  if (seasonBaseInfo) seasonBaseInfo.textContent = p2 ? `Precio base actual: ${Number(p2.precioBase||0).toFixed(0)}€` : "";
}

const seasonBaseInfo = document.getElementById("seasonBaseInfo");

spProperty?.addEventListener("change", updateBaseInfo);
seasonProperty?.addEventListener("change", updateBaseInfo);

async function applyFixedPriceRange({ propertyId, start, end, price }) {
  const col = db.collection("apartamentos").doc(propertyId).collection("prices");

  let batch = db.batch();
  let ops = 0;

  for (const day of eachDayInclusive(start, end)) {
    const iso = isoDate(day);
    const ref = col.doc(iso);

    batch.set(ref, {
      dateISO: iso,
      price,
      updatedAt: serverTimestamp(),
      ruleType: "manual_fixed"
    }, { merge: true });

    ops++;
    if (ops >= 450) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }

  if (ops > 0) await batch.commit();
}

async function clearPriceOverridesRange({ propertyId, start, end }) {
  const col = db.collection("apartamentos").doc(propertyId).collection("prices");

  let batch = db.batch();
  let ops = 0;

  for (const day of eachDayInclusive(start, end)) {
    const iso = isoDate(day);
    const ref = col.doc(iso);

    batch.delete(ref);

    ops++;
    if (ops >= 450) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }

  if (ops > 0) await batch.commit();
}

function isWeekendES(d) {
  // viernes (5) o sábado (6) -> subimos esas noches
  const dow = d.getDay(); // 0 dom, 5 vie, 6 sáb
  return dow === 5 || dow === 6;
}

async function applySeasonPercentRange({ propertyId, start, end, percent, weekendsOnly, name }) {
  const prop = getPropertyById(propertyId);
  const base = Number(prop?.precioBase || 0);

  if (!base || base <= 0) {
    throw new Error("El alojamiento no tiene precioBase válido.");
  }

  const multiplier = 1 + (percent / 100);
  const col = db.collection("apartamentos").doc(propertyId).collection("prices");

  let batch = db.batch();
  let ops = 0;

  for (const day of eachDayInclusive(start, end)) {
    if (weekendsOnly && !isWeekendES(day)) continue;

    const iso = isoDate(day);
    const price = Math.round(base * multiplier);
    const ref = col.doc(iso);

    batch.set(ref, {
      dateISO: iso,
      price,
      updatedAt: serverTimestamp(),
      ruleType: "season_percent",
      ruleName: name || ""
    }, { merge: true });

    ops++;
    if (ops >= 450) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }

  if (ops > 0) await batch.commit();
}

spApplyBtn?.addEventListener("click", async () => {
  try {
    setSpMsg("");

    const propertyId = spProperty?.value;
    const start = parseDateInput(spStart?.value);
    const end = parseDateInput(spEnd?.value);
    const price = Number(spPrice?.value);

    if (!propertyId) return setSpMsg("Selecciona un alojamiento.");
    if (!start || !end) return setSpMsg("Selecciona fechas válidas.");
    if (end < start) return setSpMsg("El rango es incorrecto.");
    if (!Number.isFinite(price) || price < 0) return setSpMsg("Precio inválido.");

    spApplyBtn.disabled = true;
    spApplyBtn.textContent = "Aplicando…";

    await applyFixedPriceRange({ propertyId, start, end, price });
    setSpMsg("✅ Precio fijo aplicado al rango.");
    await ensureCalendarForSelectedProperty(propertyId);
    calPreviewMap.clear();
    renderCalendar();

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
    const start = parseDateInput(spStart?.value);
    const end = parseDateInput(spEnd?.value);

    if (!propertyId) return setSpMsg("Selecciona un alojamiento.");
    if (!start || !end) return setSpMsg("Selecciona fechas válidas.");
    if (end < start) return setSpMsg("El rango es incorrecto.");

    spClearBtn.disabled = true;
    spClearBtn.textContent = "Borrando…";

    await clearPriceOverridesRange({ propertyId, start, end });
    setSpMsg("✅ Overrides borrados. Vuelve a precioBase.");
    await ensureCalendarForSelectedProperty(propertyId);
    calPreviewMap.clear();
    renderCalendar();

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
    const start = parseDateInput(seasonStart?.value);
    const end = parseDateInput(seasonEnd?.value);
    const percent = Number(seasonPercent?.value);
    const weekendsOnly = !!seasonWeekendsOnly?.checked;
    const name = (seasonName?.value || "").trim();

    if (!propertyId) return setSeasonMsg("Selecciona un alojamiento.");
    if (!start || !end) return setSeasonMsg("Selecciona fechas válidas.");
    if (end < start) return setSeasonMsg("El rango es incorrecto.");
    if (!Number.isFinite(percent)) return setSeasonMsg("Porcentaje inválido.");

    seasonApplyBtn.disabled = true;
    seasonApplyBtn.textContent = "Aplicando…";

    await applySeasonPercentRange({ propertyId, start, end, percent, weekendsOnly, name });
    setSeasonMsg("✅ Temporada alta aplicada correctamente.");
    await ensureCalendarForSelectedProperty(propertyId);
    calPreviewMap.clear();
    renderCalendar();

  } catch (e) {
    console.error(e);
    setSeasonMsg(`❌ ${e?.message || "Error aplicando temporada."}`);
  } finally {
    seasonApplyBtn.disabled = false;
    seasonApplyBtn.textContent = "Aplicar temporada alta";
  }
});

function setPresetRange({ startISO, endISO, percent, name }) {
  if (seasonStart) seasonStart.value = startISO;
  if (seasonEnd) seasonEnd.value = endISO;
  if (seasonPercent) seasonPercent.value = String(percent);
  if (seasonName) seasonName.value = name;
}

presetSummer?.addEventListener("click", () => {
  const y = new Date().getFullYear();
  setPresetRange({
    startISO: `${y}-06-15`,
    endISO: `${y}-09-15`,
    percent: 20,
    name: `Verano ${y}`
  });
});

presetXmas?.addEventListener("click", () => {
  const y = new Date().getFullYear();
  setPresetRange({
    startISO: `${y}-12-20`,
    endISO: `${y+1}-01-07`,
    percent: 35,
    name: `Navidad ${y}/${y+1}`
  });
});

presetEaster?.addEventListener("click", () => {
  const y = new Date().getFullYear();
  // Semana Santa cambia cada año, así que te dejo un rango "tipo" y tú lo ajustas
  setPresetRange({
    startISO: `${y}-03-25`,
    endISO: `${y}-04-10`,
    percent: 25,
    name: `Semana Santa ${y}`
  });
});


function renderPropertiesTable() {
  if (!propertiesBody) return;

  if (!propertiesCache.length) {
    propertiesBody.innerHTML = `<tr><td colspan="7">No hay alojamientos todavía.</td></tr>`;
    return;
  }

  propertiesBody.innerHTML = propertiesCache
    .map((p) => {
      const precio = typeof p.precioBase === "number" ? `${p.precioBase.toFixed(0)} €` : "-";
      return `
        <tr>
          <td>${p.orden ?? ""}</td>
          <td>${p.nombre ?? ""}</td>
          <td>${p.ciudad ?? ""}</td>
          <td>${p.capacidad ?? ""}</td>
          <td>${precio}</td>
          <td>${p.activa ? "Sí" : "No"}</td>
          <td><button class="btn-secondary" data-edit-id="${p.id}">Editar</button></td>
        </tr>
      `;
    })
    .join("");

  propertiesBody.querySelectorAll("[data-edit-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      (async () => {
        try {
          const id = btn.getAttribute("data-edit-id");
          const prop = propertiesCache.find((p) => p.id === id);

          if (!prop) return;

          // 1) Rellenar formulario
          await fillFormWithProperty(prop);

        } catch (e) {
          console.error("🔥 Error al editar alojamiento:", e);
          const calInfo = document.getElementById("calInfo");
          if (calInfo) calInfo.textContent = `Error al cargar el alojamiento/calendario. Mira consola (F12).`;
        }
      })();
    });
  });
}

spProperty?.addEventListener("change", async () => {
  await ensureCalendarForSelectedProperty(spProperty.value);
  updateFixedPreview();
});
spStart?.addEventListener("input", updateFixedPreview);
spEnd?.addEventListener("input", updateFixedPreview);
spPrice?.addEventListener("input", updateFixedPreview);
seasonProperty?.addEventListener("change", async () => {
  await ensureCalendarForSelectedProperty(seasonProperty.value);
  updateSeasonPreview();
});

seasonStart?.addEventListener("input", updateSeasonPreview);
seasonEnd?.addEventListener("input", updateSeasonPreview);
seasonPercent?.addEventListener("input", updateSeasonPreview);
seasonWeekendsOnly?.addEventListener("change", updateSeasonPreview);

async function ensureCalendarForSelectedProperty(apartmentId) {
  if (!apartmentId) return;

  const prop = propertiesCache.find(p => p.id === apartmentId);
  if (!prop) return;

  const reservasId =
    (typeof RESERVA_ID_ALIAS !== "undefined" && RESERVA_ID_ALIAS[apartmentId])
      ? RESERVA_ID_ALIAS[apartmentId]
      : apartmentId;

  calCurrentMonth = monthStart(new Date());

  if (calInfo) calInfo.textContent = "Cargando calendario...";
  await loadCalendarDataForMonth(apartmentId, reservasId, Number(prop.precioBase || 0));
  renderCalendar();
  updateCalendarSummary();
}

document.getElementById("clearPreviewBtn")?.addEventListener("click", () => {
  clearCalendarPreview();
  setSpMsg("");
  setSeasonMsg("");
});

async function fillFormWithProperty(prop) {
  if (!prop) return;

  // FORM
  if (formTitle) formTitle.textContent = "Editar alojamiento";
  if (formMessage) formMessage.textContent = "";

  propertyIdInput.value = prop.id || "";

  nombreInput.value = prop.nombre ?? "";
  direccionInput.value = prop.direccion ?? "";
  ciudadInput.value = prop.ciudad ?? "";
  capacidadInput.value = prop.capacidad ?? "";
  dormitoriosInput.value = prop.dormitorios ?? "";
  banosInput.value = prop.banos ?? "";
  descripcionInput.value = prop.descripcion ?? "";
  descripcionLargaInput.value = prop.descripcionLarga ?? "";
  precioBaseInput.value = prop.precioBase ?? "";
  activaInput.checked = !!prop.activa;

  serviciosInput.value = Array.isArray(prop.servicios)
    ? prop.servicios.join(", ")
    : (prop.servicios ?? "");

  latInput.value = prop.lat ?? "";
  lngInput.value = prop.lng ?? "";
  taglineInput.value = prop.tagline ?? "";
  highlightsInput.value = Array.isArray(prop.highlights)
    ? prop.highlights.join("\n")
    : (prop.highlights ?? "");
  checkInTimeInput.value = prop.checkInTime ?? "";
  checkOutTimeInput.value = prop.checkOutTime ?? "";
  normasInput.value = prop.normas ?? "";

  // CALENDARIO
  const apartmentId = prop.id; // docId real (atico-centro, rendona-1...)
  const reservasId = (typeof RESERVA_ID_ALIAS !== "undefined" && RESERVA_ID_ALIAS[apartmentId])
    ? RESERVA_ID_ALIAS[apartmentId]
    : apartmentId;

  if (calTitle) calTitle.textContent = `Calendario · ${prop.nombre || apartmentId}`;

  calCurrentMonth = monthStart(new Date());
  selStart = null;
  selEnd = null;

  try {
    if (calInfo) calInfo.textContent = "Cargando calendario...";
    await loadCalendarDataForMonth(apartmentId, reservasId, Number(prop.precioBase || 0));
    renderCalendar();
    updateCalendarSummary();
  } catch (e) {
    console.error("🔥 Error cargando calendario:", e);
    renderCalendar(); // que al menos se vea el mes
    if (calInfo) calInfo.textContent = "No se pudo cargar el calendario por permisos o datos. Mira consola (F12).";
  }
}

function resetForm() {
  if (formTitle) formTitle.textContent = "Nuevo alojamiento";
  if (propertyIdInput) propertyIdInput.value = "";
  propertyForm?.reset();
  if (formMessage) formMessage.textContent = "";
  selectedPhotoFiles = [];
  renderSelectedPhotoPreview();
}

newPropertyBtn?.addEventListener("click", resetForm);
resetFormBtn?.addEventListener("click", resetForm);

propertyForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!isAdmin) return showError("No tienes permisos para guardar.");

  const submitBtn = propertyForm.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;

  try {
    const id = propertyIdInput.value.trim();

    const dataToSave = {
      nombre: nombreInput.value.trim(),
      direccion: direccionInput.value.trim(),
      ciudad: ciudadInput.value.trim(),
      capacidad: capacidadInput.value ? Number(capacidadInput.value) : null,
      dormitorios: dormitoriosInput.value ? Number(dormitoriosInput.value) : null,
      banos: banosInput.value ? Number(banosInput.value) : null,
      descripcion: descripcionInput.value.trim(),
      descripcionLarga: descripcionLargaInput.value.trim(),
      precioBase: precioBaseInput.value ? Number(precioBaseInput.value) : null,
      activa: activaInput.checked,
      servicios: serviciosInput.value.trim()
        ? serviciosInput.value.split(",").map((s) => s.trim()).filter(Boolean)
        : [],

      lat: latInput.value ? Number(latInput.value) : null,
      lng: lngInput.value ? Number(lngInput.value) : null,
      tagline: taglineInput.value.trim(),
      highlights: highlightsInput.value
        ? highlightsInput.value.split("\n").map((s) => s.trim()).filter(Boolean)
        : [],
      checkInTime: checkInTimeInput.value.trim(),
      checkOutTime: checkOutTimeInput.value.trim(),
      normas: normasInput.value.trim(),

      updatedAt: serverTimestamp(),
    };

    // orden
    let orden = null;
    if (id) {
      const existing = propertiesCache.find((p) => p.id === id);
      orden = existing?.orden ?? null;
    } else {
      const ordenes = propertiesCache.map((p) => (typeof p.orden === "number" ? p.orden : 0));
      orden = (ordenes.length ? Math.max(...ordenes) : 0) + 1;
    }
    dataToSave.orden = orden;

    const docRef = id ? db.collection("apartamentos").doc(id) : db.collection("apartamentos").doc();
    await docRef.set(dataToSave, { merge: true });

    await loadProperties();
    showSuccess("✅ Alojamiento guardado.");

  } catch (err) {
    console.error(err);
    showError(`Error guardando: ${err?.message || err}`);
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

async function loadPacks() {
  if (!packsBody) return;
  packsBody.innerHTML = `<tr><td colspan="7">Cargando...</td></tr>`;
  try {
    packsCache = await fetchPacks();
    renderPacksTable();
  } catch (err) {
    console.error(err);
    packsBody.innerHTML = `<tr><td colspan="7">Error al cargar.</td></tr>`;
  }
}

function renderPacksTable() {
  if (!packsBody) return;

  if (!packsCache.length) {
    packsBody.innerHTML = `<tr><td colspan="7">No hay packs todavía.</td></tr>`;
    return;
  }

  packsBody.innerHTML = packsCache
    .map((p) => {
      const precio = typeof p.precioBase === "number" ? `${p.precioBase.toFixed(0)} €` : "-";
      return `
        <tr>
          <td>${p.orden ?? ""}</td>
          <td>${p.nombre ?? ""}</td>
          <td>${p.groupKey ?? ""}</td>
          <td>${p.capacidadTotal ?? ""}</td>
          <td>${precio}</td>
          <td>${p.activa ? "Sí" : "No"}</td>
          <td><button class="btn-secondary" data-pack-edit-id="${p.id}">Editar</button></td>
        </tr>
      `;
    })
    .join("");

  packsBody.querySelectorAll("[data-pack-edit-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-pack-edit-id");
      const pack = packsCache.find((p) => p.id === id);
      if (pack) fillPackForm(pack);
    });
  });
}

function fillPackForm(pack) {
  if (!pack) return;
  packFormTitle.textContent = "Editar pack";
  packFormMessage.textContent = "";

  packIdInput.value = pack.id;
  packNombreInput.value = pack.nombre ?? "";
  packGroupKeyInput.value = pack.groupKey ?? "";
  packDescripcionInput.value = pack.descripcion ?? "";
  packDescripcionLargaInput.value = pack.descripcionLarga ?? "";
  packCapacidadInput.value = pack.capacidadTotal ?? "";
  packPrecioBaseInput.value = pack.precioBase ?? "";
  packActivaInput.checked = !!pack.activa;
  packServiciosInput.value = Array.isArray(pack.servicios) ? pack.servicios.join(", ") : "";
}

function resetPackForm() {
  packFormTitle.textContent = "Nuevo pack";
  packFormMessage.textContent = "";
  packIdInput.value = "";
  packForm?.reset();
}

newPackBtn?.addEventListener("click", resetPackForm);
resetPackFormBtn?.addEventListener("click", resetPackForm);

packForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!isAdmin) return;

  const id = packIdInput.value.trim();
  const dataToSave = {
    nombre: packNombreInput.value.trim(),
    groupKey: packGroupKeyInput.value.trim(),
    descripcion: packDescripcionInput.value.trim(),
    descripcionLarga: packDescripcionLargaInput.value.trim(),
    capacidadTotal: packCapacidadInput.value ? Number(packCapacidadInput.value) : null,
    precioBase: packPrecioBaseInput.value ? Number(packPrecioBaseInput.value) : null,
    activa: packActivaInput.checked,
    servicios: packServiciosInput.value.trim()
      ? packServiciosInput.value.split(",").map((s) => s.trim()).filter(Boolean)
      : [],
    updatedAt: serverTimestamp(),
  };

  if (!dataToSave.nombre) {
    packFormMessage.textContent = "El nombre es obligatorio.";
    return;
  }

  // orden
  let orden = null;
  if (id) {
    const existing = packsCache.find((p) => p.id === id);
    orden = existing?.orden ?? null;
  } else {
    const ordenes = packsCache.map((p) => (typeof p.orden === "number" ? p.orden : 0));
    orden = (ordenes.length ? Math.max(...ordenes) : 0) + 1;
  }
  dataToSave.orden = orden;

  try {
    const newId = await savePack(id || null, dataToSave);
    packFormMessage.textContent = "Guardado correctamente.";
    await loadPacks();
    if (!id) packIdInput.value = newId;
  } catch (err) {
    console.error(err);
    packFormMessage.textContent = "Error al guardar.";
  }
});

function initReservasListener() {
  if (!reservasBody) return;

  if (reservasUnsubscribe) reservasUnsubscribe();

  reservasBody.innerHTML = `<tr><td colspan="6">Cargando reservas...</td></tr>`;
  firstReservasSnapshot = true;

  reservasUnsubscribe = db
    .collection("reservas")
    .orderBy("createdAt", "desc")
    .limit(100)
    .onSnapshot(
      (snapshot) => {
        reservasCache = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        renderReservasTable(snapshot);
      },
      (err) => {
        console.error("Error cargando reservas", err);
        reservasBody.innerHTML = `<tr><td colspan="6">Error al cargar reservas.</td></tr>`;
      }
    );
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function goToReservasTab() {
  document.querySelector('.tab[data-tab="reservas"]')?.click();
}

function renderReservasTable(snapshot) {
  if (!reservasBody) return;

  if (!reservasCache.length) {
    reservasBody.innerHTML = `<tr><td colspan="6">No hay reservas todavía.</td></tr>`;
    return;
  }

  reservasBody.innerHTML = reservasCache
    .map((r) => {
      const total = r.totalPrice ? `${r.totalPrice} €` : r.totalPrice === 0 ? "0 €" : "-";
      const fecha = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString() : "";

      const nombre = (r.name || r.nombre || "").trim();
      const apell = (r.surname || "").trim();
      const huesped = (nombre || apell) ? `${nombre} ${apell}`.trim() : (r.email || "");

      return `
        <tr class="reserva-row" data-reserva-id="${r.id}">
          <td title="${fecha}">${fecha.split(",")[0] || ""}</td>
          <td>${r.propertyName || r.propertyId || ""}</td>
          <td>${huesped}</td>
          <td>${r.checkIn || ""}</td>
          <td>${r.checkOut || ""}</td>
          <td>${total}</td>
        </tr>
      `;
    })
    .join("");

  reservasBody.querySelectorAll(".reserva-row").forEach((row) => {
    row.addEventListener("click", () => {
      const id = row.getAttribute("data-reserva-id");
      const reserva = reservasCache.find((r) => r.id === id);
      if (reserva) selectReserva(reserva);
      hideReservasBadge();
    });
  });

  if (!firstReservasSnapshot && snapshot) {
    const hasNew = snapshot.docChanges().some((c) => c.type === "added" && !c.doc.metadata.hasPendingWrites);
    if (hasNew) showReservasBadge();
  }
  firstReservasSnapshot = false;
}

function showReservasBadge() {
  if (reservasBadge) reservasBadge.style.display = "inline-block";
}
function hideReservasBadge() {
  if (reservasBadge) reservasBadge.style.display = "none";
}

function selectReserva(r) {
  if (!reservaDetailBox) return;

  const total = r.totalPrice ? `${r.totalPrice} €` : r.totalPrice === 0 ? "0 €" : "-";

  reservaDetailBox.innerHTML = `
    <p><strong>Alojamiento:</strong> ${r.propertyName || r.propertyId || ""}</p>
    <p><strong>Reserva ID:</strong> ${r.reservaId || r.id}</p>
    <p><strong>Check-in:</strong> ${r.checkIn || ""}</p>
    <p><strong>Check-out:</strong> ${r.checkOut || ""}</p>
    <p><strong>Total:</strong> ${total}</p>
    ${r.observations ? `<p><strong>Observaciones:</strong> ${r.observations}</p>` : ""}
  `;

  openChatForReserva(r.reservaId || r.id);
}

function openChatForReserva(reservaId) {
  currentChatReservaId = reservaId;

  db.collection("chats").doc(currentChatReservaId).set({ unreadHost: 0 }, { merge: true }).catch(() => {});

  if (!chatMessagesBox) return;

  chatMessagesBox.innerHTML = `<p class="muted">Cargando chat...</p>`;

  if (chatUnsubscribe) chatUnsubscribe();

  chatUnsubscribe = subscribeToChat(
    reservaId,
    (mensajes) => {
      if (!mensajes.length) {
        chatMessagesBox.innerHTML = `<p class="muted">No hay mensajes aún.</p>`;
        return;
      }
      chatMessagesBox.innerHTML = mensajes
        .map((m) => {
          const sender = m.sender || "guest";
          const text = m.text || "";
          const date = m.createdAt?.toDate ? m.createdAt.toDate().toLocaleString() : "";
          return `
            <div class="chat-bubble ${sender === "host" ? "host" : "guest"}">
              <div>${text}</div>
              <div class="chat-meta">${sender === "host" ? "Tú" : "Huésped"} · ${date}</div>
            </div>
          `;
        })
        .join("");
      chatMessagesBox.scrollTop = chatMessagesBox.scrollHeight;
    },
    (err) => {
      console.error("Error en chat", err);
      chatMessagesBox.innerHTML = `<p class="muted">Error al cargar el chat.</p>`;
    }
  );
}

chatForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentChatReservaId || !isAdmin) return;

  const text = chatInput.value.trim();
  if (!text) return;

  try {
    const chatRef = db.collection("chats").doc(currentChatReservaId);
    const msgRef = chatRef.collection("mensajes").doc();

    const batch = db.batch();
    batch.set(msgRef, { text, sender: "host", createdAt: serverTimestamp() });
    batch.set(
      chatRef,
      { lastMessage: text, lastSender: "host", lastAt: serverTimestamp(), unreadGuest: increment(1) },
      { merge: true }
    );

    await batch.commit();
    chatInput.value = "";
  } catch (err) {
    console.error("Error enviando mensaje (host)", err);
  }
});

let calCurrentMonth = monthStart(new Date());
let calPropertyId = null;
let calPropertyName = "";
let calBasePrice = 0;

let selStart = null; // ISO "YYYY-MM-DD"
let selEnd = null;   // ISO exclusive "YYYY-MM-DD"

let calBusySet = new Set();   // días reservados (noches)
let calHoldSet = new Set();   // bloqueos internos (noches)
let calBlocks = [];           // docs de blocks
let calPriceMap = new Map();  // ISO -> price override (Number)
let calPreviewMap = new Map(); // ISO -> precio temporal de preview (NO guardado)
let calCheckInSet = new Set();
let calCheckOutSet = new Set();

let calCheckInMap = new Map();   // iso -> [{chatId, guest, raw}]
let calCheckOutMap = new Map();  // iso -> [{chatId, guest, raw}]

function pad2(n) { return String(n).padStart(2, "0"); }
function toISODate(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function monthStart(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function monthEnd(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }

function parseEsDateToISO(es) {
  // "dd/mm/aaaa" -> "yyyy-mm-dd"
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

function getMode() {
  const el = document.querySelector('input[name="calMode"]:checked');
  return el ? el.value : "block";
}

async function loadCalendarDataForMonth(apartmentId, reservasPropertyId, basePrice) {
  calPropertyId = apartmentId; // para precios: apartamentos/{apartmentId}/prices
  calReservasPropertyId = reservasPropertyId; // para reservas y bloqueos
  calBasePrice = Number(basePrice || 0);

  const ms = monthStart(calCurrentMonth);
  const me = monthEnd(calCurrentMonth);
  const rangeStart = toISODate(new Date(ms.getFullYear(), ms.getMonth(), 1));
  const rangeEndEx = toISODate(new Date(me.getFullYear(), me.getMonth(), me.getDate() + 1));

  // 1) Reservas
  calBusySet = new Set();
  calCheckInSet = new Set();
  calCheckOutSet = new Set();
  calCheckInMap = new Map();
  calCheckOutMap = new Map();


  const reservasSnap = await db
    .collection("reservas")
    .where("propertyId", "==", reservasPropertyId)
    .get();

  reservasSnap.docs.forEach((doc) => {
    const r = doc.data() || {};
    const ciISO = parseEsDateToISO(r.checkIn);   // dd/mm/aaaa -> ISO
    const coISO = parseEsDateToISO(r.checkOut);  // dd/mm/aaaa -> ISO
    if (!ciISO || !coISO) return;

    // IN/OUT (sets)
    calCheckInSet.add(ciISO);
    calCheckOutSet.add(coISO);

    // IN/OUT (maps con info + chatId)
    const chatId = r.reservaId || doc.id; // así coincide con tu chat
    const guest =
      (`${(r.name || r.nombre || "").trim()} ${(r.surname || "").trim()}`.trim())
      || (r.email || "Cliente");

    if (!calCheckInMap.has(ciISO)) calCheckInMap.set(ciISO, []);
    calCheckInMap.get(ciISO).push({ chatId, guest, raw: r });

    if (!calCheckOutMap.has(coISO)) calCheckOutMap.set(coISO, []);
    calCheckOutMap.get(coISO).push({ chatId, guest, raw: r });

    eachNightISO(ciISO, coISO).forEach((nightISO) => {
      if (nightISO >= rangeStart && nightISO < rangeEndEx) calBusySet.add(nightISO);
    });
  });

  // 2) Bloqueos internos (colección REAL: "bloqueos")
  calHoldSet = new Set();
  calBlocks = [];
  const bloqueosSnap = await db
    .collection("bloqueos")
    .where("propertyId", "==", reservasPropertyId)
    .get();

  bloqueosSnap.docs.forEach((doc) => {
    const b = { id: doc.id, ...(doc.data() || {}) };
    calBlocks.push(b);

    const s = b.startISO;
    const e = b.endISO;
    if (!s || !e) return;

    eachNightISO(s, e).forEach((nightISO) => {
      if (nightISO >= rangeStart && nightISO < rangeEndEx) calHoldSet.add(nightISO);
    });
  });

  // 3) Precios por día (subcolección)
  // ⚠️ si no has añadido reglas para /apartamentos/{aptoId}/prices/{dateId}, aquí te dará permisos
  calPriceMap = new Map();
  const pricesSnap = await db
    .collection("apartamentos")
    .doc(apartmentId)
    .collection("prices")
    .get();

  pricesSnap.docs.forEach((doc) => {
    const p = doc.data() || {};
    const dateISO = p.dateISO || doc.id;
    if (!dateISO) return;
    if (dateISO >= rangeStart && dateISO < rangeEndEx) {
      calPriceMap.set(dateISO, Number(p.price));
    }
  });
}


function renderCalendar() {
  if (!calGrid || !calMonthLabel) return;

  const ms = monthStart(calCurrentMonth);
  const me = monthEnd(calCurrentMonth);

  const monthName = ms.toLocaleString("es-ES", { month: "long", year: "numeric" });
  calMonthLabel.textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  const dayHeaders = ["L","M","X","J","V","S","D"]
    .map(d => `<div class="day-header">${d}</div>`)
    .join("");

  // lunes=0
  const first = new Date(ms);
  const startDow = (first.getDay() + 6) % 7;

  const gridDays = [];
  for (let i=0; i<startDow; i++) gridDays.push({ type:"empty" });

  for (let d=1; d<=me.getDate(); d++) {
    const date = new Date(ms.getFullYear(), ms.getMonth(), d);
    gridDays.push({ type:"day", date, iso: toISODate(date) });
  }

  while (gridDays.length % 7 !== 0) gridDays.push({ type:"empty" });

  const htmlDays = gridDays.map(item => {
    if (item.type === "empty") return `<div class="calendar-day other-month"></div>`;

    const iso = item.iso;
    const ins = calCheckInMap.get(iso) || [];
    const outs = calCheckOutMap.get(iso) || [];

    const isIN = ins.length > 0;
    const isOUT = outs.length > 0;
    const isTurnover = isIN && isOUT;

    const outTitle = isOUT ? `Salida / limpieza:\n- ${outs.map(x => x.guest).slice(0,3).join("\n- ")}${outs.length>3 ? `\n(+${outs.length-3} más)` : ""}` : "";
    const inTitle  = isIN  ? `Llegada:\n- ${ins.map(x => x.guest).slice(0,3).join("\n- ")}${ins.length>3 ? `\n(+${ins.length-3} más)` : ""}` : "";

    // OUT primero (🧹 a la izquierda) y luego IN (derecha)
    const badges = `
      ${isOUT ? `<button type="button" class="cal-badge out" data-badge="out" data-iso="${iso}" title="${escapeHtml(outTitle)}">🧹${outs.length>1 ? `×${outs.length}` : ""}</button>` : ``}
      ${isIN ? `<button type="button" class="cal-badge in" data-badge="in" data-iso="${iso}" title="${escapeHtml(inTitle)}">IN${ins.length>1 ? `×${ins.length}` : ""}</button>` : ``}
    `;

    // Si todavía NO hay alojamiento seleccionado, pintamos el mes “deshabilitado”
    if (!calPropertyId) {
      return `
        <div class="calendar-day disabled available" data-iso="${iso}">
          <div>${item.date.getDate()}</div>
          ${badges}
          <div class="cal-price">—</div>
        </div>
      `;
    }

    const isBusy = calBusySet.has(iso);
    const isHold = calHoldSet.has(iso);
    const isSelected =
      (selStart && iso === selStart) ||
      (selStart && selEnd && iso >= selStart && iso < selEnd);

    const isPreview = calPreviewMap.has(iso);
    const isSpecial = calPriceMap.has(iso);

    const price = isPreview
      ? calPreviewMap.get(iso)
      : (isSpecial ? calPriceMap.get(iso) : calBasePrice);

    const cls = [
      "calendar-day",
      isBusy ? "occupied" : (isHold ? "hold" : "available"),
      isSelected ? "selected" : "",
      isTurnover ? "turnover" : "",
      isSpecial ? "special" : "",
      isPreview ? "preview" : ""
    ].join(" ").trim();

    return `
      <div class="${cls}" data-iso="${iso}">
        <div>${item.date.getDate()}</div>
        ${badges}
        <div class="cal-price">${Number(price || 0).toFixed(0)}€</div>
      </div>
    `;
  }).join("");

  calGrid.innerHTML = dayHeaders + htmlDays;

  calGrid.querySelectorAll("[data-iso]").forEach(el => {
    el.addEventListener("click", () => onCalendarDayClick(el.getAttribute("data-iso")));
  });
  calGrid.querySelectorAll(".cal-badge[data-badge]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const iso = btn.getAttribute("data-iso");
      const type = btn.getAttribute("data-badge"); // "in" o "out"

      const list = (type === "out" ? (calCheckOutMap.get(iso) || []) : (calCheckInMap.get(iso) || []));
      if (!list.length) return;

      // si hay 1, abre directo. si hay varias, que elija
      let chosen = list[0];
      if (list.length > 1) {
        const msg =
          `Hay ${list.length} ${type === "out" ? "salidas" : "llegadas"} el ${iso}:\n\n` +
          list.map((x, i) => `${i+1}) ${x.guest}`).join("\n") +
          `\n\nEscribe el número para abrir el chat:`;

        const pick = prompt(msg, "1");
        const idx = Number(pick);
        if (!Number.isFinite(idx) || idx < 1 || idx > list.length) return;
        chosen = list[idx - 1];
      }

      // abrir chat
      goToReservasTab();
      openChatForReserva(chosen.chatId);
    });
  });
}

function updateCalendarSummary() {
  if (!calInfo) return;

  const reserved = calBusySet.size;
  const hold = calHoldSet.size;

  calInfo.textContent =
    `Mes cargado. Reservado: ${reserved} noches · Bloqueo interno: ${hold} noches · Precio base: ${Number(calBasePrice||0).toFixed(0)}€.\n` +
    `Modo “Bloquear”: selecciona inicio y fin. Modo “Precio”: clic en un día para cambiarlo.`;
}

async function onCalendarDayClick(iso) {
  if (!calPropertyId) {
    if (calInfo) calInfo.textContent = "Selecciona un alojamiento con “Editar”.";
    return;
  }

  // Reservas reales: solo lectura
  if (calBusySet.has(iso)) {
    if (calInfo) calInfo.textContent = `📌 ${iso} está reservado (cliente).`;
    return;
  }

  const mode = getMode();

  if (mode === "price") {
    const current = calPriceMap.has(iso) ? calPriceMap.get(iso) : calBasePrice;
    const val = prompt(`Precio para la noche ${iso} (€).\nVacío = volver a precio base (${calBasePrice}€).`, String(current ?? ""));
    if (val === null) return;

    const trimmed = String(val).trim();

    // ⚠️ Guardamos en apartamentos/{propertyId}/prices/{iso}
    // Si tus apartamentos no usan docId=propertyId, dímelo y lo apunto a otro sitio.
    const priceDoc = db.collection("apartamentos").doc(calPropertyId).collection("prices").doc(iso);

    if (!trimmed) {
      await priceDoc.delete().catch(() => {});
      calPriceMap.delete(iso);
      if (calInfo) calInfo.textContent = `✅ ${iso}: vuelve a precio base (${calBasePrice}€).`;
    } else {
      const num = Number(trimmed);
      if (!Number.isFinite(num) || num < 0) {
        if (calInfo) calInfo.textContent = "❌ Precio inválido.";
        return;
      }
      await priceDoc.set({ dateISO: iso, price: num, updatedAt: serverTimestamp() }, { merge: true });
      calPriceMap.set(iso, num);
      if (calInfo) calInfo.textContent = `✅ ${iso}: precio ${num}€ guardado.`;
    }

    renderCalendar();
    return;
  }

  // No permitimos seleccionar días que ya estén en hold para crear rango (los puedes liberar)
  if (calHoldSet.has(iso)) {
    if (calInfo) calInfo.textContent = `📌 ${iso} ya está bloqueado internamente. (Puedes “Liberar bloqueos”)`;
    return;
  }

  if (!selStart) {
    selStart = iso;
    selEnd = null;
    if (calInfo) calInfo.textContent = `Inicio: ${selStart}. Elige el último día (clic) para bloquear.`;
    renderCalendar();
    return;
  }

  if (iso <= selStart) {
    selStart = iso;
    selEnd = null;
    if (calInfo) calInfo.textContent = `Inicio: ${selStart}. Elige el último día (clic) para bloquear.`;
    renderCalendar();
    return;
  }

  selEnd = iso;

  // validar conflictos
  const nights = eachNightISO(selStart, selEnd);
  const hasConflict = nights.some((d) => calBusySet.has(d) || calHoldSet.has(d));
  if (hasConflict) {
    selStart = null;
    selEnd = null;
    if (calInfo) calInfo.textContent = "❌ El rango incluye días reservados o ya bloqueados.";
    renderCalendar();
    return;
  }

  if (calInfo) calInfo.textContent = `Rango seleccionado: ${selStart} → ${selEnd} (checkout). Pulsa “Bloquear rango”.`;
  renderCalendar();
}

calBlockBtn?.addEventListener("click", async () => {
  if (!calPropertyId) return;

  if (!selStart || !selEnd) {
    if (calInfo) calInfo.textContent = "Selecciona primero un rango (inicio + fin).";
    return;
  }

  const note = prompt("Nota para el bloqueo (opcional):", "Reserva interna / mantenimiento");
  await db.collection("bloqueos").add({
    propertyId: calReservasPropertyId,
    startISO: selStart,
    endISO: selEnd,
    note: (note || "").trim(),
    createdAt: serverTimestamp(),
    createdBy: auth.currentUser?.uid || null,
  });

  selStart = null;
  selEnd = null;

  if (calInfo) calInfo.textContent = "✅ Bloqueo creado.";
  await loadCalendarDataForMonth(calPropertyId, calReservasPropertyId, calBasePrice);
  renderCalendar();
});

calUnblockBtn?.addEventListener("click", async () => {
  if (!calPropertyId) return;

  const ok = confirm("¿Eliminar TODOS los bloqueos internos de este alojamiento que caen en el mes visible?");
  if (!ok) return;

  const ms = toISODate(monthStart(calCurrentMonth));
  const me = toISODate(new Date(monthEnd(calCurrentMonth).getFullYear(), monthEnd(calCurrentMonth).getMonth(), monthEnd(calCurrentMonth).getDate() + 1));

  const toDelete = calBlocks.filter((b) => {
    const s = b.startISO || "";
    const e = b.endISO || "";
    return s < me && e > ms; // intersección
  });

  await Promise.allSettled(toDelete.map((b) => db.collection("bloqueos").doc(b.id).delete()));
  if (calInfo) calInfo.textContent = `✅ Bloqueos eliminados (${toDelete.length}).`;

  await loadCalendarDataForMonth(calPropertyId, calReservasPropertyId, calBasePrice);
  renderCalendar();
  updateCalendarSummary();
});

calPrev?.addEventListener("click", async () => {
  calCurrentMonth = monthStart(new Date(calCurrentMonth.getFullYear(), calCurrentMonth.getMonth() - 1, 1));
  if (!calPropertyId) return;
  await loadCalendarDataForMonth(calPropertyId, calReservasPropertyId, calBasePrice);
  renderCalendar();
  updateCalendarSummary();
});

calNext?.addEventListener("click", async () => {
  calCurrentMonth = monthStart(new Date(calCurrentMonth.getFullYear(), calCurrentMonth.getMonth() + 1, 1));
  if (!calPropertyId) return;
  await loadCalendarDataForMonth(calPropertyId, calReservasPropertyId, calBasePrice);
  renderCalendar();
  updateCalendarSummary();
});

calToday?.addEventListener("click", async () => {
  calCurrentMonth = monthStart(new Date());
  if (!calPropertyId) return;
  await loadCalendarDataForMonth(calPropertyId, calReservasPropertyId, calBasePrice);
  renderCalendar();
  updateCalendarSummary();
});

const VAPID_KEY =
  "BKJkrLtN0dRnBJ7T68UVHYpYIBncqlubfKPXxvfpa2gw4YOeAIZIWXM2yiziu54lxrhtPj8Zl5tzvXl3is7sHic";

async function enableHostPush() {
  try {
    if (!("serviceWorker" in navigator)) return;
    if (!("Notification" in window)) return;

    if (!VAPID_KEY || VAPID_KEY.length < 60) return;

    const swReg = await navigator.serviceWorker.register("./service-worker.js");
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return;

    const messaging = window.firebase.messaging();
    const token = await messaging.getToken({
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });

    if (!token || !auth.currentUser) return;

    await db.collection("deviceTokens").doc(token).set(
      {
        token,
        uid: auth.currentUser.uid,
        role: "host",
        updatedAt: serverTimestamp(),
        userAgent: navigator.userAgent,
      },
      { merge: true }
    );
  } catch (e) {
    console.warn("Push desactivado:", e);
  }
}
