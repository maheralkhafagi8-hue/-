/* Service Worker for Clacket Frame real-time & background notifications */
let knownShootIds = new Set();
let directorWatchActive = false;
let pollTimer = null;

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

async function checkBackendForNewShoots() {
  if (!directorWatchActive) return;
  try {
    const res = await fetch('/api/state', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    const shoots = (data && data.state && Array.isArray(data.state.shoots)) ? data.state.shoots : [];
    for (let i = 0; i < shoots.length; i++) {
      const s = shoots[i];
      if (s && s.id && !knownShootIds.has(s.id)) {
        knownShootIds.add(s.id);
        if (s.status !== 'completed') {
          await self.registration.showNotification(
            `🎬 أوردر مونتاج جديد من ${s.photographerName}`,
            {
              body: `المشروع: ${s.project} — ${s.field1Value}`,
              icon: '/pwa-192x192.png',
              badge: '/pwa-192x192.png',
              dir: 'rtl',
              lang: 'ar',
              tag: `shoot-${s.id}`,
              renotify: true,
              requireInteraction: true,
              vibrate: [300, 120, 300, 120, 400],
              data: {
                url: '/',
                shootId: s.id,
                timestamp: Date.now(),
              },
            }
          );
        }
      }
    }
  } catch (e) {
    // ignore transient offline errors
  }
}

function ensureBackgroundPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(checkBackendForNewShoots, 8000);
}

self.addEventListener('message', function (event) {
  const payload = event.data;
  if (!payload || typeof payload !== 'object') return;

  if (payload.type === 'SYNC_DIRECTOR_SHOOTS') {
    directorWatchActive = Boolean(payload.isDirector);
    if (Array.isArray(payload.shootIds)) {
      for (let i = 0; i < payload.shootIds.length; i++) {
        knownShootIds.add(payload.shootIds[i]);
      }
    }
    if (directorWatchActive) {
      ensureBackgroundPolling();
    }
  }

  if (payload.type === 'CHECK_NOW') {
    event.waitUntil(checkBackendForNewShoots());
  }
});

self.addEventListener('sync', function (event) {
  if (event.tag === 'clacket-check-shoots') {
    event.waitUntil(checkBackendForNewShoots());
  }
});

self.addEventListener('periodicsync', function (event) {
  if (event.tag === 'clacket-periodic-shoots') {
    event.waitUntil(checkBackendForNewShoots());
  }
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  const shootId = event.notification.data && event.notification.data.shootId;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (shootId && client.postMessage) {
          client.postMessage({ type: 'FOCUS_SHOOT_FROM_NOTIFICATION', shootId: shootId });
        }
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
