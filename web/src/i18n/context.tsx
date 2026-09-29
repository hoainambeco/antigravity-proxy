import React, { useState, useEffect, useMemo } from 'react';
import type { Language, Translations } from './types';
import { en } from './locales/en';
import { vi } from './locales/vi';
import { I18nContext } from './context-base';

const LOCALE_STORAGE_KEY = 'antigravity_language';

const translationsMap: Record<Language, Translations> = {
  en,
  vi,
};

function getNestedValue(obj: any, path: string): string | undefined {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return typeof current === 'string' ? current : undefined;
}

function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, key) => {
    return key in params ? String(params[key]) : match;
  });
}

function detectInitialLanguage(): Language {
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored === 'en' || stored === 'vi') {
    return stored;
  }
  const browserLang = navigator.language.toLowerCase();
  if (browserLang.startsWith('vi')) {
    return 'vi';
  }
  return 'en';
}

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(detectInitialLanguage);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem(LOCALE_STORAGE_KEY, lang);
    document.documentElement.lang = lang;
  };

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo(() => {
    const currentTranslations = translationsMap[language] || translationsMap.en;

    const t = (key: string, params?: Record<string, string | number>): string => {
      let val = getNestedValue(currentTranslations, key);
      if (val === undefined) {
        // Fallback to English
        val = getNestedValue(translationsMap.en, key);
      }
      if (val === undefined) {
        return key;
      }
      return interpolate(val, params);
    };

    return {
      language,
      setLanguage,
      t,
      translations: currentTranslations,
    };
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};
