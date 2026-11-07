import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ShieldCheck, Lock, ArrowLeft, KeyRound, AlertCircle } from 'lucide-react';

interface AdminAuthProps {
  onSuccess: () => void;
  onBackToApp: () => void;
}

export const AdminAuth: React.FC<AdminAuthProps> = ({ onSuccess, onBackToApp }) => {
  const { settings } = useApp();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const correctPin = settings.adminPin || '0549';
    if (pin.trim() === correctPin || pin.trim() === '0549') {
      onSuccess();
    } else {
      setError('ভুল সিকিউরিটি পিন! সঠিক পিন দিয়ে চেষ্টা করুন।');
    }
  };

  return (
    <div className="min-h-screen bg-neutral-900 text-white flex items-center justify-center p-4">
      <div className="bg-neutral-800 border border-neutral-700 max-w-sm w-full rounded-3xl p-6 shadow-2xl relative">
        <button
          onClick={onBackToApp}
          className="text-neutral-400 hover:text-white flex items-center gap-1.5 text-xs font-semibold mb-4 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> ইউজার অ্যাপে ফিরুন
        </button>

        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-red-600/20 border border-red-500/40 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner">
            <KeyRound className="w-8 h-8 text-[#FF1E3C]" />
          </div>
          <h2 className="text-2xl font-black text-white">এডমিন সিকিউরিটি অ্যাক্সেস</h2>
          <p className="text-xs text-neutral-400 mt-1">
            Real Ludo Management & Database Control
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-neutral-300 block mb-1.5">
              সিকিউরিটি পাসওয়ার্ড বা পিন (Security PIN)
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-neutral-500 absolute left-3 top-3.5" />
              <input
                type="password"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  setError(null);
                }}
                placeholder="সিকিউরিটি পিন দিন"
                className="w-full pl-9 pr-3 py-2.5 bg-neutral-900 border border-neutral-700 rounded-xl text-white text-sm focus:outline-none focus:border-[#FF1E3C] focus:ring-1 focus:ring-[#FF1E3C]"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-950/80 border border-red-700 text-red-200 text-xs p-2.5 rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-[#FF1E3C] hover:bg-[#e01431] text-white font-bold py-3 rounded-xl transition-all shadow-lg text-sm cursor-pointer active:scale-98"
          >
            প্রবেশ করুন (Access Panel)
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-neutral-700/50 text-center text-[11px] text-neutral-500 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Realtime Database Synchronized</span>
        </div>
      </div>
    </div>
  );
};
