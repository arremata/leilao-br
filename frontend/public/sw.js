const CACHE_NAME = 'argos-v2';
const APP_SHELL = [
  '/',
  '/offline.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/pwa-icon.svg',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  // Recursos externos obedecem à CSP da página e devem ser carregados pelo
  // navegador. Rebuscá-los dentro do worker transforma a imagem em uma conexão
  // do próprio worker, bloqueada por connect-src, e produz um ícone quebrado.
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    // Never cache personalized or auth-required responses: the Cache API keys
    // by URL only, so a cached /api/me would leak user data across sessions.
    if (request.headers.get('authorization')) return;
    // Only cache successful public reads: /api/properties and /api/imovel/{id}.
    if (!/^\/api\/(properties|imovel\/[^/]+)\/?$/.test(url.pathname)) return;
    event.respondWith(
      fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => caches.match(request))
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Grava sob a própria URL. Gravar tudo sob '/' era inofensivo quando
          // todo caminho servia o mesmo HTML; com /imovel/{id} passaria a
          // devolver a página de um imóvel para quem abrisse a home offline.
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        // `caches.match` devolve uma Promise, que é sempre verdadeira: o `||`
        // que existia aqui nunca alcançava a página offline.
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const shell = await caches.match('/');
          if (shell) return shell;
          return caches.match('/offline.html');
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request)
      .then((cached) => cached || fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      }))
  );
});
