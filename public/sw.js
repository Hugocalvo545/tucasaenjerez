// sw.js â€” App pÃºblica JLA (multi/)
// Estrategia: Network-first para JS/CSS/HTML, cache-fallback para imÃ¡genes.
// IMPORTANTE: cambiar CACHE_VER antes de cada `firebase deploy`.

// â”€â”€â”€ VersiÃ³n de cachÃ© â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const CACHE_VER    = "jla-public-v20260529";
const STATIC_CACHE = "jla-public-static-v20260529";

self.addEventListener("install", (event) => {
  self.skipWaiting();
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
              console.log("[SW public] Borrando cachÃ© antigua:", k);
              return caches.delete(k);
            })
        )
      )
      .then(() => self.clients.claim())
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
    url.hostname.includes("firebase") ||
    url.hostname.includes("googleapis")
  ) return;

  // Solo el mismo origen
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;

  // â”€â”€ Network-first para JS, CSS, HTML â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
