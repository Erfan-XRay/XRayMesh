import React, { useId } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardPaste } from 'lucide-react';
import type { Translate } from '../../i18n/translations';
import { fillTemplate } from '../../i18n/fillTemplate';
import { InviteParseResult } from '../../utils/meshInvite';
import { FieldError, PROTOCOL_TEXT } from './FormControls';

interface InviteCodeFieldProps {
  value: string;
  onChange: (value: string) => void;
  parsed: InviteParseResult;
  disabled?: boolean;
  autoFocus?: boolean;
  t: Translate;
}

const canReadClipboard = () =>
  typeof navigator !== 'undefined' && Boolean(navigator.clipboard?.readText) && window.isSecureContext;

export const InviteCodeField: React.FC<InviteCodeFieldProps> = ({ value, onChange, parsed, disabled, autoFocus, t }) => {
  const id = useId();
  const errorId = `${id}-error`;
  const hasError = parsed.status === 'invalid' || parsed.status === 'incomplete';

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) onChange(text);
    } catch {
      // Clipboard permission denied: the user can still paste into the box manually.
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-text-main">
          {t('invite_label')}
        </label>
        {canReadClipboard() && (
          <button
            type="button"
            onClick={handlePaste}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 min-h-8 px-2 rounded-lg text-xs font-medium text-primary hover:bg-primary-subtle transition-colors cursor-pointer disabled:opacity-50"
          >
            <ClipboardPaste className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t('invite_btn_paste')}</span>
          </button>
        )}
      </div>
      <textarea
        id={id}
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder="xrmesh://..."
        dir="ltr"
        spellCheck={false}
        autoComplete="off"
        aria-invalid={hasError}
        aria-describedby={hasError ? errorId : undefined}
        className={`w-full px-3 py-2.5 rounded-xl border bg-input font-mono text-xs leading-relaxed text-text-main placeholder:text-text-subtle break-all resize-none focus:outline-none transition-colors disabled:opacity-60 ${
          hasError ? 'border-rose-500/70' : 'border-card-border hover:border-card-border-hover'
        }`}
      />

      {parsed.status === 'invalid' && (
        <FieldError
          id={errorId}
          message={fillTemplate(t('invite_err_invalid'), { prefix: <bdi dir="ltr">xrmesh://</bdi> })}
        />
      )}
      {parsed.status === 'incomplete' && <FieldError id={errorId} message={t('invite_err_incomplete')} />}

      {parsed.status === 'ok' && (
        <div className="mt-1 p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 animate-fade-in">
          <dl className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-text-muted">{t('node_label_network')}</dt>
            <dd className="flex items-center gap-1.5 min-w-0 font-medium text-text-main">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" aria-hidden="true" />
              <bdi className="truncate">{parsed.invite.net}</bdi>
            </dd>
            {parsed.invite.endpoint && (
              <>
                <dt className="text-text-muted">{t('invite_preview_endpoint')}</dt>
                <dd className="text-text-main break-all">
                  <bdi dir="ltr" className="font-mono">
                    {parsed.invite.endpoint}
                  </bdi>
                </dd>
              </>
            )}
            <dt className="text-text-muted">{t('node_label_protocol')}</dt>
            <dd className="text-text-main">{t(PROTOCOL_TEXT[parsed.invite.proto][0])}</dd>
          </dl>
          {!parsed.invite.endpoint && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-400 leading-relaxed">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
              <span>{t('invite_no_endpoint')}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
};
