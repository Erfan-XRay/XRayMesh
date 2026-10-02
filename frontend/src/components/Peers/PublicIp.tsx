import React from 'react';
import { Globe } from 'lucide-react';
import { Peer } from '../../types';
import type { Translate } from '../../i18n/translations';
import { formatText } from '../../i18n/fillTemplate';
import { CopyButton } from '../ui';

interface PublicIpProps {
  peer: Peer;
  onCopy: (text: string) => void;
  copiedKey: string | null;
  t: Translate;
  /** Size of the copy button, matching the mesh IP line it sits under. */
  buttonClass?: string;
}

/** A server's public IPv4 with a copy button. Renders nothing for servers that do not report one. */
export const PublicIp: React.FC<PublicIpProps> = ({ peer, onCopy, copiedKey, t, buttonClass = 'w-6 h-6' }) => {
  if (!peer.public_ip) return null;
  return (
    <div className="flex items-center gap-0.5">
      <Globe className="w-3 h-3 shrink-0 text-text-subtle me-1" aria-hidden="true" />
      <span className="sr-only">{t('peer_public_ip')}</span>
      <span className="font-mono text-xs text-text-muted" dir="ltr" title={t('peer_public_ip')}>
        {peer.public_ip}
      </span>
      <CopyButton
        value={peer.public_ip}
        copied={copiedKey === peer.public_ip}
        onCopy={onCopy}
        label={formatText(t('peer_copy_public_ip'), { ip: peer.public_ip })}
        className={buttonClass}
      />
    </div>
  );
};
