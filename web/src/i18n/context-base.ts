import { createContext } from 'react';
import type { Language, Translations } from './types';

export interface I18nContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  translations: Translations;
}

export const I18nContext = createContext<I18nContextValue | null>(null);
