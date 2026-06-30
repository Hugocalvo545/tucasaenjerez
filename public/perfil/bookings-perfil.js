// perfil/bookings-perfil.js
import { db, auth, serverTimestamp } from "../shared/firebase.js";
import { state } from "../shared/state.js";
import { parseEsDate } from "../shared/utils.js";
import { CANCEL_POLICY_DAYS } from "../shared/config.js";

const FALLBACK_IMG = "../img/placeholder-alojamiento.jpg";

// Cache (media)
const propertyMediaCache = new Map(); // propertyId -> { imageMain, images: [] }

// Carrusel (modal detalle)
let bookingCarouselTimer = null;
let bookingCarouselIndex = 0;

async function loadPropertyMedia(propertyId) {
  if (!propertyId) return { imageMain: FALLBACK_IMG, images: [FALLBACK_IMG] };
  if (propertyMediaCache.has(propertyId)) return propertyMediaCache.get(propertyId);

  const cols = ["apartamentos", "packs"];

  for (const col of cols) {
    try {
      const snap = await db.collection(col).doc(propertyId).get();
      if (!snap.exists) continue;

      const data = snap.data() || {};
      const images = Array.isArray(data.images)
        ? data.images
        : Array.isArray(data.fotos)
          ? data.fotos
          : [];

      const imageMain = data.imageMain || images[0] || FALLBACK_IMG;
      const normalized = {
        imageMain,
        images: images.length ? images : [imageMain],
      };

      propertyMediaCache.set(propertyId, normalized);
      return normalized;
    } catch (e) {
      console.warn("No se pudo cargar media", col, propertyId, e);
    }
  }

  const fallback = { imageMain: FALLBACK_IMG, images: [FALLBACK_IMG] };
  propertyMediaCache.set(propertyId, fallback);
  return fallback;
}

// Carrusel
function stopBookingCarousel() {
  if (bookingCarouselTimer) {
    clearInterval(bookingCarouselTimer);
    bookingCarouselTimer = null;
  }
  bookingCarouselIndex = 0;
}

function startBookingCarousel(images) {
  stopBookingCarousel();

  const imgEl = document.getElementById("bookingDetailsCarouselImg");
  if (!imgEl) return;

  const safe = Array.isArray(images) && images.length ? images : [FALLBACK_IMG];
  imgEl.src = safe[0];

  if (safe.length === 1) return;

  bookingCarouselTimer = setInterval(() => {
    bookingCarouselIndex = (bookingCarouselIndex + 1) % safe.length;
    imgEl.src = safe[bookingCarouselIndex];
  }, 2600);
}

// ─── Descarga de factura PDF ───────────────────────────────────────────────

// ⚠️ DATOS FISCALES: actualizar CIF real y dirección antes de usar en producción
const EMISOR_NOMBRE   = "JLA Apartments";
const EMISOR_CIF      = "B-XXXXXXXX";   // TODO: reemplazar con CIF real
const EMISOR_DIR      = "España";        // TODO: completar dirección fiscal

function isBookingCompleted(b) {
  if (b.status === "cancelled") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (b.checkOutISO) {
    const [y, m, d] = b.checkOutISO.split("-").map(Number);
    return new Date(y, m - 1, d) < today;
  }
  const co = parseEsDate(b.checkOut);
  return co ? co < today : false;
}

async function loadJsPDF() {
  if (window.jspdf) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    s.onload = resolve;
    s.onerror = () => reject(new Error("No se pudo cargar jsPDF"));
    document.head.appendChild(s);
  });
}

export async function downloadInvoicePDF(b) {
  try {
    await loadJsPDF();
  } catch (err) {
    alert("No se pudo cargar la librería de PDF. Comprueba tu conexión.");
    return;
  }

  const { jsPDF } = window.jspdf;

  const propertyName = formatPropertyName(b.propertyId, b.propertyName);
  const reservaId    = b.id || b.reservaId || "DESCONOCIDA";
  const shortId      = String(reservaId).slice(0, 8).toUpperCase();
  const numFactura   = `FAC-${shortId}`;

  const totalPrice  = Number(b.totalPrice) || 0;
  const nights      = Math.max(1, Number(b.nights) || 1);
  const base        = totalPrice / 1.10;
  const iva         = totalPrice - base;
  const precioMedio = totalPrice / nights;

  const guestName   = b.name  || "-";
  const guestEmail  = b.email || "-";
  const checkIn     = b.checkIn  || b.checkInISO  || "-";
  const checkOut    = b.checkOut || b.checkOutISO || "-";

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;
  const M = 20;
  let y   = 0;

  // ── Cabecera ────────────────────────────────────────────────
  doc.setFillColor(26, 26, 26);
  doc.rect(0, 0, W, 30, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(242, 181, 68);
  doc.text(EMISOR_NOMBRE, M, 19);

  doc.setFontSize(10);
  doc.setTextColor(180, 180, 180);
  doc.text("FACTURA", W - M, 19, { align: "right" });

  y = 44;

  // ── Número de factura + fecha ────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(26, 26, 26);
  doc.text(numFactura, M, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(`Fecha de emisión: ${checkOut}`, M, y + 7);

  y += 18;

  // ── Línea dorada ─────────────────────────────────────────────
  doc.setDrawColor(242, 181, 68);
  doc.setLineWidth(0.6);
  doc.line(M, y, W - M, y);

  y += 10;

  // ── Emisor / Receptor ────────────────────────────────────────
  const c1 = M;
  const c2 = W / 2 + 5;

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(130, 130, 130);
  doc.text("DATOS DEL EMISOR", c1, y);
  doc.text("DATOS DEL CLIENTE", c2, y);

  y += 6;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(26, 26, 26);
  doc.text(EMISOR_NOMBRE, c1, y);
  doc.text(guestName, c2, y);

  y += 5;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text(`CIF: ${EMISOR_CIF}`, c1, y);
  doc.text(`Email: ${guestEmail}`, c2, y);

  y += 4;
  doc.text(EMISOR_DIR, c1, y);

  y += 14;

  // ── Tabla de conceptos — cabecera ────────────────────────────
  doc.setFillColor(245, 245, 242);
  doc.rect(M, y, W - M * 2, 8, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(26, 26, 26);
  doc.text("Concepto",     M + 3,      y + 5.5);
  doc.text("€/noche",      W - M - 56, y + 5.5);
  doc.text("Noches",       W - M - 30, y + 5.5, { align: "right" });
  doc.text("Importe",      W - M,      y + 5.5, { align: "right" });

  y += 11;

  // ── Fila de alojamiento ──────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(26, 26, 26);
  doc.text(propertyName, M + 3, y + 4);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(90, 90, 90);
  doc.text(`Período: ${checkIn} – ${checkOut}`, M + 3, y + 9.5);
  doc.text(`${nights} noche${nights !== 1 ? "s" : ""} × ${precioMedio.toFixed(2)} €/noche`, M + 3, y + 14);

  doc.setFontSize(10);
  doc.setTextColor(26, 26, 26);
  doc.text(`${precioMedio.toFixed(2)} €`, W - M - 56, y + 7);
  doc.text(`${nights}`,                    W - M - 30, y + 7, { align: "right" });
  doc.text(`${totalPrice.toFixed(2)} €`,   W - M,      y + 7, { align: "right" });

  y += 22;

  // ── Separador ────────────────────────────────────────────────
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.25);
  doc.line(M, y, W - M, y);

  y += 9;

  // ── Totales ──────────────────────────────────────────────────
  const tX  = W - M - 75;
  const vX  = W - M;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.text("Base imponible:",              tX, y);
  doc.text(`${base.toFixed(2)} €`,         vX, y, { align: "right" });

  y += 6;
  doc.text("IVA (10% aloj. turístico):",   tX, y);
  doc.text(`${iva.toFixed(2)} €`,          vX, y, { align: "right" });

  y += 3;
  doc.setDrawColor(26, 26, 26);
  doc.setLineWidth(0.35);
  doc.line(tX, y, vX, y);

  y += 7;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(26, 26, 26);
  doc.text("TOTAL:",                       tX, y);
  doc.text(`${totalPrice.toFixed(2)} €`,   vX, y, { align: "right" });

  // ── Pie ──────────────────────────────────────────────────────
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(160, 160, 160);
  doc.text("Gracias por su estancia. JLA Apartments.", W / 2, 284, { align: "center" });

  // ── Guardar ──────────────────────────────────────────────────
  const safeName = (propertyName || "alojamiento")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  doc.save(`factura_${shortId}_${safeName}.pdf`);
}

export function downloadInvoiceByIndex(index) {
  const b = state.bookingsDisplayCache?.[index];
  if (b) downloadInvoicePDF(b);
}

// Helpers
function formatPropertyName(propertyId, propertyName) {
  if (propertyName) return propertyName;

  switch (propertyId) {
    case "atico-jerez":
      return "Ático Dúplex en Jerez";
    default:
      return "Alojamiento";
  }
}

function normalizeBookings(raw) {
  const bookings = Array.isArray(raw) ? raw : [];
  return bookings.map((b) => (b && typeof b === "object" ? b : {}));
}

function sortBookingsByProximity(bookings) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcoming = [];
  const past = [];
  const unknown = [];

  bookings.forEach((b) => {
    const ci = parseEsDate(b.checkIn);
    if (!ci) {
      unknown.push(b);
      return;
    }

    if (ci >= today) upcoming.push({ ...b, _ci: ci });
    else past.push({ ...b, _ci: ci });
  });

  upcoming.sort((a, b) => (a._ci || 0) - (b._ci || 0));
  past.sort((a, b) => (b._ci || 0) - (a._ci || 0));

  const out = [...upcoming, ...past, ...unknown];
  return out.map((b) => {
    const copy = { ...b };
    delete copy._ci;
    return copy;
  });
}

function getBookingStatus(b) {
  if (b.status === "cancelled") return { label: "Cancelada", className: "status-expired" };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const ci = parseEsDate(b.checkIn);
  const co = parseEsDate(b.checkOut);

  if (!ci || !co) return { label: "Confirmada", className: "status-pending" };
  if (today < ci) return { label: "Pendiente", className: "status-pending" };
  if (today >= ci && today <= co) return { label: "En curso", className: "status-current" };
  return { label: "Expirada", className: "status-expired" };
}

// ─── Cancelación de reservas ───────────────────────────────────────────────

function getCancellationUI(b) {
  if (b.status === "cancelled") return { type: "cancelled" };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const parseISO = (iso) => {
    if (!iso) return null;
    const [y, m, d] = iso.split("-").map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  };

  const checkOut = parseISO(b.checkOutISO) || parseEsDate(b.checkOut);
  const checkIn  = parseISO(b.checkInISO)  || parseEsDate(b.checkIn);

  if (!checkIn || (checkOut && checkOut < today) || checkIn <= today) {
    return { type: "none" };
  }

  const deadline = new Date(today.getTime() + CANCEL_POLICY_DAYS * 24 * 60 * 60 * 1000);
  return checkIn > deadline ? { type: "cancellable" } : { type: "too_late" };
}

async function executeCancelBooking(b) {
  const reservaId = b.id || b.reservaId;
  if (!reservaId) throw new Error("ID de reserva desconocido");

  const batch = db.batch();
  batch.update(db.collection("reservas").doc(reservaId), {
    status:      "cancelled",
    cancelledAt: serverTimestamp(),
  });
  batch.delete(db.collection("reservas_public").doc(reservaId));
  await batch.commit();
}

export function confirmCancelBooking(b) {
  const existing = document.getElementById("cancelBookingModal");
  if (existing) existing.remove();

  const propertyName = formatPropertyName(b.propertyId, b.propertyName);

  const overlay = document.createElement("div");
  overlay.id = "cancelBookingModal";
  overlay.className = "modal active";

  const wrap = document.createElement("div");
  wrap.className = "modal-content";
  wrap.style.maxWidth = "440px";

  const title = document.createElement("h3");
  title.style.margin = "0 0 12px";
  title.textContent = "Cancelar reserva";

  const body = document.createElement("p");
  body.style.margin = "0 0 18px";
  body.innerHTML =
    "¿Seguro que quieres cancelar tu reserva en <strong></strong> del <strong></strong> al <strong></strong>?" +
    '<br><small style="color:#888;margin-top:6px;display:block;">Esta acción no se puede deshacer.</small>';
  body.querySelectorAll("strong")[0].textContent = propertyName;
  body.querySelectorAll("strong")[1].textContent = b.checkIn  || "-";
  body.querySelectorAll("strong")[2].textContent = b.checkOut || "-";

  const btns = document.createElement("div");
  btns.style.cssText = "display:flex;gap:10px;justify-content:flex-end;margin-bottom:10px;";

  const btnBack = document.createElement("button");
  btnBack.className = "btn-secondary";
  btnBack.type = "button";
  btnBack.textContent = "Volver";
  btnBack.addEventListener("click", () => overlay.remove());

  const btnConfirm = document.createElement("button");
  btnConfirm.className = "btn-primary";
  btnConfirm.type = "button";
  btnConfirm.style.cssText = "background:#c0392b;border-color:#c0392b;";
  btnConfirm.textContent = "Sí, cancelar";

  btns.appendChild(btnBack);
  btns.appendChild(btnConfirm);

  const msg = document.createElement("p");
  msg.style.cssText = "margin:0;font-size:0.85rem;min-height:1em;";

  wrap.appendChild(title);
  wrap.appendChild(body);
  wrap.appendChild(btns);
  wrap.appendChild(msg);
  overlay.appendChild(wrap);
  document.body.appendChild(overlay);

  btnConfirm.addEventListener("click", async () => {
    btnConfirm.disabled = true;
    btnConfirm.textContent = "Cancelando...";
    msg.style.color = "#666";
    msg.textContent = "";

    try {
      await executeCancelBooking(b);
      msg.style.color = "#1a8b7d";
      msg.textContent = "Reserva cancelada correctamente.";
      btnConfirm.style.display = "none";
      btnBack.textContent = "Cerrar";
      closeBookingDetails();
      await loadBookingsHistory();
    } catch (err) {
      console.error("Error cancelando reserva:", err);
      msg.style.color = "#c0392b";
      msg.textContent = err?.message || "Error al cancelar. Inténtalo de nuevo.";
      btnConfirm.disabled = false;
      btnConfirm.textContent = "Sí, cancelar";
    }
  });
}

export function cancelBookingByIndex(index) {
  const b = state.bookingsDisplayCache?.[index];
  if (b) confirmCancelBooking(b);
}

// Render (lista)
function renderBookingsList() {
  const list = document.getElementById("bookingsList");
  if (!list) return;

  const bookings = state.bookingsDisplayCache || [];

  if (!bookings.length) {
    list.innerHTML = '<p style="color:#999;">No tienes reservas</p>';
    list.style.display = state.bookingsVisible ? "block" : "none";
    return;
  }

  let html = "";
  bookings.forEach((b, index) => {
    const adults = Number(b.numAdults) || 0;
    const children = Number(b.numChildren) || 0;

    const guestLabel =
      `${adults} adulto${adults === 1 ? "" : "s"}` +
      (children ? ` · ${children} niño${children === 1 ? "" : "s"}` : "");

    const propertyName = formatPropertyName(b.propertyId, b.propertyName);
    const { label: statusLabel, className: statusClass } = getBookingStatus(b);

    const invoiceBtn = isBookingCompleted(b)
      ? `<button class="btn-secondary btn-sm" type="button" style="margin-top:8px;"
           onclick="event.stopPropagation(); downloadInvoiceByIndex(${index})">
           Descargar factura
         </button>`
      : "";

    const cancelUi = getCancellationUI(b);
    let cancelHtml = "";
    if (cancelUi.type === "cancellable") {
      cancelHtml = `<button class="btn-secondary btn-sm" type="button"
        style="margin-top:6px;color:#c0392b;border-color:#c0392b;"
        onclick="event.stopPropagation(); cancelBookingByIndex(${index})">
        Cancelar reserva
      </button>`;
    } else if (cancelUi.type === "too_late") {
      cancelHtml = `<p style="margin:6px 0 0;font-size:0.8rem;color:#888;">
        Cancelación no disponible (menos de ${CANCEL_POLICY_DAYS} días para la entrada)
      </p>`;
    }

    html += `
      <div class="booking-item" onclick="openBookingDetails(${index})">
        <h4>${propertyName}</h4>
        <p>${b.checkIn || "-"} → ${b.checkOut || "-"} · ${b.nights ?? "-"} noches</p>
        <p>👥 ${guestLabel} · 💰 €${b.totalPrice ?? "-"}</p>
        <span class="booking-status ${statusClass}">${statusLabel}</span>
        ${invoiceBtn}
        ${cancelHtml}
      </div>
    `;
  });

  list.innerHTML = html;
  list.style.display = state.bookingsVisible ? "block" : "none";
}

// Render (destacado)
async function renderNextBookingHighlight() {
  const box = document.getElementById("nextBookingHighlight");
  if (!box) return;

  const bookings = state.bookingsHistoryCache || [];
  if (!bookings.length) {
    box.innerHTML = `<div class="next-booking-highlight">No tienes próximas reservas.</div>`;
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let idx = bookings.findIndex((b) => {
    const ci = parseEsDate(b.checkIn);
    return ci && ci >= today;
  });
  if (idx < 0) idx = 0;

  const b = bookings[idx];
  const propertyName = formatPropertyName(b.propertyId, b.propertyName);
  const { label: statusLabel, className: statusClass } = getBookingStatus(b);
  const media = await loadPropertyMedia(b.propertyId);

  box.innerHTML = `
    <div class="next-booking-highlight" style="display:flex; gap:12px; align-items:stretch;">
      <div style="flex:0 0 110px;">
        <img
          src="${media.imageMain}"
          alt="${propertyName}"
          style="width:110px;height:84px;object-fit:cover;border-radius:10px;border:1px solid #eee;"
          onerror="this.onerror=null;this.src='${FALLBACK_IMG}';"
        />
      </div>

      <div style="flex:1;">
        <div style="display:flex; justify-content:space-between; gap:10px;">
          <div>
            <div style="font-weight:700; margin-bottom:2px;">${propertyName}</div>
            <div style="font-size:0.85rem;color:#666;">${b.checkIn || "-"} → ${b.checkOut || "-"}</div>
          </div>
          <span class="booking-status ${statusClass}" style="height:fit-content;">${statusLabel}</span>
        </div>

        <div style="margin-top:8px;">
          <button class="btn-secondary btn-sm" type="button" id="btnNextBookingDetails">
            Ver detalles
          </button>
        </div>
      </div>
    </div>
  `;

  box.querySelector("#btnNextBookingDetails")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openBookingDetailsByBooking(b);
  });

  box.querySelector(".next-booking-highlight")?.addEventListener("click", (e) => {
    if (e.target?.id === "btnNextBookingDetails") return;
    openBookingDetailsByBooking(b);
  });
}

// Public API (carga)
export async function loadBookingsHistory() {
  if (!state.currentUser) return;

  const list = document.getElementById("bookingsList");
  if (!list) return;

  try {
    const snap = await db
      .collection("reservas")
      .where("userId", "==", state.currentUser.uid)
      .orderBy("createdAt", "desc")
      .get();

    const raw = [];
    snap.forEach((doc) => raw.push({ id: doc.id, ...doc.data() }));

    const normalized = normalizeBookings(raw);
    const sorted = sortBookingsByProximity(normalized);

    state.bookingsHistoryCache = sorted;
    state.bookingsDisplayCache = [...sorted];

    renderBookingsList();
    await renderNextBookingHighlight();
  } catch (err) {
    console.error("Error cargar reservas:", err);
  }
}

// Public API (visibilidad)
export function toggleBookingsVisibility() {
  state.bookingsVisible = !state.bookingsVisible;

  const list = document.getElementById("bookingsList");
  const label = document.getElementById("bookingsToggleLabel");

  if (list) list.style.display = state.bookingsVisible ? "block" : "none";
  if (label) label.textContent = state.bookingsVisible ? "(Ocultar)" : "(Mostrar)";
}

// Public API (buscador)
export function filterBookings() {
  const input = document.getElementById("bookingsSearchInput");
  if (!input) return;

  const term = String(input.value || "").trim().toLowerCase();

  if (!term) {
    state.bookingsDisplayCache = [...(state.bookingsHistoryCache || [])];
    renderBookingsList();
    return;
  }

  const norm = (v) => (v == null ? "" : String(v)).toLowerCase();

  state.bookingsDisplayCache = (state.bookingsHistoryCache || []).filter((b) => {
    const propertyName = norm(formatPropertyName(b.propertyId, b.propertyName));
    const checkIn = norm(b.checkIn || b.checkInISO || "");
    const checkOut = norm(b.checkOut || b.checkOutISO || "");
    const dates = `${checkIn} ${checkOut}`.trim();

    const total = norm(b.totalPrice ?? b.total ?? "");
    const status = norm(b.status || b.estado || "");

    return propertyName.includes(term) || dates.includes(term) || total.includes(term) || status.includes(term);
  });

  renderBookingsList();

  if (!state.bookingsDisplayCache.length) {
    const list = document.getElementById("bookingsList");
    if (list) {
      list.innerHTML = `
        <div style="text-align:center;color:#777;padding:14px;">
          No se encontraron reservas con “${input.value}”.
        </div>
      `;
      list.style.display = state.bookingsVisible ? "block" : "none";
    }
  }
}

// Review section
async function addReviewSection(contentEl, b) {
  const section = document.createElement('div');
  section.style.cssText = 'margin-top:18px;padding-top:14px;border-top:1px solid #eee;';
  contentEl.appendChild(section);

  const uid = auth.currentUser?.uid;
  if (!uid || !b.id) return;

  try {
    const existing = await db.collection('reviews')
      .where('reservaId', '==', b.id)
      .where('userId', '==', uid)
      .limit(1)
      .get();

    if (!existing.empty) {
      section.innerHTML = `<p style="color:#1a8b7d;font-weight:500;font-size:0.9rem;">✅ Ya has dejado una reseña para esta estancia. ¡Gracias!</p>`;
      return;
    }
  } catch (e) {
    console.warn('reviewCheck error', e);
    return;
  }

  section.innerHTML = `
    <h4 style="margin:0 0 8px;font-size:0.95rem;color:#333;">¿Cómo fue tu estancia?</h4>
    <div id="rvStarsWrap" style="display:flex;gap:4px;font-size:1.9rem;cursor:pointer;margin-bottom:10px;line-height:1;">
      <span data-star="1" style="color:#ccc;">★</span>
      <span data-star="2" style="color:#ccc;">★</span>
      <span data-star="3" style="color:#ccc;">★</span>
      <span data-star="4" style="color:#ccc;">★</span>
      <span data-star="5" style="color:#ccc;">★</span>
    </div>
    <textarea id="rvText" rows="3" placeholder="Cuéntanos tu experiencia (mínimo 10 caracteres)…"
      style="width:100%;padding:8px 10px;border:1px solid #ddd;border-radius:8px;resize:vertical;font-size:0.88rem;box-sizing:border-box;font-family:inherit;"></textarea>
    <button id="rvSubmitBtn" class="btn-primary"
      style="width:100%;margin-top:8px;padding:10px 0;font-size:0.9rem;">
      Enviar reseña
    </button>
    <p id="rvMsg" style="margin:6px 0 0;font-size:0.83rem;color:#e55;min-height:1em;"></p>
  `;

  let selectedRating = 0;
  const starsWrap = section.querySelector('#rvStarsWrap');
  const stars = Array.from(starsWrap.querySelectorAll('[data-star]'));

  function paintStars(hov) {
    stars.forEach(s => {
      s.style.color = Number(s.dataset.star) <= hov ? '#f3c669' : '#ccc';
    });
  }

  stars.forEach(s => {
    s.addEventListener('mouseover', () => paintStars(Number(s.dataset.star)));
    s.addEventListener('click', () => { selectedRating = Number(s.dataset.star); paintStars(selectedRating); });
  });
  starsWrap.addEventListener('mouseleave', () => paintStars(selectedRating));

  section.querySelector('#rvSubmitBtn').addEventListener('click', async () => {
    const msg = section.querySelector('#rvMsg');
    const text = section.querySelector('#rvText').value.trim();
    if (!selectedRating) { msg.textContent = 'Selecciona una puntuación (1–5 estrellas).'; return; }
    if (text.length < 10) { msg.textContent = 'El comentario debe tener al menos 10 caracteres.'; return; }

    const btn = section.querySelector('#rvSubmitBtn');
    btn.disabled = true;
    btn.textContent = 'Enviando…';
    msg.textContent = '';

    try {
      await db.collection('reviews').add({
        reservaId: b.id,
        propertyId: b.propertyId || '',
        propertyName: formatPropertyName(b.propertyId, b.propertyName),
        userId: uid,
        userEmail: auth.currentUser?.email || '',
        userDisplayName: auth.currentUser?.displayName || (auth.currentUser?.email ? auth.currentUser.email.split('@')[0] : 'Huésped'),
        rating: selectedRating,
        comentario: text,
        text,
        checkIn: b.checkIn || b.checkInISO || '',
        checkOut: b.checkOut || b.checkOutISO || '',
        createdAt: serverTimestamp(),
        visible: true,
        source: 'guest',
      });
      section.innerHTML = `<p style="color:#1a8b7d;font-weight:600;font-size:0.9rem;">🌟 ¡Gracias por tu reseña! Nos ayuda a mejorar.</p>`;
    } catch (err) {
      console.error(err);
      msg.textContent = `❌ Error al enviar: ${err?.message || 'Inténtalo de nuevo.'}`;
      btn.disabled = false;
      btn.textContent = 'Enviar reseña';
    }
  });
}

// Public API (detalle)
export function openBookingDetails(index) {
  const b = state.bookingsDisplayCache ? state.bookingsDisplayCache[index] : null;
  if (!b) return;
  openBookingDetailsByBooking(b);
}

async function openBookingDetailsByBooking(b) {
  const modal = document.getElementById("bookingDetailsModal");
  const content = document.getElementById("bookingDetailsContent");
  if (!modal || !content) return;

  const adults = Number(b.numAdults) || 0;
  const children = Number(b.numChildren) || 0;

  const guestLabel =
    `${adults} adulto${adults === 1 ? "" : "s"}` +
    (children ? ` · ${children} niño${children === 1 ? "" : "s"}` : "");

  const propertyName = formatPropertyName(b.propertyId, b.propertyName);
  const { label: statusLabel, className: statusClass } = getBookingStatus(b);

  const media = await loadPropertyMedia(b.propertyId);
  const imgs = media.images && media.images.length ? media.images : [media.imageMain || FALLBACK_IMG];

  let guestsHtml = "";
  if (Array.isArray(b.guests) && b.guests.length) {
    guestsHtml = '<h4 style="margin-top:12px;">Huéspedes</h4><ul style="padding-left:18px;font-size:0.9rem;">';
    b.guests.forEach((g) => {
      const name = `${g?.name || ""} ${g?.surname || ""}`.trim();
      guestsHtml += `<li>${g?.isPrincipal ? "⭐ " : ""}${g?.type || ""} - ${name}</li>`;
    });
    guestsHtml += "</ul>";
  }

  content.innerHTML = `
    <div class="reserva-carousel">
      <img
        id="bookingDetailsCarouselImg"
        src="${imgs[0] || FALLBACK_IMG}"
        alt="${propertyName}"
        onerror="this.onerror=null;this.src='${FALLBACK_IMG}';"
      />
    </div>

    <p><strong>Apartamento:</strong> ${propertyName}</p>
    <p><strong>Estado:</strong> <span class="booking-status ${statusClass}">${statusLabel}</span></p>
    <p><strong>Check-in:</strong> ${b.checkIn || "-"}</p>
    <p><strong>Check-out:</strong> ${b.checkOut || "-"}</p>
    <p><strong>Noches:</strong> ${b.nights ?? "-"}</p>
    <p><strong>Huéspedes:</strong> ${guestLabel}</p>
    <p><strong>Total:</strong> €${b.totalPrice ?? "-"} ${b.discountApplied ? `(descuento ${b.discountApplied}%)` : ""}</p>
    <p><strong>Puntos ganados:</strong> ${b.pointsEarned || 0} ⭐</p>
    ${b.observations ? `<p><strong>Observaciones:</strong> ${b.observations}</p>` : ""}
    ${guestsHtml}
  `;

  modal.classList.add("active");
  startBookingCarousel(imgs);

  if (isBookingCompleted(b)) {
    const btn = document.createElement("button");
    btn.className = "btn-secondary btn-sm";
    btn.type = "button";
    btn.style.marginTop = "14px";
    btn.style.width = "100%";
    btn.textContent = "Descargar factura";
    btn.addEventListener("click", () => downloadInvoicePDF(b));
    content.appendChild(btn);
  }

  const cancelUi = getCancellationUI(b);
  if (cancelUi.type === "cancellable") {
    const btnCancel = document.createElement("button");
    btnCancel.className = "btn-secondary btn-sm";
    btnCancel.type = "button";
    btnCancel.style.cssText = "margin-top:12px;width:100%;color:#c0392b;border-color:#c0392b;";
    btnCancel.textContent = "Cancelar reserva";
    btnCancel.addEventListener("click", () => {
      closeBookingDetails();
      confirmCancelBooking(b);
    });
    content.appendChild(btnCancel);
  } else if (cancelUi.type === "too_late") {
    const note = document.createElement("p");
    note.style.cssText = "margin-top:12px;font-size:0.82rem;color:#888;text-align:center;";
    note.textContent = `Cancelación no disponible (menos de ${CANCEL_POLICY_DAYS} días para la entrada)`;
    content.appendChild(note);
  } else if (cancelUi.type === "cancelled") {
    const badge = document.createElement("p");
    badge.style.cssText = "margin-top:12px;font-weight:600;color:#c0392b;text-align:center;";
    badge.textContent = "Esta reserva ha sido cancelada.";
    content.appendChild(badge);
  }

  const { label: statusForReview } = getBookingStatus(b);
  if (statusForReview === "Expirada" && auth.currentUser) {
    addReviewSection(content, b);
  }
}

export function closeBookingDetails() {
  stopBookingCarousel();
  const modal = document.getElementById("bookingDetailsModal");
  const content = document.getElementById("bookingDetailsContent");
  if (modal) modal.classList.remove("active");
  if (content) content.innerHTML = "";
}