import React, { useState } from 'react';
import type { ApiKeyItem } from '../types';
import { api } from '../api/client';
import { Key, Plus, Trash2, Copy, Check, Shield } from 'lucide-react';

interface ApiKeysViewProps {
  apiKeys: ApiKeyItem[];
  onReload: () => void;
}

export const ApiKeysView: React.FC<ApiKeysViewProps> = ({ apiKeys, onReload }) => {
  const [showModal, setShowModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyRole, setNewKeyRole] = useState<'client' | 'admin'>('client');
  const [creating, setCreating] = useState(false);
  const [createdKeyData, setCreatedKeyData] = useState<any>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;

    try {
      setCreating(true);
      const res = await api.createApiKey({
        name: newKeyName.trim(),
        role: newKeyRole,
      });
      setCreatedKeyData(res.data);
      onReload();
    } catch (err: any) {
      alert(`Tạo key thất bại: ${err.message}`);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Bạn có chắc muốn xóa API Key [${name}] không?`)) return;

    try {
      await api.deleteApiKey(id);
      onReload();
    } catch (err: any) {
      alert(`Xóa key thất bại: ${err.message}`);
    }
  };

  const handleToggleActive = async (key: ApiKeyItem) => {
    try {
      await api.updateApiKey(key.id, { isActive: !key.isActive });
      onReload();
    } catch (err: any) {
      alert(`Cập nhật thất bại: ${err.message}`);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(text);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const closeModal = () => {
    setShowModal(false);
    setCreatedKeyData(null);
    setNewKeyName('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
            <Key className="w-5 h-5 text-amber-400" />
            Quản lý API Keys ({apiKeys.length})
          </h2>
          <p className="text-xs text-zinc-400">
            Tạo và cấp phát API Key cho từng máy tính hoặc từng tool (Cursor, Claude Code, Cline, Aider) sử dụng proxy.
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-zinc-950 rounded-xl font-semibold text-sm transition-all shadow-lg shadow-emerald-500/20"
        >
          <Plus className="w-4 h-4" />
          <span>Tạo API Key mới</span>
        </button>
      </div>

      {/* Keys Table */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
        {apiKeys.length === 0 ? (
          <div className="p-12 text-center text-zinc-500 text-sm">
            Chưa có API Key nào. Bấm "Tạo API Key mới" để tạo khóa truy cập.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-900/80 border-b border-zinc-800 text-zinc-400 font-medium uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Tên</th>
                  <th className="py-3 px-4">API Key</th>
                  <th className="py-3 px-4">Vai trò</th>
                  <th className="py-3 px-4">Trạng thái</th>
                  <th className="py-3 px-4">Sử dụng gần nhất</th>
                  <th className="py-3 px-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {apiKeys.map((k) => (
                  <tr key={k.id} className="hover:bg-zinc-900/50 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-zinc-200">{k.name}</td>
                    <td className="py-3.5 px-4 font-mono text-zinc-400">
                      <div className="flex items-center gap-2">
                        <span>{k.key}</span>
                        <button
                          onClick={() => copyToClipboard(k.key)}
                          className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300"
                          title="Copy"
                        >
                          {copiedKey === k.key ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded font-mono text-[11px] ${
                          k.role === 'admin'
                            ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                            : 'bg-zinc-800 text-zinc-300'
                        }`}
                      >
                        {k.role}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <button
                        onClick={() => handleToggleActive(k)}
                        className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                          k.isActive
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-zinc-800 text-zinc-500'
                        }`}
                      >
                        {k.isActive ? 'Active' : 'Disabled'}
                      </button>
                    </td>
                    <td className="py-3.5 px-4 text-zinc-400">
                      {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'Chưa dùng'}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => handleDelete(k.id, k.name)}
                        className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-all"
                        title="Xóa key"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
              <Key className="w-4 h-4 text-emerald-400" />
              Tạo API Key mới
            </h3>

            {createdKeyData ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-xs space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                    <Shield className="w-4 h-4" />
                    <span>API Key đã được tạo thành công!</span>
                  </div>
                  <p className="text-zinc-300">
                    Vui lòng copy key bên dưới. Vì lý do bảo mật, key đầy đủ sẽ không hiển thị lại sau khi đóng cửa sổ này.
                  </p>
                  <div className="flex items-center justify-between gap-2 p-2.5 rounded bg-zinc-950 font-mono text-emerald-300 text-xs break-all">
                    <span>{createdKeyData.key}</span>
                    <button
                      onClick={() => copyToClipboard(createdKeyData.key)}
                      className="p-1.5 rounded bg-emerald-500 text-zinc-950 hover:bg-emerald-400 shrink-0 font-sans font-bold"
                    >
                      {copiedKey === createdKeyData.key ? 'Đã copy' : 'Copy'}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={closeModal}
                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-semibold"
                  >
                    Hoàn tất
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Tên định danh</label>
                  <input
                    type="text"
                    required
                    placeholder="Ví dụ: Cursor Máy Bàn, Cline Laptop..."
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Vai trò (Role)</label>
                  <select
                    value={newKeyRole}
                    onChange={(e: any) => setNewKeyRole(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="client">Client (Cursor, Cline, OpenCode, Aider)</option>
                    <option value="admin">Admin (Toàn quyền quản trị API)</option>
                  </select>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-medium"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-zinc-950 rounded-xl text-xs font-semibold disabled:opacity-50"
                  >
                    {creating ? 'Đang tạo...' : 'Tạo Key'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
