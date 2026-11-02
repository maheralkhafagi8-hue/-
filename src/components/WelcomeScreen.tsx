import React, { useState } from 'react';
import { AppConfig, Photographer } from '../types';

interface WelcomeScreenProps {
  config: AppConfig;
  photographers: Photographer[];
  pendingTasksCount: number;
  scheduleLabel?: string;
  notificationsEnabled: boolean;
  onEnableNotifications: () => void;
  onLoginWithCredentials: (
    username: string,
    password: string
  ) => { ok: boolean; error?: string };
  onOpenPinModal?: (targetId: 'director' | string) => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  config,
  onLoginWithCredentials,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    const result = onLoginWithCredentials(username, password);
    if (!result.ok) {
      setLoginError(
        result.error || 'اسم المستخدم أو الرمز السري غير صحيح، حاول مرة أخرى'
      );
    }
  };

  return (
    <div
      id="welcomeScreen"
      className="fixed inset-0 z-40 bg-[#0b0f19] flex flex-col items-center justify-center p-5 overflow-y-auto"
    >
      <div className="w-full max-w-md glass rounded-3xl p-7 text-center shadow-2xl border border-amber-500/20 my-auto space-y-5">
        <div>
          <div className="w-20 h-20 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-4xl shadow-lg">
            🎬
          </div>

          <h1 id="welcomeAppName" className="text-3xl font-black text-white">
            {config.appName}
          </h1>
        </div>

        <div
          id="welcomeQuoteBox"
          className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm font-semibold leading-relaxed"
        >
          {config.welcomeQuote}
        </div>

        <form
          id="loginForm"
          onSubmit={handleSubmit}
          className="text-right space-y-4 bg-slate-900/75 border border-slate-800 rounded-2xl p-5"
        >
          <div className="text-center pb-1">
            <h2 className="text-base font-black text-white flex items-center justify-center gap-2">
              <span>🔐</span>
              <span>تسجيل الدخول للحساب</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              أدخل الاسم (اليوزر) والرمز السري (الباسورد) للدخول
            </p>
          </div>

          <div>
            <label
              htmlFor="loginUsernameInput"
              className="block text-xs font-bold text-slate-300 mb-1.5"
            >
              👤 الاسم (اسم المستخدم):
            </label>
            <input
              id="loginUsernameInput"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (loginError) setLoginError(null);
              }}
              placeholder="اكتب الاسم هنا..."
              className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-4 py-3 text-sm font-bold text-white focus:outline-none transition"
            />
          </div>

          <div>
            <label
              htmlFor="loginPasswordInput"
              className="block text-xs font-bold text-slate-300 mb-1.5"
            >
              🔑 الرمز السري (الباسورد):
            </label>
            <div className="relative">
              <input
                id="loginPasswordInput"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (loginError) setLoginError(null);
                }}
                placeholder="أدخل الرمز السري..."
                className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-4 py-3 pl-12 text-base font-mono tabular-nums text-amber-400 font-bold focus:outline-none transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'إخفاء الرمز' : 'إظهار الرمز'}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-sm px-1.5 py-1 cursor-pointer"
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {loginError && (
            <div
              id="loginErrorAlert"
              role="alert"
              className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-bold text-center"
            >
              ⚠️ {loginError}
            </div>
          )}

          <button
            id="loginSubmitBtn"
            type="submit"
            className="w-full py-3.5 px-5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-95 text-slate-950 font-black text-base flex items-center justify-center gap-2 shadow-lg transition cursor-pointer"
          >
            <span>تسجيل الدخول</span>
            <span>🔓</span>
          </button>
        </form>
      </div>
    </div>
  );
};
