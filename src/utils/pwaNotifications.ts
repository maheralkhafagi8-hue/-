/**
 * Dispatches native mobile / desktop notifications via ServiceWorkerRegistration.showNotification
 * so installed PWAs on Android and iOS Home Screen display lock-screen and system tray alerts
 * just like native mobile applications.
 */
export async function sendNativeMobileNotification(
  title: string,
  body: string,
  tag = 'clacket-frame-alert'
): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
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
    vibrate: [250, 120, 250, 120, 350],
    data: {
      url: '/',
      timestamp: Date.now(),
    },
  };

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
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
