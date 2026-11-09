// EntityDex – Service Worker: App offline verfügbar, aber immer zuerst die neueste Version aus dem Netz. von FGSeRaser
// Früher wurden HTML/JS dauerhaft aus dem Cache geladen. Nach einem Update konnten so alte und neue Dateien
// gemischt werden und die Seite blieb leer. Jetzt gilt: erst Netz, nur offline der Cache.
const CACHE = "entitydex-v4";
const DATEIEN = ["./", "index.html", "css/app.css", "js/app.js", "js/daten.js", "js/wiki.js", "js/builds.js", "js/kapitel.js",
  "js/geschichte.js", "js/maps.js", "js/perknamen.js", "js/challenges.js", "js/sync.js", "js/sync-config.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/favicon.png"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(DATEIEN.map((d) => new Request(d, { cache: "reload" })))).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((n) => n !== CACHE).map((n) => caches.delete(n)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;                // Wiki/tricky: immer live
  // Daten ohne ?t=… speichern, damit der Cache nicht endlos wächst
  const schluessel = url.pathname.includes("/data/") ? url.origin + url.pathname : e.request;
  e.respondWith(
    fetch(e.request, { cache: "no-cache" }).then((r) => {
      if (r.ok) { const k = r.clone(); caches.open(CACHE).then((c) => c.put(schluessel, k)); }
      return r;
    }).catch(() => caches.match(schluessel).then((c) => c || caches.match("index.html")))
  );
});
