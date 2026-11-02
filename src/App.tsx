import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, INITIAL_APP_STATE, Photographer } from './types';
import {
  authenticateUserByCredentials,
  buildReminderSchedule,
  createShootRecord,
  findTargetNotificationShoot,
  getPendingShootsCount,
  isScheduledReminderDue,
  normalizeAppState,
  PersistedUserSession,
  resolvePersistedSession,
  updatePhotographerSelfCredentials,
  verifyAccountPin,
} from './utils/clacketLogic';
import {
  fetchWorkspaceStateFromFirestore,
  saveWorkspaceStateToFirestore,
  subscribeToWorkspaceState,
  testFirestoreConnection,
} from './firebase';
import { playBeep } from './utils/sound';
import {
  registerClacketServiceWorker,
  sendNativeMobileNotification,
  syncDirectorShootsWithServiceWorker,
} from './utils/pwaNotifications';
import { WelcomeScreen } from './components/WelcomeScreen';
import { PinModal } from './components/PinModal';
import { ReminderPopup } from './components/ReminderPopup';
import { Header } from './components/Header';
import { DirectorView } from './components/DirectorView';
import { PhotographerView } from './components/PhotographerView';

const LEGACY_LOCAL_STATE_KEY = 'clacket_frame_state_v1';
const SESSION_STORAGE_KEY = 'clacket_active_session_v1';

export default function App() {
  // App state is strictly backed by Firebase Cloud Firestore (no localStorage caching of app data)
  const [appState, setAppState] = useState<AppState>(() =>
    normalizeAppState(INITIAL_APP_STATE)
  );
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Determine initial logged-in user session
  const [activeSession, setActiveSession] = useState<{
    role: 'welcome' | 'director' | 'photographer';
    photographer?: Photographer;
  }>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1' || params.get('role') === 'director') {
      return { role: 'director' };
    }
    if (params.get('role') === 'photographer' && appState.photographers[0]) {
      return { role: 'photographer', photographer: appState.photographers[0] };
    }
    try {
      const savedSessionRaw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (savedSessionRaw) {
        const parsedSession = JSON.parse(savedSessionRaw) as PersistedUserSession;
        return resolvePersistedSession(parsedSession, appState);
      }
    } catch {
      // ignore session parse errors
    }
    return { role: 'welcome' };
  });

  const [pinTargetId, setPinTargetId] = useState<'director' | string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [showReminderModal, setShowReminderModal] = useState<boolean>(false);
  const [cloudConnected, setCloudConnected] = useState<boolean>(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastTargetShootId, setToastTargetShootId] = useState<string | null>(null);
  const [focusShootRequest, setFocusShootRequest] = useState<{
    shootId: string;
    nonce: number;
  } | null>(null);
  const [pendingFocusAfterLogin, setPendingFocusAfterLogin] = useState<string | null>(
    null
  );

  const knownShootIdsRef = useRef<Set<string>>(new Set());
  const isFirstSnapshotRef = useRef<boolean>(true);
  const seenPhotographerNotifIdsRef = useRef<Set<string>>(new Set());
  const toastTimerRef = useRef<number | null>(null);
  const activeSessionRef = useRef(activeSession);
  activeSessionRef.current = activeSession;

  const showToast = useCallback(
    (msg: string, alsoSystemNotify = false, targetShootId?: string | null) => {
      setToastMessage(msg);
      setToastTargetShootId(targetShootId ?? null);
      playBeep();
      if (alsoSystemNotify) {
        sendNativeMobileNotification(
          '🎬 كلاكيت فريم | إشعار فوري',
          msg,
          targetShootId ? `shoot-${targetShootId}` : 'clacket-frame-alert',
          targetShootId
        );
      }
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
      toastTimerRef.current = window.setTimeout(() => {
        setToastMessage(null);
      }, 7500);
    },
    []
  );

  /**
   * Central state updater: writes directly to Firebase Cloud Firestore
   * and mirrors to /api/state for the background Service Worker watcher.
   * Does NOT use localStorage for application data.
   */
  const updateAppState = useCallback(
    (
      updater: (prev: AppState) => AppState,
      toastMsg?: string,
      alsoSystemNotify = false,
      targetShootId?: string | null
    ) => {
      setAppState((prev) => {
        const next: AppState = {
          ...normalizeAppState(updater(prev)),
          lastUpdated: Date.now(),
        };

        for (const s of next.shoots) {
          knownShootIdsRef.current.add(s.id);
        }

        // 1. Primary authoritative write to Firebase Cloud Firestore
        saveWorkspaceStateToFirestore(next)
          .then(() => setCloudConnected(true))
          .catch(() => setCloudConnected(false));

        // 2. Mirror to backend /api/state so Service Worker background notifications stay synced
        fetch('/api/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: next }),
        }).catch(() => {});

        return next;
      });

      if (toastMsg) {
        showToast(toastMsg, alsoSystemNotify, targetShootId);
      }
    },
    [showToast]
  );

  // Navigate directly to the specific shoot notification inside DirectorView
  const handleNavigateToNotificationTask = useCallback(
    (preferredShootId?: string | null) => {
      const target = findTargetNotificationShoot(
        appState.shoots,
        preferredShootId ?? toastTargetShootId ?? appState.activeReminderShootId
      );
      const targetId = target?.id || '';

      setToastMessage(null);
      setShowReminderModal(false);

      if (activeSession.role === 'director') {
        if (targetId) {
          setFocusShootRequest({ shootId: targetId, nonce: Date.now() });
        }
      } else {
        if (targetId) {
          setPendingFocusAfterLogin(targetId);
        }
        setPinError(null);
        setPinTargetId('director');
      }
    },
    [
      appState.shoots,
      appState.activeReminderShootId,
      toastTargetShootId,
      activeSession.role,
    ]
  );

  const handleNavigateRef = useRef(handleNavigateToNotificationTask);
  handleNavigateRef.current = handleNavigateToNotificationTask;

  // Process incoming state from Firebase Cloud Firestore (onSnapshot or manual refresh)
  const applyIncomingFirestoreState = useCallback(
    (remote: AppState, isManualRefresh = false) => {
      const session = activeSessionRef.current;
      const incomingPendingShoots = remote.shoots.filter((s) => s.status !== 'completed');

      if (isFirstSnapshotRef.current) {
        isFirstSnapshotRef.current = false;
        for (const s of remote.shoots) {
          knownShootIdsRef.current.add(s.id);
        }
        // If Director opens the app and there are pending shoot orders waiting, alert immediately
        if (session.role === 'director' && incomingPendingShoots.length > 0) {
          const latestPending = incomingPendingShoots[0];
          showToast(
            `🔔 لديك (${incomingPendingShoots.length}) أوردر مونتاج بانتظار العمل! آخرها من (${latestPending.photographerName}) لمشروع (${latestPending.project}) — اضغط للانتقال إليه.`,
            true,
            latestPending.id
          );
          if (remote.activeReminder) {
            setShowReminderModal(true);
          }
        }
      } else {
        // Detect any brand-new shoot orders submitted by photographers
        const newlyArrivedShoots = remote.shoots.filter(
          (s) => !knownShootIdsRef.current.has(s.id)
        );
        for (const s of remote.shoots) {
          knownShootIdsRef.current.add(s.id);
        }

        if (newlyArrivedShoots.length > 0 && session.role !== 'photographer') {
          const newest = newlyArrivedShoots[0];
          showToast(
            `🔔 وصل أوردر مونتاج جديد الآن من (${newest.photographerName}) لمشروع (${newest.project}): ${newest.field1Value} — اضغط للانتقال إليه!`,
            true,
            newest.id
          );
          setShowReminderModal(true);
        } else if (isManualRefresh) {
          if (session.role === 'director' && incomingPendingShoots.length > 0) {
            const latest = incomingPendingShoots[0];
            showToast(
              `🔄 تم التحديث من Firestore: لديك (${incomingPendingShoots.length}) أوردر مونتاج بانتظار العمل (${latest.project} - ${latest.photographerName})`,
              false,
              latest.id
            );
          } else {
            showToast('✅ تم التحديث الفوري من قاعدة بيانات Firestore — جميع البيانات والإشعارات محدّثة!');
          }
        }

        // Check for unread notifications sent to the active photographer
        if (session.role === 'photographer' && session.photographer) {
          const currentPhotog = session.photographer;
          const unreadForMe = (remote.photographerNotifications || []).filter(
            (n) =>
              !n.read &&
              (n.photographerId === currentPhotog.id ||
                n.photographerName === currentPhotog.name)
          );
          const newestNotif = unreadForMe.find(
            (n) => !seenPhotographerNotifIdsRef.current.has(n.id)
          );
          if (newestNotif) {
            seenPhotographerNotifIdsRef.current.add(newestNotif.id);
            showToast(newestNotif.message, true);
          }
        }
      }

      setAppState(remote);

      // Keep backend /api/state mirrored for background Service Worker checks
      fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: remote }),
      }).catch(() => {});

      // Sync known shoot IDs with Service Worker for background notifications when app is closed/minimized
      syncDirectorShootsWithServiceWorker(
        session.role === 'director',
        remote.shoots.map((s) => s.id)
      );
    },
    [showToast]
  );

  // Manual Refresh from Firebase Cloud Firestore
  const handleManualRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const freshState = await fetchWorkspaceStateFromFirestore();
      if (freshState) {
        setCloudConnected(true);
        applyIncomingFirestoreState(freshState, true);
      } else {
        const res = await fetch('/api/state');
        if (res.ok) {
          const data = await res.json();
          if (data?.state) {
            const seeded = normalizeAppState(data.state);
            await saveWorkspaceStateToFirestore(seeded);
            applyIncomingFirestoreState(seeded, true);
          }
        }
      }
    } catch {
      setCloudConnected(false);
      showToast('⚠️ تعذر الاتصال بالسحابة حالياً، يرجى التحقق من اتصال الإنترنت');
    } finally {
      setIsRefreshing(false);
    }
  }, [applyIncomingFirestoreState, showToast]);

  // Boot: Purge legacy localStorage cache, register Service Worker, validate connection, and subscribe to Firestore
  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_LOCAL_STATE_KEY);
    } catch {
      // ignore
    }

    registerClacketServiceWorker();
    testFirestoreConnection();

    // Listen to Service Worker messages when clicking an OS notification
    const handleSwMessage = (event: MessageEvent) => {
      if (
        event.data &&
        event.data.type === 'FOCUS_SHOOT_FROM_NOTIFICATION' &&
        event.data.shootId
      ) {
        handleNavigateRef.current(event.data.shootId);
      }
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
    }

    let isMounted = true;

    // Real-time Firestore listener (onSnapshot)
    const unsubscribe = subscribeToWorkspaceState(
      (remoteState) => {
        if (!isMounted) return;
        applyIncomingFirestoreState(remoteState, false);
      },
      async () => {
        // Document does not exist yet in Firestore -> seed from existing server state so no photographers/projects are lost
        if (!isMounted) return;
        try {
          const res = await fetch('/api/state');
          const data = res.ok ? await res.json() : null;
          const initialSeed = normalizeAppState(data?.state || INITIAL_APP_STATE);
          await saveWorkspaceStateToFirestore(initialSeed);
          if (isMounted) {
            applyIncomingFirestoreState(initialSeed, false);
          }
        } catch {
          const fallbackSeed = normalizeAppState(INITIAL_APP_STATE);
          saveWorkspaceStateToFirestore(fallbackSeed).catch(() => {});
        }
      },
      (connected) => {
        if (isMounted) setCloudConnected(connected);
      }
    );

    // Also refresh directly from Firestore whenever the user returns to the app from background/outside
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        fetchWorkspaceStateFromFirestore()
          .then((fresh) => {
            if (isMounted && fresh) {
              setCloudConnected(true);
              applyIncomingFirestoreState(fresh, false);
            }
          })
          .catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    return () => {
      isMounted = false;
      unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      }
    };
  }, [applyIncomingFirestoreState]);

  // Keep Service Worker background watcher updated whenever active role or shoots change
  useEffect(() => {
    syncDirectorShootsWithServiceWorker(
      activeSession.role === 'director',
      appState.shoots.map((s) => s.id)
    );
  }, [activeSession.role, appState.shoots]);

  // Respect the user's configured reminder schedule strictly
  useEffect(() => {
    if (activeSession.role === 'photographer') return;

    const checkScheduledReminder = () => {
      const counts = getPendingShootsCount(appState.shoots);
      const now = Date.now();
      if (isScheduledReminderDue(appState.reminderSchedule, counts.actionRequired, now)) {
        const targetShoot = findTargetNotificationShoot(
          appState.shoots,
          appState.reminderSchedule?.targetShootId ?? appState.activeReminderShootId
        );
        const scheduleLabel = appState.reminderSchedule?.label || 'بعد نصف ساعة';
        const intervalMins = appState.reminderSchedule?.intervalMinutes || 30;

        const alertMsg = targetShoot
          ? `🔔 تذكير مهام المونتاج (${scheduleLabel}): لديك عمل بانتظار المونتاج في (${targetShoot.project} - ${targetShoot.photographerName}) — اضغط للانتقال لمكان الإشعار!`
          : `🔔 تذكير مهام المونتاج (${scheduleLabel}): لديك (${counts.actionRequired}) مهام بانتظار المونتاج!`;

        updateAppState(
          (prev) => ({
            ...prev,
            reminderSchedule: prev.reminderSchedule
              ? {
                  ...prev.reminderSchedule,
                  nextTriggerAt: Date.now() + intervalMins * 60 * 1000,
                }
              : undefined,
          }),
          alertMsg,
          true,
          targetShoot?.id ?? null
        );
      }
    };

    const scheduleChecker = window.setInterval(checkScheduledReminder, 10000);
    return () => {
      window.clearInterval(scheduleChecker);
    };
  }, [
    activeSession.role,
    appState.shoots,
    appState.activeReminderShootId,
    appState.reminderSchedule,
    updateAppState,
  ]);

  // Keep document title synced with configured appName
  useEffect(() => {
    document.title = `${appState.config.appName} | Clacket Frame`;
  }, [appState.config.appName]);

  // Keep active photographer session synced with latest photographers list from Firestore
  useEffect(() => {
    if (activeSession.role === 'photographer' && activeSession.photographer) {
      const currentPhotog = activeSession.photographer;
      const latestPhotog = appState.photographers.find(
        (p) => p.id === currentPhotog.id || p.name.trim() === currentPhotog.name.trim()
      );
      if (
        latestPhotog &&
        (latestPhotog.name !== currentPhotog.name ||
          latestPhotog.pin !== currentPhotog.pin ||
          latestPhotog.id !== currentPhotog.id)
      ) {
        setActiveSession({
          role: 'photographer',
          photographer: latestPhotog,
        });
        try {
          const persisted: PersistedUserSession = {
            role: 'photographer',
            photographerId: latestPhotog.id,
            photographerName: latestPhotog.name,
          };
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(persisted));
        } catch {
          // ignore
        }
      }
    }
  }, [appState.photographers, activeSession.role, activeSession.photographer]);

  const handleUpdateReminderScheduleFromPopup = (input: {
    preset: '30' | '60' | '120' | '180' | '240' | '360' | 'custom';
    customAmount?: string;
    customUnit?: 'minutes' | 'hours';
  }) => {
    const targetShoot = findTargetNotificationShoot(
      appState.shoots,
      appState.activeReminderShootId
    );
    const res = buildReminderSchedule({
      preset: input.preset,
      customAmount: input.customAmount,
      customUnit: input.customUnit,
      targetShootId: targetShoot?.id ?? null,
    });
    if (!res.ok) {
      showToast(res.error);
      return;
    }
    updateAppState(
      (prev) => ({
        ...prev,
        reminderSchedule: res.schedule,
        activeReminderShootId: targetShoot?.id ?? prev.activeReminderShootId,
      }),
      `⏰ تم ضبط وقت التذكير القادم: ${res.schedule.label}`
    );
  };

  const handleOpenPinModal = (targetId: 'director' | string) => {
    setPinError(null);
    setPinTargetId(targetId);
  };

  const handleLoginWithCredentials = (
    username: string,
    password: string
  ): { ok: boolean; error?: string } => {
    const authResult = authenticateUserByCredentials(appState, username, password);
    if (!authResult.valid) {
      return { ok: false, error: authResult.error };
    }
    if (authResult.role === 'director') {
      completeLoginForTarget('director');
      return { ok: true };
    }
    if (authResult.role === 'photographer' && authResult.photographer) {
      completeLoginForTarget(authResult.photographer.id);
      return { ok: true };
    }
    return { ok: false, error: 'تعذر تسجيل الدخول، يرجى التحقق من البيانات' };
  };

  const completeLoginForTarget = (targetId: 'director' | string) => {
    setPinError(null);
    setPinTargetId(null);
    playBeep();

    // Request notification permission automatically on login so background alerts work outside the app
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    if (targetId === 'director') {
      try {
        const persisted: PersistedUserSession = { role: 'director' };
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(persisted));
      } catch {
        // ignore
      }
      setActiveSession({ role: 'director' });
      if (pendingFocusAfterLogin) {
        const targetShootId = pendingFocusAfterLogin;
        setPendingFocusAfterLogin(null);
        setFocusShootRequest({ shootId: targetShootId, nonce: Date.now() });
      } else if (
        appState.activeReminder &&
        appState.shoots.some((s) => s.status !== 'completed')
      ) {
        setShowReminderModal(true);
      }
      return;
    }

    const photog = appState.photographers.find((p) => p.id === targetId);
    if (photog) {
      try {
        const persisted: PersistedUserSession = {
          role: 'photographer',
          photographerId: photog.id,
          photographerName: photog.name,
        };
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(persisted));
      } catch {
        // ignore
      }
      setActiveSession({
        role: 'photographer',
        photographer: photog,
      });
      const unreadForMe = (appState.photographerNotifications || []).filter(
        (n) =>
          !n.read &&
          (n.photographerId === photog.id || n.photographerName === photog.name)
      );
      if (unreadForMe.length > 0) {
        seenPhotographerNotifIdsRef.current.add(unreadForMe[0].id);
        showToast(unreadForMe[0].message, true);
      } else {
        setToastMessage(null);
      }
    }
  };

  const handleVerifyPin = (enteredPin: string) => {
    if (!pinTargetId) return;
    const verification = verifyAccountPin(appState, pinTargetId, enteredPin);
    if (!verification.valid) {
      setPinError('الرمز السري غير صحيح، حاول مرة أخرى');
      return;
    }
    completeLoginForTarget(pinTargetId);
  };

  const handleFaceIdVerified = () => {
    if (!pinTargetId) return;
    completeLoginForTarget(pinTargetId);
  };

  const handleUpdatePhotographerCredentials = (input: {
    newPin?: string;
    faceIdEnabled?: boolean;
  }): { ok: boolean; error?: string } => {
    const currentPhotog = activeSession.photographer;
    if (!currentPhotog) {
      return { ok: false, error: 'لا يوجد حساب مصور نشط' };
    }

    const res = updatePhotographerSelfCredentials(appState, currentPhotog.id, input);
    if (!res.ok) {
      return { ok: false, error: res.error };
    }

    setActiveSession({
      role: 'photographer',
      photographer: res.updatedPhotographer,
    });

    updateAppState(
      (prev) => {
        const updated = updatePhotographerSelfCredentials(prev, currentPhotog.id, input);
        return updated.ok ? updated.nextState : prev;
      },
      '✅ تم تغيير وحفظ رمز الدخول السري الخاص بك في السحابة بنجاح!'
    );

    return { ok: true };
  };

  const handleLockAndReturnHome = () => {
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // ignore
    }
    setActiveSession({ role: 'welcome' });
    setPinTargetId(null);
    setPinError(null);
  };

  const handleEnableSystemNotifications = async () => {
    playBeep();
    await registerClacketServiceWorker();
    const targetShoot = findTargetNotificationShoot(
      appState.shoots,
      appState.activeReminderShootId
    );
    const scheduleLabel = appState.reminderSchedule?.label || 'بعد نصف ساعة';
    if ('Notification' in window) {
      try {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          setNotificationsEnabled(true);
          showToast(
            `🔔 تم تفعيل إشعارات الخلفية والموبايل! ستصلك إشعارات أوردرات المونتاج من المصورين حتى لو كنت خارج التطبيق، والتذكير المجدول (${scheduleLabel}).`,
            true,
            targetShoot?.id ?? null
          );
          return;
        }
      } catch {
        // ignore iframe notification permission constraints
      }
    }
    setNotificationsEnabled(true);
    showToast(
      `🔔 الجرس مفعّل! التذكير المجدول مضبوط على (${scheduleLabel}).`,
      false,
      targetShoot?.id ?? null
    );
  };

  const handlePhotographerSubmitShoot = (input: {
    project: string;
    field1Value: string;
    field2Value: string;
    shotType: string;
    isUrgent: boolean;
    reminderNote?: string;
  }): { ok: boolean; error?: string } => {
    const currentPhotog =
      activeSession.photographer || appState.photographers[0];
    if (!currentPhotog) {
      return { ok: false, error: 'لا يوجد حساب مصور محدد' };
    }
    const result = createShootRecord(input, currentPhotog);
    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    sendNativeMobileNotification(
      `📸 أوردر مونتاج جديد من ${currentPhotog.name}`,
      `المشروع: ${result.shoot.project} — ${result.shoot.field1Value}`,
      `shoot-${result.shoot.id}`,
      result.shoot.id
    );

    updateAppState(
      (prev) => ({
        ...prev,
        shoots: [result.shoot, ...prev.shoots],
        activeReminder:
          input.reminderNote ||
          `وصل أوردر مونتاج جديد من (${currentPhotog.name}) لمشروع (${result.shoot.project}): ${result.shoot.field1Value}`,
        activeReminderShootId: result.shoot.id,
      }),
      '✅ تم إرسال أوردر المونتاج وحفظه في السحابة الفورية للمونتير'
    );

    return { ok: true };
  };

  const handleDismissPhotographerNotification = (notifId: string) => {
    updateAppState((prev) => ({
      ...prev,
      photographerNotifications: (prev.photographerNotifications || []).map((n) =>
        n.id === notifId ? { ...n, read: true } : n
      ),
    }));
  };

  // Determine modal target info
  const targetPhotographer =
    pinTargetId && pinTargetId !== 'director'
      ? appState.photographers.find((p) => p.id === pinTargetId)
      : undefined;

  const pinTargetTitle =
    pinTargetId === 'director'
      ? appState.config.directorName
      : targetPhotographer?.name || '';

  const pinTargetFaceIdEnabled =
    pinTargetId === 'director'
      ? appState.config.directorFaceIdEnabled !== false
      : targetPhotographer?.faceIdEnabled !== false;

  const activeUserLabel =
    activeSession.role === 'director'
      ? `🎬 الحساب النشط: ${appState.config.directorName}`
      : activeSession.role === 'photographer' && activeSession.photographer
      ? `📸 المصور الميداني: ${activeSession.photographer.name}`
      : '';

  const pendingCounts = getPendingShootsCount(appState.shoots);

  return (
    <div className="min-h-screen pb-16 bg-[#0b0f19] text-[#f1f5f9]">
      {/* شاشة الترحيب والدخول */}
      {activeSession.role === 'welcome' && (
        <WelcomeScreen
          config={appState.config}
          photographers={appState.photographers}
          pendingTasksCount={pendingCounts.actionRequired}
          scheduleLabel={appState.reminderSchedule?.label}
          notificationsEnabled={notificationsEnabled}
          onEnableNotifications={handleEnableSystemNotifications}
          onLoginWithCredentials={handleLoginWithCredentials}
          onOpenPinModal={handleOpenPinModal}
        />
      )}

      {/* نافذة الرمز السري */}
      <PinModal
        isOpen={pinTargetId !== null}
        targetId={pinTargetId}
        targetTitle={pinTargetTitle}
        faceIdEnabled={pinTargetFaceIdEnabled}
        errorMessage={pinError}
        onVerify={handleVerifyPin}
        onFaceIdVerified={handleFaceIdVerified}
        onClose={() => {
          setPinTargetId(null);
          setPinError(null);
          setPendingFocusAfterLogin(null);
        }}
      />

      {/* نافذة التذكير الذكي للمونتير */}
      <ReminderPopup
        reminderText={
          activeSession.role === 'director' && showReminderModal
            ? appState.activeReminder
            : null
        }
        currentIntervalLabel={appState.reminderSchedule?.label}
        onDismiss={() => setShowReminderModal(false)}
        onNavigateToTask={() =>
          handleNavigateToNotificationTask(appState.activeReminderShootId)
        }
        onUpdateReminderSchedule={handleUpdateReminderScheduleFromPopup}
      />

      {/* الهيدر العلوي */}
      {activeSession.role !== 'welcome' && (
        <Header
          appName={appState.config.appName}
          activeUserLabel={activeUserLabel}
          cloudConnected={cloudConnected}
          isRefreshing={isRefreshing}
          notificationsEnabled={notificationsEnabled}
          onManualRefresh={handleManualRefresh}
          onEnableNotifications={handleEnableSystemNotifications}
          onLockAndReturnHome={handleLockAndReturnHome}
        />
      )}

      {/* إشعار منبثق */}
      {toastMessage && (
        <div
          id="liveToast"
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] w-[92%] max-w-md bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-3.5 rounded-2xl shadow-2xl flex items-center justify-between gap-2 border border-emerald-400 transition"
        >
          {activeSession.role === 'photographer' ? (
            <div className="flex items-center gap-2.5 text-right flex-1">
              <span className="text-2xl shrink-0">✅</span>
              <span
                id="liveToastText"
                className="text-xs sm:text-sm font-bold leading-relaxed block"
              >
                {toastMessage}
              </span>
            </div>
          ) : (
            <button
              id="liveToastActionBtn"
              type="button"
              onClick={() => handleNavigateToNotificationTask(toastTargetShootId)}
              className="flex items-center gap-2.5 text-right flex-1 cursor-pointer"
            >
              <span className="text-2xl shrink-0">🔔</span>
              <div className="flex-1">
                <span
                  id="liveToastText"
                  className="text-xs sm:text-sm font-bold leading-relaxed block"
                >
                  {toastMessage}
                </span>
                {toastTargetShootId && (
                  <span className="text-[11px] text-amber-200 font-black underline mt-0.5 block">
                    📍 اضغط هنا للانتقال مباشرة إلى مكان الإشعار والمهمة ↗️
                  </span>
                )}
              </div>
            </button>
          )}
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-xs bg-black/25 hover:bg-black/40 px-2.5 py-1.5 rounded-lg cursor-pointer shrink-0 font-bold"
          >
            إغلاق
          </button>
        </div>
      )}

      {/* المحتوى الرئيسي */}
      {activeSession.role !== 'welcome' && (
        <main className="max-w-5xl mx-auto p-4">
          {activeSession.role === 'director' && (
            <DirectorView
              state={appState}
              focusShootRequest={focusShootRequest}
              isRefreshing={isRefreshing}
              onManualRefresh={handleManualRefresh}
              onUpdateState={updateAppState}
              onShowToast={showToast}
            />
          )}

          {activeSession.role === 'photographer' && activeSession.photographer && (
            <PhotographerView
              photographer={activeSession.photographer}
              state={appState}
              onSubmitShoot={handlePhotographerSubmitShoot}
              onDismissNotification={handleDismissPhotographerNotification}
              onUpdatePhotographerCredentials={handleUpdatePhotographerCredentials}
            />
          )}
        </main>
      )}
    </div>
  );
}
