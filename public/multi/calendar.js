import { db } from '../shared/firebase.js';
import { state } from '../shared/state.js';
import { HOLD_MINUTES, MS_PER_DAY, PRICE_PER_NIGHT } from '../shared/config.js';

function getCurrentPropertyId() {
  return state.currentPropertyId || 'atico-jerez';
}

function getAvailabilityPropertyIds() {
  if (state.currentPropertyTipo === 'pack') {
    return state.currentPropertySourceProperties?.length
      ? state.currentPropertySourceProperties
      : [];
  }
  return [getCurrentPropertyId()];
}

function getPricesCollection() {
  return state.currentPropertyTipo === 'pack' ? 'packs' : 'apartamentos';
}

function requiresManualPrices() {
  return true;
}

function normalizeDate(dateLike) {
  const d = new Date(dateLike);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toISO(date) {
  const d = normalizeDate(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(date, n) {
  const d = normalizeDate(date);
  d.setDate(d.getDate() + n);
  return d;
}

function parseISODateLocal(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function parseESDateToLocal(dmy) {
  if (!dmy || typeof dmy !== 'string') return null;
  const [dd, mm, yy] = dmy.split('/').map(Number);
  if (!dd || !mm || !yy) return null;
  const dt = new Date(yy, mm - 1, dd);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function daysBetweenExclusiveEnd(start, endExclusive) {
  const out = [];
  let d = normalizeDate(start);
  const end = normalizeDate(endExclusive);
  while (d < end) {
    out.push(toISO(d));
    d = addDays(d, 1);
  }
  return out;
}

export function renderCalendar() {
  const year  = state.calendarCurrentDate.getFullYear();
  const month = state.calendarCurrentDate.getMonth();

  const label = state.calendarCurrentDate
    .toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  const monthEl = document.getElementById('calendarMonth');
  if (monthEl) monthEl.textContent = label.charAt(0).toUpperCase() + label.slice(1);

  const grid = document.getElementById('calendarGrid');
  if (!grid) return;

  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;

  const today = normalizeDate(new Date());
  let html = '';

  ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].forEach(d => {
    html += `<div class="day-header">${d}</div>`;
  });

  const prevMonth = new Date(year, month, 0);
  const daysInPrevMonth = prevMonth.getDate();
  for (let i = daysInPrevMonth - startingDayOfWeek + 1; i <= daysInPrevMonth; i++) {
    html += `<div class="calendar-day other-month">${i}</div>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const current = normalizeDate(new Date(year, month, day));
    const iso = toISO(current);

    const isPast         = current < today;
    const isReserved     = state.reservedDatesSet.has(iso);
    const hasCheckIn     = state.checkInDatesSet.has(iso);
    const hasCheckOut    = state.checkOutDatesSet.has(iso);
    const isHold         = state.holdDatesSet.has(iso);
    const isFullyBlocked = hasCheckIn && hasCheckOut;

    const base = state.currentPricePerNight || PRICE_PER_NIGHT;

    // “precio confirmado” = existe doc en /prices (da igual su valor)
    const hasConfirmedPrice = state.priceMap?.has?.(iso) === true;

    const override = state.priceMap?.get?.(iso);
    const pricePerNight = (typeof override === 'number') ? override : base;

    // si no hay doc en /prices => NO reservable
    const isUnpriced = !hasConfirmedPrice;

    const isCheckIn =
      state.bookCheckInDate &&
      normalizeDate(state.bookCheckInDate).getTime() === current.getTime();

    const isCheckOut =
      state.bookCheckOutDate &&
      normalizeDate(state.bookCheckOutDate).getTime() === current.getTime();

    const isInRange =
      state.bookCheckInDate &&
      state.bookCheckOutDate &&
      current > normalizeDate(state.bookCheckInDate) &&
      current < normalizeDate(state.bookCheckOutDate);

    const isAdminBlocked = state.adminBlockedSet?.has?.(iso) === true;

    const isBlockedForBooking =
      isUnpriced ||
      isFullyBlocked ||
      (isReserved && !hasCheckIn) ||
      isHold ||
      isAdminBlocked;

    let classes = 'calendar-day';
    if (isPast) classes += ' past';
    else if (isCheckIn) classes += ' selected';
    else if (isCheckOut) classes += ' checkout';
    else if (isInRange) classes += ' range';
    else if (isUnpriced) classes += ' unpriced';
    else if (isFullyBlocked || (isReserved && !hasCheckIn) || isAdminBlocked) classes += ' occupied';
    else if (isHold) classes += ' hold';
    else {
      classes += ' available';
      if (hasCheckIn && !hasCheckOut) classes += ' checkin-foreign';
    }

    let onclick = '';
    let cursor = 'not-allowed';
    if (!isPast && !isBlockedForBooking) {
      onclick = `onclick="selectCalendarDate(${year},${month},${day})"`;
      cursor = 'pointer';
    }

    const showPrice = !isPast && !isBlockedForBooking;
    const priceHtml = showPrice
      ? `<div class="calendar-price">${Math.round(pricePerNight)}€</div>`
      : '';

    html += `<div class="${classes}" style="cursor:${cursor}" ${onclick}>`
      + `<div class="calendar-daynum">${day}</div>`
      + priceHtml
      + `</div>`;
  }

  const totalCells = 42;
  const usedCells = daysInMonth + startingDayOfWeek;
  for (let i = 1; i <= totalCells - usedCells; i++) {
    html += `<div class="calendar-day other-month">${i}</div>`;
  }

  grid.innerHTML = html;
  updateCalendarInfo();
}

export function previousMonth() {
  const d = new Date(state.calendarCurrentDate);
  d.setDate(1); // ✅ evita saltos por días inexistentes (29/30/31)
  d.setMonth(d.getMonth() - 1);
  state.calendarCurrentDate = d;
  renderCalendar();
}

export function nextMonth() {
  const d = new Date(state.calendarCurrentDate);
  d.setDate(1); // ✅ evita saltos por días inexistentes (29/30/31)
  d.setMonth(d.getMonth() + 1);
  state.calendarCurrentDate = d;
  renderCalendar();
}

function updateCalendarInfo() {
  const el = document.getElementById('calendarInfo');
  if (!el) return;

  const ci = state.bookCheckInDate
    ? state.bookCheckInDate.toLocaleDateString('es-ES')
    : '-';

  const co = state.bookCheckOutDate
    ? state.bookCheckOutDate.toLocaleDateString('es-ES')
    : '-';

  const nights = state.bookCheckInDate && state.bookCheckOutDate
    ? (normalizeDate(state.bookCheckOutDate) - normalizeDate(state.bookCheckInDate)) / MS_PER_DAY
    : 0;

  const minNights = state.currentPropertyMinNights || 1;
  if (nights > 0 && nights < minNights) {
    el.textContent = `Mínimo ${minNights} noches · Seleccionadas: ${nights}`;
    el.style.color = '#b00020';
  } else {
    el.textContent = `Entrada: ${ci} · Salida: ${co}`;
    el.style.color = '';
  }
}

async function createOrRefreshHold() {
  if (!state.bookCheckInDate || !state.bookCheckOutDate) return;

  if (!state.currentUser?.uid) {
    alert('Para bloquear fechas y reservar necesitas iniciar sesión.');
    return;
  }

  await deleteActiveHold();

  const start = normalizeDate(state.bookCheckInDate);
  const end   = normalizeDate(state.bookCheckOutDate);
  const dates = daysBetweenExclusiveEnd(start, end);

  const v = rangeIsBookable();
  if (!v.ok) throw new Error(v.msg || 'Rango no reservable');

  const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60 * 1000 - 30_000);

  const propertyIds = getAvailabilityPropertyIds();

  // Creamos holds para cada propertyId que gobierna el pack (o solo uno si es apto)
  const batch = db.batch();
  const holdIds = [];

  propertyIds.forEach((pid) => {
    const ref = db.collection('holds').doc();
    holdIds.push(ref.id);
    batch.set(ref, {
      userId: state.currentUser.uid,
      propertyId: pid,
      dates,
      createdAt: new Date(),
      expiresAt,
      packId: state.currentPropertyTipo === 'pack' ? getCurrentPropertyId() : null,
    });
  });

  await batch.commit();

  // guardamos ids en un string separando por coma (compat con tu state actual)
  state.activeHoldId = holdIds.join(',');
  try { sessionStorage.setItem('activeHoldId', state.activeHoldId); } catch (_) {}
  state.ownHoldDatesSet.clear();
  dates.forEach(d => state.ownHoldDatesSet.add(d));
}

export async function deleteActiveHold() {
  if (!state.activeHoldId) return;

  const ids = String(state.activeHoldId).split(',').map(s => s.trim()).filter(Boolean);
  try {
    const batch = db.batch();
    ids.forEach(id => batch.delete(db.collection('holds').doc(id)));
    await batch.commit();
  } catch (_) {}
  try { sessionStorage.removeItem('activeHoldId'); } catch (_) {}

  state.activeHoldId = null;
  state.ownHoldDatesSet.clear();
}

export function rangeIsBookable() {
  if (!state.bookCheckInDate || !state.bookCheckOutDate) return { ok: false, msg: 'Faltan fechas.' };

  const start = normalizeDate(state.bookCheckInDate);
  const end = normalizeDate(state.bookCheckOutDate);

  if (end <= start) return { ok: false, msg: 'Las fechas no son válidas.' };

  const nightsISO = daysBetweenExclusiveEnd(start, end);

  for (const iso of nightsISO) {
    // ✅ si falta precio confirmado en cualquier noche => no reservable
    if (requiresManualPrices() && !(state.priceMap?.has?.(iso) === true)) {
      return { ok: false, msg: 'Aún no hay precio confirmado para alguna noche del rango.' };
    }
    if (state.holdDatesSet.has(iso)) return { ok: false, msg: 'Ese rango incluye días en proceso (hold).' };
    if (state.reservedDatesSet.has(iso)) return { ok: false, msg: 'Ese rango incluye días ocupados.' };
  }

  // si check-in coincide con día “doble turnover” (check-in y check-out a la vez) tu UI lo marca como no seleccionable
  const ciISO = toISO(start);
  if (state.checkInDatesSet.has(ciISO) && state.checkOutDatesSet.has(ciISO)) {
    return { ok: false, msg: 'Ese día no puede usarse como entrada.' };
  }

  return { ok: true, msg: '' };
}

export async function validateAndGoToStep2() {
  if (!state.currentUser?.uid) {
    alert('Para reservar necesitas iniciar sesión.');
    return false;
  }

  if (!state.bookCheckInDate || !state.bookCheckOutDate) {
    alert('Selecciona check-in y check-out.');
    return false;
  }

  const nights =
    (normalizeDate(state.bookCheckOutDate) - normalizeDate(state.bookCheckInDate)) / MS_PER_DAY;

  if (nights <= 0) {
    alert('Las fechas no son válidas.');
    return false;
  }

  const minNights = state.currentPropertyMinNights || 1;
  if (nights < minNights) {
    alert(`Este alojamiento requiere una estancia mínima de ${minNights} noches.`);
    return false;
  }

  const v = rangeIsBookable();
  if (!v.ok) {
    alert(v.msg || 'Las fechas no están disponibles.');
    return false;
  }

  try {
    await createOrRefreshHold();
    return true;
  } catch (e) {
    console.warn('[HOLD] error:', e);
    return false;
  }
}

export function selectCalendarDate(year, month, day) {
  const clicked = normalizeDate(new Date(year, month, day));
  const iso = toISO(clicked);
  const today = normalizeDate(new Date());

  const blocked =
    clicked < today ||
    state.holdDatesSet.has(iso) ||
    (state.reservedDatesSet.has(iso) && !state.checkInDatesSet.has(iso)) ||
    (state.checkInDatesSet.has(iso) && state.checkOutDatesSet.has(iso));

  if (blocked) return;

  const currentCI = state.bookCheckInDate ? normalizeDate(state.bookCheckInDate) : null;
  const currentCO = state.bookCheckOutDate ? normalizeDate(state.bookCheckOutDate) : null;

  // 1) Si no hay check-in o ya hay rango completo, empezamos selección nueva
  if (!currentCI || currentCO) {
    if (state.activeHoldId) deleteActiveHold().catch(()=>{});

    state.bookCheckInDate = clicked;
    state.bookCheckOutDate = null;
    state.ownHoldDatesSet.clear();
    updateReservationDates();
    renderCalendar();
    return;
  }

  // 2) Si pinchas el mismo día del check-in → se deselecciona (reset)
  if (clicked.getTime() === currentCI.getTime()) {
    state.bookCheckInDate = null;
    state.bookCheckOutDate = null;
    state.ownHoldDatesSet.clear();
    updateReservationDates();
    renderCalendar();
    return;
  }

  // 3) Si eliges una fecha anterior al check-in → opción no válida → reset
  if (clicked < currentCI) {
    state.bookCheckInDate = null;
    state.bookCheckOutDate = null;
    state.ownHoldDatesSet.clear();
    updateReservationDates();
    renderCalendar();
    return;
  }

  // 4) Intentamos cerrar rango como check-out
  const ciISO = toISO(currentCI);
  const days = daysBetweenExclusiveEnd(currentCI, clicked);

  const hasBlockedInside = days.some(d => {
    // permitir que el rango empiece en un día que sea check-in ajeno
    if (d === ciISO && state.checkInDatesSet.has(ciISO)) return false;
    return state.holdDatesSet.has(d) || state.reservedDatesSet.has(d);
  });

  if (hasBlockedInside) {
    alert('Ese rango incluye días ocupados.');
    state.bookCheckInDate = null;
    state.bookCheckOutDate = null;
    state.ownHoldDatesSet.clear();
    updateReservationDates();
    renderCalendar();
    return;
  }

  state.bookCheckOutDate = clicked;

  updateReservationDates();
  renderCalendar();
}


export function updateReservationDates() {
  const ci = state.bookCheckInDate
    ? state.bookCheckInDate.toLocaleDateString('es-ES')
    : '-';

  const co = state.bookCheckOutDate
    ? state.bookCheckOutDate.toLocaleDateString('es-ES')
    : '-';

  const nights =
    state.bookCheckInDate && state.bookCheckOutDate
      ? (normalizeDate(state.bookCheckOutDate) - normalizeDate(state.bookCheckInDate)) / MS_PER_DAY
      : 0;

  const elCheckIn = document.getElementById('bookCheckInDisplay');
  if (elCheckIn) elCheckIn.textContent = ci;

  const elCheckOut = document.getElementById('bookCheckOutDisplay');
  if (elCheckOut) elCheckOut.textContent = co;

  const elNights = document.getElementById('nightsCount');
  if (elNights) elNights.textContent = String(nights);

  const elSumIn = document.getElementById('summaryCheckIn');
  if (elSumIn) elSumIn.textContent = ci;

  const elSumOut = document.getElementById('summaryCheckOut');
  if (elSumOut) elSumOut.textContent = co;

  const elSumNights = document.getElementById('summaryNights');
  if (elSumNights) elSumNights.textContent = nights || '-';

  // Si estamos en checkout, recalcula el precio al vuelo (sin avanzar de paso)
  try {
    if (typeof window !== 'undefined' && typeof window.calculatePrice === 'function') {
      window.calculatePrice({ advance: false });
    }
  } catch (_) {}

  // Deshabilitar botón de reserva si no se cumple la estancia mínima
  const minNightsVal = state.currentPropertyMinNights || 1;
  const belowMin = nights > 0 && nights < minNightsVal;
  ['reserveBtn', 'reserveBtnTop', 'reserveBtnSide'].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = belowMin;
  });
}

export function setUpRealtimeAvailability() {
  state.reservasUnsub?.();
  state.holdsUnsub?.();
  state.bloqueosUnsub?.();

  const propertyIds = getAvailabilityPropertyIds();

  state.reservasUnsub = db
    .collection('reservas_public')
    .where('propertyId', propertyIds.length === 1 ? '==' : 'in', propertyIds.length === 1 ? propertyIds[0] : propertyIds)
    .onSnapshot((snap) => {
      state.reservedDatesSet.clear();
      state.checkInDatesSet.clear();
      state.checkOutDatesSet.clear();

      snap.forEach((doc) => {
        const d = doc.data() || {};
        let ci = d.checkInISO ? parseISODateLocal(d.checkInISO) : null;
        let co = d.checkOutISO ? parseISODateLocal(d.checkOutISO) : null;
        if (!ci && d.checkIn) ci = parseESDateToLocal(d.checkIn);
        if (!co && d.checkOut) co = parseESDateToLocal(d.checkOut);
        if (!ci || !co) return;

        daysBetweenExclusiveEnd(ci, co).forEach(iso => state.reservedDatesSet.add(iso));
        state.checkInDatesSet.add(toISO(ci));
        state.checkOutDatesSet.add(toISO(co));
      });

      renderCalendar();
    });

  state.holdsUnsub = db
    .collection('holds')
    .where('propertyId', propertyIds.length === 1 ? '==' : 'in', propertyIds.length === 1 ? propertyIds[0] : propertyIds)
    .onSnapshot((snap) => {
      state.holdDatesSet.clear();
      snap.forEach((doc) => {
        const d = doc.data() || {};
        const expiresAt = d.expiresAt?.toDate ? d.expiresAt.toDate() : d.expiresAt;
        if (expiresAt && expiresAt < new Date()) return;
        (d.dates || []).forEach((iso) => {
          if (!state.ownHoldDatesSet.has(iso)) state.holdDatesSet.add(iso);
        });
      });
      renderCalendar();
    });

  // Bloqueos admin (propietario bloquea fechas desde intranet)
  state.bloqueosUnsub = db
    .collection('bloqueos')
    .where('propertyId', propertyIds.length === 1 ? '==' : 'in', propertyIds.length === 1 ? propertyIds[0] : propertyIds)
    .onSnapshot((snap) => {
      state.adminBlockedSet.clear();
      snap.forEach((doc) => {
        const d = doc.data() || {};
        (d.dates || []).forEach((iso) => state.adminBlockedSet.add(iso));
      });
      renderCalendar();
    });
}

export function setUpRealtimePrices() {
  state.priceUnsub?.();
  state.priceMap = new Map();

  const propertyId = getCurrentPropertyId();
  if (!propertyId) return;

  const col = getPricesCollection();

  state.priceUnsub = db
    .collection(col)
    .doc(propertyId)
    .collection("prices")
    .onSnapshot(
      (qs) => {
        const map = new Map();
        qs.forEach((d) => {
          const data = d.data();
          if (data?.dateISO && typeof data.price === "number") {
            map.set(data.dateISO, data.price);
          }
        });

        state.priceMap = map;
        renderCalendar();
        try { window.calculatePrice?.({ advance: false }); } catch (_) {}
      },
      (err) => {
        console.error(
          "❌ ERROR snapshot PRICES =>",
          "col:", col,
          "propertyId:", propertyId,
          "path:", `${col}/${propertyId}/prices`,
          err
        );
      }
    );
}


export async function cleanupExpiredHoldsOnLoad() {
  const now = new Date();
  const propertyIds = getAvailabilityPropertyIds(); // ✅ pack => varios, apto => 1

  await Promise.all(propertyIds.map((pid) => cleanupExpiredHoldsForProperty(pid, now)));
}

async function cleanupExpiredHoldsForProperty(propertyId, now = new Date()) {
  // Para evitar batch gigantes
  const qs = await db.collection("holds")
    .where("propertyId", "==", propertyId)
    .limit(400)
    .get();

  if (qs.empty) return;

  const batch = db.batch();
  let count = 0;

  qs.forEach((doc) => {
    const d = doc.data() || {};
    const expiresAt = d.expiresAt?.toDate ? d.expiresAt.toDate() : d.expiresAt;
    if (expiresAt && expiresAt <= now) {
      batch.delete(doc.ref);
      count++;
    }
  });

  if (count) await batch.commit();

  // Si había más de 400, repite
  if (qs.size === 400) await cleanupExpiredHoldsForProperty(propertyId, now);
}
