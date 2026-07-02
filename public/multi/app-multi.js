import { subscribeApartamentosActivos, subscribePacksActivos } from './properties-service-multi.js';
import { auth, db } from '../shared/firebase.js';
import { state } from '../shared/state.js';
import { applyURLParams } from './url-params.js';
import { packBasePrice, resolvePackPct } from '../shared/pack-pricing.js';

function initAuthButtons() {
  auth.onAuthStateChanged((user) => {
    state.currentUser = user ? { uid: user.uid, email: user.email || null } : null;

    const btnLogin = document.getElementById('btnLogin');
    const btnRegister = document.getElementById('btnRegister');
    const btnProfile = document.getElementById('btnProfile');

    if (!btnLogin || !btnRegister || !btnProfile) return;

    if (user) {
      btnLogin.style.display = 'none';
      btnRegister.style.display = 'none';
      btnProfile.style.display = 'inline-flex';
    } else {
      btnLogin.style.display = 'inline-flex';
      btnRegister.style.display = 'inline-flex';
      btnProfile.style.display = 'none';
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

    applyURLParams();
  });
}

let allItems = [];
let filteredItems = [];
const reservationsByProperty = new Map();
let pricesLoading = false;

const filterState = {
  tipo: 'all',
  ciudad: 'all',
  guests: 2,
  checkIn: null,
  checkOut: null,
};

const ui = {
  grid: null,
  results: null,
  filterType: null,
  filterCity: null,
  filterGuests: null,
};

let map = null;
let infoWindow = null;
let mapReady = false;
let markersMap = new Map();

const MADRID = { lat: 40.4168, lng: -3.7038 };
let keepInitialMadridViewport = true;

// Returns the display price: range average when dates are set, else precioBase
function effectivePrice(item) {
  const p = item._rangePrice ?? item.precioBase;
  return typeof p === 'number' ? p : null;
}

function createPriceIcon(price, isActive = false) {
  const displayPrice = typeof price === "number" ? `€${price.toFixed(0)}` : "€–";

  const bg = isActive ? "#111111" : "#F2B544";
  const textColor = isActive ? "#ffffff" : "#1a1a1a";
  const ring = isActive ? "rgba(0,0,0,0.18)" : "rgba(0,0,0,0.10)";

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="92" height="62" viewBox="0 0 92 62">
    <defs>
      <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="6" stdDeviation="6" flood-opacity="0.25"/>
      </filter>
    </defs>

    <g filter="url(#shadow)">
      <!-- Active ring -->
      <rect x="10" y="8" rx="18" ry="18" width="72" height="34" fill="${ring}" opacity="${isActive ? 1 : 0}"/>

      <!-- Body -->
      <rect x="10" y="8" rx="18" ry="18" width="72" height="34" fill="${bg}"/>

      <!-- Pointer -->
      <path d="M46 56 L39 42 L53 42 Z" fill="${bg}"/>
    </g>

    <text x="46" y="30" text-anchor="middle"
      font-family="Inter, system-ui, -apple-system"
      font-size="14"
      font-weight="700"
      fill="${textColor}">
      ${displayPrice}
    </text>
  </svg>
  `.trim();

  return {
    url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(92, 62),
    anchor: new google.maps.Point(46, 56),
  };
}

function subscribeAllReservas() {
  return db.collection('reservas_public')
    .onSnapshot((snap) => {
      reservationsByProperty.clear();

      snap.forEach((doc) => {
        const r = doc.data();
        if (!r?.propertyId || !r?.checkInISO || !r?.checkOutISO) return;

        const set = reservationsByProperty.get(r.propertyId) || new Set();

        const d = new Date(r.checkInISO);
        const end = new Date(r.checkOutISO);
        d.setHours(0,0,0,0);
        end.setHours(0,0,0,0);

        while (d < end) {
          set.add(d.toISOString().slice(0, 10));
          d.setDate(d.getDate() + 1);
        }

        reservationsByProperty.set(r.propertyId, set);
      });

      applyFilters();
    });
}

function setActiveCard(id) {
  document.querySelectorAll('[data-property-id]').forEach((el) => {
    el.classList.toggle('is-active', el.dataset.propertyId === id);
  });
}

function initMapImpl() {
  const mapEl = document.getElementById('map');
  if (!mapEl) return;

  map = new google.maps.Map(mapEl, {
    center: MADRID,
    zoom: 14,
    mapTypeControl: true,
    streetViewControl: true,
    fullscreenControl: true,
    tilt: 45,
    heading: 0,
  });

  infoWindow = new google.maps.InfoWindow();
  mapReady = true;

  map.addListener('dragstart', () => { keepInitialMadridViewport = false; });
  map.addListener('zoom_changed', () => { keepInitialMadridViewport = false; });

  if (filteredItems.length) rebuildMarkers();
}

window.__initMapImpl = initMapImpl;

if (window.__initMapPending) {
  window.__initMapPending = false;
  initMapImpl();
}

function rebuildMarkers() {
  if (!map) return;

  markersMap.forEach(({ marker }) => marker.setMap(null));
  markersMap.clear();

  filteredItems.forEach((item) => {
    if (typeof item.lat !== 'number' || typeof item.lng !== 'number') return;

    const marker = new google.maps.Marker({
      position: { lat: item.lat, lng: item.lng },
      map,
      icon: createPriceIcon(effectivePrice(item)),
      zIndex: 1,
    });

    marker.addListener('click', () => {
      keepInitialMadridViewport = false;
      setActiveItem(item.id, {
        panTo: true,
        openPopup: true,
        scrollToCard: true,
        highlightCard: true,
      });
    });

    markersMap.set(item.id, { marker, item });

    if (markerCluster) {
      markerCluster.clearMarkers();
      markerCluster = null;
    }

    const markers = [...markersMap.values()].map(x => x.marker);

    markerCluster = new markerClusterer.MarkerClusterer({
      map,
      markers,
    });
  });

  const shouldFit =
    !keepInitialMadridViewport &&
    (filterState.ciudad !== 'all' || filterState.tipo !== 'all' || !!filterState.checkIn);

  if (shouldFit) fitMapToMarkers();
}

function fitMapToMarkers() {
  if (!map || !markersMap.size) return;

  const bounds = new google.maps.LatLngBounds();
  markersMap.forEach(({ marker }) => bounds.extend(marker.getPosition()));
  map.fitBounds(bounds);

  google.maps.event.addListenerOnce(map, 'idle', () => {
    if (map.getZoom() > 16) map.setZoom(16);
  });
}

function buildPopupContent(item) {
  const images = Array.isArray(item.images) ? item.images : [];
  const foto = item.imageMain || images[0] || '../img/placeholder-alojamiento.svg';
  const capacidad = item.capacidadTotal ?? item.capacidad ?? null;
  const price = effectivePrice(item);
  const hasDates = !!(filterState.checkIn && filterState.checkOut);
  const precioStr = typeof price === 'number'
    ? `Desde ${price.toFixed(0)} €${hasDates && item._rangePrice != null ? ' (media)' : ' / noche'}`
    : 'Consultar precio';

  return `
    <div class="map-popup">
      <img src="${foto}" class="map-popup-img" onerror="this.src='../img/placeholder-alojamiento.svg'" />
      <div class="map-popup-body">
        <div class="map-popup-title">${item.nombre || 'Alojamiento'}</div>
        <div class="map-popup-sub">
          ${item.ciudad || ''}${capacidad ? ` · Hasta ${capacidad} huéspedes` : ''}
        </div>
        <div class="map-popup-price">${precioStr}</div>
        <a class="map-popup-btn" href="./detalle.html?id=${item.id}&tipo=${item._tipo}">
          Ver detalles
        </a>
      </div>
    </div>
  `;
}

function setActiveItem(id, opts = {}) {
  const entry = markersMap.get(id);
  if (!entry) return;

  markersMap.forEach(({ marker, item }) => {
    const active = item.id === id;
    marker.setIcon(createPriceIcon(effectivePrice(item), active));
    marker.setZIndex(active ? 999 : 1);
  });

  const { marker, item } = entry;

  if (opts.panTo) {
    const scrollY = window.scrollY;
    map.panTo(marker.getPosition());
    window.scrollTo(0, scrollY);
  }
  if (opts.zoomTo) map.setZoom(opts.zoomTo);

  pulseMarker(marker, item);

  if (opts.highlightCard) setActiveCard(id);

  if (opts.openPopup && infoWindow) {
    infoWindow.setContent(buildPopupContent(entry.item));
    infoWindow.open(map, entry.marker);
  }

  if (opts.scrollToCard) {
    document
      .querySelector(`[data-property-id="${CSS.escape(id)}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function createPropertyCard(item) {
  const card = document.createElement('article');
  card.className = 'property-card lux-hover';
  card.dataset.propertyId = item.id;
  card.dataset.ciudad = (item.ciudad || item.location || '').toLowerCase();

  const images = Array.isArray(item.images) ? item.images : [];
  const foto = item.imageMain || images[0] || '../img/placeholder-alojamiento.svg';
  const capacidad = item.capacidadTotal ?? item.capacidad ?? null;
  const price = effectivePrice(item);
  const minNightsBadge = (item.minNights && item.minNights > 1)
    ? `<div class="property-min-nights">Mín. ${item.minNights} noches</div>`
    : '';

  let priceHTML;
  if (pricesLoading) {
    priceHTML = `<div class="card-price-block">
      <span class="card-desde">Desde</span>
      <span class="card-price card-price-loading">…</span>
      <span class="card-unit">/ noche</span>
    </div>`;
  } else if (price != null) {
    priceHTML = `<div class="card-price-block">
      <span class="card-desde">Desde</span>
      <span class="card-price">${price.toFixed(0)} €</span>
      <span class="card-unit">/ noche</span>
    </div>`;
  } else {
    priceHTML = `<span class="card-unit">Precio según fechas</span>`;
  }

  card.innerHTML = `
    <div class="property-image-wrap">
      <img src="${foto}" class="property-image" onerror="this.onerror=null;this.src='../img/placeholder-alojamiento.svg'">
      <div class="property-pill">${item._tipo === 'apto' ? 'Apartamento' : 'Pack'}</div>
      ${minNightsBadge}
    </div>
    <div class="property-content">
      <h3>${item.nombre || 'Alojamiento'}</h3>
      ${capacidad ? `<p>${capacidad} huéspedes máx.</p>` : ''}
      <div class="property-footer">
        ${priceHTML}
        <button class="btn-ghost">Ver detalles</button>
      </div>
    </div>
  `;

  // Hover: pan mapa + popup. Packs: zoom extra para ver marcadores solapados
  card.addEventListener('mouseenter', () => {
    const isMobile = window.innerWidth < 768;
    if (!isMobile && map) {
      keepInitialMadridViewport = false;
      if (item._tipo === 'pack') {
        window._prePackZoom   = map.getZoom();
        window._prePackCenter = map.getCenter();
        const newZoom = Math.min((window._prePackZoom || 14) + 3, 16);
        map.setZoom(newZoom);
        setActiveItem(item.id, { panTo: true, openPopup: true, highlightCard: true });
      } else {
        setActiveItem(item.id, { panTo: true, openPopup: true, highlightCard: true });
      }
    }
  });

  // Mouseleave: restaurar zoom previo para packs
  card.addEventListener('mouseleave', () => {
    if (item._tipo === 'pack' && map && window._prePackZoom != null) {
      map.setZoom(window._prePackZoom);
      map.panTo(window._prePackCenter);
      window._prePackZoom   = null;
      window._prePackCenter = null;
    }
  });

  card.addEventListener('click', () => {
    // Mejora 5: guardar filtros actuales antes de navegar al detalle
    try {
      sessionStorage.setItem('jla_filters', JSON.stringify({
        tipo:     filterState.tipo,
        ciudad:   filterState.ciudad,
        guests:   filterState.guests,
        checkIn:  filterState.checkIn,
        checkOut: filterState.checkOut,
      }));
    } catch (_) {}

    const params = new URLSearchParams({ id: item.id, tipo: item._tipo });
    if (filterState.checkIn && filterState.checkOut) {
      params.set('ci', filterState.checkIn);
      params.set('co', filterState.checkOut);
    }
    window.location.href = `./detalle.html?${params.toString()}`;
  });

  return card;
}

function pulseMarker(marker, item) {
  const price = effectivePrice(item);
  marker.setIcon(createPriceIcon(price, true));
  setTimeout(() => {
    marker.setIcon(createPriceIcon(price, true));
  }, 120);
}

function buildCityOptions() {
  if (!ui.filterCity) return;

  const cities = new Set(allItems.map((i) => i.ciudad).filter(Boolean));
  ui.filterCity.innerHTML = '<option value="all">Todas</option>';

  [...cities].sort().forEach((city) => {
    const opt = document.createElement('option');
    opt.value = city;
    opt.textContent = city;
    ui.filterCity.appendChild(opt);
  });

  // Prioridad 1: parámetro de URL pendiente
  const pending = window.__jlaURLParams;
  if (pending?.ciudad) {
    const normalize = (s) =>
      s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const target = normalize(pending.ciudad);
    const match = Array.from(ui.filterCity.options).find(
      (o) => normalize(o.value) === target || normalize(o.text) === target
    );
    if (match) ui.filterCity.value = match.value;
  } else if (filterState.ciudad && filterState.ciudad !== 'all') {
    // Prioridad 2: ciudad guardada en sessionStorage (Mejora 5)
    const opt = Array.from(ui.filterCity.options).find(o => o.value === filterState.ciudad);
    if (opt) ui.filterCity.value = filterState.ciudad;
  }
}

function applyFilters() {
  const tipo   = ui.filterType?.value  || 'all';
  const ciudad = ui.filterCity?.value  || 'all';
  const guests = parseInt(ui.filterGuests?.value || '1', 10) || 1;

  filterState.tipo   = tipo;
  filterState.ciudad = ciudad;
  filterState.guests = guests;

  const hasDates = !!(filterState.checkIn && filterState.checkOut);
  let excludedByDates = 0;

  filteredItems = allItems.filter((i) => {
    if (tipo   !== 'all' && i._tipo   !== tipo)   return false;
    if (ciudad !== 'all' && i.ciudad  !== ciudad) return false;

    const cap = i.capacidadTotal ?? i.capacidad ?? null;
    if (cap && guests > cap) return false;

    if (hasDates) {
      let failsDates = false;

      if (!failsDates) {
        const booked = reservationsByProperty.get(i.id);
        if (booked) {
          const nights = getISODateRange(filterState.checkIn, filterState.checkOut);
          for (const iso of nights) {
            if (booked.has(iso)) { failsDates = true; break; }
          }
        }
      }

      if (!failsDates) {
        const nNights = nightsBetween(filterState.checkIn, filterState.checkOut);
        if (nNights < (i.minNights || 1)) failsDates = true;
      }

      if (!failsDates && i.precioHasta) {
        const lastNight = addDaysISO(filterState.checkOut, -1);
        if (lastNight > i.precioHasta) failsDates = true;
      }

      if (failsDates) { excludedByDates++; return false; }
    }

    return true;
  });

  renderGrid(excludedByDates);

  if (mapReady) {
    if (filterState.ciudad !== 'all' || filterState.tipo !== 'all' || !!filterState.checkIn) {
      keepInitialMadridViewport = false;
    }
    rebuildMarkers();
  }
}

// Mejora 4: fetch precio medio real para el rango de fechas seleccionado
async function loadRangePrices() {
  if (!filterState.checkIn || !filterState.checkOut) return;

  const ci     = filterState.checkIn;
  const co     = filterState.checkOut;
  const nights = nightsBetween(ci, co);
  if (nights <= 0) return;

  const nightISOs = getISODateRange(ci, co);

  // Borrar precios previos
  filteredItems.forEach(item => { delete item._rangePrice; });

  pricesLoading = true;
  renderGrid();

  try {
    await Promise.allSettled(
      filteredItems.map(async (item) => {
        const col = item._tipo === 'pack' ? 'packs' : 'apartamentos';
        try {
          const snap = await db.collection(col).doc(item.id)
            .collection('prices')
            .where('dateISO', '>=', ci)
            .where('dateISO', '<=', co)
            .get();

          const priceMap = new Map();
          snap.docs.forEach(doc => {
            const data = doc.data();
            const iso  = data.dateISO || doc.id;
            if (iso) priceMap.set(iso, Number(data.price || 0));
          });

          const base = typeof item.precioBase === 'number' ? item.precioBase : 0;
          let total = 0;
          for (const iso of nightISOs) {
            total += priceMap.has(iso) ? priceMap.get(iso) : base;
          }
          item._rangePrice = Math.round(total / nights);
        } catch (_) {}
      })
    );
  } finally {
    pricesLoading = false;
    renderGrid();
    if (mapReady) rebuildMarkers();
  }
}

function getISODateRange(ci, co) {
  const out = [];
  const d   = new Date(ci);
  const end = new Date(co);

  while (d < end) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function addDaysISO(iso, n) {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function nightsBetween(ci, co) {
  return Math.round((new Date(co) - new Date(ci)) / 86400000);
}

function renderGrid(excludedByDates = 0) {
  if (!ui.grid) return;

  ui.grid.innerHTML = '';

  if (!filteredItems.length) {
    ui.grid.innerHTML = '<div class="empty-state">No hay alojamientos disponibles.</div>';
  } else {
    filteredItems.forEach((i) => ui.grid.appendChild(createPropertyCard(i)));
  }

  if (ui.results) {
    ui.results.textContent =
      filteredItems.length === 1
        ? '1 Resultado'
        : `${filteredItems.length} Resultados`;
  }

  const existing = document.getElementById('datesExcludedInfo');
  if (existing) existing.remove();

  const hasDates = !!(filterState.checkIn && filterState.checkOut);
  if (hasDates && excludedByDates > 0) {
    const msg = document.createElement('p');
    msg.id = 'datesExcludedInfo';
    msg.className = 'dates-excluded-info';
    const s = excludedByDates > 1;
    msg.textContent = `${excludedByDates} alojamiento${s ? 's' : ''} no disponible${s ? 's' : ''} para las fechas seleccionadas (reservados, sin precio o estancia mínima no cumplida).`;
    ui.grid.parentNode?.insertBefore(msg, ui.grid);
  }
}

let unsubAptos = null;
let unsubPacks = null;
let markerCluster = null;

function normalizeItem(x) {
  const images = Array.isArray(x.images)
    ? x.images
    : Array.isArray(x.fotos)
      ? x.fotos
      : [];

  return {
    ...x,
    images,
    imageMain: x.imageMain || images[0] || '',
    descripcionCorta:
      x.tagline ||
      x.descripcionCorta ||
      (x.descripcion ? String(x.descripcion).split('.').shift() : ''),
  };
}

function rebuildAllItemsFromRT(aptos, packs) {
  const aptoItems = aptos.map((a) => ({ ...normalizeItem(a), _tipo: 'apto' }));
  const packItems = packs.map((p) => ({ ...normalizeItem(p), _tipo: 'pack' }));

  // El precio del pack se DERIVA de sus unidades con el helper canónico (packPct × (A + B)).
  packItems.forEach(pack => {
    const sp = Array.isArray(pack.sourceProperties) ? pack.sourceProperties : [];
    if (sp.length >= 2) {
      const apt1 = aptoItems.find(a => a.id === sp[0]);
      const apt2 = aptoItems.find(a => a.id === sp[1]);
      if (apt1 && apt2) {
        const derived = packBasePrice(apt1.precioBase, apt2.precioBase, resolvePackPct(pack));
        if (derived != null) pack.precioBase = derived;
      }
    }
  });

  allItems = [...aptoItems, ...packItems];

  buildCityOptions();

  const pending = window.__jlaURLParams;
  if (pending && !pending.applied) {
    pending.applied = true;

    if (pending.ci) filterState.checkIn  = pending.ci;
    if (pending.co) filterState.checkOut = pending.co;

    if (pending.guests && ui.filterGuests) {
      const n = parseInt(pending.guests, 10);
      if (n >= 1 && n <= 8) ui.filterGuests.value = n;
    }

    const ciEl = document.getElementById('filterCheckIn');
    const coEl = document.getElementById('filterCheckOut');
    if (ciEl && pending.ci) ciEl.value = pending.ci;
    if (coEl && pending.co) coEl.value = pending.co;
  }

  applyFilters();
}

function showDateError(msg) {
  let el = document.getElementById('filterDateError');
  if (!el) {
    el = document.createElement('p');
    el.id = 'filterDateError';
    el.style.cssText = 'color:#b00020;font-size:13px;margin:6px 0 0;';
    document.querySelector('.multi-filters')?.appendChild(el);
  }
  el.textContent = msg;
}

function clearDateError() {
  document.getElementById('filterDateError')?.remove();
}

function init() {
  const goToPerfil = (mode = 'login') => {
    const back = window.location.href;
    const hash = mode === 'register' ? '#register' : '';
    window.location.href =
      `../perfil/index-usuario.html?back=${encodeURIComponent(back)}` + hash;
  };

  document.getElementById('btnLogin')?.addEventListener('click', () => goToPerfil('login'));
  document.getElementById('btnRegister')?.addEventListener('click', () => goToPerfil('register'));
  document.getElementById('btnProfile')?.addEventListener('click', () => goToPerfil('login'));

  initAuthButtons();

  ui.grid       = document.getElementById('propertiesGrid');
  ui.results    = document.getElementById('resultsCount');
  ui.filterType = document.getElementById('filterType');
  ui.filterCity = document.getElementById('filterCity');
  ui.filterGuests = document.getElementById('filterGuests');

  if (!ui.grid) return;
  ui.grid.innerHTML = '<p>Cargando alojamientos...</p>';

  // Mejora 5: restaurar filtros guardados al volver del detalle
  try {
    const saved = sessionStorage.getItem('jla_filters');
    if (saved) {
      const f = JSON.parse(saved);
      filterState.tipo    = f.tipo    || 'all';
      filterState.ciudad  = f.ciudad  || 'all';
      filterState.guests  = f.guests  || 2;
      filterState.checkIn  = f.checkIn  || null;
      filterState.checkOut = f.checkOut || null;

      if (ui.filterType)   ui.filterType.value   = filterState.tipo;
      if (ui.filterGuests) ui.filterGuests.value  = filterState.guests;
      // filterCity se aplica en buildCityOptions() una vez que las opciones estén construidas
    }
  } catch (_) {}

  ui.filterType?.addEventListener('change', applyFilters);
  ui.filterCity?.addEventListener('change', applyFilters);
  ui.filterGuests?.addEventListener('input', applyFilters);

  let rtAptos = [];
  let rtPacks = [];

  const ciInput = document.getElementById('filterCheckIn');
  const coInput = document.getElementById('filterCheckOut');

  // Restaurar fechas guardadas en los inputs
  if (filterState.checkIn  && ciInput) ciInput.value = filterState.checkIn;
  if (filterState.checkOut && coInput) coInput.value = filterState.checkOut;

  function isoToday() {
    const d = new Date();
    d.setHours(0,0,0,0);
    return d.toISOString().slice(0,10);
  }

  const today = isoToday();
  if (ciInput) ciInput.min = today;
  if (coInput) coInput.min = addDaysISO(today, 1);

  // Mejora 6: al seleccionar check-in, abrir automáticamente el picker de check-out
  ciInput?.addEventListener('change', () => {
    const ci = ciInput.value;
    if (!ci) return;

    const minCo = addDaysISO(ci, 1);
    if (coInput) {
      coInput.min = minCo;
      if (!coInput.value || coInput.value < minCo) coInput.value = minCo;
      clearDateError();
      coInput.focus();
      try { coInput.showPicker(); } catch (_) { coInput.click(); }
    }
  });

  coInput?.addEventListener('change', () => {
    if (!ciInput?.value || !coInput.value) return;
    if (coInput.value <= ciInput.value) {
      showDateError('La fecha de salida debe ser posterior a la de entrada.');
      coInput.value = '';
    } else {
      clearDateError();
      const minCo = addDaysISO(ciInput.value, 1);
      if (coInput.value < minCo) coInput.value = minCo;
    }
  });

  // Mejora 4: "Buscar" también carga precios reales para el rango
  document.getElementById('filterApplyDates')?.addEventListener('click', async () => {
    filterState.checkIn  = ciInput?.value || null;
    filterState.checkOut = coInput?.value || null;

    const parseISO = (iso) => {
      if (!iso) return null;
      const [y, m, d] = iso.split('-').map(Number);
      return (y && m && d) ? new Date(y, m - 1, d) : null;
    };
    state.bookCheckInDate  = parseISO(filterState.checkIn);
    state.bookCheckOutDate = parseISO(filterState.checkOut);

    applyFilters();

    if (filterState.checkIn && filterState.checkOut) {
      await loadRangePrices();
    }
  });

  document.getElementById('filterClearDates')?.addEventListener('click', () => {
    filterState.checkIn  = null;
    filterState.checkOut = null;
    state.bookCheckInDate  = null;
    state.bookCheckOutDate = null;
    if (ciInput) ciInput.value = '';
    if (coInput) coInput.value = '';

    // Limpiar precios de rango calculados
    allItems.forEach(item => { delete item._rangePrice; });

    clearDateError();
    applyFilters();
  });

  subscribeAllReservas();
  unsubAptos?.();
  unsubPacks?.();

  unsubAptos = subscribeApartamentosActivos((list) => {
    rtAptos = list;
    rebuildAllItemsFromRT(rtAptos, rtPacks);
  });

  unsubPacks = subscribePacksActivos((list) => {
    rtPacks = list;
    rebuildAllItemsFromRT(rtAptos, rtPacks);
  });
}

document.addEventListener('DOMContentLoaded', init);
