import { useState, useEffect, useCallback } from 'react';
import { Language } from '../types';
import { translations, TranslationKey } from './translations';

const LANG_STORAGE_KEY = 'xraymesh_dashboard_lang';

export function useTranslation() {
  const [lang, setLangState] = useState<Language>(() => {
    try {
      return localStorage.getItem(LANG_STORAGE_KEY) === 'fa' ? 'fa' : 'en';
    } catch {
      return 'en';
    }
  });

  const setLang = useCallback((newLang: Language) => {
    setLangState(newLang);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, newLang);
    } catch {
      // Storage blocked: the language still applies for this visit.
    }
  }, []);

  const isRtl = lang === 'fa';

  useEffect(() => {
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang, isRtl]);

  const t = useCallback(
    (key: TranslationKey): string => {
      const dict: Partial<Record<TranslationKey, string>> = translations[lang] || translations.en;
      return dict[key] || translations.en[key] || key;
    },
    [lang]
  );

  return { lang, setLang, isRtl, t };
}
