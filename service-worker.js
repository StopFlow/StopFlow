/* StopFlow 0.5.1 — service worker d’installation sans cache applicatif. */
const STOPFLOW_SW_VERSION = "0.5.1-installation-20260804";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(key => key.startsWith("stopflow-"))
        .map(key => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

/*
 * Passage réseau direct : aucune page, donnée Supabase, checklist ou PDF
 * n’est conservé dans un cache hors ligne pendant la phase de développement.
 */
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request));
});
