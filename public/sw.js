const CACHE_NAME = "sampi-medline-v17";
const CLIENT_REFRESH_DELAY_MS = 1800;
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/manifest.webmanifest?v=12",
  "/manifest-tv.webmanifest",
  "/manifest-tv.webmanifest?v=5",
  "/favicon.svg",
  "/favicon.svg?v=7",
  "/favicon.ico",
  "/favicon.ico?v=7",
  "/icons/pwa-192-v7.png",
  "/icons/pwa-256-v7.png",
  "/icons/pwa-512-v7.png",
  "/icons/pwa-512-maskable-v7.png",
  "/icons/apple-touch-icon-v7.png",
  "/audio/premium_queue_chime_close_match.wav"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

const isElectronRuntime = () => /Electron\//i.test(self.navigator?.userAgent || "");

const shouldRefreshClient = (client) => {
  try {
    const url = new URL(client.url);
    if (url.origin !== self.location.origin) return false;
    if (url.pathname.startsWith("/print")) return false;
    return isElectronRuntime() || url.pathname.startsWith("/tv");
  } catch {
    return false;
  }
};

const refreshVersionClients = async () => {
  await new Promise((resolve) => setTimeout(resolve, CLIENT_REFRESH_DELAY_MS));
  const clientList = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true
  });

  await Promise.all(
    clientList.map((client) => {
      if (!shouldRefreshClient(client) || typeof client.navigate !== "function") {
        return Promise.resolve();
      }
      return client.navigate(client.url).catch(() => null);
    })
  );
};

self.addEventListener("activate", (event) => {
  let hadPreviousCache = false;

  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              hadPreviousCache = true;
              return caches.delete(key);
            }
            return Promise.resolve();
          })
        )
      )
      .then(() => self.clients.claim())
      .then(() => {
        if (hadPreviousCache) {
          return refreshVersionClients();
        }
        return Promise.resolve();
      })
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.searchParams.has("__sampi_update_check")) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put("/index.html", copy));
          }
          return response;
        })
        .catch(() =>
          caches.match("/index.html").then((cached) => {
            if (cached) return cached;
            return new Response("Offline", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" }
            });
          })
        )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(
          () =>
            new Response("", {
              status: 504
            })
        );
    })
  );
});
