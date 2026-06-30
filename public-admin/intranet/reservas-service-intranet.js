import { db } from "../shared/firebase.js";

// Reservas: 1 listener global + N subscribers
// (este índice global por createdAt NO sirve para calendarios mensuales, pero sí para dashboard/listas recientes)

let reservasUnsub = null;
let reservasCache = [];
let lastSnapshot = null;

const reservasSubscribers = new Set();

export function startReservasIndexOnce({ limit = 100 } = {}) {
  if (reservasUnsub) return;

  reservasUnsub = db
    .collection("reservas")
    .orderBy("createdAt", "desc")
    .limit(limit)
    .onSnapshot(
      (snapshot) => {
        lastSnapshot = snapshot;
        reservasCache = snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));

        reservasSubscribers.forEach((sub) => {
          try {
            sub.onData?.(reservasCache, snapshot);
          } catch (e) {
            console.error("reservas-service subscriber error:", e);
          }
        });
      },
      (err) => {
        reservasSubscribers.forEach((sub) => {
          try {
            sub.onError?.(err);
          } catch (_) {}
        });
      }
    );
}

export function subscribeToReservas(onData, onError) {
  if (typeof onData !== "function") {
    throw new Error("subscribeToReservas: onData debe ser función");
  }

  startReservasIndexOnce({ limit: 100 });

  const sub = { onData, onError };
  reservasSubscribers.add(sub);

  try {
    onData(reservasCache, lastSnapshot);
  } catch (_) {}

  return () => {
    reservasSubscribers.delete(sub);
  };
}

export function getReservasCache() {
  return reservasCache;
}

export function stopReservasIndex() {
  if (reservasUnsub) {
    reservasUnsub();
    reservasUnsub = null;
  }
  reservasCache = [];
  lastSnapshot = null;
  reservasSubscribers.clear();
}

// Reservas por alojamiento+mes: 1 listener por key + N subs
// Evita query con desigualdades en 2 campos: usamos solo checkInISO <= endISO
// y filtramos en cliente por checkOutISO >= startISO.

const reservasMonthIndex = new Map();

function monthKey(propertyId, startISO, endISO) {
  return `${propertyId}__${startISO}__${endISO}`;
}

export function subscribeToReservasForPropertyMonth(
  { propertyId, startISO, endISO, limit = 800 },
  onData,
  onError
) {
  if (typeof onData !== "function") {
    throw new Error("subscribeToReservasForPropertyMonth: onData debe ser función");
  }
  if (!propertyId || !startISO || !endISO) {
    throw new Error("subscribeToReservasForPropertyMonth: faltan propertyId/startISO/endISO");
  }

  const key = monthKey(String(propertyId), String(startISO), String(endISO));

  if (!reservasMonthIndex.has(key)) {
    const entry = {
      unsub: null,
      cache: [],
      subs: new Set(),
    };

    const q = db
      .collection("reservas")
      .where("propertyId", "==", String(propertyId))
      .where("checkInISO", "<=", String(endISO)) // UNA sola desigualdad
      .orderBy("checkInISO")
      .limit(limit);

    entry.unsub = q.onSnapshot(
      (snap) => {
        const raw = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));

        // Solape del mes en cliente: checkOutISO >= startISO
        const filtered = raw.filter((r) => {
          const st = String(r?.status || "").toLowerCase();
          if (st === "cancelled" || st === "canceled" || r?.cancelled === true) return false;

          const ci = String(r?.checkInISO || "");
          const co = String(r?.checkOutISO || "");
          if (!ci || !co) return false;

          return co >= String(startISO);
        });

        entry.cache = filtered;

        entry.subs.forEach((sub) => {
          try {
            sub.onData(entry.cache, snap);
          } catch (e) {
            console.error("reservas-month subscriber error:", e);
          }
        });
      },
      (err) => {
        entry.subs.forEach((sub) => {
          try {
            sub.onError?.(err);
          } catch (_) {}
        });
      }
    );

    reservasMonthIndex.set(key, entry);
  }

  const entry = reservasMonthIndex.get(key);
  const sub = { onData, onError };
  entry.subs.add(sub);

  try {
    onData(entry.cache);
  } catch (_) {}

  return () => {
    entry.subs.delete(sub);
    if (entry.subs.size === 0) {
      try {
        entry.unsub?.();
      } catch (_) {}
      reservasMonthIndex.delete(key);
    }
  };
}

export function subscribeToChat(reservaId, onData, onError) {
  return db
    .collection("chats")
    .doc(reservaId)
    .collection("mensajes")
    .orderBy("createdAt", "asc")
    .onSnapshot(
      (snapshot) => {
        const mensajes = snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
        onData(mensajes, snapshot);
      },
      (err) => {
        if (onError) onError(err);
      }
    );
}
