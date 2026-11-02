import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowGuideModal(true);
    }
  };

  return (
    <>
      <button
        id="pwaInstallBtn"
        type="button"
        onClick={handleInstallClick}
        className={
          compact
            ? 'text-xs px-3 py-1.5 rounded-xl font-bold transition cursor-pointer bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 whitespace-nowrap'
            : 'w-full py-2.5 px-4 rounded-xl font-bold text-xs transition cursor-pointer bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 flex items-center justify-center gap-2'
        }
      >
        <span>📲</span>
        <span>{compact ? 'تثبيت بالموبايل' : 'تثبيت التطبيق على الموبايل (لاستلام إشعارات القفل)'}</span>
      </button>

      {showGuideModal && (
        <div
          id="pwaInstallGuideModal"
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md glass rounded-3xl p-6 border-2 border-amber-500 text-right space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <span>📲</span>
                <span>تثبيت كلاكيت فريم على الموبايل</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              عند تثبيت التطبيق على الشاشة الرئيسية وتفعيل الجرس، ستصلك إشعارات المصورين فوراً على شاشة قفل الموبايل مثل باقي تطبيقات الهاتف:
            </p>

            {isIOS ? (
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-2 text-xs text-slate-200">
                <p className="font-bold text-amber-400">🍎 خطوات التثبيت على الآيفون (Safari):</p>
                <p>1. اضغط على زر <strong>المشاركة (Share ⬆️)</strong> في أسفل متصفح سفاري.</p>
                <p>2. اختر <strong>إضافة إلى الشاشة الرئيسية (Add to Home Screen ➕)</strong>.</p>
                <p>3. افتح التطبيق من الشاشة الرئيسية واضغط على <strong>تفعيل الجرس 🔔</strong>.</p>
              </div>
            ) : (
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-2 text-xs text-slate-200">
                <p className="font-bold text-amber-400">🤖 خطوات التثبيت على الأندرويد / الهاتف:</p>
                <p>1. اضغط على قائمة المتصفح العلوية <strong>(⋮)</strong> في Chrome.</p>
                <p>2. اختر <strong>تثبيت التطبيق (Install App)</strong> أو <strong>إضافة إلى الشاشة الرئيسية</strong>.</p>
                <p>3. افتح التطبيق المثبّت واضغط على <strong>تفعيل الجرس 🔔</strong> لتصلك الإشعارات حتى والموبايل مقفول.</p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition cursor-pointer"
            >
              تم، واضح 👍
            </button>
          </div>
        </div>
      )}
    </>
  );
};
