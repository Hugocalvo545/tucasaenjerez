import { db, auth } from '../shared/firebase.js';
import { state } from '../shared/state.js';
import { PRICE_PER_NIGHT, firebaseConfig } from '../shared/config.js';
import { nightsBetween, sanitizeForFirestore } from '../shared/utils.js';
import { deleteActiveHold, renderCalendar, updateReservationDates } from './calendar.js';
import { updateGuestForms, getAllGuestData, validateGuestsRequired } from './guests.js';

const CF_BASE = `https://us-central1-${firebaseConfig.projectId}.cloudfunctions.net`;

function setStatus(msg, isError = false) {
  const el = document.getElementById('bookStatus');
  if (!el) return;

  el.textContent = msg;
  el.style.color = isError ? '#b00020' : '#1a8b7d';

  if (msg) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function money(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '-';
  return `${x.toFixed(2)} €`;
}

function toISO(d) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const da = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

// Normaliza viajeros para export/consistencia (si falta algo, cae al principal)
function normalizeTravelersForExport(travelers) {
  const arr = Array.isArray(travelers) ? travelers : [];
  if (!arr.length) return [];

  const principal = arr[0] || {};

  const pick = (t, key, fallbackKey) => {
    const v = t?.[key] ?? (fallbackKey ? t?.[fallbackKey] : undefined);
    const p = principal?.[key] ?? (fallbackKey ? principal?.[fallbackKey] : undefined);
    return (v || p || '').toString();
  };

  return arr.map(t => ({
    kind: (t.kind || 'adult'),
    index: (t.index || 1),

    name: pick(t, 'name'),
    surname: pick(t, 'surname'),
    docType: pick(t, 'docType'),
    docNumber: pick(t, 'docNumber'),
    nationality: pick(t, 'nationality'),
    birthDate: pick(t, 'birthDate'),
    country: pick(t, 'country'),

    email: pick(t, 'email'),
    phone: pick(t, 'phone'),
    address: pick(t, 'address'),
    city: pick(t, 'city'),
    postalCode: pick(t, 'postalCode', 'zipcode'),
    province: pick(t, 'province'),
  }));
}

function focusField(fieldId) {
  const el = document.getElementById(fieldId);
  if (!el) return false;

  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.focus({ preventScroll: true });

  const prevOutline = el.style.outline;
  const prevOutlineOffset = el.style.outlineOffset;

  el.style.outline = '3px solid #b00020';
  el.style.outlineOffset = '2px';

  setTimeout(() => {
    el.style.outline = prevOutline;
    el.style.outlineOffset = prevOutlineOffset;
  }, 1400);

  return true;
}

function showSuccessModal({ propertyName, checkIn, checkOut, adults, children, total, pointsEarned }) {
  const modal = document.getElementById('successModal');
  if (!modal) return;

  const elName = document.getElementById('successPropertyName');
  const elDates = document.getElementById('successDates');
  const elGuests = document.getElementById('successGuests');
  const elTotal = document.getElementById('successTotal');
  const elPoints = document.getElementById('successPoints');

  if (elName) elName.textContent = propertyName || 'Reserva confirmada';
  if (elDates) elDates.textContent = `📅 ${checkIn} → ${checkOut}`;
  if (elGuests) elGuests.textContent = `👥 Adultos: ${adults} · Niños: ${children}`;
  if (elTotal) elTotal.textContent = `Total: ${Number(total).toFixed(2)} €`;
  if (elPoints) elPoints.textContent = `⭐ Has ganado ${pointsEarned} puntos`;

  const goList = document.getElementById('successGoList');
  const goProfile = document.getElementById('successGoProfile');

  if (goList) {
    goList.onclick = () => {
      modal.classList.remove('active');
      window.location.replace('./index.html');
    };
  }
  if (goProfile) {
    goProfile.onclick = () => {
      modal.classList.remove('active');
      window.location.replace('../perfil/index-usuario.html');
    };
  }

  modal.classList.add('active');
}

export function calculatePrice({ advance = true } = {}) {
  if (!state.bookCheckInDate || !state.bookCheckOutDate) return false;

  const adults = parseInt(document.getElementById('bookAdults')?.value || '1', 10) || 1;
  const children = parseInt(document.getElementById('bookChildren')?.value || '0', 10) || 0;

  const nights = nightsBetween(state.bookCheckInDate, state.bookCheckOutDate);
  if (nights <= 0) return false;

  const base = state.currentPricePerNight || PRICE_PER_NIGHT;

  const nightlyISOs = [];
  const d = new Date(state.bookCheckInDate);
  d.setHours(0, 0, 0, 0);

  const end = new Date(state.bookCheckOutDate);
  end.setHours(0, 0, 0, 0);

  while (d < end) {
    nightlyISOs.push(toISO(d));
    d.setDate(d.getDate() + 1);
  }

  // ✅ Si falta precio confirmado en alguna noche, no se puede reservar (aplica a aptos y packs)
  const missing = nightlyISOs.filter(iso => !(state.priceMap?.has?.(iso) === true));
  if (missing.length) {
    setStatus('Estas fechas aún no tienen precio confirmado. Prueba con otras fechas.', true);
    return false;
  }

  let total = 0;
  const nightlyPrices = [];

  for (const iso of nightlyISOs) {
    const override = state.priceMap?.get?.(iso);
    const price = (typeof override === 'number' && Number.isFinite(override)) ? override : base;
    nightlyPrices.push(price);
    total += price;
  }

  const discount = Number(state.currentDiscount) || 0;
  const discountAmount = discount > 0 ? Math.round(total * discount / 100) : 0;
  const finalTotal = total - discountAmount;

  const elTotal = document.getElementById('bookTotalPrice');
  const elSummaryTotal = document.getElementById('summaryTotal');
  const elPPN = document.getElementById('summaryPricePerNight');
  const elBasePrice    = document.getElementById('bookBasePrice');
  const elDiscountLine = document.getElementById('bookDiscountLine');
  const elDiscountLabel = document.getElementById('bookDiscountLabel');
  const elDiscountBox  = document.getElementById('bookDiscountBox');

  if (elTotal) elTotal.textContent = money(finalTotal);
  if (elSummaryTotal) elSummaryTotal.textContent = money(finalTotal);

  if (elPPN) {
    const min = Math.min(...nightlyPrices);
    const max = Math.max(...nightlyPrices);
    if (min === max) elPPN.textContent = `${min.toFixed(0)} €/noche`;
    else elPPN.textContent = `Variable (${min.toFixed(0)}–${max.toFixed(0)} €/noche)`;
  }

  if (discount > 0) {
    if (elBasePrice)    elBasePrice.textContent    = money(total);
    if (elDiscountLine) elDiscountLine.textContent  = `-${money(discountAmount)}`;
    if (elDiscountLabel) elDiscountLabel.textContent = `Descuento nivel (${discount}%):`;
    if (elDiscountBox)  elDiscountBox.style.display  = '';
  } else {
    if (elDiscountBox) elDiscountBox.style.display = 'none';
  }

  updateGuestForms();

  state._computedTotal          = Number(finalTotal.toFixed(2));
  state._computedBaseTotal      = Number(total.toFixed(2));
  state._computedDiscount       = discount;
  state._computedDiscountAmount = discountAmount;
  state._computedNights         = nights;
  state._computedAdults         = adults;
  state._computedChildren       = children;

  setStatus('');

  if (advance) bookGoToStep(3);
  return true;
}

export function changeGuests(type, delta) {
  const adultsInput = document.getElementById('bookAdults');
  const childrenInput = document.getElementById('bookChildren');
  if (!adultsInput || !childrenInput) return;

  let adults = parseInt(adultsInput.value || '1', 10) || 1;
  let children = parseInt(childrenInput.value || '0', 10) || 0;

  if (type === 'adults') adults += delta;
  if (type === 'children') children += delta;

  adults = Math.min(Math.max(adults, 1), 4);
  children = Math.min(Math.max(children, 0), 4);

  if (adults + children > 4) {
    if (type === 'adults' && delta > 0) adults = 4 - children;
    if (type === 'children' && delta > 0) children = 4 - adults;
  }

  adultsInput.value = String(adults);
  childrenInput.value = String(children);

  updateGuestForms();
  calculatePrice({ advance: false });
}

export function bookGoToStep(step) {
  for (let i = 1; i <= 3; i++) {
    const content = document.getElementById('bookStep' + i);
    const stepEl = document.getElementById('bStep' + i);
    if (!content || !stepEl) continue;

    if (i === step) {
      content.classList.add('active');
      stepEl.classList.add('active');
      stepEl.classList.remove('completed', 'inactive');
    } else if (i < step) {
      content.classList.remove('active');
      stepEl.classList.add('completed');
      stepEl.classList.remove('active', 'inactive');
    } else {
      content.classList.remove('active');
      stepEl.classList.add('inactive');
      stepEl.classList.remove('active', 'completed');
    }
  }
}

export function setupBookingForm() {
  const imgEl = document.getElementById('summaryPropertyImg');
  if (imgEl && state.currentPropertyImg) imgEl.src = state.currentPropertyImg;

  const metaEl = document.getElementById('summaryPropertyMeta');
  if (metaEl) {
    const parts = [];
    if (state.currentPropertyCity) parts.push(state.currentPropertyCity);
    if (state.currentPropertyCap) parts.push(`Hasta ${state.currentPropertyCap} huéspedes`);
    metaEl.textContent = parts.join(' · ') || '';
  }

  const nameEl = document.getElementById('summaryPropertyName');
  if (nameEl) nameEl.textContent = state.currentPropertyName || 'Alojamiento';

  const pricePerNight = state.currentPricePerNight || PRICE_PER_NIGHT;
  const ppnEl = document.getElementById('summaryPricePerNight');
  if (ppnEl) ppnEl.textContent = `${pricePerNight.toFixed(0)} €/noche`;

  updateGuestForms();

  const btn = document.getElementById('confirmBookingBtn');
  if (!btn) return;
  if (btn.dataset.bound === 'true') return;
  btn.dataset.bound = 'true';

  btn.addEventListener('click', async () => {
    try {
      setStatus('');

      if (!state.currentUser?.uid) {
        setStatus('Debes iniciar sesión para confirmar la reserva.', true);
        bookGoToStep(2);
        return;
      }

      if (!state.bookCheckInDate || !state.bookCheckOutDate) {
        setStatus('Faltan fechas.', true);
        bookGoToStep(1);
        return;
      }

      const nights = state._computedNights || nightsBetween(state.bookCheckInDate, state.bookCheckOutDate);
      if (nights <= 0) {
        setStatus('Las fechas no son válidas.', true);
        bookGoToStep(1);
        return;
      }

      if (!state.activeHoldId) {
        setStatus('No hay bloqueo de fechas activo. Vuelve al paso 1 y selecciona fechas.', true);
        bookGoToStep(1);
        return;
      }

      const name = (document.getElementById('bookName')?.value || '').trim();
      const email = (document.getElementById('bookEmail')?.value || '').trim();
      const phone = (document.getElementById('bookPhone')?.value || '').trim();
      const notes = (document.getElementById('bookNotes')?.value || '').trim();

      if (!name || !email) {
        setStatus('Nombre y email son obligatorios.', true);
        bookGoToStep(2);
        return;
      }

      const v = validateGuestsRequired();
      if (!v.ok) {
        setStatus(v.message || 'Revisa los datos de los viajeros.', true);
        bookGoToStep(2);
        if (v.fieldId) setTimeout(() => focusField(v.fieldId), 150);
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Redirigiendo a pago...';

      const adults = state._computedAdults || parseInt(document.getElementById('bookAdults')?.value || '1', 10) || 1;
      const children = state._computedChildren || parseInt(document.getElementById('bookChildren')?.value || '0', 10) || 0;

      const totalPrice = Number.isFinite(state._computedTotal)
        ? state._computedTotal
        : Number(((state.currentPricePerNight || PRICE_PER_NIGHT) * nights).toFixed(2));

      const precioOriginal   = Number.isFinite(state._computedBaseTotal) ? state._computedBaseTotal : totalPrice;
      const descuentoAplicado = state._computedDiscount || 0;

      const pointsEarned = Math.max(1, Math.floor(totalPrice));

      const guestsRaw = getAllGuestData() || [];
      const guestsForExport = normalizeTravelersForExport(guestsRaw);

      // ID generado en cliente para poder construir la success_url antes del pago
      const reservaId = db.collection('reservas').doc().id;
      const holdIds = String(state.activeHoldId).split(',').map(s => s.trim()).filter(Boolean);

      const propertyId = state.currentPropertyId || 'atico-jerez';
      const propertyTipo = state.currentPropertyTipo || 'apto';

      const origin = window.location.origin;
      const successUrl = `${origin}/multi/pago-ok.html?reservaId=${reservaId}`;
      const cancelUrl  = `${origin}/multi/checkout.html?id=${encodeURIComponent(propertyId)}&tipo=${encodeURIComponent(propertyTipo)}&cancelled=1`;

      const user = auth.currentUser;
      if (!user) throw new Error('No hay sesión activa.');
      const idToken = await user.getIdToken();

      const cfRes = await fetch(`${CF_BASE}/createCheckoutSession`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          reservaId,
          propertyId,
          propertyName:  state.currentPropertyName || 'Alojamiento',
          checkInISO:    toISO(state.bookCheckInDate),
          checkOutISO:   toISO(state.bookCheckOutDate),
          checkIn:       state.bookCheckInDate.toLocaleDateString('es-ES'),
          checkOut:      state.bookCheckOutDate.toLocaleDateString('es-ES'),
          nights,
          numAdults:     adults,
          numChildren:   children,
          totalPrice,
          precioOriginal,
          descuentoAplicado,
          pointsEarned,
          name,
          email,
          phone,
          notes,
          guests:         guestsRaw,
          guestsForExport,
          holdIds,
          propertyTipo,
          sourceProperties: state.currentPropertySourceProperties || [],
          successUrl,
          cancelUrl,
        }),
      });

      if (!cfRes.ok) {
        const errBody = await cfRes.json().catch(() => ({}));
        throw new Error(errBody.error || `Error HTTP ${cfRes.status}`);
      }
      const { url } = await cfRes.json();
      if (!url) throw new Error('No se recibió URL de pago.');

      window.location.href = url;

    } catch (err) {
      console.error(err);
      setStatus(err?.message || 'Error al iniciar el pago. Inténtalo de nuevo.', true);
      btn.disabled = false;
      btn.textContent = 'Confirmar y pagar';
    }
  });
}
