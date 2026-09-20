import React, { useState } from 'react';
import { Copy, Check, Lock, Key, Layers, Loader2 } from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onLoginPassword: (password: string) => Promise<void>;
  onLoginToken: (token: string) => Promise<void>;
  onCopy: (text: string) => void;
  copiedKey: string | null;
  t: (key: any) => string;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onLoginPassword,
  onLoginToken,
  onCopy,
  copiedKey,
  t,
}) => {
  const [tab, setTab] = useState<'pw' | 'tk'>('pw');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      if (tab === 'pw') {
        await onLoginPassword(password);
      } else {
        await onLoginToken(token);
      }
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const tipCmd = 'sudo ./xraymesh.sh token';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-modal-in">
      <div className="w-full max-w-md p-6 rounded-2xl bg-slate-900 border border-white/15 shadow-2xl text-center relative">
        {/* Brand Icon */}
        <div className="w-12 h-12 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center text-primary mx-auto mb-3.5 shadow-md">
          <Layers className="w-6 h-6" />
        </div>

        <h2 className="text-lg font-bold text-text-main">{t('modal_login_title')}</h2>
        <p className="text-xs text-text-muted mt-1 mb-5">{t('modal_login_desc')}</p>

        {/* Tab switch */}
        <div className="inline-flex rounded-xl bg-white/5 border border-white/10 p-1 mb-4 w-full">
          <button
            type="button"
            onClick={() => {
              setTab('pw');
              setError(null);
            }}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
              tab === 'pw'
                ? 'bg-primary text-black font-semibold shadow'
                : 'text-text-muted hover:text-text-main'
            }`}
          >
            {t('modal_login_tab_pw')}
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('tk');
              setError(null);
            }}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
              tab === 'tk'
                ? 'bg-primary text-black font-semibold shadow'
                : 'text-text-muted hover:text-text-main'
            }`}
          >
            {t('modal_login_tab_tk')}
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {tab === 'pw' ? (
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('modal_login_pw_placeholder')}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-white/15 rounded-xl text-sm font-mono text-center text-text-main placeholder-text-subtle focus:outline-none focus:border-primary"
                required
              />
            </div>
          ) : (
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={t('modal_login_tk_placeholder')}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-white/15 rounded-xl text-sm font-mono text-center text-text-main placeholder-text-subtle focus:outline-none focus:border-primary"
                required
              />
            </div>
          )}

          {error && <div className="text-xs text-rose-400 font-medium">{error}</div>}

          <button
            type="submit"
            disabled={isLoading || (tab === 'pw' ? !password : !token)}
            className="w-full py-2.5 rounded-xl bg-primary text-black font-semibold text-sm hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all shadow-md"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            <span>{t('btn_signin')}</span>
          </button>
        </form>

        {/* Token helper note */}
        <div className="mt-5 p-3 rounded-xl bg-primary/10 border border-dashed border-primary/30 flex items-center justify-between text-left">
          <div>
            <div className="text-[10px] text-text-muted">{t('modal_login_tip_title')}</div>
            <div className="text-xs font-mono font-semibold text-primary mt-0.5">{tipCmd}</div>
          </div>
          <button
            onClick={() => onCopy(tipCmd)}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-primary border border-primary/30 transition-colors"
            title={t('btn_copied')}
          >
            {copiedKey === tipCmd ? <Check className="w-3.5 h-3.5 text-accent-green" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
};
