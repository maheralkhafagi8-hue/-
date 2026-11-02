import React from 'react';
import { AppConfig, Photographer } from '../types';

interface WelcomeScreenProps {
  config: AppConfig;
  photographers: Photographer[];
  pendingTasksCount: number;
  scheduleLabel?: string;
  notificationsEnabled: boolean;
  onEnableNotifications: () => void;
  onOpenPinModal: (targetId: 'director' | string) => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  config,
  photographers,
  onOpenPinModal,
}) => {
  return (
    <div
      id="welcomeScreen"
      className="fixed inset-0 z-40 bg-[#0b0f19] flex flex-col items-center justify-center p-5 overflow-y-auto"
    >
      <div className="w-full max-w-md glass rounded-3xl p-7 text-center shadow-2xl border border-amber-500/20 my-auto space-y-4">
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

        <p className="text-xs text-slate-400">اختر حسابك للدخول:</p>

        <button
          type="button"
          onClick={() => onOpenPinModal('director')}
          className="w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 text-slate-950 font-black text-lg flex items-center justify-center gap-2 shadow-lg hover:opacity-95 transition cursor-pointer"
        >
          <span>🎬</span>
          <span id="welcomeDirectorBtn">{config.directorName}</span>
        </button>

        <div id="welcomePhotographersList" className="space-y-2.5">
          {photographers.map((photog) => (
            <button
              key={photog.id}
              type="button"
              onClick={() => onOpenPinModal(photog.id)}
              className="w-full py-3.5 px-5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-white font-bold text-base flex items-center justify-center gap-2.5 transition cursor-pointer"
            >
              <span>📸</span>
              <span>{photog.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
