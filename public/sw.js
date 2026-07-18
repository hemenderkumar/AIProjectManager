// Minimal service worker whose only job is to make Keel installable to a phone's home
// screen — Chrome's installability check requires a registered service worker with a
// `fetch` handler, but Keel is a fully authenticated, live-data app (session cookies,
// per-user/per-org data), so this deliberately does NOT cache or intercept anything.
// Every request still goes straight to the network exactly as if no service worker
// existed — no offline mode, no stale/cross-user data risk, just installability.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Intentionally empty — no event.respondWith(), so the browser's default network
  // fetch handles every request untouched.
});
