/**
 * Class recipes for the Firouzeh Console style. Every color comes from a token in index.css,
 * so the same markup works in light, dark, every palette and both text directions.
 */

const BTN =
  'inline-flex items-center justify-center gap-2 min-h-10 px-4 rounded-xl text-sm font-semibold select-none cursor-pointer ' +
  'transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.98] ' +
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100';
export const btnPrimary = `${BTN} bg-primary text-on-primary hover:bg-primary-hover`;
export const btnSecondary = `${BTN} bg-card border border-card-border text-text-primary hover:bg-hover hover:border-border-strong`;
export const btnGhost = `${BTN} text-text-muted hover:text-text-primary hover:bg-hover`;
export const btnDanger = `${BTN} bg-danger text-on-danger hover:bg-danger/90`;
export const btnWarning = `${BTN} bg-warning text-on-warning hover:bg-warning/90`;
export const btnDangerSoft = `${BTN} border border-danger-border text-danger hover:bg-danger-subtle`;
export const btnTonal = `${BTN} bg-primary-subtle text-primary hover:bg-primary/20`;

// Compact variants for dense rows (tables, lists, toolbars).
const BTN_SM =
  'inline-flex items-center justify-center gap-1.5 min-h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap select-none cursor-pointer ' +
  'transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.98] ' +
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100';
export const btnPrimarySm = `${BTN_SM} bg-primary text-on-primary hover:bg-primary-hover`;
export const btnSecondarySm = `${BTN_SM} bg-card border border-card-border text-text-primary hover:bg-hover hover:border-border-strong`;
export const btnGhostSm = `${BTN_SM} text-text-muted hover:text-text-primary hover:bg-hover`;
export const btnTonalSm = `${BTN_SM} bg-primary-subtle text-primary hover:bg-primary/20`;
export const btnDangerSoftSm = `${BTN_SM} text-danger hover:bg-danger-subtle`;

const ICON_BTN =
  'inline-flex items-center justify-center shrink-0 text-text-muted hover:text-text-primary hover:bg-hover cursor-pointer ' +
  'transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed';
export const iconBtn = `${ICON_BTN} w-10 h-10 rounded-xl`;
export const iconBtnSm = `${ICON_BTN} w-8 h-8 rounded-lg`;

export const cardClass = 'rounded-2xl bg-card border border-card-border shadow-card';
export const insetClass = 'rounded-xl bg-surface border border-card-border';

const FIELD =
  'w-full min-h-10 px-3 py-2 rounded-xl border bg-input text-sm text-text-primary placeholder:text-text-subtle ' +
  'transition-[border-color,box-shadow] duration-150 focus:outline-none focus-visible:outline-none ' +
  'focus:border-primary focus:ring-4 focus:ring-primary/15 disabled:opacity-60 disabled:cursor-not-allowed';

export const inputClass = (invalid = false) =>
  `${FIELD} ${invalid ? 'border-danger focus:border-danger focus:ring-danger/15' : 'border-card-border hover:border-border-strong'}`;

export const selectClass = `${FIELD} select-field border-card-border hover:border-border-strong cursor-pointer`;

export const labelClass = 'text-sm font-medium text-text-primary';
export const hintClass = 'text-xs text-text-muted leading-relaxed';
