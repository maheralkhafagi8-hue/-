import React, { useEffect, useRef, useState } from 'react';

interface PinModalProps {
  isOpen: boolean;
  targetId: 'director' | string | null;
  targetTitle: string;
  faceIdEnabled?: boolean;
  errorMessage: string | null;
  onVerify: (pin: string) => void;
  onFaceIdVerified?: () => void;
  onClose: () => void;
}

export const PinModal: React.FC<PinModalProps> = ({
  isOpen,
  targetId,
  targetTitle,
  errorMessage,
  onVerify,
  onClose,
}) => {
  const [pin, setPin] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  if (!isOpen || !targetId) return null;

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    onVerify(pin);
  };

  return (
    <div
      id="pinModal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pinModalTitle"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-xs glass rounded-3xl p-6 text-center border border-slate-700 space-y-3"
      >
        <div className="text-4xl mb-1">🔑</div>
        <h3 id="pinModalTitle" className="text-lg font-bold text-white">
          أدخل الرمز السري: {targetTitle}
        </h3>

        <div>
          <label htmlFor="pinInput" className="sr-only">
            الرمز السري
          </label>
          <input
            ref={inputRef}
            id="pinInput"
            type="password"
            inputMode="numeric"
            maxLength={8}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="••••"
            className="w-full text-center text-2xl tracking-widest bg-slate-900 border border-slate-700 rounded-xl py-3 text-white focus:outline-none focus:border-amber-500 font-mono tabular-nums"
          />
        </div>

        {errorMessage && (
          <p role="alert" className="text-xs text-rose-400 font-bold">
            {errorMessage}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition cursor-pointer"
          >
            دخول
          </button>
          <button
            type="button"
            onClick={onClose}
            className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
          >
            إلغاء
          </button>
        </div>
      </form>
    </div>
  );
};
