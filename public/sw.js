// Service worker mínimo: só existe para a app poder ser instalada.
// Não guarda páginas nem dados em cache (são dados privados e têm de estar sempre atualizados).
// Sem rede, mostra uma página simples em vez do erro do browser.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

const SEM_REDE = `<!doctype html><html lang="pt"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sem ligação</title><body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center;color:#334155">
<div><h1 style="font-size:20px">Sem ligação à internet</h1><p>Verifique a ligação e tente outra vez.</p>
<button onclick="location.reload()" style="margin-top:12px;padding:10px 18px;border:0;border-radius:12px;background:#4f46e5;color:#fff;font-size:15px">Tentar outra vez</button></div></body></html>`;

self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;
  e.respondWith(fetch(e.request).catch(() => new Response(SEM_REDE, { headers: { "Content-Type": "text/html; charset=utf-8" } })));
});
