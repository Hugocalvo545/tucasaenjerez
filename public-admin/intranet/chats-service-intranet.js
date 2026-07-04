import { db } from "../shared/firebase.js";

// Listener global singleton a /chats (para badge + dashboard + lo que venga)
let chatsUnsub = null;
let chatsCache = new Map(); // chatId -> data
const subscribers = new Set(); // fn(Map)

export function startChatsIndexOnce({ limit = 250 } = {}) {
  if (chatsUnsub) return;

  // Índice para badge + dashboard + marca de la lista: solo necesitamos los chats
  // con mensajes de cliente SIN LEER (unreadHost>0). NO usamos orderBy("lastAt")
  // porque excluía los chats donde el cliente escribió pero el anfitrión aún no
  // respondió (esos no tienen lastAt; el huésped no puede escribirlo por reglas)
  // → esos avisos (típicamente apartamentos recién escritos) no llegaban.
  // Con este where entran igual apartamentos y packs; al abrir el chat se pone
  // unreadHost:0 y sale del índice (se resetea el aviso). Índice de campo único
  // (unreadHost) → automático, sin composite index.
  chatsUnsub = db
    .collection("chats")
    .where("unreadHost", ">", 0)
    .limit(limit)
    .onSnapshot(
      (snap) => {
        const next = new Map();
        snap.docs.forEach((d) => next.set(d.id, d.data()));
        chatsCache = next;

        subscribers.forEach((fn) => {
          try {
            fn(chatsCache);
          } catch (e) {
            console.error("chats-service subscriber error", e);
          }
        });
      },
      (err) => console.error("chats-service listener error", err)
    );
}

// Suscripción “in-app” (no crea otro onSnapshot, solo te notifica cambios)
export function subscribeToChatsIndex(onChange) {
  if (typeof onChange !== "function") {
    throw new Error("subscribeToChatsIndex: onChange debe ser función");
  }

  subscribers.add(onChange);

  try {
    onChange(chatsCache);
  } catch (_) {}

  return () => {
    subscribers.delete(onChange);
  };
}

export function getChatsCache() {
  return chatsCache;
}

export function getTotalUnreadHost() {
  let total = 0;
  for (const [, c] of chatsCache) {
    // unreadHost es un contador; ignora valores absurdos (docs viejos con
    // timestamp) para que el badge no explote.
    const n = Number(c?.unreadHost || 0);
    if (Number.isFinite(n) && n > 0 && n < 100000) total += n;
  }
  return total;
}

export function stopChatsIndex() {
  if (chatsUnsub) {
    chatsUnsub();
    chatsUnsub = null;
  }
  chatsCache = new Map();
  subscribers.clear();
}