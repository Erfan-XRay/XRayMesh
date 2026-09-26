import React, { useEffect, useRef, useState } from 'react';
import {
  Copy,
  Check,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  ArrowRight,
  CircleAlert,
  CircleCheck,
  TriangleAlert,
  ClipboardPaste,
  ShieldCheck,
  Terminal,
  Monitor,
  Sun,
  Moon,
  Loader2,
} from 'lucide-react';
import { XRayMeshLogo } from '../XRayMeshLogo';
import { Language, ThemeMode } from '../../types';
import type { Translate, TranslationKey } from '../../i18n/translations';
import { btnPrimary, Callout, iconBtn } from '../ui';

interface LoginModalProps {
  isOpen: boolean;
  passwordConfigured?: boolean;
  onLoginPassword: (password: string) => Promise<void>;
  onLoginToken: (token: string) => Promise<void>;
  onCopy: (text: string) => void;
  copiedKey: string | null;
  lang: Language;
  onSelectLang: (lang: Language) => void;
  themeMode: ThemeMode;
  onSelectThemeMode: (mode: ThemeMode) => void;
  /** Shown above the sign-in card, e.g. after this server updated and dropped the session. */
  notice?: string;
  t: Translate;
}

const THEME_CYCLE: Record<ThemeMode, ThemeMode> = { auto: 'light', light: 'dark', dark: 'auto' };
const THEME_ICON: Record<ThemeMode, React.ReactNode> = {
  auto: <Monitor className="w-4 h-4" aria-hidden="true" />,
  light: <Sun className="w-4 h-4" aria-hidden="true" />,
  dark: <Moon className="w-4 h-4" aria-hidden="true" />,
};

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  passwordConfigured = true,
  onLoginPassword,
  onLoginToken,
  onCopy,
  copiedKey,
  lang,
  onSelectLang,
  themeMode,
  onSelectThemeMode,
  notice,
  t,
}) => {
  const [tab, setTab] = useState<'pw' | 'tk'>(passwordConfigured ? 'pw' : 'tk');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!passwordConfigured) setTab('tk');
  }, [passwordConfigured]);

  // Focus the active field whenever the page opens or the method changes.
  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen, tab]);

  if (!isOpen) return null;

  const switchTab = (next: 'pw' | 'tk') => {
    if (next === 'pw' && !passwordConfigured) return;
    setTab(next);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      if (tab === 'pw') {
        await onLoginPassword(password);
      } else {
        await onLoginToken(token.trim());
      }
    } catch (err: any) {
      setError(err.message || t('login_failed'));
      setErrorKey((k) => k + 1);
      inputRef.current?.select();
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setToken(text.trim());
      inputRef.current?.focus();
    } catch {
      inputRef.current?.focus();
    }
  };

  const trackCapsLock = (e: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsLock(e.getModifierState?.('CapsLock') ?? false);
  };

  const tipCmd = 'sudo xraymesh token';
  const value = tab === 'pw' ? password : token;
  const inputClass =
    'w-full h-12 ps-11 bg-input border border-card-border rounded-xl text-sm font-mono text-text-primary placeholder:text-text-subtle placeholder:font-sans transition-[border-color,box-shadow] duration-150 hover:border-border-strong focus:outline-none focus-visible:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15';
  const themeLabel = `${t('theme_mode')}: ${t(`theme_${themeMode}` as TranslationKey)}`;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-canvas"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-title"
      aria-describedby="login-desc"
    >
      {/* Ambient backdrop */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="login-grid absolute inset-0" />
        <div className="absolute -top-56 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 w-[44rem] h-[30rem] rounded-full bg-primary/15 blur-3xl" />
      </div>

      {/* Preferences */}
      <div className="fixed top-3 end-3 sm:top-4 sm:end-4 z-10 flex items-center gap-1 p-1 rounded-2xl bg-card border border-card-border shadow-card">
        <button
          type="button"
          onClick={() => onSelectLang(lang === 'fa' ? 'en' : 'fa')}
          className={`${iconBtn} w-auto px-3 text-sm font-semibold`}
          title={lang === 'fa' ? 'Switch to English' : 'تغییر به فارسی'}
          aria-label={lang === 'fa' ? 'Switch to English' : 'تغییر به فارسی'}
        >
          {lang === 'fa' ? <span lang="en">EN</span> : <span lang="fa" className="font-persian">فا</span>}
        </button>
        <button type="button" onClick={() => onSelectThemeMode(THEME_CYCLE[themeMode])} className={iconBtn} title={themeLabel} aria-label={themeLabel}>
          {THEME_ICON[themeMode]}
        </button>
      </div>

      <main className="relative min-h-full flex flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-[26rem] animate-modal-in">
          {/* Brand */}
          <div className="flex flex-col items-center text-center mb-7">
            <XRayMeshLogo className="w-14 h-14 mb-5" size={56} glow />
            <h1 id="login-title" className="text-2xl font-bold tracking-tight text-text-primary">
              {t('modal_login_title')}
            </h1>
            <p id="login-desc" className="mt-2 text-sm text-text-muted max-w-xs leading-relaxed">
              {t('modal_login_desc')}
            </p>
          </div>

          {notice && (
            <Callout role="status" tone="success" icon={<CircleCheck className="w-4 h-4" />} className="mb-4">
              {notice}
            </Callout>
          )}

          {/* Card */}
          <div className="rounded-2xl bg-card border border-card-border shadow-pop p-5 sm:p-7">
            {/* Method switch */}
            <div className="relative grid grid-cols-2 p-1 mb-6 rounded-xl bg-surface border border-card-border" role="tablist" aria-label={t('modal_login_title')}>
              <span
                className={`absolute top-1 bottom-1 w-[calc(50%-0.25rem)] rounded-lg bg-card shadow-card transition-[inset-inline-start] duration-300 ease-spring ${
                  tab === 'pw' ? 'start-1' : 'start-1/2'
                }`}
                aria-hidden="true"
              />
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'pw'}
                aria-disabled={!passwordConfigured}
                onClick={() => switchTab('pw')}
                title={!passwordConfigured ? t('modal_login_token_only_notice') : undefined}
                className={`relative z-10 h-9 flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
                  tab === 'pw'
                    ? 'text-text-primary'
                    : passwordConfigured
                    ? 'text-text-muted hover:text-text-primary cursor-pointer'
                    : 'text-text-subtle opacity-50 cursor-not-allowed'
                }`}
              >
                <Lock className={`w-4 h-4 ${tab === 'pw' ? 'text-primary' : ''}`} aria-hidden="true" />
                <span>{t('modal_login_tab_pw')}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'tk'}
                onClick={() => switchTab('tk')}
                className={`relative z-10 h-9 flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors duration-200 cursor-pointer ${
                  tab === 'tk' ? 'text-text-primary' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <KeyRound className={`w-4 h-4 ${tab === 'tk' ? 'text-primary' : ''}`} aria-hidden="true" />
                <span>{t('modal_login_tab_tk')}</span>
              </button>
            </div>

            {!passwordConfigured && (
              <Callout tone="warning" icon={<TriangleAlert className="w-4 h-4" />} className="mb-4 animate-fade-in">
                {t('modal_login_token_only_notice')}
              </Callout>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div key={tab} className="animate-fade-in">
                <label htmlFor="login-secret" className="block mb-2 text-sm font-medium text-text-primary">
                  {tab === 'pw' ? t('modal_login_pw_label') : t('modal_login_tk_label')}
                </label>
                {/* Secrets are always Latin, so the whole field (icons + padding) stays LTR. */}
                <div className="relative" dir="ltr">
                  <span className="absolute inset-y-0 start-0 w-11 flex items-center justify-center text-text-muted pointer-events-none">
                    {tab === 'pw' ? <Lock className="w-4 h-4" aria-hidden="true" /> : <KeyRound className="w-4 h-4" aria-hidden="true" />}
                  </span>
                  {tab === 'pw' ? (
                    <input
                      ref={inputRef}
                      id="login-secret"
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={trackCapsLock}
                      onKeyUp={trackCapsLock}
                      onBlur={() => setCapsLock(false)}
                      placeholder={t('modal_login_pw_placeholder')}
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? 'login-error' : undefined}
                      className={`${inputClass} pe-12`}
                    />
                  ) : (
                    <input
                      ref={inputRef}
                      id="login-secret"
                      type="text"
                      name="token"
                      autoComplete="one-time-code"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder={t('modal_login_tk_placeholder')}
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? 'login-error' : undefined}
                      className={`${inputClass} pe-12`}
                    />
                  )}
                  <span className="absolute inset-y-0 end-1.5 flex items-center">
                    {tab === 'pw' ? (
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="h-9 w-9 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-hover transition-colors cursor-pointer"
                        aria-label={showPassword ? t('modal_login_hide_pw') : t('modal_login_show_pw')}
                        title={showPassword ? t('modal_login_hide_pw') : t('modal_login_show_pw')}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handlePaste}
                        className="h-9 w-9 flex items-center justify-center rounded-lg text-text-muted hover:text-primary hover:bg-hover transition-colors cursor-pointer"
                        aria-label={t('invite_btn_paste')}
                        title={t('invite_btn_paste')}
                      >
                        <ClipboardPaste className="w-4 h-4" aria-hidden="true" />
                      </button>
                    )}
                  </span>
                </div>

                {tab === 'pw' && capsLock && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-warning animate-fade-in" role="status">
                    <TriangleAlert className="w-3.5 h-3.5" aria-hidden="true" />
                    {t('modal_login_caps_lock')}
                  </p>
                )}
              </div>

              {error && (
                <div
                  key={errorKey}
                  id="login-error"
                  className="login-shake flex items-start gap-2.5 p-3 rounded-xl bg-danger-subtle border border-danger-border text-sm text-danger"
                  role="alert"
                  aria-live="assertive"
                >
                  <CircleAlert className="w-4 h-4 mt-[0.2em] shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || !value.trim()}
                className={`${btnPrimary} group w-full h-12`}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    <span>{t('login_verifying')}</span>
                  </>
                ) : (
                  <>
                    <span>{t('btn_signin')}</span>
                    <ArrowRight
                      className="w-4 h-4 rtl:-scale-x-100 transition-transform duration-200 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5"
                      aria-hidden="true"
                    />
                  </>
                )}
              </button>
            </form>

            {/* Token helper */}
            <div className="mt-6 pt-5 border-t border-card-border">
              <p className="mb-2 flex items-center gap-1.5 text-xs text-text-muted">
                <Terminal className="w-3.5 h-3.5 text-text-subtle" aria-hidden="true" />
                {t('modal_login_tip_title')}
              </p>
              <div className="flex items-center gap-2 ps-3.5 pe-1.5 py-1.5 rounded-xl bg-surface border border-card-border" dir="ltr">
                <code className="flex-1 min-w-0 truncate text-xs font-mono text-text-primary">
                  <span className="text-primary select-none">$ </span>
                  {tipCmd}
                </code>
                <button
                  type="button"
                  onClick={() => onCopy(tipCmd)}
                  className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg text-text-muted hover:text-primary hover:bg-hover transition-colors cursor-pointer"
                  title={t('btn_copy_command')}
                  aria-label={t('btn_copy_command')}
                >
                  {copiedKey === tipCmd ? <Check className="w-4 h-4 text-success" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
                </button>
              </div>
            </div>
          </div>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-text-subtle">
            <ShieldCheck className="w-3.5 h-3.5 text-success" aria-hidden="true" />
            {t('modal_login_secure_note')}
          </p>
        </div>
      </main>
    </div>
  );
};
