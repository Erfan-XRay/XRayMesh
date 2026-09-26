import React from 'react';
import { AlertTriangle, Check, CheckCircle2, Copy, Info, XCircle } from 'lucide-react';
import { iconBtnSm } from './styles';

export * from './styles';

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

// Full class strings so Tailwind can see them.
const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-text-muted',
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
};
const TONE_SOFT: Record<Tone, string> = {
  neutral: 'bg-surface text-text-muted border-card-border',
  primary: 'bg-primary-subtle text-primary border-primary-border',
  success: 'bg-success-subtle text-success border-success-border',
  warning: 'bg-warning-subtle text-warning border-warning-border',
  danger: 'bg-danger-subtle text-danger border-danger-border',
  info: 'bg-info-subtle text-info border-info-border',
};
const TONE_DOT: Record<Tone, string> = {
  neutral: 'bg-text-subtle',
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
};

export const toneText = (tone: Tone) => TONE_TEXT[tone];
export const toneSoft = (tone: Tone) => TONE_SOFT[tone];

export const StatusDot: React.FC<{ tone: Tone; pulse?: boolean; className?: string }> = ({ tone, pulse, className = '' }) => (
  <span className={`relative inline-flex w-2 h-2 shrink-0 ${className}`} aria-hidden="true">
    {pulse && <span className={`absolute inset-0 rounded-full ${TONE_DOT[tone]} opacity-40 animate-ping`} />}
    <span className={`relative w-2 h-2 rounded-full ${TONE_DOT[tone]}`} />
  </span>
);

interface PillProps {
  tone?: Tone;
  children: React.ReactNode;
  icon?: React.ReactNode;
  dot?: boolean;
  /** Technical values render LTR in monospace. */
  mono?: boolean;
  className?: string;
  title?: string;
}

/** Small status label. Soft tint, never a solid block of color. */
export const Pill: React.FC<PillProps> = ({ tone = 'neutral', children, icon, dot, mono, className = '', title }) => (
  <span
    title={title}
    dir={mono ? 'ltr' : undefined}
    className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-md border text-xs font-medium whitespace-nowrap shrink-0 ${TONE_SOFT[tone]} ${
      mono ? 'font-mono' : ''
    } ${className}`}
  >
    {dot && <StatusDot tone={tone} />}
    {icon}
    {children}
  </span>
);

const CALLOUT_ICON: Record<Tone, React.ReactNode> = {
  neutral: <Info className="w-4 h-4" />,
  primary: <Info className="w-4 h-4" />,
  info: <Info className="w-4 h-4" />,
  success: <CheckCircle2 className="w-4 h-4" />,
  warning: <AlertTriangle className="w-4 h-4" />,
  danger: <XCircle className="w-4 h-4" />,
};

interface CalloutProps {
  tone?: Tone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  role?: 'status' | 'alert';
  className?: string;
}

/** Inline message block: an icon at the start, title and body, optional action at the end. */
export const Callout: React.FC<CalloutProps> = ({ tone = 'info', title, children, icon, action, role, className = '' }) => (
  <div role={role} className={`flex flex-col sm:flex-row sm:items-start gap-3 p-3.5 rounded-xl border ${TONE_SOFT[tone]} ${className}`}>
    <div className="flex items-start gap-2.5 min-w-0 flex-1">
      <span className={`mt-0.5 shrink-0 ${TONE_TEXT[tone]}`} aria-hidden="true">
        {icon ?? CALLOUT_ICON[tone]}
      </span>
      <div className="min-w-0 flex-1 text-sm leading-relaxed">
        {title && <p className={`font-semibold ${TONE_TEXT[tone]}`}>{title}</p>}
        {children && <div className={`text-text-secondary ${title ? 'mt-0.5' : ''}`}>{children}</div>}
      </div>
    </div>
    {action && <div className="shrink-0 sm:-my-1">{action}</div>}
  </div>
);

export interface SegmentOption<T extends string | number> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  /** Shown after the label, e.g. a result count. */
  count?: React.ReactNode;
  disabled?: boolean;
  ariaLabel?: string;
}

interface SegmentedProps<T extends string | number> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentOption<T>[];
  ariaLabel: string;
  size?: 'sm' | 'md';
  /** Stretch options to share the full width. */
  block?: boolean;
  className?: string;
}

/** A row of mutually exclusive choices on a recessed track. */
export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  ariaLabel,
  size = 'md',
  block,
  className = '',
}: SegmentedProps<T>) {
  const height = size === 'sm' ? 'min-h-8 text-xs px-2.5' : 'min-h-9 text-sm px-3';
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`${block ? 'grid grid-flow-col auto-cols-fr' : 'inline-flex'} gap-1 p-1 rounded-xl bg-surface border border-card-border ${className}`}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            aria-pressed={active}
            aria-label={opt.ariaLabel}
            disabled={opt.disabled}
            onClick={() => onChange(opt.value)}
            className={`inline-flex items-center justify-center gap-1.5 ${height} rounded-lg font-medium whitespace-nowrap transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              active ? 'bg-card text-text-primary shadow-card' : 'text-text-muted hover:text-text-primary'
            }`}
          >
            {opt.icon && <span className={`shrink-0 ${active ? 'text-primary' : ''}`}>{opt.icon}</span>}
            <span>{opt.label}</span>
            {opt.count !== undefined && (
              <span className={`tabular-nums text-xs ${active ? 'text-primary' : 'text-text-subtle'}`}>{opt.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface SectionHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  /** Tile colors behind the icon; defaults to the accent tint. */
  iconClassName?: string;
  actions?: React.ReactNode;
  id?: string;
  as?: 'h2' | 'h3';
  className?: string;
}

/** Card heading: optional icon tile, title, one-line description and actions at the inline end. */
export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  description,
  icon,
  iconClassName = 'bg-primary-subtle text-primary',
  actions,
  id,
  as = 'h2',
  className = '',
}) => {
  const Heading = as;
  return (
    <div className={`flex flex-wrap items-start justify-between gap-3 ${className}`}>
      <div className="flex items-start gap-3 min-w-0">
        {icon && (
          <span className={`flex items-center justify-center w-9 h-9 shrink-0 rounded-xl ${iconClassName}`} aria-hidden="true">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <Heading id={id} className="text-base font-semibold text-text-primary leading-snug">
            {title}
          </Heading>
          {description && <p className="mt-0.5 text-sm text-text-muted leading-relaxed">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
};

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action, compact }) => (
  <div
    className={`flex flex-col items-center text-center rounded-xl border border-dashed border-card-border ${
      compact ? 'gap-1 px-4 py-4' : 'gap-2 px-6 py-10'
    }`}
  >
    {icon && (
      <span className="flex items-center justify-center w-10 h-10 mb-1 rounded-xl bg-surface text-text-subtle" aria-hidden="true">
        {icon}
      </span>
    )}
    <p className="text-sm font-medium text-text-primary">{title}</p>
    {description && <p className="max-w-sm text-sm text-text-muted leading-relaxed">{description}</p>}
    {action && <div className="mt-2">{action}</div>}
  </div>
);

interface CopyButtonProps {
  value: string;
  copied: boolean;
  onCopy: (value: string) => void;
  label: string;
  className?: string;
}

/** Icon button that turns into a check mark once its value is on the clipboard. */
export const CopyButton: React.FC<CopyButtonProps> = ({ value, copied, onCopy, label, className = '' }) => (
  <button
    type="button"
    onClick={() => onCopy(value)}
    aria-label={label}
    title={label}
    className={`${iconBtnSm} ${className}`}
  >
    {copied ? <Check className="w-3.5 h-3.5 text-success" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
  </button>
);

/** Horizontal meter; the tone shifts as the value crosses its thresholds. */
export const Meter: React.FC<{ value: number; warn: number; danger: number; label: string; className?: string }> = ({
  value,
  warn,
  danger,
  label,
  className = '',
}) => {
  const pct = Math.min(100, Math.max(0, value));
  const tone = pct >= danger ? 'bg-danger' : pct >= warn ? 'bg-warning' : 'bg-primary';
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={`h-1.5 w-full rounded-full bg-surface overflow-hidden ${className}`}
    >
      <div className={`h-full rounded-full ${tone} transition-[width] duration-700 ease-spring`} style={{ width: `${pct}%` }} />
    </div>
  );
};
