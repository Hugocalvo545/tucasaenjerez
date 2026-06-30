import { db } from "../shared/firebase.js";

// Listener global singleton a /chats (para badge + dashboard + lo que venga)
let chatsUnsub = null;
let chatsCache = new Map(); // chatId -> data
const subscribers = new Set(); // fn(Map)

export function startChatsIndexOnce({ limit = 250 } = {}) {
  if (chatsUnsub) return;

  chatsUnsub = db
    .collection("chats")
    .orderBy("lastAt", "desc")
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
    const n = Number(c?.unreadHost || 0);
    if (n > 0) total += n;
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