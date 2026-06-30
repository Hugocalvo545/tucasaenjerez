// service-worker.js â€” Intranet JLA
// Estrategia: Network-first para JS/CSS/HTML, cache-fallback para imÃ¡genes.
// IMPORTANTE: cambiar CACHE_VER antes de cada `firebase deploy` para
// forzar que los dispositivos con la PWA instalada actualicen la cachÃ©.

importScripts("https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDSYAhAuc0HTgoQBRK1ofwIqNTRdNtcegY",
  authDomain: "booking-viajeros.firebaseapp.com",
  projectId: "booking-viajeros",
  storageBucket: "booking-viajeros.firebasestorage.app",
  messagingSenderId: "42042931651",
  appId: "1:42042931651:web:50d6da6f4366d07ea7a576"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || "Nuevo mensaje";
  const body  = payload?.notification?.body  || "Tienes un mensaje pendiente.";
  self.registration.showNotification(title, {
    body,
    icon: "/img/icon-192.png",
    data: payload?.data || {}
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow("./index.html#reservas"));
});

// â”€â”€â”€ VersiÃ³n de cachÃ© â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Actualiza este valor en cada deploy para forzar la renovaciÃ³n de la cachÃ©.
const CACHE_VER    = "jla-intranet-v20260529";
const STATIC_CACHE = "jla-intranet-static-v20260529";

self.addEventListener("install", (event) => {
  self.skipWaiting(); // Activar inmediatamente, sin esperar a que se cierren pestaÃ±as
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      Promise.allSettled([
        cache.add("/img/icon-192.png"),
        cache.add("/img/icon-512.png"),
      ])
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== STATIC_CACHE)
            .map((k) => {
              console.log("[SW intranet] Borrando cachÃ© antigua:", k);
              return caches.delete(k);
            })
        )
      )
      .then(() => self.clients.claim()) // Tomar control inmediato de todas las pestaÃ±as
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  if (req.method !== "GET") return;

  const url = new URL(req.url);

  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  if (req.cache === "only-if-cached" && req.mode !== "same-origin") return;

  // No interceptar Firebase/Google
  if (
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("gstatic.com") ||
    url.hostname.includes("firebaseapp.com") ||
    url.hostname.includes("firebase")
  ) return;

  // Solo el mismo origen
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;

  // â”€â”€ Network-first para JS, CSS, HTML (siempre frescos desde la red) â”€â”€â”€â”€â”€â”€â”€â”€
  if (/\.(js|css|html)(\?.*)?$/.test(path) || path === "/" || path.endsWith("/")) {
    event.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
    return;
  }

  // â”€â”€ Cache-first para imÃ¡genes y assets estÃ¡ticos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok && res.status === 200) {
          const clone = res.clone();
          caches.open(STATIC_CACHE).then((c) => c.put(req, clone));
        }
        return res;
      });
    })
  );
});
