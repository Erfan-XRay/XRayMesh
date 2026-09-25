import { MeshProtocol, NodeConfig } from '../types';
import type { TranslationKey } from '../i18n/translations';
import { MESH_PROTOCOLS } from './meshInvite';

/** Editable node settings. Numbers stay strings so inputs can be cleared while typing. */
export interface NodeForm {
  hostname: string;
  ipv4: string;
  port: string;
  networkName: string;
  networkSecret: string;
  protocol: MeshProtocol;
  enableKcp: boolean;
  encryption: boolean;
  ipv6: boolean;
  mtu: string;
}

export type NodeFormErrors = Partial<Record<keyof NodeForm, TranslationKey>>;

/** Settings that "Apply to all servers" (Cluster SafeSync) can broadcast. */
export const SHARED_FIELDS: (keyof NodeForm)[] = ['protocol', 'enableKcp', 'encryption', 'ipv6', 'mtu', 'networkSecret'];

export function formFromConfig(cfg: NodeConfig): NodeForm {
  const protocol = String(cfg.protocol || 'dual') as MeshProtocol;
  return {
    hostname: cfg.hostname || '',
    ipv4: cfg.ipv4 || '',
    port: String(cfg.port || 11010),
    networkName: cfg.network_name || 'xraymesh',
    networkSecret: cfg.network_secret || '',
    protocol: MESH_PROTOCOLS.includes(protocol) ? protocol : 'dual',
    enableKcp: Boolean(cfg.enable_kcp),
    encryption: cfg.encryption !== false,
    ipv6: Boolean(cfg.ipv6),
    mtu: String(cfg.mtu || 1380),
  };
}

export function formToPayload(form: NodeForm, peers: string[]): Partial<NodeConfig> {
  return {
    hostname: form.hostname.trim(),
    ipv4: form.ipv4.trim(),
    port: Number(form.port),
    network_name: form.networkName.trim(),
    network_secret: form.networkSecret.trim(),
    protocol: form.protocol,
    enable_kcp: form.enableKcp,
    encryption: form.encryption,
    ipv6: form.ipv6,
    mtu: Number(form.mtu),
    peers,
  };
}

export function changedFields(a: NodeForm, b: NodeForm): (keyof NodeForm)[] {
  return (Object.keys(a) as (keyof NodeForm)[]).filter((key) => a[key] !== b[key]);
}

export function validateHostname(value: string): TranslationKey | null {
  const v = value.trim();
  if (!v) return 'node_err_hostname_required';
  return /^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$/.test(v) ? null : 'node_err_hostname_invalid';
}

export function validateIpv4(value: string): TranslationKey | null {
  const v = value.trim();
  if (!v) return 'node_err_ipv4_required';
  const ok = /^\d{1,3}(\.\d{1,3}){3}$/.test(v) && v.split('.').every((part) => Number(part) <= 255);
  return ok ? null : 'node_err_ipv4_invalid';
}

export function validatePort(value: string): TranslationKey | null {
  const n = Number(value);
  return /^\d+$/.test(value.trim()) && n >= 1 && n <= 65535 ? null : 'node_err_port_invalid';
}

export function validateMtu(value: string): TranslationKey | null {
  const n = Number(value);
  return /^\d+$/.test(value.trim()) && n >= 576 && n <= 9000 ? null : 'node_err_mtu_invalid';
}

export function validateNetworkName(value: string): TranslationKey | null {
  return value.trim() ? null : 'node_err_network_required';
}

export function validateSecret(value: string): TranslationKey | null {
  const v = value.trim();
  if (!v) return 'node_err_secret_required';
  return v.length >= 4 ? null : 'node_err_secret_short';
}

export function validateNodeForm(form: NodeForm): NodeFormErrors {
  const checks: [keyof NodeForm, TranslationKey | null][] = [
    ['hostname', validateHostname(form.hostname)],
    ['ipv4', validateIpv4(form.ipv4)],
    ['port', validatePort(form.port)],
    ['networkName', validateNetworkName(form.networkName)],
    ['networkSecret', validateSecret(form.networkSecret)],
    ['mtu', validateMtu(form.mtu)],
  ];
  const errors: NodeFormErrors = {};
  for (const [field, error] of checks) {
    if (error) errors[field] = error;
  }
  return errors;
}
