/* Service Worker: Mis Finanzas
 * - App shell: cada ruta se cachea bajo su propia URL (network-first)
 * - Fallback offline: copia cacheada de la ruta, o el shell '/' como último recurso
 * - Recursos estáticos (hashed): stale-while-revalidate
 * - GET de la API: network-first con fallback a cache (lecturas offline)
 * - POST/PUT/DELETE: nunca interceptados (se resuelven con cola + optimistic UI)
 */
const CACHE_STATIC = "finanzas-static-v2";
const CACHE_API = "finanzas-api-v1";
const PRECACHE = ["/", "/history", "/dashboard", "/settings", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_STATIC)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.startsWith("finanzas-"))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_API).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(() =>
          caches.match(request).then(
            (hit) => hit || Promise.reject(new Error("offline")),
          ),
        ),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_STATIC).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(() =>
          caches.match(request).then((hit) => hit || caches.match("/")),
        ),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((hit) => {
      const network = fetch(request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_STATIC).then((cache) => cache.put(request, copy));
        }
        return res;
      });
      return hit || network;
    }),
  );
});
