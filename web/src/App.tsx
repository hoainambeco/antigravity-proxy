import { useState, useEffect, useCallback } from 'react';
import { Sidebar, type TabType } from './components/Sidebar';
import { Header } from './components/Header';
import { DashboardView } from './views/DashboardView';
import { AccountsView } from './views/AccountsView';
import { ModelsView } from './views/ModelsView';
import { ApiKeysView } from './views/ApiKeysView';
import { AuditLogsView } from './views/AuditLogsView';
import { api } from './api/client';
import type { Account, ApiKeyItem, AuditRecord, ModelEntry, SystemStatus } from './types';

export function App() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditRecord[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [loading, setLoading] = useState(true);

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
    loadData();
    const interval = setInterval(loadData, 10000); // Polling every 10 seconds
    return () => clearInterval(interval);
  }, [loadData]);

  const handleSyncAll = async () => {
    try {
      setIsSyncing(true);
      await api.syncAccounts();
      await loadData();
    } catch (err: any) {
      alert(`Sync failed: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const titles: Record<TabType, { title: string; subtitle: string }> = {
    dashboard: {
      title: 'Tổng quan Hệ thống',
      subtitle: 'Trạng thái hoạt động, hạn mức models và các thông số gateway',
    },
    accounts: {
      title: 'Quản lý Tài khoản & Quota',
      subtitle: 'Danh sách các tài khoản Google Cloud Code và tiến trình hạn mức theo thời gian thực',
    },
    models: {
      title: 'Danh mục Models & Routing',
      subtitle: 'Các models đang khả dụng được phục vụ cho Cursor, Claude Code, Cline và OpenAI SDK',
    },
    'api-keys': {
      title: 'Quản lý Khóa API Key',
      subtitle: 'Tạo, phân quyền và thu hồi API Key truy cập vào proxy gateway',
    },
    audit: {
      title: 'Nhật ký Traffic & Lỗi',
      subtitle: 'Lịch sử cuộc gọi, thời gian phản hồi, mã lỗi và token thống kê',
    },
  };

  return (
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
              <span>Đang kết nối tới Gateway...</span>
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
              {activeTab === 'models' && <ModelsView models={models} proxyPort={status?.port} />}
              {activeTab === 'api-keys' && <ApiKeysView apiKeys={apiKeys} onReload={loadData} />}
              {activeTab === 'audit' && (
                <AuditLogsView logs={auditLogs} onReload={loadData} isLoading={isSyncing} />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
