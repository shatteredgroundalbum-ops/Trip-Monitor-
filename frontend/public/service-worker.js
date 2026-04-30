/* eslint-disable no-restricted-globals */
// Trip Monitor — Driver Edition Service Worker
// Cache-first for app shell + static assets, network-first for API.

const CACHE_VERSION = "trip-monitor-v1";
const APP_SHELL = [
  "/",
  "/dashboard",
  "/history",
  "/index.html",
  "/manifest.json",
  "/trip-monitor-logo.webp",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL).catch(() => null))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never cache cross-origin OAuth/auth or sockets
  if (url.origin !== self.location.origin) return;

  // API: network-first, fall back to cache for GETs
  if (url.pathname.startsWith("/api/")) {
    if (request.method !== "GET") return; // do not intercept mutations
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy)).catch(() => null);
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Navigation: try network, fall back to cached index for offline SPA support
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/index.html") || caches.match("/"))
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && response.status === 200 && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy)).catch(() => null);
        }
        return response;
      });
    })
  );
});
