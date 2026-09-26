import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Copy, Link2, Loader2, Pencil, Plus, Server, Share2, Trash2, Users } from 'lucide-react';
import { MeshInviteData } from '../../types';
import type { Translate } from '../../i18n/translations';
import { formatText } from '../../i18n/fillTemplate';
import { addMeshPeer, fetchMeshInvite, removeMeshPeer } from '../../services/api';
import { encodeInviteToken, sanitizePeerInput } from '../../utils/meshInvite';
import { FieldError } from './FormControls';
import { btnGhost, btnGhostSm, btnPrimary, btnSecondary, cardClass, EmptyState, iconBtn, inputClass, SectionHeader } from '../ui';
import { formatCount } from '../../i18n/format';

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
  const [addressOverride, setAddressOverride] = useState('');
  const [editingAddress, setEditingAddress] = useState(false);

  const [newPeer, setNewPeer] = useState('');
  const [peerError, setPeerError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const loadInvite = useCallback(async () => {
    setInviteState('loading');
    try {
      setInvite(await fetchMeshInvite());
      setInviteState('ready');
    } catch {
      setInviteState('error');
    }
  }, []);

  useEffect(() => {
    loadInvite();
  }, [loadInvite]);

  // Without a detected public IP the code is useless, so ask for the address right away.
  useEffect(() => {
    if (invite && !invite.details.endpoint) setEditingAddress(true);
  }, [invite]);

  const override = sanitizePeerInput(addressOverride, port);
  const endpoint = override || invite?.details.endpoint || '';
  // The code is re-encoded in the browser when the address is overridden, as before.
  const code = invite ? (override ? encodeInviteToken({ ...invite.details, endpoint: override }) : invite.invite) : '';
  const missingAddress = inviteState === 'ready' && !endpoint;

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
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <FieldError message={t('node_invite_error')} />
            <button type="button" onClick={loadInvite} className={btnGhost}>
              {t('btn_retry')}
            </button>
          </div>
        )}

        {inviteState === 'ready' && invite && (
          <div className="mt-4 space-y-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="node-invite-address" className="text-sm font-medium text-text-primary">
                {t('node_invite_address')}
              </label>
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
