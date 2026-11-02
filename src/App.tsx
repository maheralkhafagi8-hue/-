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
  updatePhotographerSelfCredentials,
  verifyAccountPin,
} from './utils/clacketLogic';
import { playBeep } from './utils/sound';
import { sendNativeMobileNotification } from './utils/pwaNotifications';
import { WelcomeScreen } from './components/WelcomeScreen';
import { PinModal } from './components/PinModal';
import { ReminderPopup } from './components/ReminderPopup';
import { Header } from './components/Header';
import { DirectorView } from './components/DirectorView';
import { PhotographerView } from './components/PhotographerView';

const LOCAL_STORAGE_KEY = 'clacket_frame_state_v1';

export default function App() {
  const [appState, setAppState] = useState<AppState>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<AppState>;
        if (parsed && parsed.config && Array.isArray(parsed.projects)) {
          const cleaned = normalizeAppState(parsed);
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cleaned));
          return cleaned;
        }
      }
    } catch {
      // ignore storage errors
    }
    return normalizeAppState(INITIAL_APP_STATE);
  });

  // Determine initial session from query params (?autostart=1 or ?role=director)
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

  const lastShootCountRef = useRef<number>(appState.shoots.length);
  const seenPhotographerNotifIdsRef = useRef<Set<string>>(new Set());
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback(
    (msg: string, alsoSystemNotify = false, targetShootId?: string | null) => {
      setToastMessage(msg);
      setToastTargetShootId(targetShootId ?? null);
      playBeep();
      if (alsoSystemNotify) {
        sendNativeMobileNotification('🎬 كلاكيت فريم | إشعار فوري', msg);
      }
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
      toastTimerRef.current = window.setTimeout(() => {
        setToastMessage(null);
      }, 6500);
    },
    []
  );

  const updateAppState = useCallback(
    (
      updater: (prev: AppState) => AppState,
      toastMsg?: string,
      alsoSystemNotify = false,
      targetShootId?: string | null
    ) => {
      setAppState((prev) => {
        const next: AppState = {
          ...updater(prev),
          lastUpdated: Date.now(),
        };
        lastShootCountRef.current = next.shoots.length;
        try {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        fetch('/api/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: next }),
        })
          .then((r) => setCloudConnected(r.ok))
          .catch(() => setCloudConnected(false));

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

  // Respect the user's configured reminder schedule strictly (no frequent spam!)
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

  // Fetch initial state from backend server & poll for real-time updates
  useEffect(() => {
    let isMounted = true;

    const fetchCloudState = async () => {
      try {
        const res = await fetch('/api/state');
        if (!res.ok) throw new Error('Status not ok');
        const data = await res.json();
        if (isMounted && data?.ok && data?.state) {
          const remote: AppState = normalizeAppState(data.state);
          setCloudConnected(true);
          setAppState((prev) => {
            // If local browser state is newer than server state (e.g. after a server restart),
            // push our saved local state back to the server so added photographers are never lost!
            if (prev.lastUpdated > remote.lastUpdated) {
              fetch('/api/state', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ state: prev }),
              }).catch(() => {});
              return prev;
            }

            if (remote.lastUpdated > prev.lastUpdated) {
              if (
                remote.shoots.length > lastShootCountRef.current &&
                activeSession.role !== 'photographer'
              ) {
                const newest = remote.shoots[0];
                if (newest) {
                  showToast(
                    `🔔 وصل تصوير جديد من (${newest.photographerName}) لمشروع (${newest.project})! اضغط للانتقال إليه.`,
                    true,
                    newest.id
                  );
                }
              }

              if (
                activeSession.role === 'photographer' &&
                activeSession.photographer
              ) {
                const currentPhotog = activeSession.photographer;
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

              lastShootCountRef.current = remote.shoots.length;
              localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(remote));
              return remote;
            }
            return prev;
          });
        }
      } catch {
        if (isMounted) setCloudConnected(false);
      }
    };

    fetchCloudState();
    const interval = window.setInterval(fetchCloudState, 6000);
    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [showToast, activeSession.role, activeSession.photographer]);

  // Keep document title synced with configured appName
  useEffect(() => {
    document.title = `${appState.config.appName} | Clacket Frame`;
  }, [appState.config.appName]);

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

    if (targetId === 'director') {
      setActiveSession({ role: 'director' });
      if (pendingFocusAfterLogin) {
        const targetShootId = pendingFocusAfterLogin;
        setPendingFocusAfterLogin(null);
        setFocusShootRequest({ shootId: targetShootId, nonce: Date.now() });
      } else if (appState.activeReminder && appState.shoots.some((s) => s.status !== 'completed')) {
        setShowReminderModal(true);
      }
      return;
    }

    const photog = appState.photographers.find((p) => p.id === targetId);
    if (photog) {
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
      '✅ تم تغيير وحفظ رمز الدخول السري الخاص بك بنجاح!'
    );

    return { ok: true };
  };

  const handleLockAndReturnHome = () => {
    setActiveSession({ role: 'welcome' });
    setPinTargetId(null);
    setPinError(null);
  };

  const handleEnableSystemNotifications = async () => {
    playBeep();
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
            `🔔 تم تفعيل إشعارات الموبايل! ستصلك تنبيهات المصورين على شاشة القفل، والتذكير المجدول (${scheduleLabel}).`,
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
      `📸 تصوير جديد من ${currentPhotog.name}`,
      `المشروع: ${result.shoot.project} — ${result.shoot.field1Value}`,
      `shoot-${result.shoot.id}`
    );

    updateAppState(
      (prev) => ({
        ...prev,
        shoots: [result.shoot, ...prev.shoots],
        activeReminder:
          input.reminderNote ||
          `وصل تصوير جديد من (${currentPhotog.name}) لمشروع (${result.shoot.project}): ${result.shoot.field1Value}`,
        activeReminderShootId: result.shoot.id,
      }),
      '✅ تم الإرسال إلى المونتير'
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

      {/* نافذة الرمز السري وبصمة الوجه */}
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
          notificationsEnabled={notificationsEnabled}
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
