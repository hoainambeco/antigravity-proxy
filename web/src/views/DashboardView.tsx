import React from 'react';
import type { Account, SystemStatus } from '../types';
import { Users, Cpu, Key, Activity, CheckCircle2, AlertTriangle, ArrowUpRight, Zap } from 'lucide-react';
import type { TabType } from '../components/Sidebar';

interface DashboardViewProps {
  status: SystemStatus | null;
  accounts: Account[];
  onNavigate: (tab: TabType) => void;
  onSyncAll: () => void;
  isSyncing: boolean;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  status,
  accounts,
  onNavigate,
  onSyncAll,
  isSyncing,
}) => {
  // Aggregate quota statistics
  const totalAccounts = accounts.length;
  const activeAccounts = accounts.filter((a) => a.is_healthy && !a.is_cooldown).length;
  const cooldownAccounts = accounts.filter((a) => a.is_cooldown).length;

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-950/40 via-zinc-900 to-zinc-900 border border-emerald-900/40 p-6">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-medium mb-3 border border-emerald-500/20">
              <Zap className="w-3.5 h-3.5" />
              Dynamic Upstream Discovery Active
            </div>
            <h2 className="text-xl font-bold text-zinc-100">Antigravity Gateway Dashboard</h2>
            <p className="text-sm text-zinc-400 max-w-xl mt-1">
              Quản lý Multi-Account Google Cloud Code, tự động xoay vòng tài khoản, khôi phục Thought Signature và phân phối tải cho Cursor, Claude Code, Cline.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigate('accounts')}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-semibold text-sm transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-1.5"
            >
              <span>Xem tài khoản</span>
              <ArrowUpRight className="w-4 h-4" />
            </button>
            <button
              onClick={onSyncAll}
              disabled={isSyncing}
              className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium transition-all"
            >
              {isSyncing ? 'Đang sync...' : 'Đồng bộ ngay'}
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Accounts Card */}
        <div
          onClick={() => onNavigate('accounts')}
          className="p-5 rounded-xl bg-zinc-900/70 border border-zinc-800 hover:border-zinc-700 cursor-pointer transition-all hover:bg-zinc-900"
        >
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium uppercase tracking-wider">Tài khoản Google</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-zinc-100">{activeAccounts}</span>
            <span className="text-xs text-zinc-400">/ {totalAccounts} active</span>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs">
            {cooldownAccounts > 0 ? (
              <span className="text-amber-400 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                {cooldownAccounts} tài khoản cooldown
              </span>
            ) : (
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Tất cả tài khoản sẵn sàng
              </span>
            )}
          </div>
        </div>

        {/* Models Card */}
        <div
          onClick={() => onNavigate('models')}
          className="p-5 rounded-xl bg-zinc-900/70 border border-zinc-800 hover:border-zinc-700 cursor-pointer transition-all hover:bg-zinc-900"
        >
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium uppercase tracking-wider">Models Khả dụng</span>
            <Cpu className="w-4 h-4 text-teal-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-zinc-100">{status?.models?.total ?? 0}</span>
            <span className="text-xs text-emerald-400">Live Upstream</span>
          </div>
          <p className="mt-3 text-xs text-zinc-400">Khám phá tự động từ Google API</p>
        </div>

        {/* API Keys Card */}
        <div
          onClick={() => onNavigate('api-keys')}
          className="p-5 rounded-xl bg-zinc-900/70 border border-zinc-800 hover:border-zinc-700 cursor-pointer transition-all hover:bg-zinc-900"
        >
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium uppercase tracking-wider">API Keys</span>
            <Key className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-zinc-100">{status?.api_keys?.active ?? 0}</span>
            <span className="text-xs text-zinc-400">đang hoạt động</span>
          </div>
          <p className="mt-3 text-xs text-zinc-400">SQLite persistence</p>
        </div>

        {/* Uptime Card */}
        <div
          onClick={() => onNavigate('audit')}
          className="p-5 rounded-xl bg-zinc-900/70 border border-zinc-800 hover:border-zinc-700 cursor-pointer transition-all hover:bg-zinc-900"
        >
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium uppercase tracking-wider">Uptime & Traffic</span>
            <Activity className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-zinc-100">
              {Math.floor((status?.uptime_seconds ?? 0) / 60)}m
            </span>
            <span className="text-xs text-zinc-400">online</span>
          </div>
          <p className="mt-3 text-xs text-zinc-400 font-mono">Strategy: {status?.routing_strategy || 'round-robin'}</p>
        </div>
      </div>

      {/* Quota Highlights Table */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-zinc-100">Hạn mức các Model chính</h3>
            <p className="text-xs text-zinc-400">Tỷ lệ hạn mức % còn lại thu thập từ Google Upstream</p>
          </div>
          <button
            onClick={() => onNavigate('accounts')}
            className="text-xs text-emerald-400 hover:underline flex items-center gap-1 font-medium"
          >
            Chi tiết tài khoản &rarr;
          </button>
        </div>

        {accounts.length === 0 ? (
          <div className="text-center py-10 text-zinc-400 text-sm">
            Chưa có tài khoản nào được kết nối. Bấm "Thêm tài khoản" để bắt đầu.
          </div>
        ) : (
          <div className="space-y-4">
            {accounts.map((account) => {
              const models = account.quota?.models || {};
              const majorKeys = Object.keys(models).filter((k) =>
                ['gemini-3.7-flash-tiered', 'gemini-3.8-flash-tiered', 'claude-sonnet-4-6', 'gemini-2.5-pro'].includes(k),
              );

              return (
                <div key={account.id} className="p-4 rounded-xl bg-zinc-900 border border-zinc-800/80">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="font-semibold text-sm text-zinc-200">{account.email}</span>
                      <span className="text-xs font-mono text-zinc-400 px-2 py-0.5 rounded bg-zinc-800">
                        {account.id}
                      </span>
                    </div>
                    {account.is_cooldown && (
                      <span className="text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        Cooldown
                      </span>
                    )}
                  </div>

                  {majorKeys.length === 0 ? (
                    <p className="text-xs text-zinc-400">Chưa fetch quota hoặc không có model tiêu chuẩn.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                      {majorKeys.map((key) => {
                        const m = models[key];
                        const pct = m?.percentage ?? 0;
                        const colorClass =
                          pct >= 50
                            ? 'bg-emerald-500'
                            : pct >= 20
                              ? 'bg-amber-500'
                              : 'bg-rose-500';

                        return (
                          <div key={key} className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800/60">
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="text-zinc-400 truncate max-w-[120px]" title={key}>
                                {key.replace('-tiered', '')}
                              </span>
                              <span className="font-mono font-bold text-zinc-200">{pct}%</span>
                            </div>
                            <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-1.5 rounded-full transition-all ${colorClass}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
