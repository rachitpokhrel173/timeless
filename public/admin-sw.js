// Service worker for the installable admin app (registered with scope "/admin").
// Admin pages hold private data and are sent with no-store, so they are never cached here:
// only Next's content-hashed build assets are, and a failed navigation shows an offline notice.
const CACHE = "tt-admin-v1";

self.addEventListener("install", (event) => {
  // The offline notice shows this icon, so it has to be on hand before the network drops
  event.waitUntil(caches.open(CACHE).then((c) => c.add("/admin-icons/icon-192.png")).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("tt-admin-") && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => offlinePage()));
    return;
  }

  // Build assets never change under the same URL, so cache-first is safe
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/admin-icons/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      })(),
    );
  }
});

function offlinePage() {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline · Timeless Ties Admin</title>
<style>
  :root{color-scheme:light dark;--bg:#f7f3ec;--text:#24201d;--muted:#6b625a;--accent:#3d5245;--on-accent:#fff}
  @media (prefers-color-scheme:dark){:root{--bg:#151715;--text:#ece7df;--muted:#a59d93;--accent:#9cc0a6;--on-accent:#10140f}}
  body{margin:0;min-height:100dvh;display:grid;place-items:center;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,sans-serif;padding:24px;box-sizing:border-box;text-align:center}
  img{width:88px;height:88px;border-radius:20px}
  h1{font-size:20px;margin:16px 0 4px}
  p{color:var(--muted);margin:0 0 20px}
  button{font:inherit;border:0;border-radius:8px;padding:10px 18px;background:var(--accent);color:var(--on-accent);cursor:pointer}
</style></head><body><main>
<img src="/admin-icons/icon-192.png" alt="">
<h1>You're offline</h1>
<p>The admin panel needs a connection. Check your network and try again.</p>
<button onclick="location.reload()">Try again</button>
</main></body></html>`;
  return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
