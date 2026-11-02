import React, { useState } from 'react';
import { AppState, IdeaItem, Photographer } from '../types';
import { createShootRecord } from '../utils/clacketLogic';

interface PhotographerViewProps {
  photographer: Photographer;
  state: AppState;
  onSubmitShoot: (
    input: {
      project: string;
      field1Value: string;
      field2Value: string;
      shotType: string;
      isUrgent: boolean;
      reminderNote?: string;
    }
  ) => { ok: boolean; error?: string };
  onDismissNotification: (notifId: string) => void;
  onUpdatePhotographerCredentials: (input: {
    newPin?: string;
    faceIdEnabled?: boolean;
  }) => { ok: boolean; error?: string };
}

export const PhotographerView: React.FC<PhotographerViewProps> = ({
  photographer,
  state,
  onSubmitShoot,
  onDismissNotification,
  onUpdatePhotographerCredentials,
}) => {
  const [selectedProject, setSelectedProject] = useState<string>(
    state.projects[0] || ''
  );
  const [field1Value, setField1Value] = useState<string>('');
  const [field2Value, setField2Value] = useState<string>('');
  const [shotType, setShotType] = useState<string>('ريلز عمودي 9:16');
  const [isUrgent, setIsUrgent] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [sentConfirmation, setSentConfirmation] = useState<boolean>(false);

  // Self-service PIN & Face ID state
  const [showSecurityPanel, setShowSecurityPanel] = useState<boolean>(false);
  const [newPin, setNewPin] = useState<string>('');
  const [confirmPin, setConfirmPin] = useState<string>('');
  const [pinChangeMsg, setPinChangeMsg] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);

  const myShoots = state.shoots.filter(
    (s) => s.photographerId === photographer.id || s.photographerName === photographer.name
  );
  const myCompletedShoots = myShoots.filter((s) => s.status === 'completed');
  const myUnreadNotifications = (state.photographerNotifications || []).filter(
    (n) =>
      !n.read &&
      (n.photographerId === photographer.id || n.photographerName === photographer.name)
  );
  const availableIdeas = state.ideas.filter(
    (i) => Boolean(i.approvedForPhotographers) && !i.isCompleted
  );

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const check = createShootRecord(
      {
        project: selectedProject || state.projects[0] || '',
        field1Value,
        field2Value,
        shotType,
        isUrgent,
      },
      photographer
    );

    if (!check.ok) {
      setFormError(check.error);
      return;
    }

    setFormError(null);
    const res = onSubmitShoot({
      project: selectedProject || state.projects[0] || '',
      field1Value,
      field2Value,
      shotType,
      isUrgent,
      reminderNote: isUrgent
        ? `تصوير عاجل من (${photographer.name}) لمشروع (${selectedProject}): ${field1Value}`
        : undefined,
    });

    if (res.ok) {
      setField1Value('');
      setField2Value('');
      setIsUrgent(false);
      setSentConfirmation(true);
    } else if (res.error) {
      setFormError(res.error);
    }
  };

  const handleSaveNewPin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNew = newPin.trim();
    const cleanConfirm = confirmPin.trim();
    if (!cleanNew) {
      setPinChangeMsg({ type: 'err', text: 'يرجى كتابة الرمز السري الجديد' });
      return;
    }
    if (cleanNew !== cleanConfirm) {
      setPinChangeMsg({
        type: 'err',
        text: 'الرمز الجديد وتأكيد الرمز غير متطابقين، تأكد من كتابتهما بنفس الشكل',
      });
      return;
    }

    const res = onUpdatePhotographerCredentials({ newPin: cleanNew });
    if (!res.ok) {
      setPinChangeMsg({ type: 'err', text: res.error || 'حدث خطأ أثناء حفظ الرمز' });
      return;
    }

    setNewPin('');
    setConfirmPin('');
    setPinChangeMsg({
      type: 'ok',
      text: '✅ تم تغيير وحفظ رمز الدخول الخاص بك بنجاح!',
    });
  };

  const applyIdeaToForm = (idea: IdeaItem) => {
    setSelectedProject(idea.project);
    setField1Value(`تنفيذ فكرة: ${idea.title} (${idea.notes.slice(0, 60)})`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div id="photographerView" className="space-y-5">
      {/* Photographer Summary Banner */}
      <div className="glass rounded-2xl p-4 border border-amber-500/30 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-2xl">
            📸
          </div>
          <div>
            <h2 className="text-base font-black text-white">
              أهلاً بك يا بطل الميدان: {photographer.name}
            </h2>
            <p className="text-xs text-slate-400">
              أرسل تفاصيل تصويرك ليصل إشعار فوري إلى المونتير
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            id="btnTogglePhotogSecurity"
            type="button"
            onClick={() => {
              setShowSecurityPanel((prev) => !prev);
              setPinChangeMsg(null);
            }}
            className="text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 px-3.5 py-2.5 rounded-xl font-black transition cursor-pointer flex items-center gap-1.5"
          >
            <span>🔑</span>
            <span>تغيير رمز الدخول السري</span>
          </button>

          <div className="flex items-center gap-4 bg-slate-900/90 px-4 py-2 rounded-xl border border-slate-800">
            <div className="text-center">
              <div className="text-lg font-black text-amber-400 tabular-nums">
                {myShoots.length}
              </div>
              <div className="text-[11px] text-slate-400">إجمالي المرسل</div>
            </div>
            <div className="w-px h-7 bg-slate-800" />
            <div className="text-center">
              <div className="text-lg font-black text-emerald-400 tabular-nums">
                {myCompletedShoots.length}
              </div>
              <div className="text-[11px] text-slate-400">منجزاتي المكتملة ✅</div>
            </div>
          </div>
        </div>
      </div>

      {/* Photographer Self-Service PIN Change Card */}
      {showSecurityPanel && (
        <div
          id="photographerSecurityCard"
          className="glass rounded-2xl p-5 border-2 border-amber-500/50 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm sm:text-base font-black text-amber-400 flex items-center gap-2">
              <span>🔐</span>
              <span>تغيير رمز الدخول السري ({photographer.name})</span>
            </h3>
            <button
              type="button"
              onClick={() => setShowSecurityPanel(false)}
              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded-lg cursor-pointer"
            >
              إغلاق ✕
            </button>
          </div>

          <form
            onSubmit={handleSaveNewPin}
            className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3"
          >
            <div className="text-xs font-black text-white flex items-center gap-1.5">
              <span>🔑</span>
              <span>أدخل رمز الدخول السري الجديد الخاص بك:</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div>
                <label
                  htmlFor="photogNewPinInput"
                  className="block text-slate-400 mb-1 font-bold"
                >
                  الرمز السري الجديد:
                </label>
                <input
                  id="photogNewPinInput"
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  placeholder="أدخل الرمز الجديد..."
                  className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-3 py-2.5 text-white text-center font-mono tabular-nums"
                />
              </div>
              <div>
                <label
                  htmlFor="photogConfirmPinInput"
                  className="block text-slate-400 mb-1 font-bold"
                >
                  تأكيد الرمز الجديد:
                </label>
                <input
                  id="photogConfirmPinInput"
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  placeholder="أعد كتابة الرمز..."
                  className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-3 py-2.5 text-white text-center font-mono tabular-nums"
                />
              </div>
            </div>

            <button
              id="btnSavePhotogPin"
              type="submit"
              className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition cursor-pointer"
            >
              💾 حفظ رمز الدخول الجديد
            </button>
          </form>

          {pinChangeMsg && (
            <p
              id="photogPinChangeAlert"
              role="status"
              className={`text-xs font-bold p-3 rounded-xl border ${
                pinChangeMsg.type === 'ok'
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                  : 'bg-rose-500/15 text-rose-300 border-rose-500/40'
              }`}
            >
              {pinChangeMsg.text}
            </p>
          )}
        </div>
      )}

      {/* Instant Notifications from Director (e.g. المونتير ماهر بدأ في العمل على هذا المشروع) */}
      {myUnreadNotifications.length > 0 && (
        <div
          id="photographerNotificationsBox"
          role="region"
          aria-label="إشعارات المونتير"
          className="space-y-2.5"
        >
          {myUnreadNotifications.map((notif) => (
            <div
              key={notif.id}
              id={`photog-notif-${notif.id}`}
              className="glass rounded-2xl p-4 border-2 border-sky-500 bg-sky-950/50 flex flex-wrap items-center justify-between gap-3 shadow-xl"
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl shrink-0">🎬</span>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-black text-sky-300">
                      🔔 إشعار فوري من {notif.directorName}:
                    </span>
                    <span className="text-[11px] text-slate-400 tabular-nums">
                      {notif.createdAt}
                    </span>
                  </div>
                  <p className="text-sm font-black text-white leading-relaxed">
                    {notif.message}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onDismissNotification(notif.id)}
                className="text-xs bg-sky-500 hover:bg-sky-400 text-slate-950 px-3.5 py-1.5 rounded-xl font-black cursor-pointer shrink-0 transition"
              >
                تم الاطلاع ✓
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Single Sent Confirmation Message for Photographer */}
      {sentConfirmation && (
        <div
          id="photographerSentConfirm"
          role="status"
          className="glass rounded-2xl p-4 border-2 border-emerald-500 bg-emerald-950/40 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">✅</span>
            <span className="text-sm font-black text-emerald-300">
              تم الإرسال إلى المونتير
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSentConfirmation(false)}
            className="text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 px-3 py-1 rounded-xl font-bold cursor-pointer"
          >
            حسناً
          </button>
        </div>
      )}

      {/* New Shoot Submission Form */}
      <form
        onSubmit={handleFormSubmit}
        className="glass rounded-2xl p-5 space-y-4 border border-amber-500/30"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-black text-amber-400">
            🎬 إرسال وجبة تصوير جديدة إلى المونتير
          </h3>
          <a
            href={state.config.telegramUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 px-3 py-1.5 rounded-xl font-bold transition whitespace-nowrap"
          >
            ✈️ فتح كروب التلكرام
          </a>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="photogProjectSelect" className="text-xs text-slate-300 font-bold block mb-1.5">
              🏢 اختر المشروع:
            </label>
            <select
              id="photogProjectSelect"
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:border-amber-500 focus:outline-none"
            >
              {state.projects.map((proj) => (
                <option key={proj} value={proj}>
                  {proj}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="photogShotType" className="text-xs text-slate-300 font-bold block mb-1.5">
              🎥 نوع التصوير:
            </label>
            <select
              id="photogShotType"
              value={shotType}
              onChange={(e) => setShotType(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:border-amber-500 focus:outline-none"
            >
              <option value="ريلز عمودي 9:16">📱 ريلز عمودي 9:16</option>
              <option value="تصوير درون جوي">🚁 تصوير درون جوي</option>
              <option value="تغطية ميدانية 4K">🏗️ تغطية ميدانية 4K</option>
              <option value="لقاء وتغطية ميدانية">🎤 لقاء وتغطية ميدانية</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="photogField1" className="text-xs text-slate-300 font-bold block mb-1.5">
            📝 {state.config.field1Label}:
          </label>
          <input
            id="photogField1"
            type="text"
            value={field1Value}
            onChange={(e) => setField1Value(e.target.value)}
            placeholder="مثال: لقطات واجهات الفلل وقت الغروب + جولة داخلية..."
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:border-amber-500 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="photogField2" className="text-xs text-slate-300 font-bold block mb-1.5">
            🔗 {state.config.field2Label}:
          </label>
          <input
            id="photogField2"
            type="text"
            value={field2Value}
            onChange={(e) => setField2Value(e.target.value)}
            placeholder="مثال: مرفوع بكروب التلكرام أو رام الكاميرا رقم 2..."
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:border-amber-500 focus:outline-none"
          />
        </div>

        <label className="flex items-center gap-2.5 text-xs text-rose-300 font-bold cursor-pointer bg-rose-950/30 border border-rose-500/30 p-3 rounded-xl">
          <input
            type="checkbox"
            checked={isUrgent}
            onChange={(e) => setIsUrgent(e.target.checked)}
            className="w-4 h-4 accent-rose-500 rounded"
          />
          <span>🔔 إرسال تنبيه عاجل وتذكير فوري على شاشة المونتير</span>
        </label>

        {formError && (
          <p role="alert" className="text-xs text-rose-400 font-bold">
            ⚠️ {formError}
          </p>
        )}

        <button
          id="submitShootBtn"
          type="submit"
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-95 text-slate-950 font-black text-base shadow-lg transition cursor-pointer"
        >
          🚀 إرسال للمونتير الآن + إشعار فوري
        </button>
      </form>

      {/* Photographer's Completed Achievements (منجزاتي المكتملة) */}
      <div
        id="photographerCompletedAchievements"
        className="glass rounded-2xl p-5 space-y-3 border border-emerald-500/30"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-emerald-400">
            🏆 منجزاتي المكتملة ({myCompletedShoots.length})
          </h3>
          <span className="text-[11px] text-slate-400">
            الأعمال التي أتم المونتير إنجازها
          </span>
        </div>
        {myCompletedShoots.length === 0 ? (
          <p className="text-xs text-slate-400">
            لا توجد أعمال مكتملة بعد.. ستنتقل أعمالك إلى هنا تلقائياً عند إتمام المونتاج.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {myCompletedShoots.map((shoot) => (
              <div
                key={shoot.id}
                className="bg-slate-900/80 border border-emerald-500/30 rounded-xl p-3.5 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black text-amber-400">
                    🏢 {shoot.project}
                  </span>
                  <span className="text-[11px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-lg font-bold">
                    ✅ تم الإنجاز
                  </span>
                </div>
                <p className="text-xs font-bold text-white leading-relaxed">
                  {shoot.field1Value}
                </p>
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                  <span>{shoot.shotType}</span>
                  <span className="tabular-nums">
                    {shoot.completedAt || shoot.createdAt}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ideas & Requested Angles Approved by Director */}
      <div
        id="photographerApprovedIdeasBox"
        className="glass rounded-2xl p-5 space-y-3"
      >
        <h3 className="text-sm font-bold text-amber-400">
          💡 أفكار وزوايا مطلوبة من المونتير في الميدان ({availableIdeas.length})
        </h3>
        {availableIdeas.length === 0 ? (
          <p className="text-xs text-slate-400">
            لا توجد أفكار معتمدة من المونتير حالياً.. ستظهر هنا الأفكار فور موافقة المونتير عليها!
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {availableIdeas.map((idea) => (
              <div
                key={idea.id}
                className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-amber-400">
                    🏢 {idea.project}
                  </span>
                  <button
                    type="button"
                    onClick={() => applyIdeaToForm(idea)}
                    className="text-[11px] bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 px-2.5 py-1 rounded-lg font-bold cursor-pointer whitespace-nowrap"
                  >
                    📸 اعتماد وتصوير هذه الفكرة
                  </button>
                </div>
                <h4 className="text-xs font-bold text-white">{idea.title}</h4>
                <p className="text-xs text-slate-400 leading-relaxed">{idea.notes}</p>
                {idea.link && (
                  <a
                    href={idea.link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block text-[11px] text-sky-400 hover:underline font-bold"
                  >
                    🔗 مشاهدة الفيديو المرجعي ↗️
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
