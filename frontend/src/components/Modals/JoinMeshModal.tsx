import React, { useMemo, useState } from 'react';
import { AlertTriangle, Check, Loader2, X } from 'lucide-react';
import { JoinMeshResult, MeshProtocol, NodeConfig } from '../../types';
import type { Translate } from '../../i18n/translations';
import { fillTemplate } from '../../i18n/fillTemplate';
import { joinMeshNetwork } from '../../services/api';
import { MESH_PROTOCOLS, parseInviteToken, suggestVirtualIp } from '../../utils/meshInvite';
import { validateHostname, validateIpv4, validatePort } from '../../utils/nodeForm';
import { btnDanger, btnPrimary, btnSecondary, Disclosure, ErrorPanel, PROTOCOL_TEXT, TextField } from '../NodeConfig/FormControls';
import { InviteCodeField } from '../NodeConfig/InviteCodeField';
import { describeJoinError } from '../NodeConfig/joinErrors';
import { ModalShell } from './ModalShell';

type Step = 'details' | 'confirm' | 'working';

interface JoinMeshModalProps {
  current: NodeConfig;
  t: Translate;
  onClose: () => void;
  onJoined: (result: JoinMeshResult) => void;
}

const protocolLabel = (proto: string, t: Translate) =>
  t(PROTOCOL_TEXT[MESH_PROTOCOLS.includes(proto as MeshProtocol) ? (proto as MeshProtocol) : 'dual'][0]);

interface ComparisonRow {
  label: string;
  value: string;
  /** Addresses and names render LTR in monospace; translated text keeps the page direction. */
  technical?: boolean;
}

const Comparison: React.FC<{ title: string; rows: ComparisonRow[]; highlight?: boolean }> = ({ title, rows, highlight }) => (
  <div className={`p-3 rounded-xl border ${highlight ? 'border-primary-border bg-primary-subtle' : 'border-card-border bg-surface'}`}>
    <p className={`text-xs font-semibold ${highlight ? 'text-primary' : 'text-text-muted'}`}>{title}</p>
    <dl className="mt-2 space-y-1.5 text-sm">
      {rows.map(({ label, value, technical }) => (
        <div key={label} className="flex items-baseline justify-between gap-3 min-w-0">
          <dt className="text-text-muted shrink-0">{label}</dt>
          <dd className="text-text-main truncate">
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

/** Replace this node's mesh configuration with the one from an invite code, after explicit confirmation. */
export const JoinMeshModal: React.FC<JoinMeshModalProps> = ({ current, t, onClose, onJoined }) => {
  const [step, setStep] = useState<Step>('details');
  const [inviteText, setInviteText] = useState('');
  const [hostname, setHostname] = useState(current.hostname || '');
  const [ipv4, setIpv4] = useState(() => suggestVirtualIp([current.ipv4]));
  const [port, setPort] = useState(String(current.port || 11010));
  const [submitted, setSubmitted] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [error, setError] = useState<{ message: string; details?: string } | null>(null);

  const parsed = useMemo(() => parseInviteToken(inviteText), [inviteText]);
  const errors = { hostname: validateHostname(hostname), ipv4: validateIpv4(ipv4), port: validatePort(port) };
  const shown = (err: ReturnType<typeof validateHostname>) => (submitted && err ? t(err) : null);
  const invite = parsed.status === 'ok' ? parsed.invite : null;

  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!invite) return;
    if (errors.hostname || errors.ipv4 || errors.port) {
      if (errors.port) setAdvancedOpen(true);
      return;
    }
    setError(null);
    setStep('confirm');
  };

  const handleJoin = async () => {
    if (!invite) return;
    setStep('working');
    setError(null);
    try {
      const result = await joinMeshNetwork(inviteText, { hostname: hostname.trim(), ipv4: ipv4.trim(), port: Number(port) });
      onJoined(result);
    } catch (err) {
      setError(describeJoinError(err, t, true));
      setStep('confirm');
    }
  };

  return (
    <ModalShell isOpen onClose={onClose} closable={step !== 'working'} labelledBy="join-mesh-title">
      {step === 'details' && (
        <form onSubmit={handleContinue} noValidate className="space-y-5">
          <header className="flex items-start justify-between gap-3">
            <div>
              <h2 id="join-mesh-title" className="text-lg font-bold text-text-main">
                {t('join_title')}
              </h2>
              <p className="mt-1 text-sm text-text-muted leading-relaxed">{t('join_desc')}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('btn_cancel')}
              className="inline-flex items-center justify-center w-9 h-9 shrink-0 rounded-lg text-text-muted hover:text-text-main hover:bg-surface transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </header>

          <InviteCodeField value={inviteText} onChange={setInviteText} parsed={parsed} autoFocus t={t} />

          {invite && (
            <div className="space-y-4 animate-fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextField
                  label={t('node_field_hostname')}
                  value={hostname}
                  onChange={setHostname}
                  error={shown(errors.hostname)}
                  technical
                />
                <TextField
                  label={t('node_field_vip')}
                  hint={t('node_field_vip_hint')}
                  value={ipv4}
                  onChange={setIpv4}
                  error={shown(errors.ipv4)}
                  technical
                  numeric
                />
              </div>
              <Disclosure label={t('node_advanced')} open={advancedOpen} onOpenChange={setAdvancedOpen}>
                <div className="sm:max-w-[calc(50%-0.5rem)]">
                  <TextField
                    label={t('node_field_port')}
                    hint={t('node_field_port_hint')}
                    value={port}
                    onChange={setPort}
                    error={shown(errors.port)}
                    technical
                    numeric
                  />
                </div>
              </Disclosure>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className={btnSecondary}>
              {t('btn_cancel')}
            </button>
            <button type="submit" disabled={!invite} className={btnPrimary}>
              {t('join_btn_continue')}
            </button>
          </div>
        </form>
      )}

      {step === 'confirm' && invite && (
        <div className="space-y-5">
          <header className="flex items-start gap-3">
            <span className="flex items-center justify-center w-10 h-10 shrink-0 rounded-xl bg-rose-500/15 text-rose-400" aria-hidden="true">
              <AlertTriangle className="w-5 h-5" />
            </span>
            <h2 id="join-mesh-title" className="pt-2 text-lg font-bold text-text-main">
              {t('join_confirm_title')}
            </h2>
          </header>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Comparison
              title={t('join_confirm_current')}
              rows={[
                { label: t('node_label_network'), value: current.network_name, technical: true },
                { label: t('node_field_vip'), value: current.ipv4, technical: true },
                { label: t('node_label_protocol'), value: protocolLabel(String(current.protocol), t) },
                { label: t('node_peers_heading'), value: String(current.peers?.length ?? 0), technical: true },
              ]}
            />
            <Comparison
              highlight
              title={t('join_confirm_next')}
              rows={[
                { label: t('node_label_network'), value: invite.net, technical: true },
                { label: t('node_field_vip'), value: ipv4.trim(), technical: true },
                { label: t('node_label_protocol'), value: protocolLabel(invite.proto, t) },
                { label: t('node_peers_heading'), value: invite.endpoint || '-', technical: true },
              ]}
            />
          </div>

          <ul className="space-y-2 text-sm leading-relaxed">
            <li className="flex items-start gap-2 text-text-main">
              <X className="w-4 h-4 mt-0.5 shrink-0 text-rose-400" aria-hidden="true" />
              <span>{fillTemplate(t('join_confirm_leave'), { network: <bdi className="font-semibold">{current.network_name}</bdi> })}</span>
            </li>
            <li className="flex items-start gap-2 text-text-main">
              <X className="w-4 h-4 mt-0.5 shrink-0 text-rose-400" aria-hidden="true" />
              <span>{t('join_confirm_replaced')}</span>
            </li>
            <li className="flex items-start gap-2 text-text-muted">
              <Check className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" aria-hidden="true" />
              <span>{t('join_confirm_kept')}</span>
            </li>
            <li className="flex items-start gap-2 text-text-muted">
              <Check className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" aria-hidden="true" />
              <span>{t('join_confirm_restore')}</span>
            </li>
          </ul>

          {error && <ErrorPanel message={error.message} details={error.details} t={t} />}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button type="button" onClick={() => setStep('details')} className={btnSecondary}>
              {t('btn_back')}
            </button>
            <button type="button" onClick={handleJoin} className={btnDanger}>
              {t('join_btn_confirm')}
            </button>
          </div>
        </div>
      )}

      {step === 'working' && invite && (
        <div className="py-8 flex flex-col items-center text-center gap-3" role="status" aria-live="polite">
          <Loader2 className="w-8 h-8 animate-spin text-primary" aria-hidden="true" />
          <h2 id="join-mesh-title" className="text-base font-semibold text-text-main">
            {fillTemplate(t('join_working'), { network: <bdi>{invite.net}</bdi> })}
          </h2>
          <p className="max-w-sm text-sm text-text-muted leading-relaxed">{t('join_working_hint')}</p>
        </div>
      )}
    </ModalShell>
  );
};
