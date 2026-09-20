// The Shed — offline app shell cache.
// Bump this string any time you want to force every device onto a clean
// cache (e.g. after a change that a background revalidate doesn't seem
// to be picking up).
const CACHE_NAME = "the-shed-v2";

// These rarely change, so cache-first is fine and keeps things instant.
const STATIC_ASSETS = [
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// The app itself: prefer a fresh copy whenever there's a connection, so
// an update you push is visible the very next time the app is opened —
// not "eventually, after a background fetch happens to succeed."
const SHELL_PAGES = ["./", "./index.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS.concat(SHELL_PAGES)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

const SHELL_URLS = SHELL_PAGES.map((p) => new URL(p, self.registration.scope).href);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // let cross-origin (e.g. Google Fonts) pass through untouched

  const isShellPage = req.mode === "navigate" || SHELL_URLS.includes(url.href);

  if (isShellPage){
    // Network-first: always try to get the latest app shell. Only fall
    // back to whatever's cached if there's genuinely no connection.
    event.respondWith(
      fetch(req).then((res) => {
        if (res && res.status === 200){
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  // Cache-first for static assets, refreshing the cache in the background.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.status === 200){
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
