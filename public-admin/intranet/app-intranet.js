import { auth, db, storage, serverTimestamp, increment, messaging } from "../shared/firebase.js";

import { fetchProperties } from "./properties-service-intranet.js";
import { fetchPacks, savePack } from "./packs-service.js";

import {
  subscribeToReservas,
  subscribeToChat,
  startReservasIndexOnce,
  stopReservasIndex,
  subscribeToReservasForPropertyMonth,
} from "./reservas-service-intranet.js";

import {
  startChatsIndexOnce,
  subscribeToChatsIndex,
  getTotalUnreadHost,
  stopChatsIndex,
} from "./chats-service-intranet.js";

import { createCalendarAdmin } from "./modules/calendar-admin.js";
import { createPriceCalendar } from "./modules/price-calendar.js";
import { createPropertiesUI } from "./modules/properties-ui.js";
import { createPacksUI } from "./modules/packs-ui.js";
import { createPackCalendar } from "./modules/pack-calendar.js";
import { createChatUI } from "./modules/chat-ui.js";
import { createReservasUI } from "./modules/reservas-ui.js";
import { createSpecialPricesUI } from "./modules/special-prices.js";
import { createDashboardUI } from "./modules/dashboard-ui.js";
import { createComentariosUI } from "./modules/comentarios-ui.js";
import { createGananciasUI } from "./modules/ganancias-ui.js";
import { start as startRegistroViajeros } from "./modules/registro-viajeros-ui.js";

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

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Mapea id apartamento -> propertyId real usado en reservas/bloqueos
const RESERVA_ID_ALIAS = {};
function resolveReservasId(apartmentId) {
  return RESERVA_ID_ALIAS[apartmentId] || apartmentId;
}

function showView(view) {
  if (loginView) loginView.style.display = view === "login" ? "flex" : "none";
  if (noAccessView) noAccessView.style.display = view === "noAccess" ? "flex" : "none";
  if (mainView) mainView.style.display = view === "main" ? "block" : "none";

  if (logoutBtn) logoutBtn.style.display = view === "main" ? "inline-flex" : "none";
  if (userEmailSpan) userEmailSpan.textContent = auth.currentUser?.email || "";
}

const tabButtons = Array.from(document.querySelectorAll(".tab"));
const tabContents = Array.from(document.querySelectorAll(".tab-content"));

function setActiveTabDOM(tab) {
  tabButtons.forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  tabContents.forEach((c) => c.classList.toggle("active", c.id === `tab-${tab}`));

  // NO reseteamos/ocultamos el badge de no-leídos al entrar en "Reservas":
  // el aviso debe seguir hasta que se ABRA el chat de cada reserva (eso sí
  // resetea unreadHost:0, y solo el de esa reserva, en chat-ui.openChatForReserva).
  // El badge lo controla getTotalUnreadHost sobre los chats en tiempo real.
}

function getRoute() {
  return (location.hash || "").replace("#", "").trim() || "dashboard";
}

function setHashRoute(route) {
  if (location.hash === `#${route}`) return false;
  location.hash = route;
  return true;
}

function createHashRouter({ onStartRoute, onStopRoute }) {
  let current = null;

  function navigate(route) {
    const next = route || getRoute();
    if (!next) return;

    if (current && current !== next) onStopRoute?.(current);

    setActiveTabDOM(next);
    onStartRoute?.(next);

    current = next;
  }

  function init() {
    window.addEventListener("hashchange", () => navigate(getRoute()));
    navigate(getRoute());
  }

  function destroy() {
    if (current) onStopRoute?.(current);
    current = null;
  }

  return { init, navigate, destroy };
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

logoutBtn?.addEventListener("click", async () => auth.signOut());
noAccessLogoutBtn?.addEventListener("click", async () => auth.signOut());

const chatUI = createChatUI({
  auth,
  db,
  serverTimestamp,
  increment,
  subscribeToChat,
  escapeHtml,
});

const goToReservasTab = () => {
  const changed = setHashRoute("reservas");
  if (!changed) router.navigate("reservas");
};

const calendarAdmin = createCalendarAdmin({
  auth,
  db,
  serverTimestamp,
  escapeHtml,
  goToReservasTab,
  openChatForReserva: (reservaId) => chatUI.openChatForReserva(reservaId),
  subscribeToReservasForPropertyMonth,
});

const priceCalendar = createPriceCalendar({ db, serverTimestamp, escapeHtml });

let pcalBtnsInited = false;
function initPriceCalendarButtonsOnce() {
  if (pcalBtnsInited) return;
  pcalBtnsInited = true;

  document.getElementById("pcalSaveSelBtn")?.addEventListener("click", () => priceCalendar.persistSelection?.());
  document.getElementById("pcalRestoreSelBtn")?.addEventListener("click", () => priceCalendar.restoreSelection?.());
  document.getElementById("pcalClearSavedSelBtn")?.addEventListener("click", () => priceCalendar.clearSavedSelection?.());
  document.getElementById("pcalClearSelBtn")?.addEventListener("click", () => priceCalendar.clearSelection?.());
}

const packCalendar = createPackCalendar({
  db,
  escapeHtml,
  goToReservasTab,
  openChatForReserva: (reservaId) => chatUI.openChatForReserva(reservaId),
});

const packsUI = createPacksUI({
  db,
  storage,
  serverTimestamp,
  fetchPacks,
  savePack,
  packCalendar,
  getPropertiesCache: () => propertiesUI?.getPropertiesCache?.() || [],
});

let propertiesUI = null;
let specialPricesUI = null;

propertiesUI = createPropertiesUI({
  auth,
  db,
  storage,
  serverTimestamp,
  fetchProperties,
  escapeHtml,
  calendarAdmin,
  priceCalendar,
  resolveReservasId,
  onPropertiesLoaded: (cache) => {
    specialPricesUI?.refreshProperties?.(cache);
  },
});

specialPricesUI = createSpecialPricesUI({
  db,
  serverTimestamp,
  escapeHtml,
  priceCalendar,
  resolveReservasId,
  getPropertiesCache: () => propertiesUI?.getPropertiesCache?.() || [],
});

const reservasUI = createReservasUI({
  db,
  serverTimestamp,
  escapeHtml,
  chatUI,
  calendarAdmin,
  subscribeToReservas,
  subscribeToChatsIndex,
});

const dashboardUI = createDashboardUI({
  db,
  escapeHtml,
  getPropertiesCache: () => propertiesUI?.getPropertiesCache?.() || [],
});

const comentariosUI = createComentariosUI({
  db,
  serverTimestamp,
  escapeHtml,
  getPropertiesCache: () => propertiesUI?.getPropertiesCache?.() || [],
});

const gananciasUI = createGananciasUI({
  db,
  escapeHtml,
  getPropertiesCache: () => propertiesUI?.getPropertiesCache?.() || [],
  resolveReservasId,
});

let mountedOnce = false;
function ensureMountedOnce() {
  if (mountedOnce) return;
  mountedOnce = true;
  comentariosUI.mount?.();
  gananciasUI.mount?.();
}

let propertiesLoadedOnce = false;
async function ensurePropertiesLoaded() {
  const cache = propertiesUI?.getPropertiesCache?.() || [];
  if (cache.length) return cache;

  if (!propertiesLoadedOnce) {
    propertiesLoadedOnce = true;
    await propertiesUI.loadProperties?.();
  }
  return propertiesUI?.getPropertiesCache?.() || [];
}

let packsLoadedOnce = false;
async function ensurePacksLoaded() {
  if (packsLoadedOnce) return;
  packsLoadedOnce = true;
  await packsUI.loadPacks?.();
}

let badgeUnsub = null;

function startBadgeOnce() {
  const badge = document.getElementById("hostMsgBadge");
  if (!badge) return;
  if (badgeUnsub) return;

  badgeUnsub = subscribeToChatsIndex(() => {
    const total = getTotalUnreadHost();
    if (total > 0) {
      badge.textContent = String(total);
      badge.style.display = "inline-flex";
    } else {
      badge.style.display = "none";
    }
  });
}

function stopBadge() {
  if (badgeUnsub) {
    badgeUnsub();
    badgeUnsub = null;
  }
}

let dropdownsInited = false;
function initBookingDropdownsOnce() {
  if (dropdownsInited) return;
  dropdownsInited = true;

  const dropdowns = Array.from(document.querySelectorAll(".bk-dropdown"));

  dropdowns.forEach((dd) => {
    const btn = dd.querySelector(".bk-dropbtn");
    const menu = dd.querySelector(".bk-dropmenu");
    if (!btn || !menu) return;

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropdowns.forEach((x) => x !== dd && x.classList.remove("is-open"));
      dd.classList.toggle("is-open");
    });

    menu.querySelectorAll("button.tab").forEach((b) => {
      b.addEventListener("click", () => dd.classList.remove("is-open"));
    });
  });

  document.addEventListener("click", () => dropdowns.forEach((dd) => dd.classList.remove("is-open")));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") dropdowns.forEach((dd) => dd.classList.remove("is-open"));
  });
}

let navInited = false;
function initNavOnce() {
  if (navInited) return;
  navInited = true;

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      if (!tab) return;
      const changed = setHashRoute(tab);
      if (!changed) router.navigate(tab);
    });
  });

  document.getElementById("navNewBtn")?.addEventListener("click", () => {
    alert("✅ 'Nuevo' preparado. Aquí podrás añadir accesos rápidos (nuevo alojamiento, nuevo pack, etc).");
  });
}

let swRegistered = false;
let swReloading  = false;

async function registerSWOnce() {
  try {
    if (swRegistered) return;
    if (!("serviceWorker" in navigator)) return;

    const registration = await navigator.serviceWorker.register("./service-worker.js");
    swRegistered = true;

    // Comprobar actualización en cada carga
    registration.update().catch(() => {});

    // Detectar nuevo SW instalándose → recargar cuando esté listo
    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (!newWorker) return;
      newWorker.addEventListener("statechange", () => {
        if (
          newWorker.state === "installed" &&
          navigator.serviceWorker.controller
        ) {
          console.log("[SW] Nueva versión disponible, recargando…");
          if (!swReloading) { swReloading = true; window.location.reload(); }
        }
      });
    });

    // Si el SW tomó control de golpe (tras skipWaiting), recargar una sola vez
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!swReloading) { swReloading = true; window.location.reload(); }
    });

  } catch (e) {
    console.warn("SW no registrado:", e);
  }
}

const VAPID_KEY =
  "BKJkrLtN0dRnBJ7T68UVHYpYIBncqlubfKPXxvfpa2gw4YOeAIZIWXM2yiziu54lxrhtPj8Zl5tzvXl3is7sHic";

async function enableHostPush() {
  try {
    if (!("serviceWorker" in navigator) || !("Notification" in window) || !messaging) return;
    if (Notification.permission === "denied") return;

    const perm =
      Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
    if (perm !== "granted") return;

    const swReg = await navigator.serviceWorker.ready;
    const token = await messaging.getToken({
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });
    if (!token || !auth.currentUser) return;

    await db.collection("deviceTokens").doc(token).set(
      {
        token,
        userId: auth.currentUser.uid,
        role: "host",
        updatedAt: serverTimestamp(),
        userAgent: navigator.userAgent,
      },
      { merge: true }
    );
  } catch (e) {
    console.warn("Push no disponible:", e);
  }
}

async function onStartRoute(route) {
  if (route === "dashboard") {
    await ensurePropertiesLoaded(); // para filtros/nombres del dashboard
    ensureMountedOnce();
    dashboardUI.start?.({ subscribeToReservas, subscribeToChatsIndex });
    return;
  }

  if (route === "reservas") {
    reservasUI.start?.();
    return;
  }

  if (route === "alojamientos") {
    await propertiesUI.start?.(); // start() ya hace load-on-demand si cache vacía
    ensureMountedOnce();
    return;
  }

  if (route === "packs") {
    await ensurePacksLoaded();
    packsUI.start?.(); // si existe; si no, no pasa nada
    return;
  }

  if (route === "registroViajeros") {
    await startRegistroViajeros();
    return;
  }
}

function onStopRoute(route) {
  if (route === "dashboard") dashboardUI.stop?.();
  if (route === "reservas") reservasUI.stop?.();
  if (route === "alojamientos") propertiesUI.stop?.();
  if (route === "packs") packsUI.stop?.();
}

const router = createHashRouter({ onStartRoute, onStopRoute });

let lastBootUid = null;

function cleanupSession() {
  router.destroy?.();

  dashboardUI.destroy?.();
  reservasUI.destroy?.();
  chatUI.destroy?.();
  propertiesUI.destroy?.();

  packsUI.destroy?.();

  stopBadge();

  stopChatsIndex?.();
  stopReservasIndex?.();

  lastBootUid = null;
}

auth.onAuthStateChanged(async (user) => {
  if (!user) {
    cleanupSession();
    showView("login");
    return;
  }

  if (userEmailSpan) userEmailSpan.textContent = user.email || "";

  const adminEmails = ["hugocalvogarcia123@gmail.com"];
  const isAdmin = adminEmails.includes(user.email);

  if (!isAdmin) {
    cleanupSession();
    showView("noAccess");
    return;
  }

  showView("main");

  if (lastBootUid === user.uid) return;
  lastBootUid = user.uid;

  initNavOnce();
  initBookingDropdownsOnce();
  initPriceCalendarButtonsOnce();

  // Stores globales (1 listener real)
  startReservasIndexOnce?.({ limit: 100 });
  startChatsIndexOnce?.({ limit: 250 });

  startBadgeOnce();

  router.init();

  registerSWOnce();
  enableHostPush();
});