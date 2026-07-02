import { db, auth } from '../shared/firebase.js';
import { state } from '../shared/state.js';
import { packBasePrice, resolvePackPct } from '../shared/pack-pricing.js';

import {
  renderCalendar,
  previousMonth,
  nextMonth,
  selectCalendarDate,
  setUpRealtimeAvailability,
  setUpRealtimePrices,
  cleanupExpiredHoldsOnLoad,
  updateReservationDates,
} from './calendar.js';

function getParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    id: params.get('id'),
    tipo: params.get('tipo') || 'apto',
  };
}

function safeText(v, fallback = '') {
  if (v === null || v === undefined) return fallback;
  return String(v);
}

function toISO(d) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const da = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

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

function initAuthUI() {
  auth.onAuthStateChanged((user) => {
    state.currentUser = user ? { uid: user.uid, email: user.email || null } : null;

    const btnLogin = document.getElementById('btnLogin');
    const btnRegister = document.getElementById('btnRegister');
    const btnProfile = document.getElementById('btnProfile');
    const cta = document.getElementById('loginCtaDetail');
    const btnAccount = document.getElementById('btnAccount');

    if (cta) cta.style.display = user ? 'none' : 'block';

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

    if (btnAccount) {
      const textEl = btnAccount.querySelector('.multi-account-text');
      if (textEl) textEl.textContent = user ? 'Mi perfil' : 'Acceder';
    }

    const backLink = document.querySelector('.multi-topbar-back');
    if (backLink) {
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

let inlineGalleryImages = [];
let inlineGalleryIndex = 0;
let inlineTouchStartX = null;

function preloadImage(url) {
  if (!url) return;
  const img = new Image();
  img.decoding = 'async';
  img.loading = 'eager';
  img.src = url;
}

function initInlineGallery(images) {
  inlineGalleryImages = (images || []).filter(Boolean);
  inlineGalleryIndex = 0;

  const heroImg = document.getElementById('inlineHeroImg');
  const heroBg = document.getElementById('inlineHeroBg');
  const counter = document.getElementById('inlineCounter');
  const thumbsWrap = document.getElementById('inlineThumbs');
  const prevBtn = document.getElementById('inlinePrev');
  const nextBtn = document.getElementById('inlineNext');

  if (!heroImg || !thumbsWrap) return;
  if (!inlineGalleryImages.length) return;

  inlineGalleryImages.slice(0, 6).forEach(preloadImage);

  thumbsWrap.innerHTML = inlineGalleryImages
    .map((u, i) => `
      <button class="inline-thumb ${i === 0 ? 'active' : ''}" type="button" data-inline-i="${i}">
        <img src="${u}" alt="thumb" loading="lazy" decoding="async">
      </button>
    `)
    .join('');

  function setHero(url) {
    if (heroBg) heroBg.style.backgroundImage = `url("${url}")`;

    heroImg.style.opacity = '0';
    heroImg.style.transform = 'scale(1.005)';
    const nextUrl = url;

    const nextI = (inlineGalleryIndex + 1) % inlineGalleryImages.length;
    const prevI = (inlineGalleryIndex - 1 + inlineGalleryImages.length) % inlineGalleryImages.length;
    preloadImage(inlineGalleryImages[nextI]);
    preloadImage(inlineGalleryImages[prevI]);

    setTimeout(() => {
      heroImg.src = nextUrl;
      heroImg.decoding = 'async';
      heroImg.onload = () => {
        heroImg.style.transition = 'opacity .35s ease, transform .9s ease';
        heroImg.style.opacity = '1';
        heroImg.style.transform = 'scale(1)';
      };
    }, 90);
  }

  function update() {
    const url = inlineGalleryImages[inlineGalleryIndex];
    setHero(url);
    if (counter) counter.textContent = `${inlineGalleryIndex + 1} / ${inlineGalleryImages.length}`;

    thumbsWrap.querySelectorAll('[data-inline-i]').forEach((t) => {
      const i = Number(t.getAttribute('data-inline-i'));
      t.classList.toggle('active', i === inlineGalleryIndex);
    });

    const activeThumb = thumbsWrap.querySelector(`.inline-thumb.active`);
    activeThumb?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }

  thumbsWrap.querySelectorAll('[data-inline-i]').forEach((t) => {
    t.addEventListener('click', () => {
      inlineGalleryIndex = Number(t.getAttribute('data-inline-i')) || 0;
      update();
    });
  });

  prevBtn?.addEventListener('click', () => {
    inlineGalleryIndex = (inlineGalleryIndex - 1 + inlineGalleryImages.length) % inlineGalleryImages.length;
    update();
  });

  nextBtn?.addEventListener('click', () => {
    inlineGalleryIndex = (inlineGalleryIndex + 1) % inlineGalleryImages.length;
    update();
  });

  heroImg.addEventListener('click', () => openGallery(inlineGalleryImages, inlineGalleryIndex));

  heroImg.addEventListener(
    'touchstart',
    (e) => {
      inlineTouchStartX = e.touches?.[0]?.clientX ?? null;
    },
    { passive: true }
  );

  heroImg.addEventListener('touchend', (e) => {
    if (inlineTouchStartX === null) return;
    const endX = e.changedTouches?.[0]?.clientX ?? null;
    if (endX === null) return;

    const dx = endX - inlineTouchStartX;
    inlineTouchStartX = null;

    if (Math.abs(dx) < 45) return;

    if (dx > 0) prevBtn?.click();
    else nextBtn?.click();
  });

  window.addEventListener('keydown', (e) => {
    if (galleryModalEl?.classList.contains('open')) return;
    if (e.key === 'ArrowLeft') prevBtn?.click();
    if (e.key === 'ArrowRight') nextBtn?.click();
  });

  update();
}

function renderDetailIntoContent(data, tipo) {
  const content = document.getElementById('detailContent');
  const actions = document.getElementById('detailActions');
  const titleEl = document.getElementById('detailTitle');
  const taglineEl = document.getElementById('detailTagline');

  if (!content) return;

  const nombre = safeText(data.nombre, 'Alojamiento');
  const ciudad = safeText(data.ciudad, '');
  const direccion = safeText(data.direccion, '');
  const descripcionLarga = safeText(data.descripcionLarga, '');
  const capacidad = data.capacidad ? Number(data.capacidad) : null;
  const precio = typeof data.precioBase === 'number' ? data.precioBase : null;

  const images = Array.isArray(data.images) ? data.images.filter(Boolean) : [];
  const fotosLegacy = Array.isArray(data.fotos) ? data.fotos.filter(Boolean) : [];
  const fotos = images.length ? images : fotosLegacy;

  const imageMain = safeText(data.imageMain, '').trim();
  const hero = imageMain && fotos.includes(imageMain) ? imageMain : fotos[0] || '';

  if (titleEl) titleEl.textContent = nombre;
  if (taglineEl) taglineEl.textContent = ciudad ? `${ciudad}` : '';

  const hasCoords = typeof data.lat === 'number' && typeof data.lng === 'number';

  content.innerHTML = `
    <div class="detail-layout">
      <div class="detail-main">

        <!-- ===== Luxury inline carousel ===== -->
        <div class="inline-gallery lux-card fade-in">
          <div class="inline-hero">
            <div class="inline-hero-bg" id="inlineHeroBg" aria-hidden="true"></div>

            <button class="inline-nav inline-prev" id="inlinePrev" type="button" aria-label="Anterior">‹</button>

            ${
              hero
                ? `<img id="inlineHeroImg" src="${hero}" alt="${nombre}" decoding="async" fetchpriority="high">`
                : ''
            }

            <button class="inline-nav inline-next" id="inlineNext" type="button" aria-label="Siguiente">›</button>

            <div class="inline-overlay">
              <div class="inline-count" id="inlineCounter">${fotos.length ? `1 / ${fotos.length}` : ''}</div>
              ${
                fotos.length > 1
                  ? `<button class="inline-open" id="galleryOpenBtn" type="button">Ver ${fotos.length} fotos</button>`
                  : ''
              }
            </div>
          </div>

          <div class="inline-thumbs" id="inlineThumbs"></div>
        </div>

        <div class="booking-bar fade-in">
          <div class="booking-bar__left">
            <div class="price-small price-from">Desde</div>
            <div class="price-big">${precio !== null ? `${Number(precio).toFixed(0)} €` : '-'}</div>
            <div class="price-small">por noche</div>
            <div class="booking-type">${tipo === 'pack' ? 'Pack' : 'Apartamento'}</div>
          </div>

          <div class="booking-bar__mid">
            <div class="booking-perks">
              <span class="perk">✅ Sin intermediarios</span>
              <span class="perk">✅ Confirmación por email</span>
              <span class="perk">✅ Pago/confirmación segura</span>
            </div>
            <div class="booking-hint">Bloquea tus fechas en 1 minuto</div>
          </div>

          <div class="booking-bar__right">
            <button class="cta-btn cta-btn--primary" type="button" id="reserveBtnTop">
              Reservar ahora
            </button>
            <div class="cta-subtle">Sin cargos ocultos</div>
          </div>
        </div>

        <div class="highlights fade-in">
          ${ciudad ? `<span class="chip">📍 ${ciudad}</span>` : ''}
          ${capacidad ? `<span class="chip">👥 Hasta ${capacidad} huéspedes</span>` : ''}
          ${data.wifi ? `<span class="chip">📶 WiFi</span>` : `<span class="chip">✅ Reserva directa</span>`}
          ${data.terraza ? `<span class="chip">🌿 Terraza</span>` : ''}
        </div>

        <div class="detail-meta fade-in">
          ${direccion ? `<div class="detail-address"><strong>Dirección:</strong> ${direccion}</div>` : ''}
        </div>

        ${
          descripcionLarga
            ? `
              <div class="detail-description fade-in">
                <h3>Sobre este alojamiento</h3>
                <p>${descripcionLarga}</p>
              </div>
            `
            : ''
        }

        ${
          hasCoords
            ? `
              <section class="detail-location-inline fade-in">
                <div class="detail-location-head">
                  <h3>Ubicación</h3>
                  <a id="openInGoogleMaps" class="map-external-btn" target="_blank" rel="noopener">Ver en Google Maps</a>
                </div>
                <div class="detail-map-wrap">
                  <div id="detail-map" class="detail-map"></div>
                  <div class="map-glow" aria-hidden="true"></div>
                </div>
                <div class="map-disclaimer">📌 Mostramos una zona aproximada para proteger la privacidad del alojamiento.</div>
              </section>
            `
            : ''
        }

      </div>
    </div>
  `;

  initInlineGallery(fotos);

  const heroBg = document.getElementById('inlineHeroBg');
  if (heroBg && hero) heroBg.style.backgroundImage = `url("${hero}")`;

  const openBtn = document.getElementById('galleryOpenBtn');
  if (openBtn) {
    openBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openGallery(fotos, inlineGalleryIndex || 0);
    });
  }

  if (actions) actions.style.display = 'block';

  state.currentPropertyImg = fotos[0] || '';
  state.currentPropertyCity = ciudad || '';
  state.currentPropertyCap = capacidad || '';

  const rsImg = document.getElementById('rsImg');
  if (rsImg && fotos[0]) rsImg.style.backgroundImage = `url("${fotos[0]}")`;

  const rsName = document.getElementById('rsName');
  if (rsName) rsName.textContent = nombre;

  const rsMeta = document.getElementById('rsMeta');
  if (rsMeta) {
    const meta = [ciudad || null, capacidad ? `Hasta ${capacidad} huéspedes` : null].filter(Boolean).join(' · ');
    rsMeta.textContent = meta || '—';
  }
}

let galleryModalEl = null;

function ensureGalleryModal() {
  if (galleryModalEl) return galleryModalEl;

  const el = document.createElement('div');
  el.className = 'gallery-lightbox';
  el.innerHTML = `
    <div class="lb-box" role="dialog" aria-modal="true" aria-label="Galería">
      <div class="lb-top">
        <div class="lb-count" id="lbCount">Foto</div>
        <div class="lb-actions">
          <button class="lb-close" type="button" id="lbClose" aria-label="Cerrar">✕</button>
        </div>
      </div>

      <div class="lb-stage">
        <button class="lb-nav lb-prev" type="button" id="lbPrev" aria-label="Anterior">‹</button>
        <img class="lb-img" id="lbImg" alt="Foto" decoding="async">
        <button class="lb-nav lb-next" type="button" id="lbNext" aria-label="Siguiente">›</button>
      </div>

      <div class="lb-bottom" id="lbThumbs"></div>
    </div>
  `;

  el.addEventListener('click', (e) => {
    if (e.target === el) closeGallery();
  });

  document.body.appendChild(el);
  galleryModalEl = el;
  return el;
}

let galleryImages = [];
let galleryIndex = 0;

function openGallery(images, startIndex = 0) {
  galleryImages = (images || []).filter(Boolean);
  if (!galleryImages.length) return;

  galleryIndex = Math.max(0, Math.min(startIndex, galleryImages.length - 1));

  const modal = ensureGalleryModal();
  modal.classList.add('open');

  modal.querySelector('#lbClose').onclick = closeGallery;
  modal.querySelector('#lbPrev').onclick = () => setGalleryIndex(galleryIndex - 1);
  modal.querySelector('#lbNext').onclick = () => setGalleryIndex(galleryIndex + 1);

  window.addEventListener('keydown', onGalleryKeyDown);

  const thumbs = modal.querySelector('#lbThumbs');
  thumbs.innerHTML = galleryImages
    .map(
      (u, i) => `
      <div class="lb-thumb ${i === galleryIndex ? 'active' : ''}" data-i="${i}">
        <img src="${u}" alt="thumb" loading="lazy" decoding="async">
      </div>
    `
    )
    .join('');

  thumbs.querySelectorAll('[data-i]').forEach((t) => {
    t.addEventListener('click', () => {
      const i = Number(t.getAttribute('data-i'));
      setGalleryIndex(i);
    });
  });

  renderGalleryImage(true);
}

function closeGallery() {
  if (!galleryModalEl) return;
  galleryModalEl.classList.remove('open');
  window.removeEventListener('keydown', onGalleryKeyDown);
}

function onGalleryKeyDown(e) {
  if (!galleryModalEl?.classList.contains('open')) return;
  if (e.key === 'Escape') closeGallery();
  if (e.key === 'ArrowLeft') setGalleryIndex(galleryIndex - 1);
  if (e.key === 'ArrowRight') setGalleryIndex(galleryIndex + 1);
}

function setGalleryIndex(i) {
  if (!galleryImages.length) return;
  galleryIndex = (i + galleryImages.length) % galleryImages.length;
  renderGalleryImage(false);
}

function renderGalleryImage(firstPaint = false) {
  const modal = ensureGalleryModal();
  const img = modal.querySelector('#lbImg');
  const count = modal.querySelector('#lbCount');

  const url = galleryImages[galleryIndex];

  preloadImage(galleryImages[(galleryIndex + 1) % galleryImages.length]);
  preloadImage(galleryImages[(galleryIndex - 1 + galleryImages.length) % galleryImages.length]);

  if (!firstPaint) {
    img.style.opacity = '0';
    setTimeout(() => {
      img.src = url;
      img.onload = () => {
        img.style.transition = 'opacity .28s ease';
        img.style.opacity = '1';
      };
    }, 90);
  } else {
    img.src = url;
    img.style.opacity = '1';
  }

  count.textContent = `${galleryIndex + 1} / ${galleryImages.length}`;

  const thumbs = modal.querySelectorAll('.lb-thumb');
  thumbs.forEach((t, idx) => t.classList.toggle('active', idx === galleryIndex));
  const active = modal.querySelector('.lb-thumb.active');
  active?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
}

// Google Maps (mapa de ubicación):
// - Sin punto exacto
// - Centro aproximado (jitter determinista)

let pendingMapData = null;
let mapInstance = null;
let pulseCircle = null;
let pulseRaf = null;

function buildDarkMapStyle() {
  return [
    { elementType: 'geometry', stylers: [{ color: '#171717' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#9a9a9a' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#171717' }] },
    { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#2a2a2a' }] },
    { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#242424' }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#121212' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#000000' }] },
  ];
}

// hash -> [0..1)
function seeded01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h >>>= 0;
  return (h % 1000000) / 1000000;
}

// offset en metros a lat/lng aprox
function jitterLatLng(lat, lng, seedStr) {
  const r1 = seeded01(seedStr + ':a');
  const r2 = seeded01(seedStr + ':b');

  const distM = 90 + r1 * 100;
  const angle = r2 * Math.PI * 2;

  const dLat = (distM * Math.cos(angle)) / 111320; // m -> deg lat
  const dLng = (distM * Math.sin(angle)) / (111320 * Math.cos((lat * Math.PI) / 180));

  return { lat: lat + dLat, lng: lng + dLng, distM };
}

function stopPulse() {
  if (pulseRaf) cancelAnimationFrame(pulseRaf);
  pulseRaf = null;
  if (pulseCircle) {
    try {
      pulseCircle.setMap(null);
    } catch (_) {}
  }
  pulseCircle = null;
}

function startPulseSmooth(latLng) {
  if (!window.google || !mapInstance) return;

  stopPulse();

  const base = 85;     // radio base
  const amp = 85;      // amplitud (zona aprox)
  const period = 2200; // ms

  pulseCircle = new google.maps.Circle({
    strokeColor: '#d1b06b',
    strokeOpacity: 0.22,
    strokeWeight: 2,
    fillColor: '#d1b06b',
    fillOpacity: 0.08,
    map: mapInstance,
    center: latLng,
    radius: base,
  });

  let last = 0;

  const tick = (t) => {
    // throttle a ~30fps
    if (!last || t - last > 33) {
      last = t;
      const phase = (t % period) / period;
      const s = Math.sin(phase * Math.PI * 2);
      const eased = (s + 1) / 2;
      const radius = base + amp * eased;

      const strokeOpacity = 0.12 + 0.18 * (1 - eased);
      const fillOpacity = 0.05 + 0.06 * (1 - eased);

      try {
        pulseCircle.setRadius(radius);
        pulseCircle.setOptions({ strokeOpacity, fillOpacity });
      } catch (_) {}
    }

    pulseRaf = requestAnimationFrame(tick);
  };

  pulseRaf = requestAnimationFrame(tick);
}

function initDetailMap(lat, lng, title, seedKeyForObfuscation) {
  if (!window.google || !document.getElementById('detail-map')) return;

  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return;

  // Centro aproximado (no es la coordenada real)
  const seed = seedKeyForObfuscation || `${latNum},${lngNum}`;
  const approx = jitterLatLng(latNum, lngNum, seed);
  const center = { lat: approx.lat, lng: approx.lng };

  mapInstance = new google.maps.Map(document.getElementById('detail-map'), {
    center,
    zoom: 16,
    styles: buildDarkMapStyle(),
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    gestureHandling: 'greedy',
    clickableIcons: false,
  });

  // ✅ SIN MARKER (sin punto exacto)
  startPulseSmooth(center);

  const btn = document.getElementById('openInGoogleMaps');
  if (btn) {
    btn.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(safeText(title, 'Ubicación'))}`;
  }
}

// Hook con tu callback initMap de detalle.html
window.__initMapImpl = function () {
  if (!pendingMapData) return;
  initDetailMap(
    pendingMapData.lat,
    pendingMapData.lng,
    pendingMapData.title,
    pendingMapData.seedKey
  );
  pendingMapData = null;
};

async function initCalendarForProperty(id, tipo, data) {
  state.currentPropertyId = id;
  state.currentPropertyTipo = tipo;
  state.currentPropertyName = (data && data.nombre) || 'Alojamiento';
  if (data && typeof data.precioBase === 'number') state.currentPricePerNight = data.precioBase;
  state.currentPropertyMinNights = (data?.minNights > 0) ? data.minNights : 1;

  state.calendarCurrentDate = new Date();
  state.bookCheckInDate = null;
  state.bookCheckOutDate = null;
  state.ownHoldDatesSet.clear();

  // Preseleccionar fechas desde URL (?ci=&co=) — pasadas desde el filtro del listado
  const _up = new URLSearchParams(window.location.search);
  const _ci = _up.get('ci');
  const _co = _up.get('co');
  if (_ci && _co) {
    const parseDateLocal = (iso) => {
      const [y, m, d] = iso.split('-').map(Number);
      if (!y || !m || !d) return null;
      const dt = new Date(y, m - 1, d);
      dt.setHours(0, 0, 0, 0);
      return dt;
    };
    const ciDate = parseDateLocal(_ci);
    const coDate = parseDateLocal(_co);
    if (ciDate && coDate && coDate > ciDate) {
      state.bookCheckInDate = ciDate;
      state.bookCheckOutDate = coDate;
    }
  }

  await cleanupExpiredHoldsOnLoad();
  setUpRealtimeAvailability();
  setUpRealtimePrices();
  updateReservationDates();
  renderCalendar();

  // Actualiza el panel "Tu reserva" cada poco (sin tocar calendar.js)
  setInterval(() => {
    const inEl = document.getElementById('rsIn');
    const outEl = document.getElementById('rsOut');
    const nightsEl = document.getElementById('rsNights');
    const totalEl = document.getElementById('rsTotal');
    if (!inEl || !outEl || !nightsEl || !totalEl) return;

    const ci = state.bookCheckInDate ? toISO(state.bookCheckInDate) : '—';
    const co = state.bookCheckOutDate ? toISO(state.bookCheckOutDate) : '—';
    inEl.textContent = ci;
    outEl.textContent = co;

    if (state.bookCheckInDate && state.bookCheckOutDate) {
      const ms = state.bookCheckOutDate - state.bookCheckInDate;
      const n = Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
      nightsEl.textContent = String(n);

      const p = Number(state.currentPricePerNight);
      totalEl.textContent = Number.isFinite(p) ? `${Math.round(p * n)} €` : '—';
    } else {
      nightsEl.textContent = '—';
      totalEl.textContent = '—';
    }
  }, 350);

  window.previousMonth = previousMonth;
  window.nextMonth = nextMonth;
  window.selectCalendarDate = selectCalendarDate;
}

async function loadDetail() {
  const { id, tipo } = getParams();
  const content = document.getElementById('detailContent');

  if (!id) {
    if (content) content.innerHTML = '<p>Falta el parámetro <strong>id</strong> en la URL.</p>';
    return;
  }

  try {
    const col = tipo === 'pack' ? 'packs' : 'apartamentos';
    const snap = await db.collection(col).doc(id).get();

    if (!snap.exists) {
      if (content) content.innerHTML = '<p>No existe este alojamiento.</p>';
      return;
    }

    const data = snap.data() || {};

    // PACK: derivar el precio de las unidades (packPct × (A + B)); NO usar el precioBase guardado.
    // Sobrescribimos data.precioBase en memoria para que ficha (display) y el base del calendario
    // usen el derivado. currentPackPct se fija antes de setUpRealtimePrices (dentro de initCalendar…).
    if (tipo === 'pack') {
      const sp = Array.isArray(data.sourceProperties) ? data.sourceProperties : [];
      const pct = resolvePackPct(data);
      state.currentPackPct = pct;
      if (sp.length >= 2) {
        const [aptA, aptB] = await Promise.all([
          db.collection('apartamentos').doc(sp[0]).get(),
          db.collection('apartamentos').doc(sp[1]).get(),
        ]);
        const derived = packBasePrice(
          Number(aptA.data()?.precioBase),
          Number(aptB.data()?.precioBase),
          pct
        );
        if (derived != null) data.precioBase = derived;
      }
    } else {
      state.currentPackPct = null;
    }

    renderDetailIntoContent(data, tipo);
    loadReviews(snap.id);
    state.currentPropertySourceProperties = Array.isArray(data.sourceProperties)
      ? data.sourceProperties
      : [];
    await initCalendarForProperty(snap.id, tipo, data);

    // Preparar mapa (obfuscado): guardamos coords y dejamos que initMap lo pinte cuando Maps cargue
    if (typeof data.lat === 'number' && typeof data.lng === 'number') {
      pendingMapData = {
        lat: data.lat,
        lng: data.lng,
        title: data.nombre || 'Alojamiento',
        // semilla determinista por alojamiento (así la "zona aproximada" no cambia cada refresh)
        seedKey: `${snap.id}:${data.lat}:${data.lng}`,
      };

      if (window.google && typeof window.__initMapImpl === 'function') {
        window.__initMapImpl();
      }
    }

    const reserveBtnTop = document.getElementById('reserveBtnTop');
    if (reserveBtnTop) {
      reserveBtnTop.addEventListener('click', () => {
        document.getElementById('reserveBtn')?.click();
      });
    }

    const reserveBtnSide = document.getElementById('reserveBtnSide');
    if (reserveBtnSide) {
      reserveBtnSide.addEventListener('click', () => {
        document.getElementById('reserveBtn')?.click();
      });
    }

    const reserveBtn = document.getElementById('reserveBtn');
    if (reserveBtn) {
      reserveBtn.addEventListener('click', () => {
        // Puedes continuar al checkout aunque aún no hayas elegido fechas.
        // Si hay fechas, las pasamos por URL; si no, se elegirán en checkout.
        const params = new URLSearchParams({ id: snap.id, tipo });

        if (state.bookCheckInDate && state.bookCheckOutDate) {
          const ci = toISO(state.bookCheckInDate);
          const co = toISO(state.bookCheckOutDate);
          params.set('ci', ci);
          params.set('co', co);
        }

        const checkoutAbs = new URL(`./checkout.html?${params.toString()}`, window.location.href).toString();

        if (!state.currentUser?.uid) {
          goToLoginWithBack(checkoutAbs);
          return;
        }

        window.location.href = `./checkout.html?${params.toString()}`;
      });
    }
  } catch (err) {
    console.error(err);
    if (content) content.innerHTML = '<p>Error cargando el alojamiento.</p>';
  }
}

function starsHtml(rating) {
  const rounded = Math.round(Math.max(0, Math.min(5, Number(rating) || 0)));
  return '★'.repeat(rounded) + '☆'.repeat(5 - rounded);
}

function fmtReviewDateES(r) {
  let dt = null;
  if (r.reviewDateISO) {
    const [y, m, d] = r.reviewDateISO.split('-').map(Number);
    dt = new Date(y, m - 1, d);
  } else if (r.createdAt?.seconds) {
    dt = new Date(r.createdAt.seconds * 1000);
  }
  if (!dt || isNaN(dt)) return '';
  return dt.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
}

function reviewInitials(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function loadReviews(propertyId) {
  const section = document.getElementById('reviewsSection');
  if (!section) return;

  db.collection('reviews')
    .where('propertyId', '==', propertyId)
    .limit(100)
    .get()
    .then(snap => {
      const all = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(r => r.visible !== false)
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

      const heading = '<h2>Opiniones de huéspedes</h2>';

      if (!all.length) {
        section.innerHTML = `${heading}<div class="reviews-empty">Sé el primero en opinar sobre este alojamiento.</div>`;
        return;
      }

      const avg = all.reduce((s, r) => s + (Number(r.rating) || 0), 0) / all.length;
      const showSummary = all.length >= 3;
      const STEP = 5;
      let showing = STEP;

      function renderReviews() {
        const slice = all.slice(0, showing);

        const cardsHtml = slice.map(r => {
          const author = r.userDisplayName || r.authorName || 'Huésped';
          const dateStr = fmtReviewDateES(r);
          const text = r.comentario || r.text || '';
          const responseText = r.respuestaAlojamiento || r.response || '';
          return `
            <div class="review-card">
              <div class="review-card-head">
                <div class="review-avatar">${reviewInitials(author)}</div>
                <div class="review-meta">
                  <div class="review-author">${safeText(author)}</div>
                  ${dateStr ? `<div class="review-date">${dateStr}</div>` : ''}
                </div>
                <div class="review-stars">${starsHtml(r.rating)}</div>
              </div>
              ${text ? `<p class="review-text">${safeText(text)}</p>` : ''}
              ${responseText ? `
                <div class="review-response">
                  <span class="response-label">Respuesta del alojamiento</span>
                  <p>${safeText(responseText)}</p>
                </div>
              ` : ''}
            </div>
          `;
        }).join('');

        const summaryHtml = showSummary ? `
          <div class="reviews-summary">
            <div class="reviews-avg-score">${avg.toFixed(1)}</div>
            <div>
              <div class="reviews-avg-stars">${starsHtml(avg)}</div>
              <div class="reviews-avg-count">${all.length} opinión${all.length !== 1 ? 'es' : ''}</div>
            </div>
          </div>
        ` : '';

        const moreBtnHtml = showing < all.length
          ? `<button class="reviews-more-btn" type="button" id="reviewsMoreBtn">Ver más opiniones (${all.length - showing} restantes)</button>`
          : '';

        section.innerHTML = `${heading}${summaryHtml}<div class="reviews-list">${cardsHtml}</div>${moreBtnHtml}`;

        document.getElementById('reviewsMoreBtn')?.addEventListener('click', () => {
          showing = Math.min(showing + STEP, all.length);
          renderReviews();
        });
      }

      renderReviews();
    })
    .catch(err => console.warn('loadReviews error:', err));
}

function cleanupOnLeaveDetail() {
  try { state.reservasUnsub?.(); } catch (_) {}
  try { state.holdsUnsub?.(); } catch (_) {}
  try { deleteActiveHold(); } catch (_) {}
}
window.addEventListener('pagehide', cleanupOnLeaveDetail);

document.addEventListener('DOMContentLoaded', () => {
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

  const backBtn = document.getElementById('backBtn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      window.location.href = './index.html';
    });
  }

  initAuthUI();
  loadDetail();
});
