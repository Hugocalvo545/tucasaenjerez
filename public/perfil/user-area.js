// perfil/user-area.js
import { auth, db, serverTimestamp, increment } from "../shared/firebase.js";
import { parseEsDate, parseISODateLocal } from "../shared/utils.js";

// Media
const FALLBACK_IMG = "../img/placeholder-alojamiento.jpg";
const propertyMediaCache = new Map(); // propertyId -> { imageMain, images: [] }

// Estado interno
let unreadMap = new Map();

let reservasCache = [];
let reservasFiltered = [];
let reservasUnsubscribe = null;

let currentReservaId = null;
let chatUnsubscribe = null;

let detailCarouselTimer = null;
let detailCarouselIndex = 0;

// DOM refs
let reservasBody = null;
let reservasInfo = null;
let reservaDetailBox = null;
let chatSection = null;
let chatMessagesBox = null;
let chatForm = null;
let chatInput = null;

// DOM helpers
function el(id) {
  return document.getElementById(id);
}

function initDomRefs() {
  reservasBody = el("userReservasBody");
  reservasInfo = el("userReservasInfo");
  reservaDetailBox = el("userReservaDetail");
  chatSection = el("userChatSection");
  chatMessagesBox = el("userChatMessages");
  chatForm = el("userChatForm");
  chatInput = el("userChatInput");
}

// Tabs
function initUserTabs() {
  const tabButtons = document.querySelectorAll(".user-tab");
  const tabContents = document.querySelectorAll(".user-tab-content");
  if (!tabButtons.length || !tabContents.length) return;

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-user-tab");

      tabButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      tabContents.forEach((section) => {
        const id = String(section.id || "").replace("userTab-", "");
        section.classList.toggle("active", id === target);
      });
    });
  });
}

// Media helpers
function getPropertyImageFromCache(propertyId) {
  const m = propertyMediaCache.get(propertyId);
  return m?.imageMain || FALLBACK_IMG;
}

function getPropertyImagesFromCache(propertyId) {
  const m = propertyMediaCache.get(propertyId);
  const imgs = Array.isArray(m?.images) ? m.images : [];
  return imgs.length ? imgs : [getPropertyImageFromCache(propertyId)];
}

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
      const normalized = { imageMain, images: images.length ? images : [imageMain] };

      propertyMediaCache.set(propertyId, normalized);
      return normalized;
    } catch (e) {
      console.warn("No se pudo cargar media de", col, propertyId, e);
    }
  }

  const fallback = { imageMain: FALLBACK_IMG, images: [FALLBACK_IMG] };
  propertyMediaCache.set(propertyId, fallback);
  return fallback;
}

// Estado reserva
function getReservaStatusLabel(r) {
  const s = String(r?.status || r?.estado || "").toLowerCase();

  if (["cancelled", "canceled", "cancelada"].includes(s)) return { text: "Cancelada", cls: "status-cancel" };
  if (["pending", "pendiente", "payment_pending"].includes(s)) return { text: "Pendiente", cls: "status-pending" };
  if (["expired", "expirada"].includes(s)) return { text: "Expirada", cls: "status-expired" };
  if (["confirmed", "confirmada"].includes(s)) return { text: "Confirmada", cls: "status-ok" };

  return { text: "Confirmada", cls: "status-ok" };
}

function parseReservaCheckIn(r) {
  const iso = r?.checkInISO;
  if (iso) return parseISODateLocal(iso);

  const es = r?.checkIn;
  if (es) return parseEsDate(es);

  return null;
}

// Carrusel detalle
function stopDetailCarousel() {
  if (detailCarouselTimer) {
    clearInterval(detailCarouselTimer);
    detailCarouselTimer = null;
  }
  detailCarouselIndex = 0;
}

function startDetailCarousel(images) {
  stopDetailCarousel();

  const imgEl = el("userReservaCarouselImg");
  if (!imgEl) return;

  const safe = Array.isArray(images) && images.length ? images : [FALLBACK_IMG];
  imgEl.src = safe[0];

  if (safe.length === 1) return;

  detailCarouselTimer = setInterval(() => {
    detailCarouselIndex = (detailCarouselIndex + 1) % safe.length;
    imgEl.src = safe[detailCarouselIndex];
  }, 2800);
}

// Listener reservas
function initUserReservationsListener(uid) {
  if (!reservasBody) return;

  if (reservasUnsubscribe) reservasUnsubscribe();

  reservasBody.innerHTML = '<tr><td colspan="5">Todavía no tienes reservas.</td></tr>';
  if (reservasInfo) reservasInfo.textContent = "";

  reservasUnsubscribe = db
    .collection("reservas")
    .where("userId", "==", uid)
    .orderBy("createdAt", "desc")
    .onSnapshot(
      (snapshot) => {
        reservasCache = snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          // Ocultar docs-sombra de pack (id "<reservaId>__<unidad>" / campo packId): el cliente
          // ve solo el doc principal del pack. No se borran; siguen bloqueando calendarios.
          .filter((r) => !r.packId && !String(r.id || r.reservaId || "").includes("__"));
        reservasFiltered = [...reservasCache];
        applyReservasFilters();

        // (Re)cablea los listeners de "no leído" para los chats de estas reservas.
        initUserUnreadListeners(reservasCache);
      },
      (err) => {
        console.error("Error cargando reservas del usuario", err);
        reservasBody.innerHTML = '<tr><td colspan="5">Error al cargar reservas.</td></tr>';
      }
    );
}

// Listener unread: un chat tiene mensajes sin leer para el huésped si
// unreadGuest > 0 (contador que el anfitrión incrementa al enviar y el huésped
// resetea a 0 al abrir). El doc de chat NO tiene guestId, así que no se puede
// filtrar por query; en su lugar escuchamos /chats/{reservaId} de cada reserva
// del usuario (chatId === reservaId), que el huésped SÍ puede leer.
let unreadChatUnsubs = [];
let unreadWiredKey = "";

function stopUserUnreadListeners() {
  unreadChatUnsubs.forEach((fn) => { try { fn(); } catch (_) {} });
  unreadChatUnsubs = [];
}

function refreshUnreadBadge() {
  let total = 0;
  for (const n of unreadMap.values()) total += n;

  const badge = el("userMsgBadge");
  if (badge) {
    badge.textContent = total > 9 ? "9+" : String(total);
    badge.style.display = total ? "inline-flex" : "none";
  }

  paintUnreadMarksInTable();
}

function initUserUnreadListeners(reservas) {
  // Solo re-cablear si cambió el conjunto de reservas (evita thrash).
  const ids = (reservas || []).map((r) => r.id).filter(Boolean).sort();
  const key = ids.join("|");
  if (key === unreadWiredKey) return;
  unreadWiredKey = key;

  stopUserUnreadListeners();
  unreadMap = new Map();

  ids.forEach((reservaId) => {
    const unsub = db.collection("chats").doc(reservaId).onSnapshot(
      (snap) => {
        const data = snap.exists ? (snap.data() || {}) : {};
        const n = Number(data.unreadGuest || 0);
        // Contador; ignora valores absurdos por si acaso (docs viejos).
        if (Number.isFinite(n) && n > 0 && n < 100000) unreadMap.set(reservaId, n);
        else unreadMap.delete(reservaId);
        refreshUnreadBadge();
      },
      (err) => console.error("Error listener unreadGuest chat", reservaId, err)
    );
    unreadChatUnsubs.push(unsub);
  });

  refreshUnreadBadge();
}

function paintUnreadMarksInTable() {
  document.querySelectorAll(".user-reserva-row").forEach((row) => {
    const id = row.getAttribute("data-reserva-id");
    const hasUnread = unreadMap.has(id);
    row.classList.toggle("has-unread", hasUnread);
  });
}

// Filtros
function hasActiveFilters() {
  const term = String(el("userReservasSearchInput")?.value || "").trim();
  const mode = el("userReservasRangeSelect")?.value || "all";
  return !!term || mode !== "all";
}

function applyReservasFilters() {
  const input = el("userReservasSearchInput");
  const sel = el("userReservasRangeSelect");

  const term = String(input?.value || "").trim().toLowerCase();
  const mode = String(sel?.value || "all");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const norm = (v) => (v == null ? "" : String(v)).toLowerCase();

  reservasFiltered = (reservasCache || []).filter((r) => {
    if (mode !== "all") {
      const ci = parseReservaCheckIn(r);
      if (ci) {
        const isFuture = ci >= today;
        if (mode === "future" && !isFuture) return false;
        if (mode === "past" && isFuture) return false;
      }
    }

    if (!term) return true;

    const propertyName = norm(r.propertyName || r.propertyId || "");
    const checkIn = norm(r.checkIn || r.checkInISO || "");
    const checkOut = norm(r.checkOut || r.checkOutISO || "");
    const total = norm(r.totalPrice ?? r.total ?? "");
    const status = norm(r.status || r.estado || "");

    return (
      propertyName.includes(term) ||
      checkIn.includes(term) ||
      checkOut.includes(term) ||
      total.includes(term) ||
      status.includes(term)
    );
  });

  renderUserReservasTable();
  paintUnreadMarksInTable();
}

// Render tabla reservas
function renderUserReservasTable() {
  if (!reservasBody) return;

  const list = reservasFiltered.length || hasActiveFilters() ? reservasFiltered : reservasCache;

  if (!reservasCache.length) {
    reservasBody.innerHTML = '<tr><td colspan="5">Todavía no tienes reservas.</td></tr>';
    if (reservasInfo) reservasInfo.textContent = "";
    if (reservaDetailBox) {
      reservaDetailBox.textContent =
        "Cuando tengas reservas, podrás ver aquí el detalle y chatear con el alojamiento.";
    }
    if (chatSection) chatSection.style.display = "none";
    return;
  }

  if (reservasInfo) {
    reservasInfo.textContent =
      list.length === reservasCache.length
        ? `Tienes ${reservasCache.length} reserva(s).`
        : `Mostrando ${list.length} de ${reservasCache.length} reserva(s).`;
  }

  if (!list.length) {
    const term = String(el("userReservasSearchInput")?.value || "");
    reservasBody.innerHTML = `
      <tr><td colspan="5" style="text-align:center;color:#777;padding:14px;">
        No se encontraron reservas con “${term}”.
      </td></tr>
    `;
    if (chatSection) chatSection.style.display = "none";
    return;
  }

  reservasBody.innerHTML = list
    .map((r) => {
      const fecha =
        r.createdAt && r.createdAt.toDate ? r.createdAt.toDate().toLocaleDateString() : "";

      const propName = r.propertyName || r.propertyId || "";
      const checkIn = r.checkIn || "";
      const checkOut = r.checkOut || "";
      const st = getReservaStatusLabel(r);

      return `
        <tr class="user-reserva-row" data-reserva-id="${r.id}">
          <td>${fecha}</td>
          <td class="reserva-prop-cell">
            <img
              class="reserva-thumb"
              data-property-id="${r.propertyId || ""}"
              src="${FALLBACK_IMG}"
              alt="${propName}"
              loading="lazy"
              onerror="this.onerror=null;this.src='${FALLBACK_IMG}';"
            />
            <span class="reserva-prop-name">${propName}</span>
          </td>
          <td>${checkIn}</td>
          <td>${checkOut}</td>
          <td><span class="status-chip ${st.cls}">${st.text}</span></td>
        </tr>
      `;
    })
    .join("");

  hydrateReservationThumbs();

  reservasBody.querySelectorAll(".user-reserva-row").forEach((row) => {
    row.addEventListener("click", () => {
      const id = row.getAttribute("data-reserva-id");
      const reserva = (reservasCache || []).find((r) => r.id === id);
      if (!reserva) return;

      seleccionarReservaUsuario(reserva).catch(console.warn);

      document.querySelectorAll(".user-reserva-row").forEach((rRow) => {
        rRow.classList.toggle("is-selected", rRow.getAttribute("data-reserva-id") === id);
      });

      const detail = el("userReservaDetail");
      if (detail) {
        setTimeout(() => {
          detail.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 80);
      }
    });
  });

  paintUnreadMarksInTable();
}

async function hydrateReservationThumbs() {
  const thumbs = Array.from(document.querySelectorAll(".reserva-thumb[data-property-id]"));
  if (!thumbs.length) return;

  const uniqueIds = [...new Set(thumbs.map((t) => t.dataset.propertyId).filter(Boolean))];

  await Promise.all(
    uniqueIds.map(async (propertyId) => {
      try {
        const media = await loadPropertyMedia(propertyId);
        const url = media?.imageMain || (media?.images && media.images[0]) || FALLBACK_IMG;

        thumbs
          .filter((t) => t.dataset.propertyId === propertyId)
          .forEach((t) => {
            t.src = url;
          });
      } catch (e) {
        console.warn("No se pudo hidratar miniatura", propertyId, e);
      }
    })
  );
}

// Detalle reserva + chat
async function seleccionarReservaUsuario(r) {
  currentReservaId = r.id;

  const propName = r.propertyName || r.propertyId || "";
  await loadPropertyMedia(r.propertyId);
  const propImage = getPropertyImageFromCache(r.propertyId);

  const checkIn = r.checkIn || "";
  const checkOut = r.checkOut || "";
  const noches = r.nights ?? r.noches ?? "";
  const total =
    r.totalPrice || r.totalPrice === 0 ? `${r.totalPrice} €` : r.total ? `${r.total} €` : "-";

  const nombre = r.name || r.nombre || "";
  const apell = r.surname || "";
  const email = r.email || "";
  const phone = r.phone || "";

  if (!reservaDetailBox) return;

  reservaDetailBox.innerHTML = `
    <div class="reserva-carousel">
      <img
        id="userReservaCarouselImg"
        src="${propImage}"
        alt="${propName}"
        onerror="this.onerror=null;this.src='${FALLBACK_IMG}';"
      >
    </div>

    <div class="reserva-apto-card">
      <img src="${propImage}" alt="${propName}" onerror="this.onerror=null;this.src='${FALLBACK_IMG}';">
      <div>
        <h4>${propName || "Alojamiento"}</h4>
        <small>ID: ${r.propertyId || "-"}</small>
      </div>
    </div>

    <div class="reserva-chips">
      <span class="reserva-chip">Entrada: ${checkIn || "-"}</span>
      <span class="reserva-chip">Salida: ${checkOut || "-"}</span>
      <span class="reserva-chip">Noches: ${noches || "-"}</span>
      <span class="reserva-chip">Total: ${total}</span>
    </div>

    <p><strong>Reserva:</strong> ${r.reservaId || r.id}</p>
    <p><strong>Nombre:</strong> ${(nombre + " " + apell).trim() || "—"}</p>
    <p><strong>Email de contacto:</strong> ${email || "—"}</p>
    <p><strong>Teléfono:</strong> ${phone || "—"}</p>
    ${
      r.observations ? `<p><strong>Observaciones:</strong> ${r.observations}</p>` : ""
    }
    <div style="margin-top:0.4rem;">
      <button type="button" class="btn-primary btn-sm" onclick="window.scrollTo({top: document.body.scrollHeight, behavior:'smooth'});">
        Ir al chat de esta reserva
      </button>
    </div>
  `;

  const images = getPropertyImagesFromCache(r.propertyId);
  startDetailCarousel(images);

  if (chatSection) chatSection.style.display = "block";
  abrirChatUsuario(currentReservaId);
}

function abrirChatUsuario(reservaId) {
  if (!chatMessagesBox) return;

  chatMessagesBox.innerHTML = '<p class="muted">Cargando chat...</p>';

  if (chatUnsubscribe) chatUnsubscribe();

  chatUnsubscribe = db
    .collection("chats")
    .doc(reservaId)
    .collection("mensajes")
    .orderBy("createdAt", "asc")
    .onSnapshot(
      (snapshot) => {
        if (snapshot.empty) {
          chatMessagesBox.innerHTML =
            '<p class="muted">Todavía no hay mensajes. Escribe el primero si quieres contactar con el alojamiento.</p>';
          return;
        }

        const html = snapshot.docs
          .map((doc) => {
            const m = doc.data() || {};
            const sender = m.sender || "guest";
            const text = m.text || "";
            const date = m.createdAt && m.createdAt.toDate ? m.createdAt.toDate().toLocaleString() : "";

            return `
              <div class="chat-bubble ${sender === "guest" ? "guest" : "host"}">
                <div>${text}</div>
                <div class="chat-meta">
                  ${sender === "guest" ? "Tú" : "Alojamiento"} · ${date}
                </div>
              </div>
            `;
          })
          .join("");

        chatMessagesBox.innerHTML = html;
        chatMessagesBox.scrollTop = chatMessagesBox.scrollHeight;
      },
      (err) => {
        console.error("Error en chat usuario", err);
        chatMessagesBox.innerHTML = '<p class="muted">Error al cargar los mensajes.</p>';
      }
    );

  markChatAsReadForGuest(reservaId).catch(() => {});
}

async function markChatAsReadForGuest(reservaId) {
  try {
    await db.collection("chats").doc(reservaId).set({ unreadGuest: 0 }, { merge: true });
  } catch (_) {}
}

// Envío chat
function bindChatForm() {
  if (!chatForm || !chatInput) return;

  chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const text = String(chatInput.value || "").trim();
    if (!text || !currentReservaId) return;

    try {
      const user = auth.currentUser;
      if (!user) return;

      await db
        .collection("chats")
        .doc(currentReservaId)
        .collection("mensajes")
        .add({
          text,
          sender: "guest",
          createdAt: serverTimestamp(),
        });

      // unreadHost es un CONTADOR de mensajes del cliente sin leer por el anfitrión
      // (no un timestamp): el anfitrión lo resetea a 0 al abrir el chat, y el
      // dashboard/badge lo cuentan. Antes escribía serverTimestamp() y por eso el
      // dashboard mostraba un número gigante y el badge no funcionaba.
      await db.collection("chats").doc(currentReservaId).set({ unreadHost: increment(1) }, { merge: true });

      chatInput.value = "";
    } catch (err) {
      console.error("Error enviando mensaje (usuario)", err);
    }
  });
}

// Init
document.addEventListener("DOMContentLoaded", () => {
  initDomRefs();
  initUserTabs();
  bindChatForm();

  const input = el("userReservasSearchInput");
  const sel = el("userReservasRangeSelect");
  if (input) input.addEventListener("input", applyReservasFilters);
  if (sel) sel.addEventListener("change", applyReservasFilters);

  auth.onAuthStateChanged((user) => {
    if (!user) return;

    initUserReservationsListener(user.uid);
    // El badge de "no leído" se cablea dentro del listener de reservas
    // (initUserUnreadListeners), una vez conocidas las reservas del usuario.
  });
});