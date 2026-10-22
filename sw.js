/* Permite usar la app sin cobertura en la instalación (tras haberla abierto una vez con conexión). */
const CACHE = 'actas-v6';
const BASE = [
  './',
  'index.html',
  'admin.html',
  'css/estilos.css',
  'js/cripto.js',
  'js/comun.js',
  'js/pdf-acta.js',
  'js/app.js',
  'js/admin.js',
  'vendor/pdf-lib.min.js',
  'assets/icono.svg',
  'assets/logo.png',
  'manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// Red primero (para recibir siempre la última versión), caché si no hay conexión.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((r) => {
        if (r.ok) {
          const copia = r.clone();
          const clave = req.url.split('?')[0];
          caches.open(CACHE).then((c) => c.put(clave, copia));
        }
        return r;
      })
      .catch(() => caches.match(req.url.split('?')[0]).then((r) => r || caches.match('index.html')))
  );
});
