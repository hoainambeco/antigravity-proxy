import { useState, useEffect, useCallback } from 'react';
import { Sidebar, type TabType } from './components/Sidebar';
import { Header } from './components/Header';
import { DashboardView } from './views/DashboardView';
import { AccountsView } from './views/AccountsView';
import { RoutingView } from './views/RoutingView';
import { ModelsView } from './views/ModelsView';
import { ApiKeysView } from './views/ApiKeysView';
import { AuditLogsView } from './views/AuditLogsView';
import { LoginView } from './views/LoginView';
import { api } from './api/client';
import { useTranslation } from './i18n';
import { useToast } from './components/Toast';
import type { Account, ApiKeyItem, AuditRecord, ModelEntry, SystemStatus } from './types';

const ADMIN_KEY_STORAGE = 'antigravity_admin_key';

export function App() {
  const { t } = useTranslation();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [adminKey, setAdminKey] = useState<string | null>(
    () => localStorage.getItem(ADMIN_KEY_STORAGE),
  );
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditRecord[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [loading, setLoading] = useState(true);

  const handleAuthed = (key: string) => {
    localStorage.setItem(ADMIN_KEY_STORAGE, key);
    setAdminKey(key);
  };

  const loadData = useCallback(async () => {
    try {
      const [statusRes, accountsRes, modelsRes, apiKeysRes, auditRes] = await Promise.allSettled([
        api.getSystemStatus(),
        api.getAccounts(),
        api.getModels(),
        api.getApiKeys(),
        api.getAuditRequests(),
      ]);

      if (statusRes.status === 'fulfilled') setStatus(statusRes.value);
      if (accountsRes.status === 'fulfilled') setAccounts(accountsRes.value);
      if (modelsRes.status === 'fulfilled') setModels(modelsRes.value);
      if (apiKeysRes.status === 'fulfilled') setApiKeys(apiKeysRes.value);
      if (auditRes.status === 'fulfilled') setAuditLogs(auditRes.value);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    void loadData();
    const interval = setInterval(() => {
      void loadData();
    }, 10000); // Polling every 10 seconds
    return () => clearInterval(interval);
  }, [loadData]);

  const handleSyncAll = async () => {
    try {
      setIsSyncing(true);
      await api.syncAccounts();
      await loadData();
    } catch (err: any) {
      toast.error(t('accounts.syncFailed', { message: err.message }));
    } finally {
      setIsSyncing(false);
    }
  };

  const titles: Record<TabType, { title: string; subtitle: string }> = {
    dashboard: {
      title: t('tabs.dashboard.title'),
      subtitle: t('tabs.dashboard.subtitle'),
    },
    accounts: {
      title: t('tabs.accounts.title'),
      subtitle: t('tabs.accounts.subtitle'),
    },
    routing: {
      title: t('tabs.routing.title'),
      subtitle: t('tabs.routing.subtitle'),
    },
    models: {
      title: t('tabs.models.title'),
      subtitle: t('tabs.models.subtitle'),
    },
    'api-keys': {
      title: t('tabs.apiKeys.title'),
      subtitle: t('tabs.apiKeys.subtitle'),
    },
    audit: {
      title: t('tabs.audit.title'),
      subtitle: t('tabs.audit.subtitle'),
    },
  };

  return adminKey ? (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500/30 selection:text-emerald-300">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} statusPort={status?.port ?? 8044} />

      <div className="flex-1 flex flex-col min-w-0">
        <Header
          title={titles[activeTab].title}
          subtitle={titles[activeTab].subtitle}
          onRefresh={handleSyncAll}
          isRefreshing={isSyncing}
        />

        <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto overflow-y-auto">
          {loading && !status ? (
            <div className="flex items-center justify-center h-64 text-zinc-500 text-sm">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-emerald-500 mr-3" />
              <span>{t('common.loadingGateway')}</span>
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <DashboardView
                  status={status}
                  accounts={accounts}
                  onNavigate={setActiveTab}
                  onSyncAll={handleSyncAll}
                  isSyncing={isSyncing}
                />
              )}
              {activeTab === 'accounts' && <AccountsView accounts={accounts} onReload={loadData} />}
              {activeTab === 'routing' && <RoutingView />}
              {activeTab === 'models' && <ModelsView models={models} proxyPort={status?.port} />}
              {activeTab === 'api-keys' && (
                <ApiKeysView apiKeys={apiKeys} accounts={accounts} onReload={loadData} />
              )}
              {activeTab === 'audit' && (
                <AuditLogsView logs={auditLogs} onReload={loadData} isLoading={isSyncing} />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  ) : (
    <LoginView onAuthed={handleAuthed} />
  );
}

export default App;
