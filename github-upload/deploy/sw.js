// PetrolMeets service worker: makes the app installable, opens offline with the last copy, and shows meet reminders.
// Nov 2026: the app lives at /app/; / is the public website. Push links that still say /?meet=… open in /app/.
const CACHE = 'pm-v7';
const SHELL = ['/app/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;   // never touch Supabase, tiles or fonts
  e.respondWith(fetch(r).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); } return res; })
    .catch(() => caches.match(r).then(m => m || (r.mode === 'navigate' && u.pathname.startsWith('/app') ? caches.match('/app/') : m))));
});
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: 'PetrolMeets', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'PetrolMeets', {
    body: d.body || '', tag: d.tag, data: { url: d.url || '/app/' },
    icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', renotify: true
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const u = new URL((e.notification.data && e.notification.data.url) || '/app/', self.location.origin);
  if (u.origin === self.location.origin && u.pathname === '/') u.pathname = '/app/';
  const url = u.href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    for (const w of ws) if ('focus' in w) { w.navigate(url); return w.focus(); }
    return self.clients.openWindow(url);
  }));
});
