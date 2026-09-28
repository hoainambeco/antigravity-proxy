import type { Account, ApiKeyItem, AuditRecord, ModelEntry, SystemStatus } from '../types';

const BASE_URL = '';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const savedKey = localStorage.getItem('antigravity_admin_key') || '';
  const headers: Record<string, string> = {
    ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
    ...(savedKey ? { Authorization: `Bearer ${savedKey}` } : {}),
    ...(options?.headers as Record<string, string>),
  };

  const res = await fetch(`${BASE_URL}${url}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const errorText = await res.text();
    let message = `Request failed: ${res.status} ${res.statusText}`;
    try {
      const parsed = JSON.parse(errorText);
      message = parsed.error?.message || parsed.message || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json();
}

export const api = {
  getSystemStatus: () => fetchJson<SystemStatus>('/internal/system/status'),

  getAccounts: async () => {
    const res = await fetchJson<{ data: Account[]; total: number }>('/internal/accounts');
    return res.data;
  },

  syncAccounts: (id?: string) =>
    fetchJson<{ success: boolean; message: string }>(
      id ? `/internal/accounts/sync?id=${encodeURIComponent(id)}` : '/internal/accounts/sync',
      { method: 'POST' },
    ),

  deleteAccount: (id: string) =>
    fetchJson<{ success: boolean; message: string }>(`/internal/accounts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  getOAuthUrl: (customRedirectUri?: string) =>
    fetchJson<{ url: string }>(
      customRedirectUri
        ? `/internal/accounts/oauth/url?redirect_uri=${encodeURIComponent(customRedirectUri)}`
        : '/internal/accounts/oauth/url',
    ),

  getModels: async () => {
    const res = await fetchJson<{ data: ModelEntry[] }>('/v1/models');
    return res.data;
  },

  getApiKeys: async () => {
    const res = await fetchJson<{ success: boolean; data: ApiKeyItem[] }>('/internal/api-keys');
    return res.data;
  },

  createApiKey: (data: { name: string; role?: 'admin' | 'client'; description?: string }) =>
    fetchJson<{ success: boolean; data: ApiKeyItem }>('/internal/api-keys', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateApiKey: (id: string, data: { name?: string; isActive?: boolean }) =>
    fetchJson<{ success: boolean; data: ApiKeyItem }>(`/internal/api-keys/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteApiKey: (id: string) =>
    fetchJson<{ success: boolean }>(`/internal/api-keys/${id}`, {
      method: 'DELETE',
    }),

  getAuditRequests: async () => {
    try {
      const res = await fetchJson<{ data: AuditRecord[] }>('/internal/audit/requests');
      return res.data || [];
    } catch {
      return [];
    }
  },
};
