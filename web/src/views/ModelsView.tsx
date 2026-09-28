import React, { useState } from 'react';
import type { ModelEntry } from '../types';
import { Cpu, Search, Copy, Check, Terminal, Brain, Sparkles, BookOpen } from 'lucide-react';

interface ModelsViewProps {
  models: ModelEntry[];
  proxyPort?: number;
}

export const ModelsView: React.FC<ModelsViewProps> = ({ models, proxyPort = 8044 }) => {
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredModels = models.filter((m) =>
    m.id.toLowerCase().includes(search.toLowerCase()),
  );

  const handleCopy = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
            <Cpu className="w-5 h-5 text-teal-400" />
            Models Catalog ({models.length})
          </h2>
          <p className="text-xs text-zinc-400">
            Danh sách tất cả các models khả dụng được tự động khám phá từ tài khoản Google và sinh các biến thể reasoning.
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Tìm kiếm model..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-4 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500 transition-all"
          />
        </div>
      </div>

      {/* Quick Setup Guide Banner */}
      <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-3">
        <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-emerald-400" />
          Hướng dẫn kết nối nhanh vào các Client
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800/80">
            <div className="flex items-center gap-2 font-semibold text-zinc-300 mb-1">
              <Sparkles className="w-3.5 h-3.5 text-teal-400" />
              <span>Cursor IDE / Cline / Roo Code</span>
            </div>
            <p className="text-zinc-400 text-[11px] mb-1.5">Settings &rarr; Models &rarr; OpenAI Override Base URL:</p>
            <code className="block bg-zinc-900 px-2.5 py-1.5 rounded text-emerald-400 font-mono text-[11px]">
              http://localhost:{proxyPort}/v1
            </code>
          </div>

          <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800/80">
            <div className="flex items-center gap-2 font-semibold text-zinc-300 mb-1">
              <Terminal className="w-3.5 h-3.5 text-amber-400" />
              <span>Claude Code CLI (Official)</span>
            </div>
            <p className="text-zinc-400 text-[11px] mb-1.5">Thiết lập biến môi trường trước khi chạy lệnh `claude`:</p>
            <code className="block bg-zinc-900 px-2.5 py-1.5 rounded text-emerald-400 font-mono text-[11px]">
              export ANTHROPIC_BASE_URL="http://localhost:{proxyPort}"
            </code>
          </div>
        </div>
      </div>

      {/* Models Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredModels.map((model) => {
          const isThinking =
            model.id.includes('thinking') ||
            model.id.includes('-high') ||
            model.id.includes('-medium') ||
            model.id.includes('-low') ||
            model.id.includes('tiered');

          return (
            <div
              key={model.id}
              className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-zinc-200 break-all">{model.id}</span>
                  <button
                    onClick={() => handleCopy(model.id)}
                    className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-all shrink-0"
                    title="Copy Model ID"
                  >
                    {copiedId === model.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-zinc-400" />
                    )}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 mt-3">
                  {isThinking && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium">
                      <Brain className="w-3 h-3" />
                      Thinking
                    </span>
                  )}
                  {model.id.includes('claude') && (
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                      Anthropic
                    </span>
                  )}
                  {model.id.includes('gemini') && (
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-teal-500/10 text-teal-400 border border-teal-500/20 font-medium">
                      Gemini Upstream
                    </span>
                  )}
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-400 font-mono">
                    {model.owned_by}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
