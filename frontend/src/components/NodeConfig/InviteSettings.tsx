import React from 'react';
import { MeshProtocol } from '../../types';
import type { Translate } from '../../i18n/translations';
import { MESH_PROTOCOLS } from '../../utils/meshInvite';
import { PROTOCOL_TEXT } from './FormControls';

/** The settings an invite code applies on the server that joins with it. */
export interface InviteSettingsSource {
  proto: string;
  port?: number;
  mtu?: number;
  kcp?: boolean;
  enc?: boolean;
  ipv6?: boolean;
}

export interface InviteSettingRow {
  label: string;
  value: string;
  /** Ports and MTU are identifiers people compare between servers, so they stay LTR. */
  technical?: boolean;
}

export function inviteSettingRows(s: InviteSettingsSource, t: Translate): InviteSettingRow[] {
  const proto = (MESH_PROTOCOLS.includes(s.proto as MeshProtocol) ? s.proto : 'dual') as MeshProtocol;
  const onOff = (v: boolean | undefined) => t(v ? 'state_on' : 'state_off');
  const rows: InviteSettingRow[] = [{ label: t('node_label_protocol'), value: t(PROTOCOL_TEXT[proto][0]) }];
  if (s.port) rows.push({ label: t('invite_setting_port'), value: String(s.port), technical: true });
  if (s.mtu) rows.push({ label: t('node_field_mtu'), value: String(s.mtu), technical: true });
  if (s.kcp !== undefined) rows.push({ label: t('invite_setting_kcp'), value: onOff(s.kcp) });
  if (s.enc !== undefined) rows.push({ label: t('invite_setting_encryption'), value: onOff(s.enc) });
  if (s.ipv6 !== undefined) rows.push({ label: t('invite_setting_ipv6'), value: onOff(s.ipv6) });
  return rows;
}

/** Compact, wrapping list of what a code sets up, for the server that shares it. */
export const InviteSettingsSummary: React.FC<{ settings: InviteSettingsSource; t: Translate }> = ({ settings, t }) => (
  <div>
    <p className="text-xs font-medium text-text-muted">{t('node_invite_settings')}</p>
    <dl className="mt-2 flex flex-wrap gap-1.5">
      {inviteSettingRows(settings, t).map(({ label, value, technical }) => (
        <div key={label} className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-surface border border-card-border text-xs">
          <dt className="text-text-muted">{label}</dt>
          <dd className="font-medium text-text-primary">
            {technical ? (
              <bdi dir="ltr" className="font-mono">
                {value}
              </bdi>
            ) : (
              value
            )}
          </dd>
        </div>
      ))}
    </dl>
  </div>
);
