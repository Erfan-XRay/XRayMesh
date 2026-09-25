import { JoinMeshError } from '../../services/api';
import type { Translate, TranslationKey } from '../../i18n/translations';
import { formatText } from '../../i18n/fillTemplate';

const JOIN_ERROR_TEXT: Record<string, TranslationKey> = {
  invite_incomplete: 'invite_err_incomplete',
  invalid_hostname: 'node_err_hostname_invalid',
  invalid_ipv4: 'node_err_ipv4_invalid',
  invalid_port: 'node_err_port_invalid',
};

/** Localized message for a failed join, plus the server's own text when it helps diagnose. */
export function describeJoinError(err: unknown, t: Translate, hadConfig: boolean): { message: string; details?: string } {
  const raw = err instanceof Error ? err.message : String(err);
  if (!(err instanceof JoinMeshError)) return { message: t('join_err_generic'), details: raw };

  if (err.code === 'invalid_invite') {
    return { message: formatText(t('invite_err_invalid'), { prefix: 'xrmesh://' }) };
  }
  if (err.code === 'start_failed') {
    return { message: t(hadConfig ? 'join_err_start_failed' : 'join_err_start_failed_setup'), details: raw };
  }
  const key = JOIN_ERROR_TEXT[err.code];
  return key ? { message: t(key) } : { message: t('join_err_generic'), details: raw };
}
