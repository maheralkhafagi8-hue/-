import React from 'react';

interface HeaderProps {
  appName: string;
  activeUserLabel: string;
  cloudConnected: boolean;
  isRefreshing: boolean;
  notificationsEnabled: boolean;
  onManualRefresh: () => void;
  onEnableNotifications: () => void;
  onLockAndReturnHome: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  appName,
  activeUserLabel,
  cloudConnected,
  isRefreshing,
  notificationsEnabled,
  onManualRefresh,
  onEnableNotifications,
  onLockAndReturnHome,
}) => {
  return (
    <header className="sticky top-0 z-30 glass border-b border-slate-800 px-4 py-3">
      <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <img
            src="/icon.svg?v=2"
            alt=""
            aria-hidden="true"
            referrerPolicy="no-referrer"
            className="w-11 h-11 rounded-xl shadow-md border border-amber-500/30 shrink-0"
          />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 id="headerAppName" className="font-black text-lg text-white whitespace-nowrap">
                {appName}
              </h1>
              <span
                id="cloudStatusBadge"
                className={`text-[11px] px-2 py-0.5 rounded-full border whitespace-nowrap ${
                  cloudConnected
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                }`}
              >
                {cloudConnected ? 'متصل بـ Firestore 🟢' : 'جاري الاتصال بـ Firestore 🟡'}
              </span>
            </div>
            <p id="activeUserLabel" className="text-xs text-amber-400 font-semibold">
              {activeUserLabel}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            id="btnManualRefresh"
            type="button"
            onClick={onManualRefresh}
            disabled={isRefreshing}
            aria-label="تحديث البيانات والإشعارات من السحابة الفورية"
            className="text-xs bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 px-3 py-2 rounded-xl font-bold transition cursor-pointer whitespace-nowrap flex items-center gap-1.5"
          >
            <span className={isRefreshing ? 'inline-block animate-spin' : 'inline-block'}>
              🔄
            </span>
            <span>{isRefreshing ? 'جاري التحديث...' : 'تحديث'}</span>
          </button>

          <button
            type="button"
            onClick={onEnableNotifications}
            className={`text-xs px-3 py-2 rounded-xl border transition cursor-pointer whitespace-nowrap ${
              notificationsEnabled
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
          >
            {notificationsEnabled ? '🔔 الجرس مفعّل' : '🔔 تفعيل الجرس'}
          </button>

          <button
            id="btnLogout"
            type="button"
            onClick={onLockAndReturnHome}
            className="text-xs bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 px-3 py-2 rounded-xl font-bold transition cursor-pointer whitespace-nowrap"
          >
            خروج 🔒
          </button>
        </div>
      </div>
    </header>
  );
};
