/* eslint-disable no-restricted-globals */
// Trip Monitor — Driver Edition Service Worker
// Fully offline PWA: cache-first for everything, no API calls to intercept.
// All data lives in IndexedDB; the service worker only caches the app shell
// and static assets so the app loads instantly and works without network.

const CACHE_VERSION = "trip-monitor-v3-offline";
const APP_SHELL = [
  "/",
  "/dashboard",
  "/history",
  "/templates",
  "/index.html",
  "/manifest.json",
  "/trip-monitor-logo.webp",
  "/trip-monitor-logo.png",
];

// Install: pre-cache the app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL).catch(() => null))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
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

  // Never cache cross-origin requests (fonts, CDNs are fine to try network-first)
  if (url.origin !== self.location.origin) {
    // For external resources (Google Fonts, CDN assets), try network then cache
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy)).catch(() => null);
          }
          return response;
        }).catch(() => cached || new Response('Offline', { status: 503 }));
      })
    );
    return;
  }

  // Navigation requests: serve cached SPA shell for offline support
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/index.html") || caches.match("/"))
    );
    return;
  }

  // Same-origin static assets: cache-first, network fallback
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && response.status === 200 && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy)).catch(() => null);
        }
        return response;
      }).catch(() => {
        // Return offline fallback for HTML requests
        if (request.headers.get("accept")?.includes("text/html")) {
          return caches.match("/index.html");
        }
        return new Response("Offline", { status: 503 });
      });
    })
  );
});