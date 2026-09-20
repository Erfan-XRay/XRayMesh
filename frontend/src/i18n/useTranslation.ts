import { useState, useEffect, useCallback } from 'react';
import { Language } from '../types';
import { translations } from './translations';

const LANG_STORAGE_KEY = 'xraymesh_dashboard_lang';

export function useTranslation() {
  const [lang, setLangState] = useState<Language>(() => {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    return (saved === 'fa' || saved === 'en') ? saved : 'en';
  });

  const setLang = useCallback((newLang: Language) => {
    setLangState(newLang);
    localStorage.setItem(LANG_STORAGE_KEY, newLang);
  }, []);

  const isRtl = lang === 'fa';

  useEffect(() => {
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
    if (isRtl) {
      document.body.classList.add('font-persian');
      document.body.classList.remove('font-sans');
    } else {
      document.body.classList.add('font-sans');
      document.body.classList.remove('font-persian');
    }
  }, [lang, isRtl]);

  const t = useCallback(
    (key: keyof typeof translations.en): string => {
      const dict = translations[lang] || translations.en;
      return dict[key] || translations.en[key] || key;
    },
    [lang]
  );

  return { lang, setLang, isRtl, t };
}
