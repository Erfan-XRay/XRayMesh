import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Copy, Link2, Loader2, Pencil, Plus, Radio, RefreshCw, Server, Share2, Trash2, Users } from 'lucide-react';
import { MeshInviteData, MeshInviteJoinedVia } from '../../types';
import type { Translate, TranslationKey } from '../../i18n/translations';
import { fillTemplate, formatText } from '../../i18n/fillTemplate';
import { addMeshPeer, fetchMeshInvite, removeMeshPeer } from '../../services/api';
import { encodeInviteToken, isBackpackProtocol, sanitizePeerInput } from '../../utils/meshInvite';
import { FieldError } from './FormControls';
import { InviteSettingsSummary } from './InviteSettings';
import { btnGhost, btnGhostSm, btnPrimary, btnSecondary, Callout, cardClass, EmptyState, iconBtn, inputClass, SectionHeader, Segmented } from '../ui';
import { formatCount, localizeDigits } from '../../i18n/format';

interface ConnectionsPanelProps {
  port: number;
  peers: string[];
  onPeersChange: (peers: string[]) => void;
  onServiceChanged: () => void;
  onJoinRequest: () => void;
  onNotify: (msg: string, type: 'success' | 'error' | 'info') => void;
  onCopy: (text: string) => void;
  copiedKey: string | null;
  t: Translate;
}

/** Everything about connecting servers: share this node's invite, manage peers, or move to another mesh. */
export const ConnectionsPanel: React.FC<ConnectionsPanelProps> = ({
  port,
  peers,
  onPeersChange,
  onServiceChanged,
  onJoinRequest,
  onNotify,
  onCopy,
  copiedKey,
  t,
}) => {
  const [invite, setInvite] = useState<MeshInviteData | null>(null);
  const [inviteState, setInviteState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [inviteError, setInviteError] = useState('');
  // A server that joined over an ICMP/PCK link sends people to the server it joined through,
  // unless they explicitly ask for a code here.
  const [joinedVia, setJoinedVia] = useState<MeshInviteJoinedVia | null>(null);
  const [codeHere, setCodeHere] = useState(false);
  const [addressOverride, setAddressOverride] = useState('');
  const [editingAddress, setEditingAddress] = useState(false);
  const [family, setFamily] = useState<'ipv4' | 'ipv6'>('ipv4');

  const [newPeer, setNewPeer] = useState('');
  const [peerError, setPeerError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const loadInvite = useCallback(async () => {
    setInviteState('loading');
    try {
      const data = await fetchMeshInvite(codeHere);
      if ('invite' in data) {
        setInvite(data);
        setJoinedVia(null);
      } else {
        setInvite(null);
        setJoinedVia(data);
      }
      setInviteState('ready');
    } catch (err) {
      // The server's reason (e.g. an outdated CLI on this server) is what the user needs to act on.
      setInviteError(err instanceof Error ? err.message : String(err));
      setInviteState('error');
    }
  }, [codeHere]);

  useEffect(() => {
    loadInvite();
  }, [loadInvite]);

  // A server with only a public IPv6 is offered over IPv6 from the start.
  useEffect(() => {
    if (invite && !invite.details.endpoint && invite.endpoint_ipv6) setFamily('ipv6');
  }, [invite]);

  const familyEndpoint = (family === 'ipv6' ? invite?.endpoint_ipv6 : invite?.details.endpoint) || '';
  // Without a detected public IP the code is useless, so ask for the address right away.
  useEffect(() => {
    if (inviteState === 'ready' && invite && !familyEndpoint) setEditingAddress(true);
  }, [invite, inviteState, familyEndpoint]);

  const override = sanitizePeerInput(addressOverride, port);
  const endpoint = override || familyEndpoint;
  // The code is re-encoded in the browser when the address or address family differs from the server's copy.
  const reencode = Boolean(invite) && endpoint !== invite?.details.endpoint;
  const code = invite
    ? reencode
      ? encodeInviteToken({ ...invite.details, endpoint, ipv6: invite.details.ipv6 || endpoint.startsWith('[') })
      : invite.invite
    : '';
  const missingAddress = inviteState === 'ready' && !endpoint;
  // The choice is offered whenever IPv6 is on for this server; the reason shows when it cannot be used.
  const showFamily = Boolean(invite?.details.ipv6);
  const IPV6_REASON: Record<string, TranslationKey> = {
    icmp: 'node_invite_ipv6_icmp',
    pck: 'node_invite_ipv6_pck',
    faketcp: 'node_invite_ipv6_faketcp',
    not_detected: 'node_invite_ipv6_not_detected',
  };
  const ipv6ReasonKey = invite?.ipv6_unavailable ? IPV6_REASON[invite.ipv6_unavailable] : undefined;

  const handleAddPeer = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = sanitizePeerInput(newPeer, port);
    if (!clean) {
      setPeerError(t('node_peer_invalid'));
      return;
    }
    setAdding(true);
    setPeerError(null);
    try {
      onPeersChange(await addMeshPeer(clean));
      setNewPeer('');
      onNotify(t('node_peer_added'), 'success');
      onServiceChanged();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setAdding(false);
    }
  };

  const handleRemovePeer = async (peer: string) => {
    setRemoving(peer);
    try {
      onPeersChange(await removeMeshPeer(peer));
      onNotify(t('node_peer_removed'), 'info');
      onServiceChanged();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="space-y-4">
      <section className={`${cardClass} p-5 sm:p-6`} aria-labelledby="node-invite-heading">
        <SectionHeader
          as="h3"
          id="node-invite-heading"
          icon={<Share2 className="w-[18px] h-[18px]" />}
          title={t('node_invite_heading')}
          description={t('node_invite_help')}
        />

        {inviteState === 'loading' && (
          <p className="mt-4 flex items-center gap-2 text-sm text-text-muted" role="status">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            {t('node_invite_loading')}
          </p>
        )}

        {inviteState === 'error' && (
          <div className="mt-4 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <FieldError message={t('node_invite_error')} />
              <button type="button" onClick={loadInvite} className={btnGhost}>
                {t('btn_retry')}
              </button>
            </div>
            {inviteError && (
              <p dir="ltr" className="text-start font-mono text-xs text-text-muted leading-relaxed break-words">
                {inviteError}
              </p>
            )}
          </div>
        )}

        {inviteState === 'ready' && joinedVia && (
          <div className="mt-4">
            <Callout tone="info" icon={<Radio className="w-4 h-4" />} title={t('invite_joined_via_title')}>
              <p>
                {fillTemplate(t('invite_joined_via_body'), {
                  proto: joinedVia.proto.toUpperCase(),
                  host: (
                    <bdi dir="ltr" className="font-mono">
                      {joinedVia.joined_via}
                    </bdi>
                  ),
                })}
              </p>
              <div className="mt-3 flex flex-col items-start gap-1.5">
                <button type="button" onClick={() => setCodeHere(true)} className={btnGhostSm}>
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t('invite_joined_via_here')}</span>
                </button>
                <p className="text-xs text-text-muted leading-relaxed">{t('invite_joined_via_here_hint')}</p>
              </div>
            </Callout>
          </div>
        )}

        {inviteState === 'ready' && invite && (
          <div className="mt-4 space-y-4">
            {isBackpackProtocol(invite.details.proto) && (
              <Callout
                tone="info"
                icon={<Radio className="w-4 h-4" />}
                title={t(invite.details.proto === 'pck' ? 'pck_howto_title' : 'icmp_howto_title')}
                action={
                  <button type="button" onClick={loadInvite} className={btnGhostSm}>
                    <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t('node_invite_icmp_refresh')}</span>
                  </button>
                }
              >
                <ol className="mt-1 space-y-1">
                  {/* A code made on a joined server is not from the main server, so the first step does not apply. */}
                  {((codeHere ? ['icmp_howto_2', 'icmp_howto_3'] : ['icmp_howto_1', 'icmp_howto_2', 'icmp_howto_3']) as TranslationKey[]).map((key, i) => (
                    <li key={key} className="flex gap-2">
                      <span className="shrink-0 tabular-nums text-text-subtle" aria-hidden="true">
                        {localizeDigits(i + 1, t)}.
                      </span>
                      <span>{t(key)}</span>
                    </li>
                  ))}
                </ol>
                {invite.details.proto === 'pck' && invite.details.link && (
                  <p className="mt-2">
                    {fillTemplate(t('pck_howto_port'), {
                      port: (
                        <bdi dir="ltr" className="font-mono">
                          {invite.details.link.p}/TCP
                        </bdi>
                      ),
                    })}
                  </p>
                )}
                {invite.details.enc !== false && <p className="mt-2">{t('backpack_howto_encryption')}</p>}
              </Callout>
            )}

            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="node-invite-address" className="text-sm font-medium text-text-primary">
                  {t('node_invite_address')}
                </label>
                {showFamily && (
                  <Segmented
                    size="sm"
                    ariaLabel={t('node_invite_family')}
                    value={family}
                    onChange={(v) => {
                      setFamily(v);
                      setAddressOverride('');
                      setEditingAddress(false);
                    }}
                    options={[
                      { value: 'ipv4', label: 'IPv4', disabled: !invite.details.endpoint },
                      { value: 'ipv6', label: 'IPv6', disabled: !invite.endpoint_ipv6 },
                    ]}
                  />
                )}
              </div>
              {editingAddress ? (
                <div className="flex gap-2">
                  <input
                    id="node-invite-address"
                    value={addressOverride}
                    onChange={(e) => setAddressOverride(e.target.value)}
                    placeholder={invite.details.endpoint || '5.161.20.30'}
                    dir="ltr"
                    autoComplete="off"
                    spellCheck={false}
                    className={`${inputClass()} font-mono`}
                  />
                  {endpoint && (
                    <button type="button" onClick={() => setEditingAddress(false)} className={`${btnSecondary} shrink-0`}>
                      {t('node_invite_address_done')}
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-text-primary" dir="ltr">
                    {endpoint}
                  </span>
                  <button type="button" onClick={() => setEditingAddress(true)} className={btnGhostSm}>
                    <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t('node_invite_address_change')}</span>
                  </button>
                </div>
              )}
              {missingAddress && (
                <p className="flex items-start gap-1.5 text-xs text-warning leading-relaxed">
                  <AlertTriangle className="w-3.5 h-3.5 mt-[0.2em] shrink-0" aria-hidden="true" />
                  <span>{t('node_invite_no_ip_warning')}</span>
                </p>
              )}
              {showFamily && ipv6ReasonKey && <p className="text-xs text-text-muted leading-relaxed">{t(ipv6ReasonKey)}</p>}
            </div>

            <div className="rounded-xl bg-surface border border-card-border overflow-hidden">
              <div dir="ltr" className="p-3 max-h-32 overflow-y-auto text-start font-mono text-xs leading-relaxed text-text-primary break-all select-all">
                {code}
              </div>
              <div className="flex justify-end p-2 border-t border-card-border bg-card">
                <button type="button" onClick={() => onCopy(code)} disabled={missingAddress} className={`${btnPrimary} w-full sm:w-auto`}>
                  {copiedKey === code ? <Check className="w-4 h-4" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
                  <span>{copiedKey === code ? t('btn_copied_short') : t('node_btn_copy_code')}</span>
                </button>
              </div>
            </div>

            <InviteSettingsSummary settings={invite.details} t={t} />
          </div>
        )}
      </section>

      <section className={`${cardClass} p-5 sm:p-6`} aria-labelledby="node-peers-heading">
        <SectionHeader
          as="h3"
          id="node-peers-heading"
          icon={<Users className="w-[18px] h-[18px]" />}
          title={
            <span className="inline-flex items-center gap-2">
              {t('node_peers_heading')}
              {peers.length > 0 && <span className="text-sm font-medium text-text-subtle tabular-nums">{formatCount(peers.length, t)}</span>}
            </span>
          }
          description={t('node_peers_help')}
        />

        <form onSubmit={handleAddPeer} noValidate className="mt-4 flex gap-2">
          <input
            value={newPeer}
            onChange={(e) => {
              setNewPeer(e.target.value);
              setPeerError(null);
            }}
            placeholder="51.15.20.30:11010"
            aria-label={t('node_peer_input_label')}
            aria-invalid={Boolean(peerError)}
            aria-describedby={peerError ? 'node-peer-error' : undefined}
            disabled={adding}
            dir="ltr"
            autoComplete="off"
            spellCheck={false}
            className={`${inputClass(Boolean(peerError))} font-mono`}
          />
          <button type="submit" disabled={adding || !newPeer.trim()} className={`${btnSecondary} shrink-0`}>
            {adding ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Plus className="w-4 h-4" aria-hidden="true" />}
            <span>{t('node_btn_add')}</span>
          </button>
        </form>
        {peerError && (
          <div className="mt-1.5">
            <FieldError id="node-peer-error" message={peerError} />
          </div>
        )}

        {peers.length === 0 ? (
          <div className="mt-4">
            <EmptyState compact icon={<Server className="w-5 h-5" />} title={t('node_peers_empty')} />
          </div>
        ) : (
          <ul className="mt-4 rounded-xl border border-card-border divide-y divide-card-border overflow-hidden">
            {peers.map((peer) => (
              <li key={peer} className="flex items-center justify-between gap-2 ps-3.5 pe-1 py-1 hover:bg-hover transition-colors">
                <span className="font-mono text-sm text-text-primary truncate" dir="ltr">
                  {peer}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemovePeer(peer)}
                  disabled={removing !== null}
                  title={formatText(t('node_peer_remove'), { peer })}
                  aria-label={formatText(t('node_peer_remove'), { peer })}
                  className={`${iconBtn} hover:text-danger hover:bg-danger-subtle`}
                >
                  {removing === peer ? (
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${cardClass} p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4`}>
        <SectionHeader as="h3" icon={<Link2 className="w-[18px] h-[18px]" />} title={t('node_move_title')} description={t('node_move_desc')} />
        <button type="button" onClick={onJoinRequest} className={`${btnSecondary} shrink-0`}>
          <Link2 className="w-4 h-4" aria-hidden="true" />
          <span>{t('node_move_btn')}</span>
        </button>
      </section>
    </div>
  );
};
