import { db, auth } from '../shared/firebase.js';
import { state } from '../shared/state.js';
import { PRICE_PER_NIGHT, calculateLevel } from '../shared/config.js';
import { packBasePrice, resolvePackPct } from '../shared/pack-pricing.js';
import { propertyCover } from '../shared/utils.js';

import {
  renderCalendar,
  previousMonth,
  nextMonth,
  selectCalendarDate,
  validateAndGoToStep2,
  rangeIsBookable,
  setUpRealtimeAvailability,
  setUpRealtimePrices,
  updateReservationDates,
  cleanupExpiredHoldsOnLoad,
  deleteActiveHold,
} from './calendar.js';

import {
  setupAddGuestForm,
  openAddGuestModal,
  closeAddGuestModal,
  openSelectFrequentGuestModal,
  closeSelectGuestModal,
  selectAndFillGuest,
  deleteFrequentGuest,
  showSaveGuestForm,
  updateGuestForms,
  loadFrequentGuests,
} from './guests.js';

import {
  calculatePrice,
  bookGoToStep,
  setupBookingForm,
  changeGuests,
} from './bookings.js';

let isSubmittingCheckout = false;

function goToPerfil(mode = 'login', extraQuery = '') {
  const backUrl = window.location.href;
  const hash = mode === 'register' ? '#register' : '';

  const base = `../perfil/index-usuario.html?back=${encodeURIComponent(backUrl)}`;
  const url = extraQuery ? `${base}&${extraQuery}${hash}` : `${base}${hash}`;

  window.location.href = url;
}

function goToLoginWithBack(targetUrlAfterLogin) {
  const redirect = encodeURIComponent(targetUrlAfterLogin);
  goToPerfil('login', `redirect=${redirect}`);
}

function getStep1ContinueButton() {
  const byId = document.getElementById('btnStep1Continue');
  if (byId) return byId;

  const byOnclick = document.querySelector(
    'button[onclick*="validateAndGoToStep2"], a[onclick*="validateAndGoToStep2"]'
  );
  if (byOnclick) return byOnclick;

  return null;
}

function setCheckoutLoading(loading) {
  const btn = getStep1ContinueButton();
  if (!btn) return;

  if (!btn.dataset.originalText) {
    btn.dataset.originalText = btn.textContent || 'Continuar';
  }

  btn.disabled = loading;
  btn.style.pointerEvents = loading ? 'none' : '';
  btn.textContent = loading ? 'Procesando...' : btn.dataset.originalText;
}

function showCheckoutError(msg) {
  let box = document.getElementById('checkoutError');

  if (!box) {
    box = document.createElement('div');
    box.id = 'checkoutError';
    box.style.color = '#b00020';
    box.style.margin = '10px 0';
    box.style.fontSize = '14px';
    box.style.fontWeight = '500';

    const container = document.querySelector('.checkout-container') || document.body;
    container.prepend(box);
  }

  box.textContent = msg;
}

function parseISODateLocal(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function toISODate(value) {
  if (!value) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;

  return '';
}

function initAuthUI() {
  auth.onAuthStateChanged((user) => {
    state.currentUser = user ? { uid: user.uid, email: user.email || null } : null;

    const btnLogin = document.getElementById('btnLogin');
    const btnRegister = document.getElementById('btnRegister');
    const btnProfile = document.getElementById('btnProfile');

    if (btnLogin && btnRegister && btnProfile) {
      if (user) {
        btnLogin.style.display = 'none';
        btnRegister.style.display = 'none';
        btnProfile.style.display = 'inline-flex';
      } else {
        btnLogin.style.display = 'inline-flex';
        btnRegister.style.display = 'inline-flex';
        btnProfile.style.display = 'none';
      }
    }

    const btnAccount = document.getElementById('btnAccount');
    if (btnAccount) {
      const textEl = btnAccount.querySelector('.multi-account-text');
      if (textEl) textEl.textContent = user ? 'Mi perfil' : 'Acceder';
    }

    const backLink = document.querySelector('.multi-topbar-back');
    if (backLink) {
      // PRODUCCIÓN: URL → cambiar al dominio WordPress real
      const base = 'https://tucasaenjerez.com/';
      if (user) {
        const info = btoa(JSON.stringify({ email: user.email, name: user.displayName || user.email, exp: Date.now() + 30 * 60 * 1000 }));
        backLink.href = base + '?jla_user=' + info;
      } else {
        backLink.href = base;
      }
    }
  });
}

function cleanupOnLeaveCheckout() {
  try { state.reservasUnsub?.(); } catch (_) {}
  try { state.holdsUnsub?.(); } catch (_) {}
  try { deleteActiveHold(); } catch (_) {}
}

window.addEventListener('pagehide', cleanupOnLeaveCheckout);
window.addEventListener('beforeunload', cleanupOnLeaveCheckout);

async function setupPropertyContextFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const tipo = params.get('tipo') || 'apto';

  state.currentPropertyTipo = tipo;
  state.currentPackPct = null; // se fija abajo si es pack; null en aptos/errores

  if (!id) {
    state.currentPropertyId = 'atico-jerez';
    state.currentPropertyName = 'Alojamiento';
    state.currentPricePerNight = PRICE_PER_NIGHT;
    return;
  }

  try {
    const col = tipo === 'pack' ? 'packs' : 'apartamentos';
    const snap = await db.collection(col).doc(id).get();

    if (snap.exists) {
      const data = snap.data() || {};

      // Misma lectura que el listado: prioriza images[], cae a fotos[] (legacy).
      state.currentPropertyImg = propertyCover(data);
      state.currentPropertyCity = data.ciudad || '';
      state.currentPropertyCap = data.capacidad || '';

      state.currentPropertyId = snap.id;
      state.currentPropertyName = data.nombre || 'Alojamiento';
      state.currentPropertyMinNights = (data.minNights > 0) ? data.minNights : 1;
      state.currentPropertySourceProperties = Array.isArray(data.sourceProperties)
        ? data.sourceProperties
        : [];

      if (tipo === 'pack') {
        // PACK: base derivado de las unidades (packPct × (A + B)); NO el precioBase guardado.
        // El precio real por-noche vendrá del priceMap combinado (setUpRealtimePrices modo pack).
        const pct = resolvePackPct(data);
        state.currentPackPct = pct;
        const sp = state.currentPropertySourceProperties;
        let derived = null;
        if (sp.length >= 2) {
          const [aptA, aptB] = await Promise.all([
            db.collection('apartamentos').doc(sp[0]).get(),
            db.collection('apartamentos').doc(sp[1]).get(),
          ]);
          derived = packBasePrice(
            Number(aptA.data()?.precioBase),
            Number(aptB.data()?.precioBase),
            pct
          );

          // Si el pack no trae foto propia, usa la de su primera unidad (la que haya).
          if (!state.currentPropertyImg) {
            state.currentPropertyImg =
              propertyCover(aptA.data()) || propertyCover(aptB.data());
          }
        }
        state.currentPricePerNight = derived != null ? derived : PRICE_PER_NIGHT;
      } else {
        state.currentPackPct = null;
        state.currentPricePerNight =
          typeof data.precioBase === 'number' ? data.precioBase : PRICE_PER_NIGHT;
      }
    } else {
      state.currentPropertyId = id;
      state.currentPropertyName = 'Alojamiento';
      state.currentPricePerNight = PRICE_PER_NIGHT;
      state.currentPropertySourceProperties = [];
    }
  } catch (err) {
    console.error('Error setupPropertyContextFromUrl:', err);
    state.currentPropertyId = id;
    state.currentPropertyName = 'Alojamiento';
    state.currentPricePerNight = PRICE_PER_NIGHT;
    state.currentPropertySourceProperties = [];
  }
}

async function loadUserProfileAndPrefill() {
  if (!auth.currentUser?.uid) return null;

  try {
    const snap = await db.collection('usuarios').doc(auth.currentUser.uid).get();
    if (!snap.exists) return null;

    const raw = snap.data() || {};

    const points = raw.points || 0;
    state.userPoints = points;
    const levelInfo = calculateLevel(points);
    state.currentLevel = levelInfo.level;
    state.currentDiscount = levelInfo.discount;

    const profile = {
      name: raw.name || '',
      surname: raw.surname || '',
      email: raw.email || auth.currentUser.email || '',
      phone: raw.phone || '',
      docType: raw.docType || 'DNI',
      docNumber: raw.docNumber || '',
      nationality: raw.nationality || 'Española',
      birthDate: toISODate(raw.birthDate || ''),
      country: raw.country || 'España',
      address: raw.address || '',
      city: raw.city || '',
      postalCode: raw.postalCode || raw.zipcode || '',
      province: raw.province || '',
    };

    state.userProfile = profile;

    const nameFull = [profile.name, profile.surname].filter(Boolean).join(' ').trim();

    const bookName = document.getElementById('bookName');
    const bookEmail = document.getElementById('bookEmail');
    const bookPhone = document.getElementById('bookPhone');

    if (bookName && !bookName.value) bookName.value = nameFull;
    if (bookEmail && !bookEmail.value) bookEmail.value = profile.email;
    if (bookPhone && !bookPhone.value) bookPhone.value = profile.phone;

    const set = (id, v) => {
      const el = document.getElementById(id);
      if (el && !el.value) el.value = v || '';
    };

    set('adult_1_name', profile.name);
    set('adult_1_surname', profile.surname);
    set('adult_1_email', profile.email);
    set('adult_1_phone', profile.phone);

    const dt = document.getElementById('adult_1_docType');
    if (dt && (!dt.value || dt.value === '')) dt.value = profile.docType;

    set('adult_1_docNumber', profile.docNumber);
    set('adult_1_nationality', profile.nationality);
    set('adult_1_birthDate', profile.birthDate);
    set('adult_1_country', profile.country);

    set('adult_1_address', profile.address);
    set('adult_1_city', profile.city);
    set('adult_1_postalCode', profile.postalCode);
    set('adult_1_province', profile.province);

    return profile;
  } catch (e) {
    console.warn('No se pudo cargar perfil usuario:', e);
    return null;
  }
}

function cancelBooking() {
  state.reservasUnsub?.();
  state.holdsUnsub?.();

  deleteActiveHold();

  state.bookCheckInDate = null;
  state.bookCheckOutDate = null;
  state.ownHoldDatesSet.clear();

  const params = new URLSearchParams({
    id: state.currentPropertyId || '',
    tipo: state.currentPropertyTipo || 'apto',
  });

  window.location.href = `./detalle.html?${params.toString()}`;
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('btnLogin')?.addEventListener('click', (e) => {
    e.preventDefault();
    goToPerfil('login');
  });

  document.getElementById('btnRegister')?.addEventListener('click', (e) => {
    e.preventDefault();
    goToPerfil('register');
  });

  document.getElementById('btnProfile')?.addEventListener('click', (e) => {
    e.preventDefault();
    goToPerfil('login');
  });

  await setupPropertyContextFromUrl();

  const params = new URLSearchParams(window.location.search);
  const ci = parseISODateLocal(params.get('ci'));
  const co = parseISODateLocal(params.get('co'));

  if (ci && co) {
    state.bookCheckInDate = ci;
    state.bookCheckOutDate = co;
  } else {
    state.bookCheckInDate = null;
    state.bookCheckOutDate = null;
    state.ownHoldDatesSet.clear();
  }

  initAuthUI();

  const currentUrl = window.location.href;

  if (!auth.currentUser) {
    goToLoginWithBack(currentUrl);
    return;
  }

  setupAddGuestForm();
  setupBookingForm();

  await cleanupExpiredHoldsOnLoad();

  if (params.get('cancelled') === '1') {
    showCheckoutError('El pago fue cancelado. Puedes intentarlo de nuevo.');
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('cancelled');
    history.replaceState(null, '', cleanUrl.toString());
  }

  setUpRealtimeAvailability();
  setUpRealtimePrices();
  updateReservationDates();
  renderCalendar();

  updateGuestForms();
  await loadUserProfileAndPrefill();
  updateGuestForms();

  calculatePrice({ advance: false });

  try { await loadFrequentGuests(); } catch (_) {}

  if (state.bookCheckInDate && state.bookCheckOutDate) {
    if (state.bookCheckInDate >= state.bookCheckOutDate) {
      showCheckoutError('Las fechas seleccionadas no son válidas.');
      bookGoToStep(1);
      return;
    }

    const ok = await validateAndGoToStep2();
    if (ok) bookGoToStep(2);
    else bookGoToStep(1);
  } else {
    bookGoToStep(1);
  }
});

window.previousMonth = previousMonth;
window.nextMonth = nextMonth;
window.selectCalendarDate = selectCalendarDate;

window.validateAndGoToStep2 = async () => {
  if (isSubmittingCheckout) return;

  isSubmittingCheckout = true;
  setCheckoutLoading(true);

  try {
    if (!state.bookCheckInDate || !state.bookCheckOutDate) {
      showCheckoutError('Por favor, selecciona las fechas de entrada y salida.');
      bookGoToStep(1);
      return;
    }

    // ✅ VALIDACIÓN REAL (anti URL hack)
    const v = rangeIsBookable();
    if (!v.ok) {
      showCheckoutError(v.msg || 'Las fechas no están disponibles.');
      bookGoToStep(1);
      return;
    }

    const ok = await validateAndGoToStep2();
    if (!ok) {
      showCheckoutError('No se han podido bloquear las fechas. Inténtalo de nuevo.');
      bookGoToStep(1);
      return;
    }

    bookGoToStep(2);
  } catch (e) {
    console.error(e);
    showCheckoutError('No se han podido validar las fechas. Inténtalo de nuevo.');
    bookGoToStep(1);
  } finally {
    setCheckoutLoading(false);
    isSubmittingCheckout = false;
  }
};

window.goToStep3WithValidation = function() {
  const checkbox = document.getElementById('acceptPrivacy');
  if (checkbox && !checkbox.checked) {
    showCheckoutError('Debes aceptar la política de privacidad y los términos para continuar.');
    checkbox.focus();
    return;
  }
  calculatePrice();
};

window.validateAndGoToStep3 = async () => {
  if (isSubmittingCheckout) return;

  isSubmittingCheckout = true;
  setCheckoutLoading(true);

  try {
    const email = document.getElementById('bookEmail').value;
    const name = document.getElementById('bookName').value;
    const birthDate = document.getElementById('adult_1_birthDate').value;

    if (!name || !email || !birthDate) {
      showCheckoutError('Por favor, completa todos los campos obligatorios.');
      bookGoToStep(2);
      return;
    }

    if (!isValidEmail(email)) {
      showCheckoutError('El email ingresado no es válido.');
      bookGoToStep(2);
      return;
    }

    if (!isValidISODate(birthDate)) {
      showCheckoutError('La fecha de nacimiento no es válida.');
      bookGoToStep(2);
      return;
    }

    bookGoToStep(3);
  } catch (e) {
    console.error('Error en paso 2 del checkout:', e);
    showCheckoutError('Hubo un problema con los datos del huésped. Inténtalo de nuevo.');
  } finally {
    setCheckoutLoading(false);
    isSubmittingCheckout = false;
  }
};

window.bookGoToStep = bookGoToStep;
window.calculatePrice = calculatePrice;
window.changeGuests = changeGuests;

window.cancelBooking = cancelBooking;

window.addEventListener('pageshow', (event) => {
  if (event.persisted) window.location.reload();
});

window.openAddGuestModal = openAddGuestModal;
window.closeAddGuestModal = closeAddGuestModal;
window.openSelectFrequentGuestModal = openSelectFrequentGuestModal;
window.closeSelectGuestModal = closeSelectGuestModal;
window.selectAndFillGuest = selectAndFillGuest;
window.deleteFrequentGuest = deleteFrequentGuest;
window.showSaveGuestForm = showSaveGuestForm;
window.updateGuestForms = updateGuestForms;
