import React, { useState } from 'react';
import { KeyRound, LogIn, AlertCircle, Lock, ShieldCheck } from 'lucide-react';
import { api } from '../api/client';

interface LoginViewProps {
  onAuthed: (key: string) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onAuthed }) => {
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = key.trim();
    if (!trimmed) {
      setError('Vui lòng nhập API Key');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await api.validateKey(trimmed);
      if (res.valid) {
        onAuthed(trimmed);
      } else {
        setError(res.error || 'API Key không hợp lệ');
      }
    } catch (err: any) {
      setError(`Không thể kết nối tới server: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
            <Lock className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold">Antigravity Proxy</h1>
          <p className="text-sm text-zinc-400 mt-1">Admin Dashboard</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-4"
        >
          <div>
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <KeyRound className="w-3.5 h-3.5" />
              API Key
            </label>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Nhập API Key của bạn"
              autoFocus
              className="w-full px-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-700 focus:border-emerald-500 focus:outline-none text-sm placeholder-zinc-500 font-mono"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-zinc-950 rounded-xl font-semibold text-sm transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
          >
            <LogIn className="w-4 h-4" />
            <span>{loading ? 'Đang kiểm tra...' : 'Đăng nhập'}</span>
          </button>

          <p className="flex items-center justify-center gap-1.5 text-[11px] text-zinc-500 pt-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500/70" />
            API Key được dùng làm danh tính để ghi Traffic Logs
          </p>
        </form>
      </div>
    </div>
  );
};