import type { Translate } from './translations';

/*
 * Numbers follow the reader's script: quantities (counts, latency, load, traffic) use Persian
 * digits in Persian. Identifiers people type or copy (IPs, ports, versions, hostnames) are never
 * passed through here and stay in Latin digits.
 */

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

const isPersian = (t: Translate) => t('locale') === 'fa-IR';

/** Counts in running text, e.g. "۱۲". */
export function formatCount(value: number, t: Translate): string {
  return new Intl.NumberFormat(t('locale')).format(value);
}

/** A measured quantity with fixed decimals, e.g. 124.6 → "۱۲۴٫۶". */
export function formatNumber(value: number, t: Translate, decimals = 0): string {
  return new Intl.NumberFormat(t('locale'), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: false,
  }).format(value);
}

/** Localizes the digits of a server-formatted quantity such as "1.24 GB" or "42.3". */
export function localizeDigits(text: string | number, t: Translate): string {
  const s = String(text);
  if (!isPersian(t)) return s;
  return s.replace(/(\d)\.(?=\d)/g, '$1٫').replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

/** "12d 4h 31m" from the server → "12d 4h" / "۱۲ روز و ۴ ساعت" (the two largest units). */
export function formatUptime(text: string | undefined, t: Translate): string {
  const match = /^(?:(\d+)d)?\s*(?:(\d+)h)?\s*(?:(\d+)m)?$/.exec((text || '').trim());
  if (!text || !match || match[0] === '') return text ? localizeDigits(text, t) : '—';
  const parts = (
    [
      [match[1], 'uptime_days'],
      [match[2], 'uptime_hours'],
      [match[3], 'uptime_minutes'],
    ] as const
  )
    .filter(([n]) => n !== undefined)
    .slice(0, 2)
    .map(([n, key]) => t(key).replace('{n}', formatCount(Number(n), t)));
  return parts.join(t('uptime_join'));
}
