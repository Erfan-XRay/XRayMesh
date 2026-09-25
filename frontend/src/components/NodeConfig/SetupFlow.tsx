import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Copy, Link2, Loader2, Plus } from 'lucide-react';
import { NodeConfig } from '../../types';
import type { Translate } from '../../i18n/translations';
import { fillTemplate } from '../../i18n/fillTemplate';
import { fetchMeshInvite, joinMeshNetwork, saveNodeConfig } from '../../services/api';
import { generateSecret, parseInviteToken, suggestVirtualIp } from '../../utils/meshInvite';
import {
  formFromConfig,
  formToPayload,
  NodeForm,
  validateHostname,
  validateIpv4,
  validateNodeForm,
  validatePort,
} from '../../utils/nodeForm';
import {
  btnPrimary,
  btnSecondary,
  cardClass,
  Disclosure,
  ErrorPanel,
  iconBtn,
  ProtocolPicker,
  SecretField,
  SwitchField,
  TextField,
} from './FormControls';
import { InviteCodeField } from './InviteCodeField';
import { describeJoinError } from './joinErrors';

type Step = 'choose' | 'join' | 'create' | 'done';

interface SetupResult {
  mode: 'join' | 'create';
  network: string;
  hostname: string;
  ipv4: string;
  inviteCode?: string;
  noPublicIp?: boolean;
}

interface SetupFlowProps {
  config: NodeConfig;
  t: Translate;
  onCopy: (text: string) => void;
  copiedKey: string | null;
  /** Runs as soon as the node is configured so the dashboard can refresh behind the success screen. */
  onConfigured: () => void;
  /** Runs when the user leaves the success screen. */
  onFinished: () => void;
}

const ChoiceCard: React.FC<{ icon: React.ReactNode; title: string; desc: string; onClick: () => void }> = ({
  icon,
  title,
  desc,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="group flex flex-col text-start p-4 sm:p-5 rounded-2xl border border-card-border hover:border-primary-border hover:bg-primary-subtle transition-colors cursor-pointer"
  >
    <span className="flex items-center justify-between gap-3 mb-3">
      <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary-subtle text-primary" aria-hidden="true">
        {icon}
      </span>
      <ArrowRight
        className="w-4 h-4 text-text-subtle group-hover:text-primary transition-colors rtl:-scale-x-100"
        aria-hidden="true"
      />
    </span>
    <span className="text-base font-semibold text-text-main">{title}</span>
    <span className="mt-1 text-sm text-text-muted leading-relaxed">{desc}</span>
  </button>
);

export const SetupFlow: React.FC<SetupFlowProps> = ({ config, t, onCopy, copiedKey, onConfigured, onFinished }) => {
  const [step, setStep] = useState<Step>('choose');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; details?: string } | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<keyof NodeForm, boolean>>>({});
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [result, setResult] = useState<SetupResult | null>(null);

  const [form, setForm] = useState<NodeForm>(() => ({
    ...formFromConfig(config),
    networkName: config.network_name || 'xraymesh',
    ipv4: '10.144.144.1',
    networkSecret: config.network_secret || generateSecret(),
  }));
  const [inviteText, setInviteText] = useState('');
  const [joinIpv4, setJoinIpv4] = useState(() => suggestVirtualIp());
  const parsedInvite = useMemo(() => parseInviteToken(inviteText), [inviteText]);

  const createErrors = validateNodeForm(form);
  const joinErrors = {
    hostname: validateHostname(form.hostname),
    ipv4: validateIpv4(joinIpv4),
    port: validatePort(form.port),
  };

  const update = <K extends keyof NodeForm>(key: K, value: NodeForm[K]) => setForm((prev) => ({ ...prev, [key]: value }));
  const touch = (key: keyof NodeForm) => setTouched((prev) => ({ ...prev, [key]: true }));
  const shown = (key: keyof NodeForm, err: ReturnType<typeof validateHostname> | undefined) =>
    err && (submitted || touched[key]) ? t(err) : null;

  const goTo = (next: Step) => {
    setStep(next);
    setError(null);
    setSubmitted(false);
    setTouched({});
    setAdvancedOpen(false);
  };

  const finish = (res: SetupResult) => {
    setResult(res);
    setStep('done');
    onConfigured();
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (parsedInvite.status !== 'ok') return;
    if (joinErrors.hostname || joinErrors.ipv4 || joinErrors.port) {
      if (joinErrors.port) setAdvancedOpen(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await joinMeshNetwork(inviteText, {
        hostname: form.hostname.trim(),
        ipv4: joinIpv4.trim(),
        port: Number(form.port),
      });
      finish({ mode: 'join', network: res.network_name, hostname: res.hostname, ipv4: res.ipv4 });
    } catch (err) {
      setError(describeJoinError(err, t, false));
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(createErrors).length > 0) {
      if (createErrors.port || createErrors.mtu || createErrors.networkSecret) setAdvancedOpen(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveNodeConfig(formToPayload(form, []));
      let inviteCode: string | undefined;
      let noPublicIp = false;
      try {
        const invite = await fetchMeshInvite();
        if (invite.details.endpoint) inviteCode = invite.invite;
        else noPublicIp = true;
      } catch {
        // The code is still available later under Peers & invite.
      }
      finish({
        mode: 'create',
        network: form.networkName.trim(),
        hostname: form.hostname.trim(),
        ipv4: form.ipv4.trim(),
        inviteCode,
        noPublicIp,
      });
    } catch (err) {
      setError({ message: t('setup_err_create'), details: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const stepHeader = (title: string) => (
    <div className="flex items-center gap-2 mb-5">
      <button type="button" onClick={() => goTo('choose')} disabled={busy} aria-label={t('btn_back')} title={t('btn_back')} className={iconBtn}>
        <ArrowLeft className="w-4 h-4 rtl:-scale-x-100" aria-hidden="true" />
      </button>
      <h2 id="setup-title" className="text-lg font-bold text-text-main">
        {title}
      </h2>
    </div>
  );

  const submitLabel = (idle: string, working: string) =>
    busy ? (
      <>
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        <span>{working}</span>
      </>
    ) : (
      <span>{idle}</span>
    );

  return (
    <section aria-labelledby="setup-title" className={`${cardClass} max-w-2xl mx-auto p-5 sm:p-7 animate-fade-in`}>
      {step === 'choose' && (
        <div className="space-y-6">
          <header>
            <h2 id="setup-title" className="text-lg sm:text-xl font-bold text-text-main">
              {t('setup_title')}
            </h2>
            <p className="mt-1 text-sm text-text-muted leading-relaxed">{t('setup_desc')}</p>
          </header>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ChoiceCard
              icon={<Link2 className="w-5 h-5" />}
              title={t('setup_join_title')}
              desc={t('setup_join_desc')}
              onClick={() => goTo('join')}
            />
            <ChoiceCard
              icon={<Plus className="w-5 h-5" />}
              title={t('setup_create_title')}
              desc={t('setup_create_desc')}
              onClick={() => goTo('create')}
            />
          </div>
          <p className="text-xs text-text-subtle">{t('setup_mode_locked_notice')}</p>
        </div>
      )}

      {step === 'join' && (
        <form onSubmit={handleJoin} noValidate>
          {stepHeader(t('setup_join_title'))}
          <div className="space-y-5">
            <InviteCodeField
              value={inviteText}
              onChange={(value) => {
                setInviteText(value);
                setError(null);
              }}
              parsed={parsedInvite}
              disabled={busy}
              autoFocus
              t={t}
            />
            {parsedInvite.status === 'ok' && (
              <div className="space-y-4 animate-fade-in">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <TextField
                    label={t('node_field_hostname')}
                    hint={t('node_field_hostname_hint')}
                    value={form.hostname}
                    onChange={(v) => update('hostname', v)}
                    onBlur={() => touch('hostname')}
                    error={shown('hostname', joinErrors.hostname)}
                    technical
                    disabled={busy}
                  />
                  <TextField
                    label={t('node_field_vip')}
                    hint={t('node_field_vip_hint')}
                    value={joinIpv4}
                    onChange={setJoinIpv4}
                    onBlur={() => touch('ipv4')}
                    error={shown('ipv4', joinErrors.ipv4)}
                    technical
                    numeric
                    disabled={busy}
                  />
                </div>
                <Disclosure label={t('node_advanced')} open={advancedOpen} onOpenChange={setAdvancedOpen}>
                  <div className="sm:max-w-[calc(50%-0.5rem)]">
                    <TextField
                      label={t('node_field_port')}
                      hint={t('node_field_port_hint')}
                      value={form.port}
                      onChange={(v) => update('port', v)}
                      onBlur={() => touch('port')}
                      error={shown('port', joinErrors.port)}
                      technical
                      numeric
                      disabled={busy}
                    />
                  </div>
                </Disclosure>
              </div>
            )}
            {error && <ErrorPanel message={error.message} details={error.details} t={t} />}
            <div className="flex justify-end">
              <button type="submit" disabled={busy || parsedInvite.status !== 'ok'} className={`${btnPrimary} w-full sm:w-auto`}>
                {submitLabel(t('setup_btn_join'), t('setup_joining'))}
              </button>
            </div>
          </div>
        </form>
      )}

      {step === 'create' && (
        <form onSubmit={handleCreate} noValidate>
          {stepHeader(t('setup_create_title'))}
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextField
                label={t('node_field_hostname')}
                hint={t('node_field_hostname_hint')}
                value={form.hostname}
                onChange={(v) => update('hostname', v)}
                onBlur={() => touch('hostname')}
                error={shown('hostname', createErrors.hostname)}
                technical
                autoFocus
                disabled={busy}
              />
              <TextField
                label={t('node_field_network')}
                value={form.networkName}
                onChange={(v) => update('networkName', v)}
                onBlur={() => touch('networkName')}
                error={shown('networkName', createErrors.networkName)}
                technical
                disabled={busy}
              />
              <TextField
                label={t('node_field_vip')}
                hint={t('node_field_vip_hint')}
                value={form.ipv4}
                onChange={(v) => update('ipv4', v)}
                onBlur={() => touch('ipv4')}
                error={shown('ipv4', createErrors.ipv4)}
                technical
                numeric
                disabled={busy}
              />
            </div>
            <Disclosure label={t('node_advanced')} open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SecretField
                  label={t('node_field_secret')}
                  hint={t('node_field_secret_hint')}
                  value={form.networkSecret}
                  onChange={(v) => update('networkSecret', v)}
                  onBlur={() => touch('networkSecret')}
                  onGenerate={() => update('networkSecret', generateSecret())}
                  error={shown('networkSecret', createErrors.networkSecret)}
                  disabled={busy}
                  t={t}
                />
                <TextField
                  label={t('node_field_port')}
                  hint={t('node_field_port_hint')}
                  value={form.port}
                  onChange={(v) => update('port', v)}
                  onBlur={() => touch('port')}
                  error={shown('port', createErrors.port)}
                  technical
                  numeric
                  disabled={busy}
                />
              </div>
              <ProtocolPicker value={form.protocol} onChange={(v) => update('protocol', v)} disabled={busy} t={t} />
              <div className="space-y-4">
                <SwitchField
                  label={t('node_toggle_kcp')}
                  hint={t('node_kcp_desc')}
                  checked={form.enableKcp}
                  onChange={(v) => update('enableKcp', v)}
                  disabled={busy}
                />
                <SwitchField
                  label={t('node_toggle_encryption')}
                  hint={t('node_toggle_encryption_hint')}
                  checked={form.encryption}
                  onChange={(v) => update('encryption', v)}
                  disabled={busy}
                />
                <SwitchField
                  label={t('node_toggle_ipv6')}
                  hint={t('node_toggle_ipv6_hint')}
                  checked={form.ipv6}
                  onChange={(v) => update('ipv6', v)}
                  disabled={busy}
                />
              </div>
              <div className="sm:max-w-[calc(50%-0.5rem)]">
                <TextField
                  label={t('node_field_mtu')}
                  hint={t('node_field_mtu_hint')}
                  value={form.mtu}
                  onChange={(v) => update('mtu', v)}
                  onBlur={() => touch('mtu')}
                  error={shown('mtu', createErrors.mtu)}
                  technical
                  numeric
                  disabled={busy}
                />
              </div>
            </Disclosure>
            {error && <ErrorPanel message={error.message} details={error.details} t={t} />}
            <div className="flex justify-end">
              <button type="submit" disabled={busy} className={`${btnPrimary} w-full sm:w-auto`}>
                {submitLabel(t('setup_btn_create'), t('setup_creating'))}
              </button>
            </div>
          </div>
        </form>
      )}

      {step === 'done' && result && (
        <div className="space-y-5 animate-fade-in">
          <header className="flex items-start gap-3">
            <span className="flex items-center justify-center w-10 h-10 shrink-0 rounded-xl bg-emerald-500/15 text-emerald-400" aria-hidden="true">
              <CheckCircle2 className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h2 id="setup-title" className="text-lg font-bold text-text-main">
                {fillTemplate(t(result.mode === 'join' ? 'setup_done_join_title' : 'setup_done_create_title'), {
                  network: <bdi>{result.network}</bdi>,
                })}
              </h2>
              <p className="mt-1 text-sm text-text-muted leading-relaxed">
                {t(result.mode === 'join' ? 'setup_done_join_desc' : 'setup_done_create_desc')}
              </p>
            </div>
          </header>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="p-3 rounded-xl bg-surface border border-card-border">
              <dt className="text-xs text-text-muted">{t('node_field_hostname')}</dt>
              <dd className="mt-0.5 font-medium text-text-main truncate">
                <bdi dir="ltr" className="font-mono">
                  {result.hostname}
                </bdi>
              </dd>
            </div>
            <div className="p-3 rounded-xl bg-surface border border-card-border">
              <dt className="text-xs text-text-muted">{t('node_field_vip')}</dt>
              <dd className="mt-0.5 font-medium text-text-main">
                <bdi dir="ltr" className="font-mono">
                  {result.ipv4}
                </bdi>
              </dd>
            </div>
          </dl>

          {result.inviteCode && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-text-main">{t('invite_label')}</p>
              <div dir="ltr" className="p-3 rounded-xl bg-input border border-card-border font-mono text-xs leading-relaxed text-text-main break-all select-all">
                {result.inviteCode}
              </div>
              <button type="button" onClick={() => onCopy(result.inviteCode!)} className={btnSecondary}>
                {copiedKey === result.inviteCode ? (
                  <Check className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                ) : (
                  <Copy className="w-4 h-4" aria-hidden="true" />
                )}
                <span>{t('node_btn_copy_code')}</span>
              </button>
            </div>
          )}
          {result.noPublicIp && <p className="text-sm text-amber-400 leading-relaxed">{t('setup_done_no_ip')}</p>}

          <div className="flex justify-end pt-1">
            <button type="button" onClick={onFinished} className={`${btnPrimary} w-full sm:w-auto`}>
              {t('setup_btn_dashboard')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
