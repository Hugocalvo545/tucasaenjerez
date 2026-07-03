// perfil/app.js
import { auth, db } from "../shared/firebase.js";
import { state } from "../shared/state.js";
import { initPlacesProfile, setupAddressAutocomplete } from "../shared/places.js";
import { populateCountrySelect } from "../shared/countries.js";

// Auth (login / tabs / pasos)
import { initAuth, switchTab, regNextStep, regPrevStep } from "./auth.js";

// Perfil (datos usuario / nivel / puntos)
import {
  displayUserProfile,
  showProfileScreen as showProfileScreenFromProfile,
  calculateLevel,
  getUserLevel,
  getDiscountForLevel,
  updateLevelDisplay,
  updatePointsDisplay,
  openProfileEdit,
  closeProfileEdit,
  saveProfileEdit,
} from "./profile.js";

// Perfil (reservas)
import {
  loadBookingsHistory,
  openBookingDetails,
  closeBookingDetails,
  toggleBookingsVisibility,
  filterBookings,
  downloadInvoiceByIndex,
  cancelBookingByIndex,
  confirmCancelBooking,
} from "./bookings-perfil.js";

// Perfil (huéspedes frecuentes)
import {
  openAddGuestModal,
  closeAddGuestModal,
  openSelectFrequentGuestModal,
  closeSelectGuestModal,
  selectAndFillGuest,
  deleteFrequentGuest,
  loadFrequentGuests,
} from "./guests-perfil.js";

// Datos usuario
async function loadUserData() {
  if (!state.currentUser) return;

  try {
    const docSnap = await db.collection("usuarios").doc(state.currentUser.uid).get();

    if (docSnap.exists) {
      state.userData = docSnap.data() || {};
      state.userPoints = state.userData.points || 0;
      const levelInfo = calculateLevel(state.userPoints);
      state.currentLevel = levelInfo.level;
      state.currentDiscount = levelInfo.discount;
    } else {
      state.userData = { email: state.currentUser.email };
      state.userPoints = 0;
      state.currentLevel = 1;
      state.currentDiscount = 0;
    }

    displayUserProfile();
    updateLevelDisplay();
    updatePointsDisplay();

    await loadBookingsHistory();
  } catch (err) {
    console.error("Error loadUserData:", err);
  }
}

// Sesión
async function logout() {
  await deleteHoldFromSessionStorage();
  await auth.signOut();
  state.currentUser = null;
  state.userData = {};
  state.userPoints = 0;
  state.currentLevel = 1;
  state.currentDiscount = 0;

  const login = document.getElementById("loginScreen");
  const profile = document.getElementById("profileScreen");

  if (login) login.classList.add("active");
  if (profile) profile.classList.remove("active");
}

// Navegación
function goToMulti() {
  const redirectBack = encodeURIComponent("../perfil/index-usuario.html");
  window.location.href = `../multi/index.html?redirect=${redirectBack}`;
}

function getBackUrl() {
  const params = new URLSearchParams(window.location.search);

  const back = params.get("back") || params.get("from") || params.get("redirectBack");
  if (back) return decodeURIComponent(back);

  const stored = sessionStorage.getItem("perfil_back_url");
  if (stored) return stored;

  if (document.referrer && document.referrer !== window.location.href) return document.referrer;

  return null;
}

function setupBackButton() {
  const btn = document.getElementById("btnBackOrigin");
  if (!btn) return;

  const backUrl = getBackUrl();

  if (!backUrl) {
    btn.style.display = "none";
    return;
  }

  sessionStorage.setItem("perfil_back_url", backUrl);

  btn.style.display = "inline-flex";
  btn.addEventListener("click", () => {
    window.location.href = backUrl;
  });
}

async function deleteHoldFromSessionStorage() {
  let raw = null;
  try { raw = sessionStorage.getItem('activeHoldId'); } catch (_) {}
  if (!raw) return;

  const ids = String(raw).split(',').map(s => s.trim()).filter(Boolean);
  if (!ids.length) return;

  try {
    const batch = db.batch();
    ids.forEach(id => batch.delete(db.collection('holds').doc(id)));
    await batch.commit();
  } catch (e) {
    console.warn("No se pudo borrar hold (logout):", e);
  }

  try { sessionStorage.removeItem('activeHoldId'); } catch (_) {}
}

// Rellena los selects de País y Nacionalidad del registro con la lista completa
// de países (ISO 3166-1) desde el array reutilizable compartido.
function populateRegistroCountrySelects() {
  populateCountrySelect(document.getElementById("nationality"));
  populateCountrySelect(document.getElementById("country"));
}

// DOM ready
document.addEventListener("DOMContentLoaded", async () => {
  populateRegistroCountrySelects();

  // Deep-link "Regístrate" (…/index-usuario.html#register): abrir la vista de
  // CREAR CUENTA (paso 1) en vez de quedarse en la pestaña de login.
  if (window.location.hash === "#register") {
    switchTab("register");
  }

  initAuth(async () => {
    await loadUserData();
    showProfileScreenFromProfile();

    try {
      await initPlacesProfile();
    } catch (_) {}

    await setupAddressAutocomplete();
    setupBackButton();
  });
});

// Window (auth)
window.switchTab = switchTab;
window.regNextStep = regNextStep;
window.regPrevStep = regPrevStep;

// Window (sesión / navegación)
window.logout = logout;
window.goToMulti = goToMulti;

// Window (perfil: reservas)
window.loadBookingsHistory = loadBookingsHistory;
window.openBookingDetails = openBookingDetails;
window.toggleBookingsVisibility = toggleBookingsVisibility;
window.closeBookingDetails = closeBookingDetails;
window.filterBookings = filterBookings;
window.downloadInvoiceByIndex = downloadInvoiceByIndex;
window.cancelBookingByIndex = cancelBookingByIndex;
window.confirmCancelBooking = confirmCancelBooking;

// Window (perfil: edición de datos)
window.openProfileEdit = openProfileEdit;
window.closeProfileEdit = closeProfileEdit;
window.saveProfileEdit = saveProfileEdit;

// Window (perfil: huéspedes frecuentes)
window.openAddGuestModal = openAddGuestModal;
window.closeAddGuestModal = closeAddGuestModal;
window.openSelectFrequentGuestModal = openSelectFrequentGuestModal;
window.closeSelectGuestModal = closeSelectGuestModal;
window.selectAndFillGuest = selectAndFillGuest;
window.deleteFrequentGuest = deleteFrequentGuest;
window.loadFrequentGuests = loadFrequentGuests;