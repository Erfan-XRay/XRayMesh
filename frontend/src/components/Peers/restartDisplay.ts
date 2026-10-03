import type { Translate } from '../../i18n/translations';
import { formatText } from '../../i18n/fillTemplate';
import { formatCount } from '../../i18n/format';

/** Limits the server enforces (web/server.py RESTART_MIN_MINUTES and RESTART_MAX_MINUTES). */
export const RESTART_MIN_MINUTES = 5;
export const RESTART_MAX_MINUTES = 30 * 24 * 60;

export const RESTART_PRESETS = [30, 60, 180, 360, 720, 1440];

export type IntervalUnit = 'minutes' | 'hours' | 'days';

export const UNIT_MINUTES: Record<IntervalUnit, number> = { minutes: 1, hours: 60, days: 1440 };

/** The largest unit that divides the interval evenly, so 360 reads as "6 hours" in the custom field. */
export function splitInterval(minutes: number): { value: number; unit: IntervalUnit } {
  if (minutes % UNIT_MINUTES.days === 0) return { value: minutes / UNIT_MINUTES.days, unit: 'days' };
  if (minutes % UNIT_MINUTES.hours === 0) return { value: minutes / UNIT_MINUTES.hours, unit: 'hours' };
  return { value: minutes, unit: 'minutes' };
}

/** "90" → "1 h 30 min" / "۱ ساعت و ۳۰ دقیقه". */
export function formatInterval(minutes: number, t: Translate): string {
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const parts = [
    days && formatText(t('interval_day'), { n: formatCount(days, t) }),
    hours && formatText(t('interval_hour'), { n: formatCount(hours, t) }),
    mins && formatText(t('interval_min'), { n: formatCount(mins, t) }),
  ].filter(Boolean);
  return parts.join(t('interval_join'));
}

/** How long ago a Unix timestamp was, to the largest fitting unit. */
export function formatAgo(unixSeconds: number, t: Translate, now = Date.now()): string {
  const sec = Math.max(0, Math.round(now / 1000 - unixSeconds));
  if (sec < 60) return formatText(t('tunnels_ago_seconds'), { n: formatCount(sec, t) });
  if (sec < 3600) return formatText(t('tunnels_ago_minutes'), { n: formatCount(Math.round(sec / 60), t) });
  if (sec < 172800) return formatText(t('tunnels_ago_hours'), { n: formatCount(Math.round(sec / 3600), t) });
  return formatText(t('restart_ago_days'), { n: formatCount(Math.round(sec / 86400), t) });
}
