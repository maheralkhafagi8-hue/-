import React, { useState } from 'react';
import { REMINDER_PRESET_OPTIONS } from '../utils/clacketLogic';

interface ReminderPopupProps {
  reminderText: string | null;
  currentIntervalLabel?: string;
  onDismiss: () => void;
  onNavigateToTask: () => void;
  onUpdateReminderSchedule: (input: {
    preset: '30' | '60' | '120' | '180' | '240' | '360' | 'custom';
    customAmount?: string;
    customUnit?: 'minutes' | 'hours';
  }) => void;
}

export const ReminderPopup: React.FC<ReminderPopupProps> = ({
  reminderText,
  currentIntervalLabel,
  onDismiss,
  onNavigateToTask,
  onUpdateReminderSchedule,
}) => {
  const [selectedPreset, setSelectedPreset] = useState<
    '30' | '60' | '120' | '180' | '240' | '360' | 'custom'
  >('30');
  const [customAmount, setCustomAmount] = useState<string>('45');
  const [customUnit, setCustomUnit] = useState<'minutes' | 'hours'>('minutes');

  if (!reminderText) return null;

  const handleApplySnooze = () => {
    onUpdateReminderSchedule({
      preset: selectedPreset,
      customAmount,
      customUnit,
    });
    onDismiss();
  };

  return (
    <div
      id="reminderPopup"
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
    >
      <div className="w-full max-w-md glass rounded-3xl p-6 border-2 border-rose-500 text-center shadow-2xl space-y-4">
        <div className="text-4xl">🔔</div>
        <h3 className="text-xl font-black text-white">تذكير مهام المونتاج!</h3>

        <button
          type="button"
          onClick={onNavigateToTask}
          className="w-full text-right p-3.5 rounded-2xl bg-rose-950/60 hover:bg-rose-900/60 border border-rose-500/40 transition cursor-pointer group"
        >
          <p id="reminderPopupText" className="text-slate-200 text-sm leading-relaxed font-bold">
            {reminderText}
          </p>
          <span className="inline-block mt-2 text-xs text-amber-300 font-black group-hover:underline">
            📍 اضغط هنا للانتقال مباشرة إلى مكان المهمة في المونتاج ↗️
          </span>
        </button>

        {/* التحكم بأوقات التذكير */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 text-right space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-amber-400">⏰ تحكم بوقت التذكير القادم:</span>
            {currentIntervalLabel && (
              <span className="text-[11px] text-slate-400">
                الحالي: {currentIntervalLabel}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-xs">
            {REMINDER_PRESET_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSelectedPreset(opt.value)}
                className={`py-2 px-2.5 rounded-xl font-bold transition cursor-pointer ${
                  selectedPreset === opt.value
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {opt.shortLabel}
              </button>
            ))}
          </div>

          {selectedPreset === 'custom' && (
            <div className="flex items-center gap-2 pt-1">
              <input
                type="number"
                min="1"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                placeholder="أدخل الوقت..."
                className="flex-1 bg-slate-950 border border-amber-500/50 rounded-xl px-3 py-2 text-xs text-white text-center font-bold tabular-nums"
              />
              <select
                value={customUnit}
                onChange={(e) => setCustomUnit(e.target.value as 'minutes' | 'hours')}
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-amber-300 font-bold"
              >
                <option value="minutes">دقيقة</option>
                <option value="hours">ساعة</option>
              </select>
            </div>
          )}

          <button
            type="button"
            onClick={handleApplySnooze}
            className="w-full py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-bold text-xs transition cursor-pointer"
          >
            ⏰ حفظ وقت التذكير وتأجيل التنبيه
          </button>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onNavigateToTask}
            className="flex-1 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs transition cursor-pointer"
          >
            🎬 افتح مكان الإشعار الآن
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition cursor-pointer"
          >
            إغلاق 👍
          </button>
        </div>
      </div>
    </div>
  );
};
