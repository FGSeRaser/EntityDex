// EntityDex – Service Worker: App offline verfügbar, Daten immer frisch. von FGSeRaser
const CACHE = "entitydex-v1";
const DATEIEN = ["./", "index.html", "css/app.css", "js/app.js", "js/daten.js", "js/wiki.js", "js/builds.js", "js/kapitel.js",
  "js/geschichte.js", "js/maps.js", "js/perknamen.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/favicon.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(DATEIEN)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((n) => n !== CACHE).map((n) => caches.delete(n)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;                // Wiki/tricky: immer live
  if (url.pathname.includes("/data/")) {                       // Daten: erst Netz, sonst Cache
    e.respondWith(fetch(e.request).then((r) => { const k = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, k)); return r; }).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then((c) => c || fetch(e.request).then((r) => { const k = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, k)); return r; })));
});
