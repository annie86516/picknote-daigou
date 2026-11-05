const PREFIX = "picknote-daigou-shell-";
const CACHE = PREFIX + "v5-shared-link";
const BASE = new URL("./", self.location.href);
const FILES = ["index.html", "buyer.html", "styles.css", "maple.css", "app.js", "buyer.js", "shared.js", "summary.js", "ui.js", "config.js", "art.svg", "icon.svg", "icon-192.png", "icon-512.png", "manifest.webmanifest"];
const allowed = new Set(FILES.map(path => new URL(path, BASE).pathname));
self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(FILES.map(path => new Request(new URL(path, BASE), { cache: "reload" })));
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== BASE.origin) return;
  if (url.pathname === BASE.pathname) url.pathname += "index.html";
  if (!allowed.has(url.pathname)) return;
  const key = new URL(url.pathname, BASE.origin).href;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(event.request, { signal: controller.signal });
      if (!response.ok) throw new Error("Unavailable");
      await cache.put(key, response.clone());
      return response;
    } catch {
      return await cache.match(key) || Response.error();
    } finally { clearTimeout(timer); }
  })());
});
