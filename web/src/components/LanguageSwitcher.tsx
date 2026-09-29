import React from 'react';
import { useTranslation, type Language } from '../i18n';

interface LanguageSwitcherProps {
  className?: string;
  compact?: boolean;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ className = '', compact = false }) => {
  const { language, setLanguage } = useTranslation();

  const handleSelect = (lang: Language) => {
    setLanguage(lang);
  };

  return (
    <div
      className={`inline-flex items-center rounded-xl bg-zinc-900 border border-zinc-800 p-0.5 text-xs select-none ${className}`}
      role="group"
      aria-label="Language selector"
    >
      <button
        type="button"
        onClick={() => handleSelect('vi')}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition-all ${
          language === 'vi'
            ? 'bg-zinc-800 text-emerald-400 shadow-sm'
            : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
        }`}
        title="Tiếng Việt"
        aria-pressed={language === 'vi'}
      >
        <span className="text-sm leading-none" role="img" aria-label="Vietnam">
          🇻🇳
        </span>
        <span className={compact ? 'text-[11px]' : 'text-xs'}>VI</span>
      </button>

      <button
        type="button"
        onClick={() => handleSelect('en')}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition-all ${
          language === 'en'
            ? 'bg-zinc-800 text-emerald-400 shadow-sm'
            : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
        }`}
        title="English"
        aria-pressed={language === 'en'}
      >
        <span className="text-sm leading-none" role="img" aria-label="United States">
          🇺🇸
        </span>
        <span className={compact ? 'text-[11px]' : 'text-xs'}>EN</span>
      </button>
    </div>
  );
};
