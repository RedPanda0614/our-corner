// Offline shell. Bump VERSION after each deploy so phones pick up the new files.
const PREFIX = 'olc:' + self.registration.scope + ':';
const VERSION = PREFIX + 'v10';
const SHELL = ['./', 'index.html', 'theme-vars.css', 'style.css', 'app.css', 'config.js', 'calendar-import.js', 'store.js', 'bgm.js', 'app.js',
  'manifest.webmanifest', 'assets/hero.jpg', 'assets/bunny.png', 'assets/fusion-pixel-sc.woff2', 'assets/icon-192.png', 'assets/ipod.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const sameOrigin = url.origin === location.origin;
  if (sameOrigin && !url.href.startsWith(self.registration.scope)) return;
  const cdn = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !cdn) return; // GitHub API calls always go straight to the network
  // Network first (fresh files after a deploy), cache as fallback when offline.
  // no-cache: always ask GitHub Pages whether the file changed, so a new deploy shows up right away.
  e.respondWith(fetch(sameOrigin ? new Request(e.request, { cache: 'no-cache' }) : e.request).then(res => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: sameOrigin })));
});
