import React, { useMemo, useState } from 'react';
import { Globe, Loader2, Trash2 } from 'lucide-react';
import { MeshProtocol, NodeConfig } from '../../types';
import type { Translate } from '../../i18n/translations';
import { saveNodeConfig } from '../../services/api';
import { generateSecret } from '../../utils/meshInvite';
import { changedFields, formFromConfig, formToPayload, NodeForm, SHARED_FIELDS, validateNodeForm } from '../../utils/nodeForm';
import { btnDangerSoft, btnGhost, btnPrimary, btnSecondary, cardClass } from '../ui';
import {
  Disclosure,
  ErrorPanel,
  ProtocolPicker,
  SecretField,
  SwitchField,
  TextField,
} from './FormControls';

export interface ClusterSyncConfig {
  protocol: MeshProtocol;
  enableKcp: boolean;
  encryption: boolean;
  ipv6: boolean;
  mtu: number;
  networkSecret: string;
  hostname: string;
  ipv4: string;
}

interface SettingsPanelProps {
  config: NodeConfig;
  peers: string[];
  t: Translate;
  onSaved: () => void;
  onNotify: (msg: string, type: 'success' | 'error' | 'info') => void;
  onOpenClusterSync?: (cfg: ClusterSyncConfig) => void;
  onDeleteRequest: () => void;
}

const Section: React.FC<{ title: string; description?: string; children: React.ReactNode; first?: boolean }> = ({
  title,
  description,
  children,
  first,
}) => (
  <section className={`grid grid-cols-1 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] gap-x-8 gap-y-4 ${first ? '' : 'pt-6 border-t border-card-border'}`}>
    <div>
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      {description && <p className="mt-1 text-xs text-text-muted leading-relaxed">{description}</p>}
    </div>
    <div className="min-w-0">{children}</div>
  </section>
);

/**
 * One form for every node setting. Edits stay local until the sticky bar saves them,
 * so there is exactly one place to save and it only appears when something changed.
 */
export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  config,
  peers,
  t,
  onSaved,
  onNotify,
  onOpenClusterSync,
  onDeleteRequest,
}) => {
  const baseline = useMemo(() => formFromConfig(config), [config]);
  const [form, setForm] = useState<NodeForm>(baseline);
  const [touched, setTouched] = useState<Partial<Record<keyof NodeForm, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const errors = validateNodeForm(form);
  const changed = changedFields(form, baseline);
  const dirty = changed.length > 0;
  // SafeSync only broadcasts shared settings, so it is offered only when nothing else changed.
  const sharedOnly = dirty && changed.every((field) => SHARED_FIELDS.includes(field));

  const update = <K extends keyof NodeForm>(key: K, value: NodeForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaveError(null);
  };
  const touch = (key: keyof NodeForm) => setTouched((prev) => ({ ...prev, [key]: true }));
  const shown = (key: keyof NodeForm) => {
    const err = errors[key];
    return err && (submitted || touched[key]) ? t(err) : null;
  };

  const blockOnErrors = () => {
    setSubmitted(true);
    if (Object.keys(errors).length === 0) return false;
    if (errors.mtu) setAdvancedOpen(true);
    return true;
  };

  const handleSave = async () => {
    if (blockOnErrors()) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveNodeConfig(formToPayload(form, peers));
      onNotify(t('node_save_success'), 'success');
      onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleApplyAll = () => {
    if (blockOnErrors() || !onOpenClusterSync) return;
    onOpenClusterSync({
      protocol: form.protocol,
      enableKcp: form.enableKcp,
      encryption: form.encryption,
      ipv6: form.ipv6,
      mtu: Number(form.mtu),
      networkSecret: form.networkSecret.trim(),
      hostname: form.hostname.trim(),
      ipv4: form.ipv4.trim(),
    });
  };

  const discard = () => {
    setForm(baseline);
    setTouched({});
    setSubmitted(false);
    setSaveError(null);
  };

  return (
    <div className="space-y-4">
      <div className={`${cardClass} p-5 sm:p-6 space-y-6`}>
        <Section title={t('node_section_identity')} description={t('node_section_identity_desc')} first>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            <TextField
              label={t('node_field_hostname')}
              hint={t('node_field_hostname_hint')}
              value={form.hostname}
              onChange={(v) => update('hostname', v)}
              onBlur={() => touch('hostname')}
              error={shown('hostname')}
              technical
            />
            <TextField
              label={t('node_field_vip')}
              hint={t('node_field_vip_hint')}
              value={form.ipv4}
              onChange={(v) => update('ipv4', v)}
              onBlur={() => touch('ipv4')}
              error={shown('ipv4')}
              technical
              numeric
            />
            <TextField
              label={t('node_field_port')}
              hint={t('node_field_port_hint')}
              value={form.port}
              onChange={(v) => update('port', v)}
              onBlur={() => touch('port')}
              error={shown('port')}
              technical
              numeric
            />
          </div>
        </Section>

        <Section title={t('node_section_network')} description={t('node_section_network_desc')}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TextField
              label={t('node_field_network')}
              value={form.networkName}
              onChange={(v) => update('networkName', v)}
              onBlur={() => touch('networkName')}
              error={shown('networkName')}
              technical
            />
            <SecretField
              label={t('node_field_secret')}
              hint={t('node_field_secret_hint')}
              value={form.networkSecret}
              onChange={(v) => update('networkSecret', v)}
              onBlur={() => touch('networkSecret')}
              onGenerate={() => update('networkSecret', generateSecret())}
              error={shown('networkSecret')}
              t={t}
            />
          </div>
        </Section>

        <Section title={t('node_section_transport')} description={t('node_section_transport_desc')}>
          <div className="space-y-5">
            <ProtocolPicker value={form.protocol} onChange={(v) => update('protocol', v)} hideLegend t={t} />
            <SwitchField
              label={t('node_toggle_kcp')}
              hint={t('node_kcp_desc')}
              checked={form.enableKcp}
              onChange={(v) => update('enableKcp', v)}
            />
            <Disclosure label={t('node_advanced')} open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <SwitchField
                label={t('node_toggle_encryption')}
                hint={t('node_toggle_encryption_hint')}
                checked={form.encryption}
                onChange={(v) => update('encryption', v)}
              />
              <SwitchField
                label={t('node_toggle_ipv6')}
                hint={t('node_toggle_ipv6_hint')}
                checked={form.ipv6}
                onChange={(v) => update('ipv6', v)}
              />
              <div className="md:max-w-xs">
                <TextField
                  label={t('node_field_mtu')}
                  hint={t('node_field_mtu_hint')}
                  value={form.mtu}
                  onChange={(v) => update('mtu', v)}
                  onBlur={() => touch('mtu')}
                  error={shown('mtu')}
                  technical
                  numeric
                />
              </div>
            </Disclosure>
          </div>
        </Section>
      </div>

      <section className="rounded-2xl border border-danger-border bg-danger/5 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-danger">{t('node_danger_title')}</h3>
          <p className="mt-1 text-sm text-text-muted leading-relaxed max-w-xl">{t('node_delete_desc')}</p>
        </div>
        <button type="button" onClick={onDeleteRequest} className={`${btnDangerSoft} shrink-0`}>
          <Trash2 className="w-4 h-4" aria-hidden="true" />
          <span>{t('node_btn_delete')}</span>
        </button>
      </section>

      {dirty && (
        <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-4 z-30">
          <div
            role="region"
            aria-label={t('node_unsaved')}
            className="rounded-2xl bg-elevated border border-primary-border shadow-pop p-3 sm:p-4 space-y-3 animate-fade-in"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0 flex items-start gap-2.5">
                <span className="mt-[0.45em] w-2 h-2 shrink-0 rounded-full bg-warning" aria-hidden="true" />
                <div className="min-w-0">
                <p className="text-sm font-semibold text-text-primary">{t('node_unsaved')}</p>
                <p className="text-xs text-text-muted">{t('node_unsaved_hint')}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={discard} disabled={saving} className={btnGhost}>
                  {t('node_btn_discard')}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className={`${sharedOnly ? btnSecondary : btnPrimary} flex-1 sm:flex-none`}
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                  <span>{saving ? t('node_saving') : t('node_btn_save_local')}</span>
                </button>
                {sharedOnly && onOpenClusterSync && (
                  <button
                    type="button"
                    onClick={handleApplyAll}
                    disabled={saving}
                    title={t('cluster_btn_sync_all_desc')}
                    className={`${btnPrimary} w-full sm:w-auto`}
                  >
                    <Globe className="w-4 h-4" aria-hidden="true" />
                    <span>{t('node_btn_save_all')}</span>
                  </button>
                )}
              </div>
            </div>
            {saveError && <ErrorPanel message={t('node_save_failed')} details={saveError} t={t} />}
          </div>
        </div>
      )}
    </div>
  );
};
