import { AppState, Photographer } from '../types';
import { IDEA_SUGGESTION_TEMPLATES } from './clacketLogic';

export type AppEdition = 'default' | 'mobile' | 'mac' | 'photographers';

const FALLBACK_SHARED_APP_URL =
  'https://ais-pre-2ovhqho53orbjdzf22tcpo-990568687180.europe-west2.run.app';
const FALLBACK_DEV_APP_URL =
  'https://ais-dev-2ovhqho53orbjdzf22tcpo-990568687180.europe-west2.run.app';

/**
 * Resolves the public shared URL (ais-pre-*) for external sharing.
 */
export function resolvePublicCloudUrl(currentOrigin?: string): string {
  const raw =
    currentOrigin ||
    (typeof window !== 'undefined' ? window.location.origin : FALLBACK_SHARED_APP_URL);
  const cleaned = raw.replace(/\/+$/, '');
  if (cleaned.includes('ais-dev-')) {
    return cleaned.replace('ais-dev-', 'ais-pre-');
  }
  return cleaned || FALLBACK_SHARED_APP_URL;
}

/**
 * Resolves the active current origin URL (works immediately in the active session).
 */
export function resolveCurrentOriginUrl(currentOrigin?: string): string {
  const raw =
    currentOrigin ||
    (typeof window !== 'undefined' ? window.location.origin : FALLBACK_DEV_APP_URL);
  return raw.replace(/\/+$/, '') || FALLBACK_DEV_APP_URL;
}

export interface EditionUrls {
  currentOriginUrl: string;
  publicBaseUrl: string;
  mobileUrl: string;
  macUrl: string;
  photographersUrl: string;
  activeMobileUrl: string;
  activeMacUrl: string;
  activePhotographersUrl: string;
  photographerDirectLinks: Array<{
    id: string;
    name: string;
    url: string;
    activeUrl: string;
  }>;
}

export function buildEditionUrls(
  photographers: Photographer[],
  currentOrigin?: string
): EditionUrls {
  const currentOriginUrl = resolveCurrentOriginUrl(currentOrigin);
  const publicBaseUrl = resolvePublicCloudUrl(currentOrigin);

  return {
    currentOriginUrl,
    publicBaseUrl,
    mobileUrl: `${publicBaseUrl}/?edition=mobile`,
    macUrl: `${publicBaseUrl}/?edition=mac&role=director`,
    photographersUrl: `${publicBaseUrl}/?edition=photographers`,
    activeMobileUrl: `${currentOriginUrl}/?edition=mobile`,
    activeMacUrl: `${currentOriginUrl}/?edition=mac&role=director`,
    activePhotographersUrl: `${currentOriginUrl}/?edition=photographers`,
    photographerDirectLinks: photographers.map((p) => ({
      id: p.id,
      name: p.name,
      url: `${publicBaseUrl}/?edition=photographers&photogId=${encodeURIComponent(p.id)}`,
      activeUrl: `${currentOriginUrl}/?edition=photographers&photogId=${encodeURIComponent(p.id)}`,
    })),
  };
}

export function parseUrlEdition(searchStr: string): {
  edition: AppEdition;
  photogId: string | null;
} {
  const params = new URLSearchParams(searchStr);
  const rawEdition = (params.get('edition') || '').toLowerCase();
  const photogId = params.get('photogId');

  if (rawEdition === 'photographers' || rawEdition === 'photographer') {
    return { edition: 'photographers', photogId };
  }
  if (rawEdition === 'mac' || rawEdition === 'macos') {
    return { edition: 'mac', photogId };
  }
  if (rawEdition === 'mobile' || rawEdition === 'phone') {
    return { edition: 'mobile', photogId };
  }
  return { edition: 'default', photogId };
}

/**
 * Generates a macOS .command script that opens the downloaded Mac HTML file or live URL in a dedicated window.
 */
export function buildMacDesktopLauncher(macUrl: string, appName: string): string {
  return `#!/bin/bash
# مشغل تطبيق ${appName} على نظام الماك (macOS Studio Launcher)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOCAL_HTML="$SCRIPT_DIR/ClacketFrame-Mac-Studio.html"
APP_URL="${macUrl}"

if [ -f "$LOCAL_HTML" ]; then
  TARGET="file://$LOCAL_HTML"
else
  TARGET="$APP_URL"
fi

if [ -d "/Applications/Google Chrome.app" ]; then
  open -a "Google Chrome" --args --app="$TARGET"
elif [ -d "/Applications/Brave Browser.app" ]; then
  open -a "Brave Browser" --args --app="$TARGET"
elif [ -d "/Applications/Microsoft Edge.app" ]; then
  open -a "Microsoft Edge" --args --app="$TARGET"
else
  open -a "Safari" "$TARGET"
fi
`;
}

/**
 * Generates a 100% self-contained, standalone HTML5 application file for:
 * - 'mobile': Full Director + Photographer Mobile PWA (works offline & online without external links)
 * - 'mac': Full macOS Desktop Studio for Director & Editing Room (works offline & online without external links)
 * - 'photographers': Photographers-Only Edition (Director login & settings completely removed)
 */
export function buildStandaloneEditionHtml(
  state: AppState,
  edition: 'mobile' | 'mac' | 'photographers',
  currentOrigin?: string
): string {
  const publicBaseUrl = resolvePublicCloudUrl(currentOrigin);
  const activeOriginUrl = resolveCurrentOriginUrl(currentOrigin);

  // Strip sensitive director PIN when exporting the Photographers-only standalone file
  const safeExportState: AppState =
    edition === 'photographers'
      ? {
          ...state,
          config: {
            ...state.config,
            directorPin: '****',
          },
        }
      : state;

  const serializedState = JSON.stringify(safeExportState).replace(/</g, '\\u003c');
  const serializedTemplates = JSON.stringify(IDEA_SUGGESTION_TEMPLATES).replace(
    /</g,
    '\\u003c'
  );

  const editionTitle =
    edition === 'photographers'
      ? `${state.config.appName} | نسخة المصورين`
      : edition === 'mac'
      ? `${state.config.appName} | نسخة حاسبة الماك (Studio)`
      : `${state.config.appName} | نسخة الموبايل`;

  const editionBadge =
    edition === 'photographers'
      ? '📸 نسخة المصورين الميدانية'
      : edition === 'mac'
      ? '💻 نسخة حاسبة الماك (macOS Studio)'
      : '📱 نسخة الموبايل الكاملة';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="${editionTitle}" />
  <meta name="theme-color" content="#0b0f19" />
  <title>${editionTitle}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
  <style>
    body { font-family: 'Cairo', sans-serif; background-color: #0b0f19; color: #f1f5f9; user-select: none; }
    .glass { background: rgba(17, 24, 39, 0.90); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.08); }
    .pulse-red { animation: pulseRed 2s infinite; }
    @keyframes pulseRed { 0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.55); } 50% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); } }
  </style>
</head>
<body class="min-h-screen pb-16">
  <div id="standaloneApp" class="max-w-5xl mx-auto p-4 space-y-5"></div>

  <script>
    const EDITION = ${JSON.stringify(edition)};
    const CLOUD_ENDPOINTS = [
      ${JSON.stringify(`${activeOriginUrl}/api/state`)},
      ${JSON.stringify(`${publicBaseUrl}/api/state`)}
    ];
    const IDEA_TEMPLATES = ${serializedTemplates};
    const STORAGE_KEY = 'clacket_standalone_state_' + EDITION;

    let appState = (function() {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.config && Array.isArray(parsed.projects)) return parsed;
        }
      } catch (e) {}
      return ${serializedState};
    })();

    let activeSession = { role: 'welcome', photog: null }; // 'welcome' | 'director' | 'photographer'
    let directorTab = 'editTab'; // 'editTab' | 'ideasTab' | 'statsTab' | 'audioTab' | 'adminTab'
    let pinModalTarget = null; // null | 'director' | photogId
    let pinInputVal = '';
    let pinErrorMsg = '';
    let toastMessage = '';
    let toastShootId = null;
    let highlightedShootId = null;
    let projectFilter = 'all';
    let statusFilter = 'all';
    let aiRunning = false;
    let aiTimer = null;
    let aiLastPrompt = '';
    let aiReplyText = 'أهلاً بك بالمونتاج! اكتب فكرة اللقطات وسأقترح عليك الهوك البصري، ترتيب اللقطات، وسكريبت التعليق الصوتي.';
    let adminDraft = JSON.parse(JSON.stringify(appState));
    let hasUnsavedAdmin = false;

    function playBeep() {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.22, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime + 0.45);
      } catch (e) {}
    }

    function sendDeviceNotification(title, body) {
      playBeep();
      if ('Notification' in window && Notification.permission === 'granted') {
        try { new Notification(title, { body }); } catch (e) {}
      }
    }

    function showToast(msg, shootId) {
      toastMessage = msg;
      toastShootId = shootId || null;
      playBeep();
      render();
      setTimeout(() => {
        if (toastMessage === msg) {
          toastMessage = '';
          toastShootId = null;
          render();
        }
      }, 6000);
    }

    function saveState(nextState, msg, notifyDevice, shootId) {
      appState = { ...nextState, lastUpdated: Date.now() };
      if (!hasUnsavedAdmin) {
        adminDraft = JSON.parse(JSON.stringify(appState));
      }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(appState)); } catch (e) {}
      if (msg) {
        showToast(msg, shootId);
        if (notifyDevice) sendDeviceNotification('🎬 ' + appState.config.appName, msg);
      } else {
        render();
      }

      // Sync to Firebase RTDB if configured
      if (appState.config && appState.config.firebaseUrl && appState.config.firebaseUrl.startsWith('https://')) {
        const fbClean = appState.config.firebaseUrl.replace(/\\/+$/, '');
        fetch(fbClean + '/clacket_frame.json', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(appState)
        }).catch(() => {});
      }

      // Sync to Cloud API endpoints
      CLOUD_ENDPOINTS.forEach(url => {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: appState })
        }).catch(() => {});
      });
    }

    async function syncFromCloud() {
      // Do not overwrite while typing in an input
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
        return;
      }

      for (const url of CLOUD_ENDPOINTS) {
        try {
          const res = await fetch(url);
          if (res.ok) {
            const data = await res.json();
            if (data && data.ok && data.state && data.state.lastUpdated > (appState.lastUpdated || 0)) {
              appState = data.state;
              try { localStorage.setItem(STORAGE_KEY, JSON.stringify(appState)); } catch (e) {}
              if (!hasUnsavedAdmin) adminDraft = JSON.parse(JSON.stringify(appState));
              render();
              return;
            }
          }
        } catch (e) {}
      }

      if (appState.config && appState.config.firebaseUrl && appState.config.firebaseUrl.startsWith('https://')) {
        try {
          const fbClean = appState.config.firebaseUrl.replace(/\\/+$/, '');
          const res = await fetch(fbClean + '/clacket_frame.json');
          if (res.ok) {
            const remote = await res.json();
            if (remote && remote.config && remote.lastUpdated > (appState.lastUpdated || 0)) {
              appState = remote;
              try { localStorage.setItem(STORAGE_KEY, JSON.stringify(appState)); } catch (e) {}
              if (!hasUnsavedAdmin) adminDraft = JSON.parse(JSON.stringify(appState));
              render();
            }
          }
        } catch (e) {}
      }
    }

    function openPinModal(targetId) {
      pinModalTarget = targetId;
      pinInputVal = '';
      pinErrorMsg = '';
      render();
      setTimeout(() => {
        const inp = document.getElementById('pinModalInput');
        if (inp) inp.focus();
      }, 50);
    }

    function verifyPinSubmit() {
      const inp = document.getElementById('pinModalInput');
      const entered = (inp ? inp.value : pinInputVal).trim();
      if (pinModalTarget === 'director') {
        if (entered !== String(appState.config.directorPin).trim()) {
          pinErrorMsg = 'الرمز السري غير صحيح، حاول مرة أخرى';
          render();
          return;
        }
        pinModalTarget = null;
        activeSession = { role: 'director', photog: null };
        playBeep();
        render();
        return;
      }
      const photog = (appState.photographers || []).find(p => p.id === pinModalTarget);
      if (!photog || entered !== String(photog.pin).trim()) {
        pinErrorMsg = 'الرمز السري غير صحيح، حاول مرة أخرى';
        render();
        return;
      }
      pinModalTarget = null;
      activeSession = { role: 'photographer', photog };
      playBeep();
      render();
    }

    function focusShootCard(shootId) {
      directorTab = 'editTab';
      projectFilter = 'all';
      statusFilter = 'all';
      highlightedShootId = shootId;
      toastMessage = '';
      render();
      setTimeout(() => {
        const el = document.getElementById('shoot-card-' + shootId);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 80);
    }

    function updateShootStatus(shootId, newStatus) {
      const target = (appState.shoots || []).find(s => s.id === shootId);
      if (!target) return;

      if (newStatus === 'editing') {
        const dirTitle = appState.config.directorName.includes('المونتير')
          ? appState.config.directorName
          : 'المونتير ' + appState.config.directorName;
        const notif = {
          id: 'pnotif-' + Date.now(),
          photographerId: target.photographerId,
          photographerName: target.photographerName,
          shootId: target.id,
          project: target.project,
          shootTitle: target.field1Value,
          directorName: dirTitle,
          message: '🎬 ' + dirTitle + ' بدأ في العمل على هذا المشروع (' + target.project + ' — ' + target.field1Value + ')',
          createdAt: new Date().toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }),
          timestamp: Date.now(),
          read: false
        };
        const next = {
          ...appState,
          shoots: appState.shoots.map(s => s.id === shootId ? { ...s, status: 'editing' } : s),
          photographerNotifications: [notif, ...(appState.photographerNotifications || [])]
        };
        saveState(next, '🎬 تم بدء المونتاج وإرسال إشعار للمصور (' + target.photographerName + ')', true, shootId);
        return;
      }

      if (newStatus === 'completed') {
        const nowStr = new Date().toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
        const next = {
          ...appState,
          shoots: appState.shoots.map(s => s.id === shootId ? { ...s, status: 'completed', completedAt: nowStr } : s)
        };
        saveState(next, '✅ تم إنجاز العمل ونقله إلى منجزات المصور ومنجزاتك الخاصة!', false);
        return;
      }

      const next = {
        ...appState,
        shoots: appState.shoots.map(s => s.id === shootId ? { ...s, status: newStatus } : s)
      };
      saveState(next, '↩️ تمت إعادة العمل لطابور الانتظار');
    }

    function setReminderIntervalMinutes(mins, label) {
      const next = {
        ...appState,
        reminderSchedule: {
          preset: 'custom',
          intervalMinutes: mins,
          label: label,
          nextTriggerAt: Date.now() + mins * 60 * 1000
        }
      };
      saveState(next, '⏰ تم ضبط وقت التذكير: ' + label);
    }

    function sendAiPrompt() {
      const inp = document.getElementById('aiPromptInput');
      if (!inp || !inp.value.trim()) return;
      aiLastPrompt = inp.value.trim();
      aiRunning = true;
      render();
      aiTimer = setTimeout(() => {
        aiRunning = false;
        aiReplyText = '🎬 خطة مونتاج مقترحة لـ ("' + aiLastPrompt + '"):\\n' +
          '1️⃣ الهوك البصري (أول 3 ثوانٍ): لقطة خاطفة مع مؤثر صوتي Whoosh لجذب المشاهد فوراً.\\n' +
          '2️⃣ تسلسل اللقطات: انتقالات J-Cut سريعة على إيقاع الموسيقى تبرز فخامة المشروع.\\n' +
          '3️⃣ التعليق الصوتي المقترح: "هنا تبدأ تفاصيل الفخامة والراحة.. في قلب أرقى مشاريعنا السكنية."';
        render();
      }, 1200);
    }

    function stopAndEditAiPrompt() {
      if (aiTimer) clearTimeout(aiTimer);
      aiRunning = false;
      render();
      setTimeout(() => {
        const inp = document.getElementById('aiPromptInput');
        if (inp) {
          inp.value = aiLastPrompt;
          inp.focus();
        }
      }, 50);
    }

    function approveIdea(ideaId) {
      const next = {
        ...appState,
        ideas: (appState.ideas || []).map(i => i.id === ideaId ? { ...i, approvedForPhotographers: true } : i)
      };
      saveState(next, '✅ تمت الموافقة على الفكرة وأصبحت ظاهرة للمصورين الآن!');
    }

    function unapproveIdea(ideaId) {
      const next = {
        ...appState,
        ideas: (appState.ideas || []).map(i => i.id === ideaId ? { ...i, approvedForPhotographers: false } : i)
      };
      saveState(next, '🔒 تم إخفاء الفكرة عن المصورين');
    }

    function rejectAndReplaceIdea(ideaId) {
      const existingTitles = (appState.ideas || []).map(i => i.title);
      const avail = IDEA_TEMPLATES.filter(t => !existingTitles.includes(t.title));
      const pick = avail[0] || IDEA_TEMPLATES[Math.floor(Math.random() * IDEA_TEMPLATES.length)];
      const proj = (appState.projects && appState.projects[0]) || 'عام';
      const replacement = {
        id: 'idea-sug-' + Date.now(),
        project: proj,
        title: pick.title,
        notes: pick.notes,
        link: '',
        createdAt: new Date().toISOString().slice(0, 10),
        isCompleted: false,
        approvedForPhotographers: false,
        isSuggestedByApp: true
      };
      const next = {
        ...appState,
        ideas: [replacement, ...(appState.ideas || []).filter(i => i.id !== ideaId)]
      };
      saveState(next, '🔄 تم حذف المقترح واستبداله بفكرة جديدة للمراجعة');
    }

    function generateMoreSuggestions() {
      const existingTitles = (appState.ideas || []).map(i => i.title);
      const avail = IDEA_TEMPLATES.filter(t => !existingTitles.includes(t.title)).slice(0, 3);
      const list = (avail.length > 0 ? avail : IDEA_TEMPLATES.slice(0, 3)).map((t, idx) => ({
        id: 'idea-sug-' + Date.now() + '-' + idx,
        project: appState.projects[idx % appState.projects.length] || 'عام',
        title: t.title,
        notes: t.notes,
        link: '',
        createdAt: new Date().toISOString().slice(0, 10),
        isCompleted: false,
        approvedForPhotographers: false,
        isSuggestedByApp: true
      }));
      const next = { ...appState, ideas: [...list, ...(appState.ideas || [])] };
      saveState(next, '✨ تم توليد 3 مقترحات تصوير جديدة للمراجعة');
    }

    function addManualIdea(approveNow) {
      const proj = document.getElementById('newIdeaProj').value;
      const title = document.getElementById('newIdeaTitle').value.trim();
      const notes = document.getElementById('newIdeaNotes').value.trim();
      if (!title) { alert('يرجى كتابة عنوان الفكرة'); return; }
      const item = {
        id: 'idea-' + Date.now(),
        project: proj,
        title,
        notes: notes || title,
        link: '',
        createdAt: new Date().toISOString().slice(0, 10),
        isCompleted: false,
        approvedForPhotographers: Boolean(approveNow),
        isSuggestedByApp: false
      };
      saveState({ ...appState, ideas: [item, ...(appState.ideas || [])] }, approveNow ? '✅ تمت إضافة الفكرة وإظهارها للمصورين!' : '💡 تم حفظ الفكرة بانتظار موافقتك');
    }

    function submitPhotographerShoot() {
      if (!activeSession.photog) return;
      const project = document.getElementById('pProject').value;
      const shotType = document.getElementById('pShotType').value;
      const f1 = document.getElementById('pF1').value.trim();
      const f2 = document.getElementById('pF2').value.trim();
      const isUrgent = document.getElementById('pUrgent').checked;
      if (!f1) { alert('⚠️ يرجى كتابة تفاصيل التصوير أولاً'); return; }
      const newShoot = {
        id: 'shoot-' + Date.now(),
        project,
        photographerId: activeSession.photog.id,
        photographerName: activeSession.photog.name,
        shotType,
        field1Value: f1,
        field2Value: f2 || 'مرفوع على التلكرام',
        isUrgent,
        status: 'pending',
        createdAt: new Date().toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })
      };
      const next = {
        ...appState,
        shoots: [newShoot, ...(appState.shoots || [])],
        activeReminder: 'وصل تصوير جديد من (' + activeSession.photog.name + ') لمشروع (' + project + '): ' + f1,
        activeReminderShootId: newShoot.id
      };
      saveState(next, '✅ تم الإرسال إلى المونتير', true, newShoot.id);
    }

    function dismissPhotogNotif(notifId) {
      const next = {
        ...appState,
        photographerNotifications: (appState.photographerNotifications || []).map(n =>
          n.id === notifId ? { ...n, read: true } : n
        )
      };
      saveState(next);
    }

    function saveAdminDraft() {
      hasUnsavedAdmin = false;
      saveState(adminDraft, '💾 تم حفظ التغييرات بنجاح!');
    }

    function discardAdminDraft() {
      adminDraft = JSON.parse(JSON.stringify(appState));
      hasUnsavedAdmin = false;
      showToast('❌ تم عدم الحفظ واسترجاع الإعدادات السابقة');
    }

    function render() {
      const root = document.getElementById('standaloneApp');
      if (!root) return;

      const toastHtml = toastMessage ? \`
        <div onclick="\${toastShootId && activeSession.role === 'director' ? "focusShootCard('" + toastShootId + "')" : ''}" class="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md bg-emerald-600 text-white px-4 py-3.5 rounded-2xl font-bold shadow-2xl border border-emerald-400 flex items-center justify-between gap-2 cursor-pointer">
          <span class="text-xs sm:text-sm">\${toastMessage}</span>
          <button onclick="event.stopPropagation(); toastMessage=''; render();" class="text-xs bg-black/25 px-2.5 py-1 rounded-lg">إغلاق</button>
        </div>
      \` : '';

      const pinModalHtml = pinModalTarget ? \`
        <div class="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div class="w-full max-w-sm glass rounded-3xl p-6 text-center space-y-4 border border-amber-500/40">
            <div class="text-3xl">🔒</div>
            <h3 class="text-base font-black text-white">تأكيد الدخول: \${pinModalTarget === 'director' ? appState.config.directorName : ((appState.photographers || []).find(p => p.id === pinModalTarget)?.name || '')}</h3>
            <p class="text-xs text-slate-400">أدخل الرمز السري الخاص بحسابك للمتابعة</p>
            <input id="pinModalInput" type="password" inputmode="numeric" placeholder="••••" onkeydown="if(event.key==='Enter') verifyPinSubmit()" class="w-full bg-slate-900 border border-slate-700 rounded-xl py-3 text-center text-xl font-black tracking-widest text-amber-400" />
            \${pinErrorMsg ? \`<p class="text-xs text-rose-400 font-bold">\${pinErrorMsg}</p>\` : ''}
            <div class="flex gap-2">
              <button onclick="verifyPinSubmit()" class="flex-1 py-3 rounded-xl bg-amber-500 text-slate-950 font-black text-xs cursor-pointer">دخول ✓</button>
              <button onclick="pinModalTarget=null; render();" class="py-3 px-4 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs cursor-pointer">إلغاء</button>
            </div>
          </div>
        </div>
      \` : '';

      // WELCOME SCREEN
      if (activeSession.role === 'welcome') {
        const isPhotogOnly = EDITION === 'photographers';
        root.innerHTML = toastHtml + pinModalHtml + \`
          <div class="max-w-md mx-auto glass rounded-3xl p-7 text-center space-y-4 border border-amber-500/30 mt-6 shadow-2xl">
            <div class="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-4xl shadow-lg">\${isPhotogOnly ? '📸' : EDITION === 'mac' ? '💻' : '🎬'}</div>
            <div class="inline-block text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 px-3.5 py-1 rounded-full">${editionBadge}</div>
            <h1 class="text-3xl font-black text-white">\${appState.config.appName}</h1>
            <div class="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm font-semibold">\${appState.config.welcomeQuote}</div>
            <p class="text-xs text-slate-400">\${isPhotogOnly ? 'اختر اسمك للدخول وإرسال التصوير إلى المونتير:' : 'اختر حسابك للدخول:'}</p>
            \${!isPhotogOnly ? \`
              <button onclick="openPinModal('director')" class="w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 text-slate-950 font-black text-lg flex items-center justify-between shadow-lg cursor-pointer">
                <span>🎬 \${appState.config.directorName}</span>
                <span class="text-xs bg-black/20 px-2.5 py-1 rounded-lg">🔒 رمز الدخول</span>
              </button>
            \` : ''}
            <div class="space-y-2.5">
              \${(appState.photographers || []).map(p => \`
                <button onclick="openPinModal('\${p.id}')" class="w-full py-3.5 px-5 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white font-bold text-base flex items-center justify-between cursor-pointer">
                  <span>📸 \${p.name}</span>
                  <span class="text-xs text-slate-400 bg-slate-800 px-2.5 py-1 rounded-lg">دخول المصور 🔑</span>
                </button>
              \`).join('')}
            </div>
          </div>
        \`;
        return;
      }

      // PHOTOGRAPHER VIEW
      if (activeSession.role === 'photographer' && activeSession.photog) {
        const photog = activeSession.photog;
        const myShoots = (appState.shoots || []).filter(s => s.photographerId === photog.id || s.photographerName === photog.name);
        const myCompleted = myShoots.filter(s => s.status === 'completed');
        const myNotifs = (appState.photographerNotifications || []).filter(n => !n.read && (n.photographerId === photog.id || n.photographerName === photog.name));
        const approvedIdeas = (appState.ideas || []).filter(i => i.approvedForPhotographers && !i.isCompleted);

        root.innerHTML = toastHtml + \`
          <header class="glass rounded-2xl p-4 flex items-center justify-between border border-slate-800">
            <div>
              <h1 class="font-black text-lg text-white">📸 المصور: \${photog.name}</h1>
              <p class="text-xs text-emerald-400 font-bold">متصل مع \${appState.config.directorName} 🟢</p>
            </div>
            <div class="flex gap-2">
              <button onclick="if('Notification' in window) Notification.requestPermission(); playBeep();" class="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/40 px-3 py-2 rounded-xl font-bold cursor-pointer">🔔 تفعيل الجرس</button>
              <button onclick="activeSession={role:'welcome',photog:null}; render();" class="text-xs bg-rose-500/20 text-rose-300 border border-rose-500/30 px-3 py-2 rounded-xl font-bold cursor-pointer">خروج 🔒</button>
            </div>
          </header>

          \${myNotifs.length > 0 ? \`
            <div class="glass rounded-2xl p-4 border-2 border-sky-500/60 bg-sky-950/30 space-y-2">
              <div class="text-xs font-black text-sky-300">🎬 إشعارات من المونتير (\${myNotifs.length}):</div>
              \${myNotifs.map(n => \`
                <div class="bg-slate-900/90 border border-sky-500/40 rounded-xl p-3 flex items-center justify-between gap-2 text-xs">
                  <div>
                    <p class="font-bold text-white">\${n.message}</p>
                    <span class="text-[11px] text-sky-300">🏢 \${n.project} · 🕒 \${n.createdAt || ''}</span>
                  </div>
                  <button onclick="dismissPhotogNotif('\${n.id}')" class="bg-sky-500 text-slate-950 font-bold px-2.5 py-1 rounded-lg cursor-pointer shrink-0">تم العلم ✓</button>
                </div>
              \`).join('')}
            </div>
          \` : ''}

          <div class="glass rounded-2xl p-5 space-y-4 border border-amber-500/30">
            <h3 class="text-base font-black text-amber-400">📤 إرسال مادة تصوير جديدة إلى المونتير</h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label class="block text-slate-300 mb-1 font-bold">اختر المشروع:</label>
                <select id="pProject" class="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white font-bold">
                  \${(appState.projects || []).map(proj => \`<option value="\${proj}">\${proj}</option>\`).join('')}
                </select>
              </div>
              <div>
                <label class="block text-slate-300 mb-1 font-bold">نوع المادة المصورة:</label>
                <select id="pShotType" class="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white font-bold">
                  <option value="ريلز عمودي 9:16">📱 ريلز عمودي 9:16</option>
                  <option value="تصوير درون جوي">🚁 تصوير درون جوي</option>
                  <option value="فيديو أفقي 16:9">🎬 فيديو أفقي سينمائي 16:9</option>
                  <option value="لقاء وتغطية ميدانية">🎙️ لقاء وتغطية ميدانية</option>
                </select>
              </div>
            </div>
            <div class="text-xs">
              <label class="block text-slate-300 mb-1 font-bold">\${appState.config.field1Label}:</label>
              <input id="pF1" type="text" placeholder="اكتب تفاصيل اللقطات والمكان..." class="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white" />
            </div>
            <div class="text-xs">
              <label class="block text-slate-300 mb-1 font-bold">\${appState.config.field2Label}:</label>
              <input id="pF2" type="text" placeholder="ملاحظات للمونتير أو رابط التلكرام..." class="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white" />
            </div>
            <label class="flex items-center gap-2 text-xs text-rose-300 font-bold cursor-pointer">
              <input id="pUrgent" type="checkbox" class="w-4 h-4 accent-rose-500" />
              <span>🔥 عمل مستعجل (أولوية قصوى للمونتير)</span>
            </label>
            <button onclick="submitPhotographerShoot()" class="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-slate-950 font-black text-sm shadow-lg cursor-pointer">
              🚀 إرسال الإشعار للمونتير الآن
            </button>
          </div>

          <div class="glass rounded-2xl p-5 space-y-3 border border-emerald-500/30">
            <h3 class="text-sm font-black text-emerald-400">🏆 منجزاتي المكتملة (\${myCompleted.length})</h3>
            \${myCompleted.length === 0 ? '<p class="text-xs text-slate-400">لا توجد أعمال مكتملة بعد.</p>' : myCompleted.map(c => \`
              <div class="bg-slate-900/90 border border-emerald-500/30 rounded-xl p-3 text-xs flex items-center justify-between">
                <div>
                  <span class="font-bold text-amber-400">🏢 \${c.project}</span>
                  <p class="text-white font-semibold mt-0.5">\${c.field1Value}</p>
                </div>
                <span class="bg-emerald-500/20 text-emerald-300 px-2.5 py-1 rounded-lg font-bold">✅ تم الإنجاز</span>
              </div>
            \`).join('')}
          </div>

          <div class="glass rounded-2xl p-5 space-y-3 border border-amber-500/20">
            <h3 class="text-sm font-black text-amber-400">💡 أفكار وزوايا مطلوبة من المونتير (\${approvedIdeas.length})</h3>
            \${approvedIdeas.length === 0 ? '<p class="text-xs text-slate-400">لا توجد أفكار معتمدة حالياً بانتظار موافقة المونتير.</p>' : approvedIdeas.map(idea => \`
              <div class="bg-slate-900/80 border border-slate-800 rounded-xl p-3 text-xs space-y-1">
                <div class="font-bold text-amber-400">🏢 \${idea.project} — \${idea.title}</div>
                <p class="text-slate-300">\${idea.notes}</p>
              </div>
            \`).join('')}
          </div>
        \`;
        return;
      }

      // DIRECTOR STUDIO VIEW (For Mac & Mobile Editions)
      const pendingShoots = (appState.shoots || []).filter(s => s.status === 'pending');
      const editingShoots = (appState.shoots || []).filter(s => s.status === 'editing');
      const completedShoots = (appState.shoots || []).filter(s => s.status === 'completed');
      const activeQueue = (appState.shoots || []).filter(s => {
        if (statusFilter === 'all' && s.status === 'completed') return false;
        if (statusFilter !== 'all' && s.status !== statusFilter) return false;
        if (projectFilter !== 'all' && s.project !== projectFilter) return false;
        return true;
      });
      const urgentTargetId = (pendingShoots[0] || editingShoots[0])?.id || '';

      root.innerHTML = toastHtml + \`
        <header class="glass rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 border border-slate-800">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-xl">🎬</div>
            <div>
              <h1 class="font-black text-lg text-white">\${appState.config.appName} <span class="text-xs text-sky-300 font-bold">(${editionBadge})</span></h1>
              <p class="text-xs text-amber-400 font-bold">🎬 الحساب النشط: \${appState.config.directorName}</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="if('Notification' in window) Notification.requestPermission(); playBeep();" class="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-3 py-2 rounded-xl font-bold cursor-pointer">🔔 الجرس مفعّل</button>
            <button onclick="activeSession={role:'welcome',photog:null}; render();" class="text-xs bg-rose-500/20 text-rose-300 border border-rose-500/30 px-3 py-2 rounded-xl font-bold cursor-pointer">خروج 🔒</button>
          </div>
        </header>

        \${(pendingShoots.length + editingShoots.length) > 0 ? \`
          <div onclick="focusShootCard('\${urgentTargetId}')" class="p-3.5 rounded-2xl bg-rose-950/80 border border-rose-500 pulse-red flex items-center justify-between gap-3 cursor-pointer">
            <div>
              <span class="text-xs sm:text-sm font-bold text-rose-200 block">⚠️ لديك (\${pendingShoots.length}) أعمال بانتظار المونتاج و (\${editingShoots.length}) قيد العمل حالياً!</span>
              <span class="text-[11px] text-amber-300 font-bold">📍 اضغط هنا للانتقال مباشرة إلى مكان الإشعار والعمل المطلوب</span>
            </div>
            <span class="text-xs bg-rose-500 text-white px-3 py-2 rounded-xl font-bold shrink-0">افتح المونتاج</span>
          </div>
        \` : ''}

        <div class="flex flex-wrap gap-2">
          <button onclick="directorTab='editTab'; render();" class="flex-1 py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm cursor-pointer \${directorTab==='editTab' ? 'bg-amber-500 text-slate-950' : 'glass text-slate-300'}">🎬 غرفة المونتاج والـ AI</button>
          <button onclick="directorTab='ideasTab'; render();" class="flex-1 py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm cursor-pointer \${directorTab==='ideasTab' ? 'bg-amber-500 text-slate-950' : 'glass text-slate-300'}">💡 خزنة الأفكار والمقترحات</button>
          <button onclick="directorTab='statsTab'; render();" class="flex-1 py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm cursor-pointer \${directorTab==='statsTab' ? 'bg-amber-500 text-slate-950' : 'glass text-slate-300'}">📊 عداد المصورين ومنجزاتي</button>
          <button onclick="directorTab='adminTab'; render();" class="flex-1 py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm cursor-pointer \${directorTab==='adminTab' ? 'bg-amber-500 text-slate-950' : 'glass text-slate-300'}">⚙️ إدارة الأسماء والأقسام</button>
        </div>

        \${directorTab === 'editTab' ? \`
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div class="lg:col-span-2 space-y-3">
              <div class="glass rounded-2xl p-4 space-y-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <h2 class="font-bold text-sm text-white">🎞️ طابور أعمال التصوير الجاهزة للمونتاج</h2>
                  <div class="flex flex-wrap gap-1.5 text-[11px]">
                    <button onclick="setReminderIntervalMinutes(30, 'بعد نصف ساعة')" class="bg-slate-800 hover:bg-slate-700 text-amber-300 px-2.5 py-1 rounded-lg font-bold cursor-pointer">⏰ نصف ساعة</button>
                    <button onclick="setReminderIntervalMinutes(60, 'بعد ساعة')" class="bg-slate-800 hover:bg-slate-700 text-amber-300 px-2.5 py-1 rounded-lg font-bold cursor-pointer">⏰ ساعة</button>
                    <button onclick="setReminderIntervalMinutes(120, 'بعد ساعتين')" class="bg-slate-800 hover:bg-slate-700 text-amber-300 px-2.5 py-1 rounded-lg font-bold cursor-pointer">⏰ ساعتين</button>
                    <button onclick="const m=prompt('أدخل وقت التذكير بالدقائق:'); if(m&&Number(m)>0) setReminderIntervalMinutes(Number(m), 'بعد '+m+' دقيقة');" class="bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2.5 py-1 rounded-lg font-bold cursor-pointer">✍️ وقت يدوي</button>
                  </div>
                </div>
                <div class="flex gap-2 text-xs">
                  <select onchange="projectFilter=this.value; render();" class="flex-1 bg-slate-900 border border-slate-700 rounded-xl p-2 text-white">
                    <option value="all">كل المشاريع</option>
                    \${(appState.projects || []).map(p => \`<option value="\${p}" \${projectFilter===p?'selected':''}>\${p}</option>\`).join('')}
                  </select>
                  <select onchange="statusFilter=this.value; render();" class="bg-slate-900 border border-slate-700 rounded-xl p-2 text-white">
                    <option value="all" \${statusFilter==='all'?'selected':''}>الأعمال النشطة</option>
                    <option value="pending" \${statusFilter==='pending'?'selected':''}>⏳ بانتظار المونتاج</option>
                    <option value="editing" \${statusFilter==='editing'?'selected':''}>🎬 جاري المونتاج</option>
                  </select>
                </div>
              </div>

              \${activeQueue.length === 0 ? '<div class="glass rounded-2xl p-8 text-center text-xs text-slate-400">🎉 لا توجد أعمال معلقة في الطابور حالياً — جميع الأعمال المنجزة انتقلت إلى قسم المنجزات!</div>' : activeQueue.map(s => \`
                <div id="shoot-card-\${s.id}" class="glass rounded-2xl p-4 space-y-3 border \${highlightedShootId===s.id ? 'border-2 border-amber-400 ring-2 ring-amber-400/40' : s.isUrgent ? 'border-rose-500/60' : 'border-slate-800'}">
                  <div class="flex items-center justify-between text-xs">
                    <span class="font-black text-amber-400">🏢 \${s.project} · 📸 \${s.photographerName}</span>
                    <span class="text-slate-400">\${s.createdAt}</span>
                  </div>
                  <p class="text-sm font-bold text-white">\${s.field1Value}</p>
                  <p class="text-xs text-slate-300 bg-slate-900/80 p-2.5 rounded-xl">🔗 \${s.field2Value}</p>
                  <div class="flex flex-wrap gap-2 pt-1">
                    <button onclick="updateShootStatus('\${s.id}', 'editing')" class="flex-1 py-2.5 px-3 rounded-xl font-bold text-xs cursor-pointer \${s.status==='editing' ? 'bg-sky-500 text-slate-950' : 'bg-slate-800 text-sky-300'}">🎬 بدء المونتاج (إشعار للمصور)</button>
                    <button onclick="updateShootStatus('\${s.id}', 'completed')" class="flex-1 py-2.5 px-3 rounded-xl font-bold text-xs cursor-pointer bg-emerald-500 text-slate-950">✅ تم الإنجاز (نقل للمنجزات)</button>
                  </div>
                </div>
              \`).join('')}
            </div>

            <div class="glass rounded-2xl p-4 space-y-3 border border-amber-500/30 h-fit">
              <h3 class="font-bold text-sm text-amber-400">🤖 مساعد المونتاج الذكي (AI)</h3>
              <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 whitespace-pre-line leading-relaxed">\${aiRunning ? '⏳ جاري إعداد خطة المونتاج والسكريبت...' : aiReplyText}</div>
              \${aiRunning ? \`
                <button onclick="stopAndEditAiPrompt()" class="w-full py-2.5 rounded-xl bg-rose-600 text-white font-black text-xs cursor-pointer">⏹️ إيقاف المهمة وتعديلها</button>
              \` : ''}
              <div class="flex gap-2">
                <input id="aiPromptInput" type="text" placeholder="اكتب فكرة الفيديو أو اطلب سكريبت..." class="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white" />
                <button onclick="sendAiPrompt()" class="bg-amber-500 text-slate-950 font-black px-4 py-2 rounded-xl text-xs cursor-pointer">إرسال</button>
              </div>
            </div>
          </div>
        \` : ''}

        \${directorTab === 'ideasTab' ? \`
          <div class="space-y-4">
            <div class="glass rounded-2xl p-5 space-y-3 border-2 border-amber-500/40">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 class="text-sm font-black text-amber-400">🤖 مقترحات البرنامج الذكية (بانتظار موافقتك لتظهر للمصورين)</h3>
                  <p class="text-xs text-slate-300">لا يظهر أي مقترح عند المصورين إلا بعد ضغطك على موافقة:</p>
                </div>
                <button onclick="generateMoreSuggestions()" class="bg-amber-500 text-slate-950 font-black px-3.5 py-2 rounded-xl text-xs cursor-pointer">🔄 أعطني مقترحات جديدة</button>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                \${(appState.ideas || []).filter(i => !i.approvedForPhotographers).map(idea => \`
                  <div class="bg-slate-900/90 border border-amber-500/30 rounded-2xl p-4 space-y-2 text-xs">
                    <div class="font-bold text-amber-400">🏢 \${idea.project}</div>
                    <div class="font-bold text-white text-sm">\${idea.title}</div>
                    <p class="text-slate-300">\${idea.notes}</p>
                    <div class="flex gap-2 pt-2">
                      <button onclick="approveIdea('\${idea.id}')" class="flex-1 py-2 rounded-xl bg-emerald-500 text-slate-950 font-black cursor-pointer">✅ موافقة وإظهار للمصورين</button>
                      <button onclick="rejectAndReplaceIdea('\${idea.id}')" class="py-2 px-3 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold cursor-pointer">🗑️ حذف واقتراح بديل</button>
                    </div>
                  </div>
                \`).join('')}
              </div>
            </div>

            <div class="glass rounded-2xl p-5 space-y-3 border border-emerald-500/40">
              <h3 class="text-sm font-black text-emerald-400">✅ الأفكار والزوايا المعتمدة والظاهرة عند المصورين حالياً</h3>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                \${(appState.ideas || []).filter(i => i.approvedForPhotographers).map(idea => \`
                  <div class="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-4 space-y-2 text-xs">
                    <div class="font-bold text-amber-400">🏢 \${idea.project}</div>
                    <div class="font-bold text-white text-sm">\${idea.title}</div>
                    <p class="text-slate-300">\${idea.notes}</p>
                    <button onclick="unapproveIdea('\${idea.id}')" class="py-1.5 px-3 rounded-lg bg-slate-800 text-amber-300 font-bold cursor-pointer">🔒 إيقاف العرض عن المصورين</button>
                  </div>
                \`).join('')}
              </div>
            </div>

            <div class="glass rounded-2xl p-5 space-y-3">
              <h3 class="text-sm font-bold text-amber-400">✍️ إضافة فكرة أو زاوية جديدة</h3>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <select id="newIdeaProj" class="bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white">
                  \${(appState.projects || []).map(p => \`<option value="\${p}">\${p}</option>\`).join('')}
                </select>
                <input id="newIdeaTitle" type="text" placeholder="عنوان الفكرة أو الزاوية..." class="bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white" />
              </div>
              <textarea id="newIdeaNotes" rows="2" placeholder="شرح الزاوية للمصور..." class="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white"></textarea>
              <div class="flex gap-2">
                <button onclick="addManualIdea(true)" class="flex-1 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-black text-xs cursor-pointer">✅ إضافة وموافقة فوراً للمصورين</button>
                <button onclick="addManualIdea(false)" class="py-2.5 px-4 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs cursor-pointer">💡 حفظ للمراجعة</button>
              </div>
            </div>
          </div>
        \` : ''}

        \${directorTab === 'statsTab' ? \`
          <div class="space-y-4">
            <div class="glass rounded-2xl p-5 border-2 border-amber-500/40 space-y-3">
              <h3 class="text-base font-black text-amber-400">🏆 منجزاتي والأعمال المكتملة (\${completedShoots.length})</h3>
              \${completedShoots.length === 0 ? '<p class="text-xs text-slate-400">لا توجد أعمال مكتملة بعد.</p>' : completedShoots.map(s => \`
                <div class="bg-slate-900/90 border border-emerald-500/30 rounded-xl p-3 text-xs flex items-center justify-between">
                  <div>
                    <span class="font-bold text-amber-400">🏢 \${s.project} — 📸 \${s.photographerName}</span>
                    <p class="text-white font-semibold mt-0.5">\${s.field1Value}</p>
                  </div>
                  <span class="bg-emerald-500/20 text-emerald-300 px-2.5 py-1 rounded-lg font-bold">✅ مكتمل</span>
                </div>
              \`).join('')}
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              \${(appState.photographers || []).map(p => {
                const pShoots = (appState.shoots || []).filter(s => s.photographerId === p.id || s.photographerName === p.name);
                const pDone = pShoots.filter(s => s.status === 'completed');
                return \`
                  <div class="glass rounded-2xl p-5 space-y-3 border border-slate-800">
                    <div class="flex items-center justify-between">
                      <h4 class="font-black text-white text-base">📸 \${p.name}</h4>
                      <span class="text-amber-400 font-black text-lg">\${pShoots.length} أعمال</span>
                    </div>
                    <div class="text-xs text-emerald-400 font-bold">🏆 المنجزات المكتملة: \${pDone.length}</div>
                    \${pDone.map(d => \`<div class="bg-slate-900/80 border border-emerald-500/20 p-2.5 rounded-xl text-xs text-slate-200">✅ [\${d.project}] \${d.field1Value}</div>\`).join('')}
                  </div>
                \`;
              }).join('')}
            </div>
          </div>
        \` : ''}

        \${directorTab === 'adminTab' ? \`
          <div class="space-y-4">
            <div class="glass rounded-2xl p-4 border-2 border-amber-500/40 flex flex-wrap items-center justify-between gap-2">
              <span class="text-xs font-black text-white">⚙️ التحكم بحفظ التعديلات (لا يتم الحفظ تلقائياً):</span>
              <div class="flex gap-2">
                <button onclick="saveAdminDraft()" class="py-2.5 px-5 rounded-xl bg-emerald-500 text-slate-950 font-black text-xs cursor-pointer">💾 حفظ التغييرات ✅</button>
                <button onclick="discardAdminDraft()" class="py-2.5 px-5 rounded-xl bg-rose-600/20 text-rose-300 border border-rose-500/40 font-bold text-xs cursor-pointer">❌ عدم الحفظ</button>
              </div>
            </div>

            <div class="glass rounded-2xl p-5 space-y-3">
              <h3 class="font-bold text-amber-400 text-sm">✏️ اسم المونتير والرمز السري</h3>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <input type="text" value="\${adminDraft.config.directorName}" oninput="adminDraft.config.directorName=this.value; hasUnsavedAdmin=true;" class="bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white font-bold" />
                <input type="text" value="\${adminDraft.config.directorPin}" oninput="adminDraft.config.directorPin=this.value; hasUnsavedAdmin=true;" class="bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-amber-400 font-mono font-bold text-center" />
              </div>
            </div>

            <div class="glass rounded-2xl p-5 space-y-3">
              <h3 class="font-bold text-amber-400 text-sm">🏢 تعديل أسماء المجمعات والبارك</h3>
              <div class="space-y-2">
                \${(adminDraft.projects || []).map((proj, idx) => \`
                  <div class="flex gap-2">
                    <input type="text" value="\${proj}" oninput="adminDraft.projects[\${idx}]=this.value; hasUnsavedAdmin=true;" class="flex-1 bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-bold" />
                    <button onclick="adminDraft.projects.splice(\${idx},1); hasUnsavedAdmin=true; render();" class="bg-rose-500/20 text-rose-300 px-3 rounded-xl text-xs font-bold cursor-pointer">حذف</button>
                  </div>
                \`).join('')}
              </div>
            </div>

            <div class="glass rounded-2xl p-5 space-y-3">
              <h3 class="font-bold text-amber-400 text-sm">📸 تعديل أسماء المصورين والرموز السرية</h3>
              <div class="space-y-2">
                \${(adminDraft.photographers || []).map((p, idx) => \`
                  <div class="flex gap-2">
                    <input type="text" value="\${p.name}" oninput="adminDraft.photographers[\${idx}].name=this.value; hasUnsavedAdmin=true;" class="flex-1 bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-bold" />
                    <input type="text" value="\${p.pin}" oninput="adminDraft.photographers[\${idx}].pin=this.value; hasUnsavedAdmin=true;" class="w-24 bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-amber-400 font-mono text-center" />
                  </div>
                \`).join('')}
              </div>
            </div>
          </div>
        \` : ''}
      \`;
    }

    render();
    syncFromCloud();
    setInterval(syncFromCloud, 6000);
  </script>
</body>
</html>`;
}
