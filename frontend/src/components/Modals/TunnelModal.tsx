import React, { useState, useEffect, useId } from 'react';
import { Peer, HaproxyTunnel, IptablesTunnel, GostTunnel, RealmTunnel, TunnelNodeState } from '../../types';
import { fetchInterfaces } from '../../services/api';
import { Boxes, Cpu, Loader2, Network, Server, Zap } from 'lucide-react';
import type { Translate, TranslationKey } from '../../i18n/translations';
import { formatText } from '../../i18n/fillTemplate';
import { toAsciiDigits } from '../../utils/meshInvite';
import { FieldError } from '../NodeConfig/FormControls';
import { btnPrimary, btnSecondary, Callout, hintClass, inputClass, labelClass, Pill, Segmented, selectClass, toneSoft, Tone } from '../ui';
import { ModalClose, ModalShell } from './ModalShell';

export type TunnelModalType = 'haproxy' | 'iptables' | 'gost' | 'realm';

interface TunnelModalProps {
  isOpen: boolean;
  type: TunnelModalType;
  isEdit: boolean;
  initialData?: HaproxyTunnel | IptablesTunnel | GostTunnel | RealmTunnel | null;
  peers: Peer[];
  /** Per-node reachability from the tunnels view, used to flag unreachable origins. */
  nodeStates?: TunnelNodeState[];
  /** Origin preselected for new tunnels (the node the tunnels view is scoped to). */
  defaultOriginNode?: string;
  interfaces: string[];
  onClose: () => void;
  onSubmit: (formData: any) => Promise<void>;
  t: Translate;
}

const ENGINES: Record<TunnelModalType, { name: string; icon: React.ReactNode; tone: Tone; desc: TranslationKey }> = {
  realm: { name: 'Realm', icon: <Cpu className="w-5 h-5" />, tone: 'success', desc: 'tunnels_realm_desc' },
  haproxy: { name: 'HAProxy', icon: <Network className="w-5 h-5" />, tone: 'primary', desc: 'tunnels_haproxy_desc' },
  iptables: { name: 'iptables', icon: <Boxes className="w-5 h-5" />, tone: 'info', desc: 'tunnels_iptables_desc' },
  gost: { name: 'GOST', icon: <Zap className="w-5 h-5" />, tone: 'warning', desc: 'tunnels_gost_desc' },
};

const PRESETS: Record<TunnelModalType, { val: string; key: TranslationKey }[]> = {
  haproxy: [
    { val: '80,443', key: 'preset_web' },
    { val: '443', key: 'preset_https' },
    { val: '1234:443', key: 'preset_map' },
    { val: '8000-8010', key: 'preset_range' },
    { val: '2222', key: 'preset_ssh' },
  ],
  iptables: [
    { val: '443', key: 'preset_quic' },
    { val: '1234:443', key: 'preset_map' },
    { val: '20000-20100', key: 'preset_hopping' },
    { val: '80,443', key: 'preset_multi' },
    { val: '53', key: 'preset_dns' },
  ],
  realm: [
    { val: '80,443', key: 'preset_web' },
    { val: '443', key: 'preset_https' },
    { val: '1234:443', key: 'preset_map' },
    { val: '8000-8010', key: 'preset_range' },
    { val: '2222', key: 'preset_ssh' },
  ],
  gost: [
    { val: '80,443', key: 'preset_web' },
    { val: '443', key: 'preset_https' },
    { val: '1234:443', key: 'preset_map' },
    { val: '8000-8010', key: 'preset_range' },
    { val: '1080', key: 'preset_socks' },
  ],
};

const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;

export const TunnelModal: React.FC<TunnelModalProps> = ({
  isOpen,
  type,
  isEdit,
  initialData,
  peers,
  nodeStates = [],
  defaultOriginNode = '',
  interfaces,
  onClose,
  onSubmit,
  t,
}) => {
  const [name, setName] = useState('');
  const [originNode, setOriginNode] = useState('');
  const [target, setTarget] = useState('');
  const [ports, setPorts] = useState('');
  const [protocol, setProtocol] = useState('udp');
  const [iface, setIface] = useState('any');
  const [sourceCidr, setSourceCidr] = useState('0.0.0.0/0');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  const [nodeInterfaces, setNodeInterfaces] = useState<string[]>(interfaces || ['any']);
  const [loadingInterfaces, setLoadingInterfaces] = useState(false);
  const [interfaceError, setInterfaceError] = useState<string | null>(null);

  const isRemoteIptablesEdit = Boolean(
    type === 'iptables' &&
      isEdit &&
      ((initialData as any)?._is_local === false || ((initialData as any)?._node_ip && (initialData as any)?._is_local !== true))
  );

  useEffect(() => {
    if (!isOpen || type !== 'iptables') return;

    let isMounted = true;
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 6000);

    const initialIface = (initialData as IptablesTunnel)?.IN_IF;
    const baseInterfaces = interfaces && interfaces.length > 0 ? interfaces : ['any'];
    const mergedBase =
      initialIface && initialIface !== 'any' && !baseInterfaces.includes(initialIface) ? [...baseInterfaces, initialIface] : baseInterfaces;

    setNodeInterfaces(mergedBase);
    setIface((prev) => (mergedBase.includes(prev) ? prev : initialIface || 'any'));
    setInterfaceError(null);

    if (isRemoteIptablesEdit) {
      setLoadingInterfaces(false);
      return () => {
        isMounted = false;
        abortController.abort();
        clearTimeout(timeout);
      };
    }

    setLoadingInterfaces(true);
    fetchInterfaces(undefined, abortController.signal)
      .then((ifaces) => {
        if (isMounted) {
          const list = ifaces && ifaces.length > 0 ? ifaces : ['any'];
          const finalList = initialIface && initialIface !== 'any' && !list.includes(initialIface) ? [...list, initialIface] : list;
          setNodeInterfaces(finalList);
          setIface((prev) => (finalList.includes(prev) ? prev : initialIface || 'any'));
        }
      })
      .catch((requestError: unknown) => {
        if (isMounted) {
          setNodeInterfaces(mergedBase);
          if (mergedBase.length === 1 && mergedBase[0] === 'any') {
            setInterfaceError(
              requestError instanceof DOMException && requestError.name === 'AbortError'
                ? t('modal_tunnel_interfaces_timeout')
                : requestError instanceof Error
                  ? requestError.message
                  : t('modal_tunnel_interfaces_error')
            );
          }
        }
      })
      .finally(() => {
        if (isMounted) setLoadingInterfaces(false);
      });

    return () => {
      isMounted = false;
      abortController.abort();
      clearTimeout(timeout);
    };
  }, [isOpen, type, interfaces, initialData, isRemoteIptablesEdit, t]);

  useEffect(() => {
    if (initialData && isEdit) {
      setName(initialData.TUNNEL_NAME || '');
      setOriginNode(type === 'iptables' ? '' : (initialData as any)._node_ip || '');
      setTarget(initialData.TARGET_IP || '');
      setPorts(initialData.PORT_SPEC || '');
      if (type === 'iptables') {
        const ipt = initialData as IptablesTunnel;
        setProtocol(ipt.FORWARD_PROTOCOL || 'udp');
        setIface(ipt.IN_IF || 'any');
        setSourceCidr(ipt.SOURCE_CIDR || '0.0.0.0/0');
      } else if (type === 'gost') {
        setProtocol((initialData as GostTunnel).PROTOCOL || 'both');
      } else if (type === 'realm') {
        setProtocol((initialData as RealmTunnel).PROTOCOL || 'both');
      }
    } else {
      setName('');
      setOriginNode(type === 'iptables' ? '' : defaultOriginNode);
      setTarget('');
      setPorts('');
      setProtocol(type === 'gost' || type === 'realm' ? 'both' : 'udp');
      setIface('any');
      setSourceCidr('0.0.0.0/0');
    }
    setError(null);
  }, [initialData, isEdit, type, isOpen, defaultOriginNode]);

  if (!isOpen) return null;

  const engine = ENGINES[type];
  const current = peers.find((p) => p.is_current);
  const originState = nodeStates.find((n) => n.ip === originNode)?.status;
  const originDown = Boolean(originNode && originState && originState !== 'ok' && originState !== 'idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isRemoteIptablesEdit) {
      setError(t('modal_tunnel_iptables_remote_notice'));
      return;
    }
    if (!name.trim() || !target.trim() || !ports.trim()) {
      setError(t('tunnel_err_required'));
      return;
    }
    if (!NAME_PATTERN.test(name.trim())) {
      setError(t('tunnel_err_name'));
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      await onSubmit({
        isEdit,
        name: name.trim(),
        originNode: type === 'iptables' ? undefined : originNode.trim() || undefined,
        target: target.trim(),
        ports: ports.trim(),
        protocol,
        interface: iface,
        sourceCidr: sourceCidr.trim(),
        source_cidr: sourceCidr.trim(),
      });
      onClose();
    } catch (err: any) {
      setError(err.message || t('toast_save_failed'));
    } finally {
      setIsLoading(false);
    }
  };

  const protocolOptions =
    type === 'iptables'
      ? [
          { value: 'udp', label: 'UDP' },
          { value: 'tcp', label: 'TCP' },
          { value: 'both', label: 'TCP + UDP' },
        ]
      : [
          { value: 'both', label: 'TCP + UDP' },
          { value: 'tcp', label: 'TCP' },
          { value: 'udp', label: 'UDP' },
        ];

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} closable={!isLoading} labelledBy="tunnel-title" maxWidth="sm:max-w-xl">
      <header className="flex items-start justify-between gap-3 mb-5">
        <div className="flex items-start gap-3 min-w-0">
          <span className={`flex items-center justify-center w-10 h-10 shrink-0 rounded-xl border ${toneSoft(engine.tone)}`} aria-hidden="true">
            {engine.icon}
          </span>
          <div className="min-w-0">
            <h2 id="tunnel-title" className="text-lg font-semibold text-text-primary leading-snug">
              {formatText(t(isEdit ? 'tunnel_modal_title_edit' : 'tunnel_modal_title_create'), { engine: engine.name })}
            </h2>
            <p className="mt-0.5 text-sm text-text-muted leading-relaxed">{t(engine.desc)}</p>
          </div>
        </div>
        <ModalClose onClick={onClose} label={t('btn_cancel')} disabled={isLoading} />
      </header>

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {isRemoteIptablesEdit && (
          <Callout tone="warning" title={t('modal_tunnel_iptables_remote_warning_title')}>
            {t('modal_tunnel_iptables_remote_notice')}
          </Callout>
        )}

        {/* Origin server */}
        {type === 'iptables' ? (
          <div className="space-y-1.5">
            <p className={labelClass}>{t('tunnels_origin_server')}</p>
            <div className="p-3 rounded-xl bg-surface border border-card-border space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 min-w-0">
                  <Server className="w-4 h-4 text-text-muted shrink-0" aria-hidden="true" />
                  <bdi className="text-sm font-medium text-text-primary truncate">
                    {isRemoteIptablesEdit
                      ? (initialData as any)?._node_name || (initialData as any)?._node_ip || t('modal_tunnel_remote_server')
                      : current?.hostname || current?.ipv4 || t('tunnels_origin_local')}
                  </bdi>
                  <span className="font-mono text-xs text-text-subtle" dir="ltr">
                    {isRemoteIptablesEdit ? (initialData as any)?._node_ip || '' : current?.ipv4 || ''}
                  </span>
                </span>
                <Pill tone="info">{t('modal_tunnel_iptables_kernel_level')}</Pill>
              </div>
              <p className={hintClass}>{isRemoteIptablesEdit ? t('modal_tunnel_iptables_remote_notice') : t('modal_tunnel_iptables_local_notice')}</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-origin`} className={labelClass}>
              {t('tunnels_origin_server')}
            </label>
            <select
              id={`${id}-origin`}
              value={originNode}
              onChange={(e) => setOriginNode(e.target.value)}
              disabled={isEdit}
              className={selectClass}
            >
              <option value="">{t('tunnels_origin_local')}</option>
              {peers
                .filter((p) => !p.is_current)
                .map((p) => {
                  const st = nodeStates.find((n) => n.ip === p.ipv4)?.status;
                  const down = Boolean(st && st !== 'ok' && st !== 'idle');
                  return (
                    <option key={p.ipv4} value={p.ipv4}>
                      {p.hostname || p.ipv4} ({p.ipv4}){down ? ` · ${t('tunnels_node_unreachable_short')}` : ''}
                    </option>
                  );
                })}
            </select>
            {originDown ? (
              <p className="text-xs text-warning leading-relaxed">{t('tunnels_origin_unreachable_warning')}</p>
            ) : (
              <p className={hintClass}>{t('tunnels_origin_server_desc')}</p>
            )}
          </div>
        )}

        {/* Name */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-name`} className={labelClass}>
            {t('modal_tunnel_name')}
          </label>
          <input
            id={`${id}-name`}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isEdit}
            placeholder="web-forward"
            maxLength={32}
            dir="ltr"
            autoComplete="off"
            spellCheck={false}
            aria-describedby={`${id}-name-hint`}
            className={`${inputClass()} font-mono`}
          />
          <p id={`${id}-name-hint`} className={hintClass}>
            {t('tunnel_name_hint')}
          </p>
        </div>

        {/* Destination */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-target`} className={labelClass}>
            {t('modal_tunnel_dest')}
          </label>
          <div className={`grid gap-2 ${peers.length > 0 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
            {peers.length > 0 && (
              <select
                aria-label={t('modal_tunnel_dest_select')}
                value={peers.some((p) => p.ipv4 === target) ? target : ''}
                onChange={(e) => e.target.value && setTarget(e.target.value)}
                disabled={isRemoteIptablesEdit}
                className={selectClass}
              >
                <option value="">{t('modal_tunnel_dest_select')}</option>
                {peers.map((p) => (
                  <option key={p.ipv4} value={p.ipv4}>
                    {p.hostname || p.ipv4} ({p.ipv4})
                  </option>
                ))}
              </select>
            )}
            <input
              id={`${id}-target`}
              type="text"
              inputMode="decimal"
              value={target}
              onChange={(e) => setTarget(toAsciiDigits(e.target.value))}
              disabled={isRemoteIptablesEdit}
              placeholder="10.144.144.2"
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
              className={`${inputClass()} font-mono`}
            />
          </div>
          <p className={hintClass}>{t('tunnel_target_hint')}</p>
        </div>

        {/* Protocol */}
        {type !== 'haproxy' && (
          <div className="flex flex-col gap-1.5">
            <p className={labelClass}>{t('modal_tunnel_proto')}</p>
            <Segmented
              block
              value={protocol}
              onChange={setProtocol}
              ariaLabel={t('modal_tunnel_proto')}
              options={protocolOptions.map((o) => ({ ...o, disabled: isRemoteIptablesEdit, label: <span className="font-mono" dir="ltr">{o.label}</span> }))}
            />
          </div>
        )}

        {/* Ports */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-ports`} className={labelClass}>
            {t('modal_tunnel_ports')}
          </label>
          <input
            id={`${id}-ports`}
            type="text"
            value={ports}
            onChange={(e) => setPorts(toAsciiDigits(e.target.value))}
            disabled={isRemoteIptablesEdit}
            placeholder="80,443 · 8000-8010 · 1234:443"
            dir="ltr"
            autoComplete="off"
            spellCheck={false}
            aria-describedby={`${id}-ports-hint`}
            className={`${inputClass()} font-mono`}
          />
          <p id={`${id}-ports-hint`} className={hintClass}>
            {t('modal_tunnel_ports_help')}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 pt-1" role="group" aria-label={t('modal_tunnel_presets')}>
            <span className="text-xs text-text-subtle me-1">{t('modal_tunnel_presets')}</span>
            {PRESETS[type].map((pr) => {
              const active = ports === pr.val;
              return (
                <button
                  key={`${pr.val}-${pr.key}`}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setPorts(pr.val)}
                  disabled={isRemoteIptablesEdit}
                  className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-xs transition-colors cursor-pointer disabled:opacity-50 ${
                    active ? 'border-primary bg-primary-subtle text-primary' : 'border-card-border text-text-muted hover:text-text-primary hover:border-border-strong'
                  }`}
                >
                  <span className="font-mono font-medium" dir="ltr">
                    {pr.val}
                  </span>
                  <span className="text-text-subtle">{t(pr.key)}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* iptables: inbound interface and allowed sources */}
        {type === 'iptables' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={`${id}-iface`} className={labelClass}>
                  {t('modal_tunnel_interface')}
                </label>
                {loadingInterfaces && (
                  <span className="inline-flex items-center gap-1 text-xs text-primary" role="status">
                    <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
                    {t('modal_tunnel_loading_ifaces')}
                  </span>
                )}
              </div>
              <select
                id={`${id}-iface`}
                value={iface}
                onChange={(e) => setIface(e.target.value)}
                disabled={isRemoteIptablesEdit}
                dir="ltr"
                className={`${selectClass} font-mono`}
              >
                {nodeInterfaces.map((i) => (
                  <option key={i} value={i}>
                    {i === 'any' ? `any · ${t('tunnel_iface_any')}` : i}
                  </option>
                ))}
              </select>
              {interfaceError && <FieldError message={`${t('modal_tunnel_interfaces_error')}: ${interfaceError}`} />}
            </div>

            <div className="flex flex-col gap-1.5 min-w-0">
              <label htmlFor={`${id}-cidr`} className={labelClass}>
                {t('modal_tunnel_source_cidr')}
              </label>
              <input
                id={`${id}-cidr`}
                type="text"
                value={sourceCidr}
                onChange={(e) => setSourceCidr(toAsciiDigits(e.target.value))}
                disabled={isRemoteIptablesEdit}
                placeholder="0.0.0.0/0"
                dir="ltr"
                autoComplete="off"
                spellCheck={false}
                className={`${inputClass()} font-mono`}
              />
            </div>
          </div>
        )}

        {error && <FieldError message={error} />}

        <div className="grid grid-cols-1 sm:flex sm:justify-end gap-2 pt-4 border-t border-card-border">
          <button type="submit" disabled={isLoading || isRemoteIptablesEdit} className={`${btnPrimary} sm:order-last`}>
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            <span>{isEdit ? t('btn_save') : t('btn_create')}</span>
          </button>
          <button type="button" onClick={onClose} disabled={isLoading} className={btnSecondary}>
            {t('btn_cancel')}
          </button>
        </div>
      </form>
    </ModalShell>
  );
};
