import React, { useState } from 'react';
import { AppState } from '../types';
import {
  buildEditionUrls,
  buildMacDesktopLauncher,
  buildStandaloneEditionHtml,
} from '../utils/exportBuilder';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface ExportCenterProps {
  state: AppState;
  onShowToast: (msg: string) => void;
  onPreviewPhotographersEdition?: () => void;
  onCloseModal?: () => void;
}

export const ExportCenter: React.FC<ExportCenterProps> = ({
  state,
  onShowToast,
  onPreviewPhotographersEdition,
  onCloseModal,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showMobileSteps, setShowMobileSteps] = useState<boolean>(false);
  const [showMacSteps, setShowMacSteps] = useState<boolean>(false);
  const [previewCodeEdition, setPreviewCodeEdition] = useState<
    'mobile' | 'mac' | 'photographers' | null
  >(null);

  const urls = buildEditionUrls(state.photographers);

  const handleCopyText = async (text: string, key: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopiedKey(key);
    onShowToast(`✅ تم نسخ ${label} بنجاح!`);
    window.setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 3000);
  };

  const triggerFileDownload = (
    filename: string,
    content: string,
    serverEndpoint: string,
    mimeType = 'text/html;charset=utf-8'
  ) => {
    try {
      const blob = new Blob([content], { type: mimeType });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    } catch {
      // Fallback to direct server attachment endpoint
      const a = document.createElement('a');
      a.href = serverEndpoint;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const handleShareStandaloneFile = async (
    edition: 'mobile' | 'mac' | 'photographers',
    filename: string,
    title: string
  ) => {
    const html = buildStandaloneEditionHtml(state, edition);
    if (navigator.share && navigator.canShare) {
      try {
        const file = new File([html], filename, { type: 'text/html' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            title,
            text: `${title} — افتح الملف مباشرة ليعمل التطبيق فوراً:`,
            files: [file],
          });
          onShowToast(`📤 تم فتح مشاركة ملف (${filename})`);
          return;
        }
      } catch {
        // Fallback to download if share is cancelled or unsupported in iframe
      }
    }
    triggerFileDownload(filename, html, `/api/download/${edition}`);
    onShowToast(`📥 تم تحميل ملف (${filename}) — يمكنك إرساله كملف بالتلكرام أو الواتساب!`);
  };

  const handleDownloadMobileFile = () => {
    const html = buildStandaloneEditionHtml(state, 'mobile');
    triggerFileDownload('ClacketFrame-Mobile.html', html, '/api/download/mobile');
    onShowToast(
      '📱 تم تحميل ملف تطبيق الموبايل الكامل (ClacketFrame-Mobile.html) — يعمل مباشرة بدون روابط!'
    );
  };

  const handleDownloadMacStudioFile = () => {
    const html = buildStandaloneEditionHtml(state, 'mac');
    triggerFileDownload('ClacketFrame-Mac-Studio.html', html, '/api/download/mac');
    onShowToast(
      '💻 تم تحميل ملف تطبيق حاسبة الماك الكامل (ClacketFrame-Mac-Studio.html) — افتحه على الماك مباشرة!'
    );
  };

  const handleDownloadMacLauncher = () => {
    const script = buildMacDesktopLauncher(urls.activeMacUrl, state.config.appName);
    triggerFileDownload(
      'ClacketFrame-Mac.command',
      script,
      '/api/download/mac-command',
      'text/plain;charset=utf-8'
    );
    onShowToast('🍎 تم تحميل مشغل سطح المكتب للماك (ClacketFrame-Mac.command)');
  };

  const handleDownloadPhotographersFile = () => {
    const html = buildStandaloneEditionHtml(state, 'photographers');
    triggerFileDownload(
      'ClacketFrame-Photographers.html',
      html,
      '/api/download/photographers'
    );
    onShowToast(
      '📸 تم تحميل ملف نسخة المصورين المستقلة (ClacketFrame-Photographers.html) — أرسله كملف بكروب التلكرام!'
    );
  };

  const handleNativeMobileInstall = async () => {
    if (isInstallable) {
      await install();
      onShowToast('📲 تم بدء تثبيت التطبيق على جهازك');
    } else {
      setShowMobileSteps((prev) => !prev);
    }
  };

  return (
    <div id="exportCenterContainer" className="space-y-5">
      {/* Important Clarification Banner explaining why external URLs need AI Studio Share OR Standalone HTML Files */}
      <div className="glass rounded-3xl p-5 border-2 border-amber-500/50 bg-gradient-to-l from-amber-500/15 via-slate-900/95 to-emerald-500/15 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-2xl">💡</span>
            <h2 className="text-base sm:text-lg font-black text-white">
              لماذا لم تفتح الروابط قبل قليل؟ وكيف تشغّل النسخ الثلاث فوراً 100%؟
            </h2>
          </div>

          {onCloseModal && (
            <button
              type="button"
              onClick={onCloseModal}
              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 py-2 rounded-xl font-bold cursor-pointer"
            >
              إغلاق ✕
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="bg-slate-950/90 border border-emerald-500/40 rounded-2xl p-3.5 space-y-1.5">
            <p className="font-black text-emerald-400">
              ✅ الطريقة الأولى (تعمل فوراً 100% بدون الحاجة لأي رابط):
            </p>
            <p className="text-slate-200 leading-relaxed">
              اضغط على زر <strong>«📥 تحميل ملف النسخة المستقلة (HTML)»</strong> في أي بطاقة بالأسفل. كل ملف محمّل أصبح <strong>تطبيقاً كاملاً ومستقلاً بذاته 100%</strong> (يحتوي بداخله على كامل غرفة المونتاج أو واجهة المصورين بدون أي تحويل لرابط خارجي!) — افتحه على حاسبتك الماك أو أرسله كملف عبر <strong>التلكرام / واتساب / AirDrop</strong> لموبايلك وللمصورين وسيعمل فوراً!
            </p>
          </div>

          <div className="bg-slate-950/90 border border-amber-500/40 rounded-2xl p-3.5 space-y-1.5">
            <p className="font-black text-amber-400">
              🌐 الطريقة الثانية (تفعيل روابط الويب المباشرة على الموبايل والماك):
            </p>
            <p className="text-slate-200 leading-relaxed">
              الروابط الخارجية التي تبدأ بـ (<code className="text-amber-300">ais-pre-...</code>) تكون مقفولة تلقائياً من منصة Google AI Studio حتى تضغط على أيقونة <strong>Share (مشاركة التطبيق 🔗)</strong> أو <strong>Deploy (نشر 🚀)</strong> في أعلى يمين شاشة المنصة، وبعدها يفتح الرابط على أي موبايل أو حاسبة فوراً.
            </p>
          </div>
        </div>
      </div>

      {/* 3 Main Export Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* CARD 1: MOBILE EDITION */}
        <div
          id="exportMobileCard"
          className="glass rounded-3xl p-5 border-2 border-amber-500/40 flex flex-col justify-between space-y-4"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-2xl">
                📱
              </span>
              <span className="text-[11px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2.5 py-1 rounded-full font-bold">
                تطبيق كامل مستقل 100%
              </span>
            </div>

            <div>
              <h3 className="text-base font-black text-white">
                1. نسخة الموبايل (للمونتير والإدارة)
              </h3>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                تحتوي على كامل غرفة المونتاج، المساعد الذكي، الأفكار، والإعدادات. حمّل الملف وأرسله لموبايلك عبر التلكرام أو AirDrop ليشتغل فوراً!
              </p>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <button
              id="btnDownloadMobileHtml"
              type="button"
              onClick={handleDownloadMobileFile}
              className="w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition cursor-pointer flex items-center justify-center gap-2 shadow-lg"
            >
              <span>📥</span>
              <span>تحميل ملف تطبيق الموبايل الكامل (HTML)</span>
            </button>

            <button
              type="button"
              onClick={() =>
                handleShareStandaloneFile(
                  'mobile',
                  'ClacketFrame-Mobile.html',
                  `${state.config.appName} - نسخة الموبايل`
                )
              }
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-bold text-xs transition cursor-pointer flex items-center justify-center gap-2"
            >
              <span>📤</span>
              <span>إرسال / مشاركة ملف الموبايل مباشرة</span>
            </button>

            {!isInstalled && (
              <button
                id="btnInstallMobilePwa"
                type="button"
                onClick={handleNativeMobileInstall}
                className="w-full py-2.5 px-4 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 font-bold text-xs transition cursor-pointer flex items-center justify-center gap-2"
              >
                <span>📲</span>
                <span>
                  {isInstallable
                    ? 'تثبيت التطبيق على الشاشة الرئيسية'
                    : 'خطوات التثبيت على شاشة الموبايل'}
                </span>
              </button>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                id="btnCopyMobileLink"
                type="button"
                onClick={() =>
                  handleCopyText(
                    urls.activeMobileUrl,
                    'mobile-active-url',
                    'رابط نسخة الموبايل'
                  )
                }
                className="py-2 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-[11px] transition cursor-pointer"
              >
                {copiedKey === 'mobile-active-url' ? '✅ تم النسخ!' : '🔗 نسخ الرابط الحالي'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const html = buildStandaloneEditionHtml(state, 'mobile');
                  handleCopyText(html, 'mobile-code', 'كود ملف تطبيق الموبايل الكامل');
                }}
                className="py-2 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-[11px] transition cursor-pointer"
              >
                {copiedKey === 'mobile-code' ? '✅ تم نسخ الكود!' : '📋 نسخ كود الملف'}
              </button>
            </div>

            {showMobileSteps && (
              <div className="bg-slate-950/90 border border-amber-500/30 rounded-2xl p-3 text-[11px] text-slate-200 space-y-1.5">
                <p className="font-bold text-amber-400">📱 أسهل طريقة لتشغيله على موبايلك الآن:</p>
                <p>1. اضغط <strong>«📥 تحميل ملف تطبيق الموبايل الكامل»</strong> أعلاه.</p>
                <p>2. أرسل الملف <code>ClacketFrame-Mobile.html</code> لنفسك في <strong>تلكرام (الرسائل المحفوظة)</strong> أو عبر <strong>AirDrop</strong> وافتحه على موبايلك ليعمل فوراً بكامل الميزات!</p>
                {isIOS && (
                  <p>3. في Safari اضغط مشاركة (⬆️) ← <strong>Add to Home Screen</strong>.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* CARD 2: MAC COMPUTER EDITION */}
        <div
          id="exportMacCard"
          className="glass rounded-3xl p-5 border-2 border-sky-500/40 flex flex-col justify-between space-y-4"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="w-12 h-12 rounded-2xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-2xl">
                💻
              </span>
              <span className="text-[11px] bg-sky-500/20 text-sky-300 border border-sky-500/40 px-2.5 py-1 rounded-full font-bold">
                يعمل مباشرة على الماك 🍎
              </span>
            </div>

            <div>
              <h3 className="text-base font-black text-white">
                2. نسخة حاسبتي الماك (استوديو المونتير)
              </h3>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                ملف تطبيق ماك مستقل بالكامل (يحتوي بداخله على كامل غرفة المونتاج والـ AI والأفكار والإعدادات) — احفظه على سطح مكتب الماك (Desktop) وافتحه بضغطتين!
              </p>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <button
              id="btnDownloadMacHtml"
              type="button"
              onClick={handleDownloadMacStudioFile}
              className="w-full py-3 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs transition cursor-pointer flex items-center justify-center gap-2 shadow-lg"
            >
              <span>💻</span>
              <span>تحميل تطبيق الماك الكامل (Mac Studio HTML)</span>
            </button>

            <button
              id="btnDownloadMacCommand"
              type="button"
              onClick={handleDownloadMacLauncher}
              className="w-full py-2.5 px-4 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 font-bold text-xs transition cursor-pointer flex items-center justify-center gap-2"
            >
              <span>🍎</span>
              <span>تحميل مشغل سطح المكتب للماك (.command)</span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                id="btnCopyMacLink"
                type="button"
                onClick={() =>
                  handleCopyText(
                    urls.activeMacUrl,
                    'mac-active-url',
                    'رابط نسخة حاسبة الماك'
                  )
                }
                className="py-2 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-[11px] transition cursor-pointer"
              >
                {copiedKey === 'mac-active-url' ? '✅ تم النسخ!' : '🔗 نسخ رابط الماك'}
              </button>
              <button
                id="btnToggleMacGuide"
                type="button"
                onClick={() => setShowMacSteps((prev) => !prev)}
                className="py-2 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 font-bold text-[11px] transition cursor-pointer"
              >
                🍎 طريقة التشغيل بالماك
              </button>
            </div>

            {showMacSteps && (
              <div className="bg-slate-950/90 border border-sky-500/30 rounded-2xl p-3 text-[11px] text-slate-200 space-y-1.5">
                <p className="font-bold text-sky-400">
                  💻 تشغيل التطبيق على حاسبتك الماك (بدون الحاجة لأي رابط):
                </p>
                <p>
                  1. اضغط <strong>«💻 تحميل تطبيق الماك الكامل (Mac Studio HTML)»</strong> أعلاه.
                </p>
                <p>
                  2. سيحفظ الملف <code>ClacketFrame-Mac-Studio.html</code> في مجلد <strong>Downloads (التنزيلات)</strong> على الماك — اسحبه إلى سطح المكتب وافتحه بضغطتين في Safari أو Chrome!
                </p>
                <p>
                  3. لتثبيته في شريط <strong>Dock</strong> بالماك: من قائمة Safari العلوية اختر <strong>File (ملف)</strong> ← <strong>Add to Dock (إضافة إلى Dock)</strong>.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* CARD 3: PHOTOGRAPHERS-ONLY EDITION */}
        <div
          id="exportPhotographersCard"
          className="glass rounded-3xl p-5 border-2 border-emerald-500/50 flex flex-col justify-between space-y-4"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-2xl">
                📸
              </span>
              <span className="text-[11px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2.5 py-1 rounded-full font-bold">
                مخفي منها حساب المونتير 🔒
              </span>
            </div>

            <div>
              <h3 className="text-base font-black text-white">
                3. نسخة المصورين فقط (جاهزة للإرسال بالكروب)
              </h3>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                ملف تطبيق مخصص للمصورين فقط — <strong>محذوف منه حساب المونتير والإعدادات</strong>. حمّل الملف وأرسله مباشرة في كروب التلكرام أو الواتساب للمصورين ليفتحوه على هواتفهم!
              </p>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <button
              id="btnDownloadPhotographersHtml"
              type="button"
              onClick={handleDownloadPhotographersFile}
              className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition cursor-pointer flex items-center justify-center gap-2 shadow-lg"
            >
              <span>📥</span>
              <span>تحميل ملف نسخة المصورين (HTML للكروب)</span>
            </button>

            <button
              type="button"
              onClick={() =>
                handleShareStandaloneFile(
                  'photographers',
                  'ClacketFrame-Photographers.html',
                  `${state.config.appName} - نسخة المصورين`
                )
              }
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-black text-xs transition cursor-pointer flex items-center justify-center gap-2"
            >
              <span>📤</span>
              <span>مشاركة / إرسال ملف نسخة المصورين للكروب</span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                id="btnCopyPhotographersLink"
                type="button"
                onClick={() =>
                  handleCopyText(
                    urls.activePhotographersUrl,
                    'photog-all-url',
                    'رابط نسخة المصورين فقط'
                  )
                }
                className="py-2 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 font-bold text-[11px] transition cursor-pointer"
              >
                {copiedKey === 'photog-all-url'
                  ? '✅ تم نسخ الرابط!'
                  : '🔗 نسخ رابط المصورين'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const html = buildStandaloneEditionHtml(state, 'photographers');
                  handleCopyText(html, 'photog-code', 'كود ملف نسخة المصورين');
                }}
                className="py-2 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-[11px] transition cursor-pointer"
              >
                {copiedKey === 'photog-code' ? '✅ تم نسخ الكود!' : '📋 نسخ كود الملف'}
              </button>
            </div>

            {onPreviewPhotographersEdition && (
              <button
                id="btnPreviewPhotographersEdition"
                type="button"
                onClick={onPreviewPhotographersEdition}
                className="w-full py-2.5 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-black text-xs transition cursor-pointer"
              >
                👁️ تشغيل ومعاينة "نسخة المصورين" أمامك الآن
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Direct Code Viewer Fallback if browser blocks file downloads */}
      <div className="glass rounded-2xl p-4 border border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-xs sm:text-sm font-black text-white">
              🛠️ خيار إضافي: عرض ونسخ الكود المصدري الجاهز لأي نسخة (إذا كان المتصفح يمنع التحميل المباشر):
            </h3>
            <p className="text-[11px] text-slate-400">
              يمكنك عرض الكود الكامل لأي نسخة ونسخه بضغطة واحدة وحفظه كملف <code>.html</code> على الماك أو الموبايل:
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                setPreviewCodeEdition((prev) => (prev === 'mac' ? null : 'mac'))
              }
              className="text-xs bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 px-3 py-1.5 rounded-xl font-bold cursor-pointer"
            >
              💻 كود نسخة الماك
            </button>
            <button
              type="button"
              onClick={() =>
                setPreviewCodeEdition((prev) => (prev === 'mobile' ? null : 'mobile'))
              }
              className="text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 px-3 py-1.5 rounded-xl font-bold cursor-pointer"
            >
              📱 كود نسخة الموبايل
            </button>
            <button
              type="button"
              onClick={() =>
                setPreviewCodeEdition((prev) =>
                  prev === 'photographers' ? null : 'photographers'
                )
              }
              className="text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 px-3 py-1.5 rounded-xl font-bold cursor-pointer"
            >
              📸 كود نسخة المصورين
            </button>
          </div>
        </div>

        {previewCodeEdition && (
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-400">
                📄 الكود الكامل لـ{' '}
                {previewCodeEdition === 'photographers'
                  ? 'نسخة المصورين فقط (ClacketFrame-Photographers.html)'
                  : previewCodeEdition === 'mac'
                  ? 'نسخة حاسبة الماك (ClacketFrame-Mac-Studio.html)'
                  : 'نسخة الموبايل (ClacketFrame-Mobile.html)'}
              </span>
              <button
                type="button"
                onClick={() =>
                  handleCopyText(
                    buildStandaloneEditionHtml(state, previewCodeEdition),
                    `preview-code-${previewCodeEdition}`,
                    'الكود الكامل للملف'
                  )
                }
                className="text-xs bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-4 py-1.5 rounded-xl cursor-pointer"
              >
                {copiedKey === `preview-code-${previewCodeEdition}`
                  ? '✅ تم نسخ الكود الكامل!'
                  : '📋 نسخ الكود الكامل الآن'}
              </button>
            </div>
            <textarea
              readOnly
              dir="ltr"
              rows={6}
              value={buildStandaloneEditionHtml(state, previewCodeEdition)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-[11px] text-emerald-300 font-mono"
            />
          </div>
        )}
      </div>

      {/* Direct Individual Photographer Links */}
      <div
        id="exportPerPhotographerLinks"
        className="glass rounded-2xl p-5 border border-slate-800 space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-black text-amber-400">
              👤 روابط فردية مخصصة لكل مصور بالاسم (تفتح حساب المصور مباشرة):
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              بعد تفعيل زر Share في أعلى المنصة، يمكنك إرسال رابط مخصص لكل مصور يفتح على اسمه مباشرة:
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {urls.photographerDirectLinks.map((item) => (
            <div
              key={item.id}
              className="bg-slate-900/90 border border-slate-800 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs"
            >
              <div className="flex items-center gap-2 font-bold text-white truncate">
                <span>📸</span>
                <span className="truncate">{item.name}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    handleCopyText(
                      item.activeUrl,
                      `photog-${item.id}`,
                      `الرابط الخاص بالمصور (${item.name})`
                    )
                  }
                  className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 px-3 py-1.5 rounded-lg font-bold cursor-pointer whitespace-nowrap"
                >
                  {copiedKey === `photog-${item.id}` ? '✅ تم النسخ' : '🔗 نسخ رابط المصور'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
