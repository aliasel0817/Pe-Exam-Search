const CACHE_NAME = 'pe-study-note-shell-v2-0-4';
const APP_SHELL = [
  './study-note.html',
  './manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key.startsWith('pe-study-note-shell-') && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isStudyNoteHtml = url.pathname.endsWith('/study-note.html');
  const isManifest = url.pathname.endsWith('/manifest.webmanifest');
  if (!isStudyNoteHtml && !isManifest) return;

  // HTML은 network-first: GitHub에 새 버전을 올리면 다음 접속/새로고침에서 우선 최신 파일을 사용한다.
  if (isStudyNoteHtml) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // manifest는 작고 자주 바뀌지 않으므로 cache-first + network fallback.
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      return response;
    }))
  );
});
