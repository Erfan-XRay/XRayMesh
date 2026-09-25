import React, { useId, useState } from 'react';
import { AlertCircle, ChevronDown, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { MeshProtocol } from '../../types';
import type { Translate, TranslationKey } from '../../i18n/translations';
import { MESH_PROTOCOLS, toAsciiDigits } from '../../utils/meshInvite';

// Opacity modifiers do not compile for CSS-variable colors (e.g. bg-primary/10),
// so tinted states use the palette's *-subtle / *-border tokens instead.
const BTN = 'inline-flex items-center justify-center gap-2 min-h-10 px-4 rounded-xl text-sm font-semibold transition-colors active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 cursor-pointer';
export const btnPrimary = `${BTN} bg-primary text-on-primary hover:bg-primary-hover`;
export const btnSecondary = `${BTN} bg-surface border border-card-border text-text-main hover:border-card-border-hover`;
export const btnGhost = `${BTN} text-text-muted hover:text-text-main hover:bg-surface`;
export const btnDanger = `${BTN} bg-accent-red text-white hover:opacity-90`;
export const btnWarning = `${BTN} bg-amber-500 text-black hover:bg-amber-400`;
// Compact variants for dense rows (tables, lists).
const BTN_SM = 'inline-flex items-center justify-center gap-1.5 min-h-8 px-3 rounded-lg text-xs font-semibold transition-colors active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap';
export const btnPrimarySm = `${BTN_SM} bg-primary text-on-primary hover:bg-primary-hover`;
export const btnSecondarySm = `${BTN_SM} bg-surface border border-card-border text-text-main hover:border-card-border-hover`;
export const btnGhostSm = `${BTN_SM} text-text-muted hover:text-text-main hover:bg-surface`;
export const btnDangerSoft = `${BTN} border border-rose-500/30 text-rose-400 hover:bg-rose-500/10`;
export const iconBtn = 'inline-flex items-center justify-center w-10 h-10 rounded-xl text-text-muted hover:text-text-main hover:bg-surface transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';
export const cardClass = 'rounded-2xl bg-card border border-card-border backdrop-blur-xl shadow-lg';

const inputClass = (invalid: boolean) =>
  `w-full min-h-10 px-3 py-2 rounded-xl border bg-input text-sm text-text-main placeholder:text-text-subtle transition-colors focus:outline-none disabled:opacity-60 ${
    invalid ? 'border-rose-500/70' : 'border-card-border hover:border-card-border-hover'
  }`;

export const FieldError: React.FC<{ id?: string; message: React.ReactNode }> = ({ id, message }) => (
  <p id={id} role="alert" className="flex items-start gap-1.5 text-xs text-rose-400 leading-relaxed">
    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
    <span>{message}</span>
  </p>
);

/** A failed server action: localized message first, raw server output tucked behind "Details". */
export const ErrorPanel: React.FC<{ message: string; details?: string; t: Translate }> = ({ message, details, t }) => (
  <div role="alert" className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-sm animate-fade-in">
    <p className="flex items-start gap-2 text-rose-400 leading-relaxed">
      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </p>
    {details && (
      <details className="mt-2 ms-6">
        <summary className="text-xs text-text-muted cursor-pointer select-none">{t('join_err_details')}</summary>
        <pre dir="ltr" className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-text-muted">
          {details}
        </pre>
      </details>
    )}
  </div>
);

/** Hint and error share one slot below the input so the layout does not jump. */
const FieldFootnote: React.FC<{ id: string; hint?: string; error?: string | null }> = ({ id, hint, error }) => {
  if (error) return <FieldError id={`${id}-error`} message={error} />;
  if (hint) return <p id={`${id}-hint`} className="text-xs text-text-muted leading-relaxed">{hint}</p>;
  return null;
};

const describedBy = (id: string, hint?: string, error?: string | null) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  hint?: string;
  error?: string | null;
  placeholder?: string;
  /** Technical values (IPs, ports, hostnames) render LTR in monospace. */
  technical?: boolean;
  /** Converts Persian/Arabic digits typed on a local keyboard to ASCII. */
  numeric?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  maxLength?: number;
}

export const TextField: React.FC<TextFieldProps> = ({
  label,
  value,
  onChange,
  onBlur,
  hint,
  error,
  placeholder,
  technical,
  numeric,
  disabled,
  autoFocus,
  maxLength,
}) => {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <label htmlFor={id} className="text-sm font-medium text-text-main">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(numeric ? toAsciiDigits(e.target.value) : e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        maxLength={maxLength}
        dir={technical ? 'ltr' : undefined}
        inputMode={numeric ? 'decimal' : undefined}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy(id, hint, error)}
        className={`${inputClass(Boolean(error))} ${technical ? 'font-mono' : ''}`}
      />
      <FieldFootnote id={id} hint={hint} error={error} />
    </div>
  );
};

interface SecretFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onGenerate?: () => void;
  hint?: string;
  error?: string | null;
  disabled?: boolean;
  t: Translate;
}

export const SecretField: React.FC<SecretFieldProps> = ({ label, value, onChange, onBlur, onGenerate, hint, error, disabled, t }) => {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <label htmlFor={id} className="text-sm font-medium text-text-main">
        {label}
      </label>
      {/* LTR like the value itself, so the buttons land on the same side as the input's end padding. */}
      <div className="relative" dir="ltr">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          dir="ltr"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy(id, hint, error)}
          className={`${inputClass(Boolean(error))} font-mono ${onGenerate ? 'pe-20' : 'pe-11'}`}
        />
        <div className="absolute inset-y-0 end-1 flex items-center">
          {onGenerate && (
            <button
              type="button"
              onClick={() => {
                onGenerate();
                setVisible(true);
              }}
              disabled={disabled}
              title={t('node_secret_generate')}
              aria-label={t('node_secret_generate')}
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-text-muted hover:text-text-main hover:bg-surface transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            title={visible ? t('node_secret_hide') : t('node_secret_show')}
            aria-label={visible ? t('node_secret_hide') : t('node_secret_show')}
            aria-pressed={visible}
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-text-muted hover:text-text-main hover:bg-surface transition-colors cursor-pointer"
          >
            {visible ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
          </button>
        </div>
      </div>
      <FieldFootnote id={id} hint={hint} error={error} />
    </div>
  );
};

interface SwitchFieldProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export const SwitchField: React.FC<SwitchFieldProps> = ({ label, hint, checked, onChange, disabled }) => {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-text-main cursor-pointer">
          {label}
        </label>
        {hint && (
          <p id={`${id}-hint`} className="text-xs text-text-muted leading-relaxed mt-0.5">
            {hint}
          </p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={hint ? `${id}-hint` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
          checked ? 'bg-primary border-primary' : 'bg-surface border-card-border'
        }`}
      >
        <span
          aria-hidden="true"
          className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-6 rtl:-translate-x-6' : 'translate-x-1 rtl:-translate-x-1'
          }`}
        />
      </button>
    </div>
  );
};

interface DisclosureProps {
  label: string;
  /** Controlled mode lets a form open the section when a field inside it fails validation. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

export const Disclosure: React.FC<DisclosureProps> = ({ label, open: openProp, onOpenChange, children }) => {
  const id = useId();
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const toggle = () => {
    setOpenState(!open);
    onOpenChange?.(!open);
  };
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={toggle}
        className="inline-flex items-center gap-1.5 min-h-10 text-sm font-medium text-text-muted hover:text-text-main transition-colors cursor-pointer"
      >
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        <span>{label}</span>
      </button>
      {open && (
        <div id={id} className="pt-3 space-y-4 animate-fade-in">
          {children}
        </div>
      )}
    </div>
  );
};

export const PROTOCOL_TEXT: Record<MeshProtocol, [TranslationKey, TranslationKey]> = {
  dual: ['proto_dual', 'proto_dual_desc'],
  udp: ['proto_udp', 'proto_udp_desc'],
  tcp: ['proto_tcp', 'proto_tcp_desc'],
  ws: ['proto_ws', 'proto_ws_desc'],
  wss: ['proto_wss', 'proto_wss_desc'],
  quic: ['proto_quic', 'proto_quic_desc'],
  faketcp: ['proto_faketcp', 'proto_faketcp_desc'],
};

interface ProtocolPickerProps {
  value: MeshProtocol;
  onChange: (value: MeshProtocol) => void;
  disabled?: boolean;
  /** Keep the legend for screen readers only when a section heading already names the group. */
  hideLegend?: boolean;
  t: Translate;
}

export const ProtocolPicker: React.FC<ProtocolPickerProps> = ({ value, onChange, disabled, hideLegend, t }) => {
  const name = useId();
  return (
    <fieldset className="min-w-0" disabled={disabled}>
      <legend className={hideLegend ? 'sr-only' : 'text-sm font-medium text-text-main mb-2'}>{t('node_field_protocol')}</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {MESH_PROTOCOLS.map((proto) => {
          const selected = value === proto;
          const [labelKey, descKey] = PROTOCOL_TEXT[proto];
          return (
            <label
              key={proto}
              className={`flex items-start gap-3 p-3 rounded-xl border transition-colors cursor-pointer ${
                selected ? 'border-primary-border bg-primary-subtle' : 'border-card-border hover:border-card-border-hover'
              }`}
            >
              <input
                type="radio"
                name={name}
                value={proto}
                checked={selected}
                onChange={() => onChange(proto)}
                className="mt-0.5 w-4 h-4 shrink-0 accent-primary cursor-pointer"
              />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-text-main">
                  {t(labelKey)}
                  {proto === 'dual' && (
                    <span className="px-1.5 py-0.5 rounded-md text-xs font-medium bg-primary-subtle text-primary">
                      {t('node_protocol_recommended')}
                    </span>
                  )}
                </span>
                <span className="block mt-0.5 text-xs text-text-muted leading-relaxed">{t(descKey)}</span>
              </span>
            </label>
          );
        })}
      </div>
      {value === 'udp' && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-400 leading-relaxed">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          <span>{t('node_proto_udp_hint')}</span>
        </p>
      )}
    </fieldset>
  );
};
