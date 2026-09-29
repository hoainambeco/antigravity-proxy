import React, { useEffect, useState } from 'react';
import { Route, Plus, Trash2, Edit2, Save, RefreshCw, Check } from 'lucide-react';
import type { RoutingConfig, RoutingRule } from '../types';
import { api } from '../api/client';
import { useTranslation } from '../i18n';
import { useToast } from '../components/Toast';

const ALL_PROVIDERS = [
  { id: 'google', label: 'Google Antigravity', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  { id: 'anthropic_api', label: 'Claude (API Key)', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  { id: 'anthropic_oauth', label: 'Claude (CLI OAuth)', color: 'bg-orange-500/10 text-orange-400 border-orange-500/30' },
  { id: 'anthropic_web', label: 'Claude (Web Session)', color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' },
  { id: 'copilot', label: 'GitHub Copilot', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  { id: 'openai_api', label: 'OpenAI (API Key)', color: 'bg-green-500/10 text-green-400 border-green-500/30' },
  { id: 'chatgpt_web', label: 'ChatGPT (Web OAuth)', color: 'bg-teal-500/10 text-teal-400 border-teal-500/30' },
];

export const RoutingView: React.FC = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const [config, setConfig] = useState<RoutingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // Form state
  const [pattern, setPattern] = useState('');
  const [pipeline, setPipeline] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [rawMode, setRawMode] = useState(false);
  const [rawJson, setRawJson] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const data = await api.getRoutingConfig();
      setConfig(data);
      setRawJson(JSON.stringify(data, null, 2));
    } catch (err: any) {
      toast.error(t('routing.loadFailed', { message: err.message }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleOpenAdd = () => {
    setEditingIndex(null);
    setPattern('');
    setPipeline(['google']);
    setDescription('');
    setShowModal(true);
  };

  const handleOpenEdit = (index: number) => {
    if (!config) return;
    const rule = config.rules[index];
    setEditingIndex(index);
    setPattern(rule.pattern);
    setPipeline([...rule.pipeline]);
    setDescription(rule.description || '');
    setShowModal(true);
  };

  const handleDeleteRule = async (index: number) => {
    if (!config) return;
    const confirmed = await toast.confirm(t('routing.deleteConfirmMessage'), {
      title: t('routing.deleteConfirmTitle'),
      danger: true,
      confirmLabel: t('routing.deleteRule'),
      cancelLabel: t('routing.cancel'),
    });
    if (!confirmed) return;

    const newRules = config.rules.filter((_, idx) => idx !== index);
    const updated = { ...config, rules: newRules };
    await saveNewConfig(updated);
  };

  const handleSaveModal = async () => {
    if (!pattern.trim()) {
      toast.warning(t('routing.patternRequired'));
      return;
    }
    if (pipeline.length === 0) {
      toast.warning(t('routing.pipelineRequired'));
      return;
    }
    if (!config) return;

    const newRule: RoutingRule = {
      pattern: pattern.trim(),
      pipeline,
      description: description.trim(),
    };

    let newRules = [...config.rules];
    if (editingIndex !== null) {
      newRules[editingIndex] = newRule;
    } else {
      newRules.push(newRule);
    }

    const updated = { ...config, rules: newRules };
    await saveNewConfig(updated);
    setShowModal(false);
  };

  const saveNewConfig = async (newConfig: RoutingConfig) => {
    try {
      setSaving(true);
      await api.updateRoutingConfig(newConfig);
      setConfig(newConfig);
      setRawJson(JSON.stringify(newConfig, null, 2));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: any) {
      toast.error(t('routing.saveFailed', { message: err.message }));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRaw = async () => {
    try {
      const parsed = JSON.parse(rawJson);
      await saveNewConfig(parsed);
    } catch (err: any) {
      toast.error(t('routing.invalidJson', { message: err.message }));
    }
  };

  const toggleProviderInPipeline = (providerId: string) => {
    if (pipeline.includes(providerId)) {
      setPipeline(pipeline.filter((p) => p !== providerId));
    } else {
      setPipeline([...pipeline, providerId]);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-zinc-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" /> {t('routing.loading')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
            <Route className="w-5 h-5 text-emerald-400" />
            {t('routing.ruleBasedTitle')}
          </h2>
          <p className="text-xs text-zinc-400">
            {t('routing.ruleBasedDesc')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {saveSuccess && (
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <Check className="w-4 h-4" /> {t('routing.saved')}
            </span>
          )}
          <button
            onClick={() => setRawMode(!rawMode)}
            className="px-3 py-1.5 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-xs font-medium text-zinc-300 transition-colors"
          >
            {rawMode ? t('routing.visualMode') : t('routing.rawJsonMode')}
          </button>
          {!rawMode && (
            <button
              onClick={handleOpenAdd}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-semibold text-xs shadow-md transition-all"
            >
              <Plus className="w-4 h-4" /> {t('routing.addRule')}
            </button>
          )}
        </div>
      </div>

      {rawMode ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
          <textarea
            value={rawJson}
            onChange={(e) => setRawJson(e.target.value)}
            className="w-full h-96 bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs font-mono text-zinc-200 focus:outline-none focus:border-emerald-500"
          />
          <button
            disabled={saving}
            onClick={handleSaveRaw}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-semibold text-xs transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4" /> {saving ? t('routing.saving') : t('common.save')}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Rules list */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden divide-y divide-zinc-800/80">
            {config?.rules.map((rule, idx) => (
              <div key={idx} className="p-4 hover:bg-zinc-800/30 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      {rule.pattern}
                    </span>
                    {rule.description && (
                      <span className="text-xs text-zinc-400">{rule.description}</span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-zinc-500">{t('routing.pipelineLabel')}</span>
                    {rule.pipeline.map((p, pIdx) => {
                      const providerMeta = ALL_PROVIDERS.find((item) => item.id === p);
                      return (
                        <React.Fragment key={pIdx}>
                          <span
                            className={`text-xs px-2 py-0.5 rounded border font-medium ${
                              providerMeta?.color || 'bg-zinc-800 text-zinc-300 border-zinc-700'
                            }`}
                          >
                            {pIdx + 1}. {providerMeta?.label || p}
                          </span>
                          {pIdx < rule.pipeline.length - 1 && (
                            <span className="text-xs text-zinc-600">➔</span>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end md:self-center">
                  <button
                    onClick={() => handleOpenEdit(idx)}
                    className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
                    title={t('routing.editTooltip')}
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteRule(idx)}
                    className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded-lg transition-colors"
                    title={t('routing.deleteTooltip')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            {(!config?.rules || config.rules.length === 0) && (
              <div className="p-8 text-center text-xs text-zinc-500">
                {t('routing.noRules')}
              </div>
            )}
          </div>

          {/* Default pipeline */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2">
              {t('routing.defaultPipelineTitle')}
            </h3>
            <div className="flex flex-wrap items-center gap-1.5">
              {config?.default_pipeline.map((p, pIdx) => {
                const providerMeta = ALL_PROVIDERS.find((item) => item.id === p);
                return (
                  <React.Fragment key={pIdx}>
                    <span
                      className={`text-xs px-2.5 py-1 rounded border font-medium ${
                        providerMeta?.color || 'bg-zinc-800 text-zinc-300 border-zinc-700'
                      }`}
                    >
                      {pIdx + 1}. {providerMeta?.label || p}
                    </span>
                    {pIdx < config.default_pipeline.length - 1 && (
                      <span className="text-xs text-zinc-600">➔</span>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Edit / Add Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg p-6 space-y-5 shadow-2xl">
            <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
              <Route className="w-5 h-5 text-emerald-400" />
              {editingIndex !== null ? t('routing.editRule') : t('routing.addRule')}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  {t('routing.patternLabel')}
                </label>
                <input
                  type="text"
                  value={pattern}
                  onChange={(e) => setPattern(e.target.value)}
                  placeholder={t('routing.patternPlaceholder')}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  {t('routing.descriptionLabel')}
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('routing.descriptionPlaceholder')}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-2">
                  {t('routing.providersLabel')}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ALL_PROVIDERS.map((prov) => {
                    const isSelected = pipeline.includes(prov.id);
                    const order = pipeline.indexOf(prov.id) + 1;
                    return (
                      <button
                        type="button"
                        key={prov.id}
                        onClick={() => toggleProviderInPipeline(prov.id)}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                          isSelected
                            ? `${prov.color} shadow-sm ring-1 ring-emerald-500/50`
                            : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                        }`}
                      >
                        <span>{prov.label}</span>
                        {isSelected && (
                          <span className="w-5 h-5 rounded-full bg-emerald-500 text-zinc-950 text-[10px] font-bold flex items-center justify-center">
                            #{order}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-3.5 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                {t('routing.cancel')}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveModal}
                className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-zinc-950 text-xs font-semibold shadow-md transition-all disabled:opacity-50"
              >
                {saving ? t('routing.saving') : t('routing.saveRule')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
