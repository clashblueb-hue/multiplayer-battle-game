const CACHE_NAME = "sky-scramble-v6";
const PRECACHE = ["/", "/index.html", "/icons/icon.svg", "/icons/icon-maskable.svg", "/site.webmanifest"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function isAppAsset(url) {
  return /\.(?:js|css|html)(\?|$)/.test(url.pathname) || url.pathname === "/";
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    (async () => {
      if (isAppAsset(url)) {
        try {
          const response = await fetch(event.request);
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, response.clone());
          return response;
        } catch (error) {
          const cached = await caches.match(event.request);
          if (cached) {
            return cached;
          }
          return caches.match("/index.html");
        }
      }

      const cached = await caches.match(event.request);
      if (cached) {
        return cached;
      }

      try {
        const response = await fetch(event.request);
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, response.clone());
        return response;
      } catch (error) {
        return caches.match("/index.html");
      }
    })(),
  );
});
