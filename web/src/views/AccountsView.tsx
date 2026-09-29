import React, { useState } from 'react';
import type { Account } from '../types';
import { api } from '../api/client';
import { Users, RefreshCw, Trash2, Plus, AlertCircle, CheckCircle2, ShieldAlert, Clock } from 'lucide-react';
import { useTranslation } from '../i18n';

function formatResetCountdown(resetTime: string, resettingText: string, prefixTemplate: string): string {
  const diffMs = new Date(resetTime).getTime() - Date.now();
  if (diffMs <= 0) return resettingText;
  const diffMin = Math.floor(diffMs / 60000);
  let timeStr = '';
  if (diffMin < 60) {
    timeStr = `${diffMin}m`;
  } else {
    const hours = Math.floor(diffMin / 60);
    const mins = diffMin % 60;
    timeStr = mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  return prefixTemplate.replace('{time}', timeStr);
}

interface AccountsViewProps {
  accounts: Account[];
  onReload: () => void;
}

export const AccountsView: React.FC<AccountsViewProps> = ({ accounts, onReload }) => {
  const { t } = useTranslation();
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthUrl, setOauthUrl] = useState<string | null>(null);

  const handleSyncAccount = async (id: string) => {
    try {
      setSyncingId(id);
      await api.syncAccounts(id);
      onReload();
    } catch (err: any) {
      alert(t('accounts.syncFailed', { message: err.message }));
    } finally {
      setSyncingId(null);
    }
  };

  const handleDeleteAccount = async (id: string, email: string) => {
    if (!confirm(t('accounts.confirmDelete', { email }))) {
      return;
    }

    try {
      setDeletingId(id);
      await api.deleteAccount(id);
      onReload();
    } catch (err: any) {
      alert(t('accounts.deleteFailed', { message: err.message }));
    } finally {
      setDeletingId(null);
    }
  };

  const handleAddAccount = async () => {
    try {
      setOauthLoading(true);
      const res = await api.getOAuthUrl();
      if (res?.url) {
        setOauthUrl(res.url);
        const popup = window.open(res.url, '_blank', 'width=600,height=700');
        if (popup) {
          const timer = setInterval(() => {
            if (popup.closed) {
              clearInterval(timer);
              onReload();
            }
          }, 1000);
        }
      }
    } catch (err: any) {
      alert(t('accounts.oauthError', { message: err.message }));
    } finally {
      setOauthLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-400" />
            {t('accounts.titleWithCount', { count: accounts.length })}
          </h2>
          <p className="text-xs text-zinc-400">
            {t('accounts.description')}
          </p>
        </div>

        <button
          onClick={handleAddAccount}
          disabled={oauthLoading}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-zinc-950 rounded-xl font-semibold text-sm transition-all shadow-lg shadow-emerald-500/20"
        >
          <Plus className="w-4 h-4" />
          <span>{oauthLoading ? t('accounts.openingOAuth') : t('accounts.addAccountBtn')}</span>
        </button>
      </div>

      {oauthUrl && (
        <div className="p-4 rounded-xl bg-zinc-900 border border-emerald-500/30 text-xs text-zinc-300 flex items-center justify-between">
          <div className="space-y-1">
            <p className="font-semibold text-emerald-400">{t('accounts.oauthOpenedTitle')}</p>
            <p className="text-zinc-400">{t('accounts.oauthBlockedHint')}</p>
            <a href={oauthUrl} target="_blank" rel="noreferrer" className="text-teal-400 underline break-all font-mono">
              {oauthUrl}
            </a>
          </div>
          <button
            onClick={() => setOauthUrl(null)}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
          >
            {t('common.close')}
          </button>
        </div>
      )}

      {/* Account Cards */}
      {accounts.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-zinc-800 bg-zinc-900/30">
          <AlertCircle className="w-10 h-10 text-zinc-500 mx-auto mb-3" />
          <p className="text-sm text-zinc-300 font-medium">{t('accounts.noAccountsYet')}</p>
          <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
            {t('accounts.noAccountsSubhint')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {accounts.map((account) => {
            const models = account.quota?.models || {};
            const modelKeys = Object.keys(models);

            return (
              <div
                key={account.id}
                className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700/80 transition-all space-y-4"
              >
                {/* Account Header */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center font-bold text-zinc-200">
                      {account.email.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-base text-zinc-100">{account.email}</span>
                        <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                          {account.id}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-zinc-400">
                        <span>
                          {t('accounts.projectLabel')}{' '}
                          <code className="text-zinc-300 font-mono">{account.project_id || 'N/A'}</code>
                        </span>
                        <span>•</span>
                        <span>
                          {t('accounts.tierLabel')}{' '}
                          <span className="text-emerald-400 font-medium">
                            {account.quota?.subscription_tier || 'Standard'}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    {account.is_cooldown ? (
                      <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        {t('accounts.cooldownRemaining', { seconds: account.cooldown_remaining_sec ?? 0 })}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {t('common.active')}
                      </span>
                    )}

                    <button
                      onClick={() => handleSyncAccount(account.id)}
                      disabled={syncingId === account.id}
                      className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-all text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
                      title={t('common.syncQuota')}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${syncingId === account.id ? 'animate-spin text-emerald-400' : ''}`} />
                      <span className="hidden sm:inline">{t('common.sync')}</span>
                    </button>

                    <button
                      onClick={() => handleDeleteAccount(account.id, account.email)}
                      disabled={deletingId === account.id}
                      className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-all text-xs flex items-center gap-1.5"
                      title={t('common.delete')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{t('common.delete')}</span>
                    </button>
                  </div>
                </div>

                {/* Quota breakdown */}
                <div>
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2.5">
                    {t('accounts.modelQuotasTitle', { count: modelKeys.length })}
                  </h4>
                  {modelKeys.length === 0 ? (
                    <p className="text-xs text-zinc-500 italic">{t('accounts.noQuotaSyncHint')}</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                      {modelKeys.map((modelKey) => {
                        const m = models[modelKey];
                        const pct = m?.percentage ?? 0;
                        const barColor =
                          pct >= 50
                            ? 'bg-emerald-500'
                            : pct >= 20
                              ? 'bg-amber-500'
                              : 'bg-rose-500';

                        return (
                          <div
                            key={modelKey}
                            className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800/60 flex flex-col justify-between"
                          >
                            <div className="flex items-start justify-between gap-1 mb-1.5">
                              <span className="text-xs font-medium text-zinc-300 truncate" title={modelKey}>
                                {modelKey}
                              </span>
                              <span className="text-xs font-mono font-bold text-zinc-100">{pct}%</span>
                            </div>
                            <div>
                              <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className={`h-1.5 rounded-full transition-all ${barColor}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              {m?.resetTime && (
                                <div className="flex items-center gap-1 text-[10px] text-zinc-500 mt-1">
                                  <Clock className="w-2.5 h-2.5" />
                                  <span>
                                    {formatResetCountdown(
                                      m.resetTime,
                                      t('accounts.resettingNow'),
                                      t('accounts.resetCountdown', { time: '{time}' }),
                                    )}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
