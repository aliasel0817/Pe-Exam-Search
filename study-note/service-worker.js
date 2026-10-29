// Study planner additive rollout; keep existing shell caching semantics.
const CACHE_NAME = 'pe-study-note-shell-v4-6-9-device-list-filter-image-webp98';
const APP_SHELL = [
  './study-note.html',
  './image-upload-optimizer.js',
  './manifest.webmanifest',
  './study-planner.js',
  './study-plans/pe141-100days.json'
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
  const isPlannerAsset = url.pathname.endsWith('/study-planner.js') || url.pathname.endsWith('/study-plans/pe141-100days.json');
  const isImageOptimizerAsset = url.pathname.endsWith('/image-upload-optimizer.js');
  if (!isStudyNoteHtml && !isManifest && !isPlannerAsset && !isImageOptimizerAsset) return;

  // HTML은 network-first: GitHub에 새 버전을 올리면 다음 접속/새로고침에서 우선 최신 파일을 사용한다.
  if (isStudyNoteHtml || isPlannerAsset || isImageOptimizerAsset) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request, { ignoreSearch: true }))
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
