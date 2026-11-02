/**
 * Registers the Service Worker and manages background/system notifications
 * so the Director receives immediate shoot order alerts both inside and outside the app.
 */

let swRegistrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export function registerClacketServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return Promise.resolve(null);
  }
  if (!swRegistrationPromise) {
    swRegistrationPromise = navigator.serviceWorker
      .register('/sw-notifications.js', { scope: '/' })
      .catch(() => null);
  }
  return swRegistrationPromise;
}

export async function syncDirectorShootsWithServiceWorker(
  isDirector: boolean,
  shootIds: string[]
): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const reg =
      (await navigator.serviceWorker.getRegistration()) ||
      (await registerClacketServiceWorker());
    const activeWorker = reg?.active || navigator.serviceWorker.controller;
    if (activeWorker) {
      activeWorker.postMessage({
        type: 'SYNC_DIRECTOR_SHOOTS',
        isDirector,
        shootIds,
      });
    }
  } catch {
    // ignore
  }
}

export async function sendNativeMobileNotification(
  title: string,
  body: string,
  tag = 'clacket-frame-alert',
  shootId?: string | null
): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  if (Notification.permission === 'default') {
    try {
      await Notification.requestPermission();
    } catch {
      // ignore
    }
  }

  if (Notification.permission !== 'granted') {
    return false;
  }

  const options: NotificationOptions & { vibrate?: number[]; renotify?: boolean } = {
    body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    dir: 'rtl',
    lang: 'ar',
    tag,
    renotify: true,
    requireInteraction: true,
    vibrate: [300, 120, 300, 120, 400],
    data: {
      url: '/',
      shootId: shootId ?? null,
      timestamp: Date.now(),
    },
  };

  try {
    if ('serviceWorker' in navigator) {
      const registration =
        (await navigator.serviceWorker.getRegistration()) ||
        (await registerClacketServiceWorker());
      if (registration && 'showNotification' in registration) {
        await registration.showNotification(title, options);
        return true;
      }
    }
  } catch {
    // Fallback to standard Notification API below
  }

  try {
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}
