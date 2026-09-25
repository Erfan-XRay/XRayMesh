import { MeshProtocol } from '../types';

export const MESH_PROTOCOLS: MeshProtocol[] = ['dual', 'udp', 'tcp', 'ws', 'wss', 'quic', 'faketcp'];

export interface MeshInvite {
  net: string;
  secret: string;
  endpoint: string;
  proto: MeshProtocol;
  enc?: boolean;
  kcp?: boolean;
  ipv6?: boolean;
  mtu?: number;
}

export type InviteParseResult =
  | { status: 'empty' }
  | { status: 'invalid' }
  | { status: 'incomplete' }
  | { status: 'ok'; invite: MeshInvite };

// Zero-width and bidi control characters that chat apps and RTL pages slip into copied text.
const INVISIBLE_CHARS = /[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

function parseLeadingJsonObject(text: string): unknown {
  // Like Python's raw_decode: accept a JSON object even when junk bytes follow it.
  for (let end = text.indexOf('}'); end !== -1; end = text.indexOf('}', end + 1)) {
    try {
      return JSON.parse(text.slice(0, end + 1));
    } catch {
      // keep extending to the next closing brace
    }
  }
  return null;
}

function decodeCandidate(token: string): Record<string, unknown> | null {
  let b64 = token.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (!b64) return null;
  b64 += '='.repeat((4 - (b64.length % 4)) % 4);
  try {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).trimStart();
    const data = parseLeadingJsonObject(text);
    return data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Decode an xrmesh:// invite code. Mirrors decode_invite_token() in web/server.py. */
export function parseInviteToken(raw: string): InviteParseResult {
  let text = (raw || '').replace(INVISIBLE_CHARS, '');
  if (!text.trim()) return { status: 'empty' };

  const prefix = /xrmesh:\/\//i.exec(text);
  if (prefix) text = text.slice(prefix.index + prefix[0].length);
  text = text.replace(/^[^A-Za-z0-9+/_-]+/, '');
  const run = (/^[A-Za-z0-9+/_=\s-]+/.exec(text) || [''])[0];

  // A wrapped code spans several lines; a code followed by other words must stop at the first gap.
  let data: Record<string, unknown> | null = null;
  for (const candidate of [run.replace(/\s+/g, ''), run.trim().split(/\s+/)[0] || '']) {
    data = decodeCandidate(candidate);
    if (data) break;
  }
  if (!data) return { status: 'invalid' };

  const net = String(data.net || data.network_name || '').trim();
  const secret = String(data.secret || data.network_secret || '').trim();
  if (!net || !secret) return { status: 'incomplete' };

  const proto = String(data.proto || data.protocol || 'dual').trim().toLowerCase() as MeshProtocol;
  const invite: MeshInvite = {
    net,
    secret,
    endpoint: String(data.endpoint || data.peer || '').trim(),
    proto: MESH_PROTOCOLS.includes(proto) ? proto : 'dual',
  };
  if (typeof data.enc === 'boolean') invite.enc = data.enc;
  if (typeof data.kcp === 'boolean') invite.kcp = data.kcp;
  if (typeof data.ipv6 === 'boolean') invite.ipv6 = data.ipv6;
  if (Number.isInteger(data.mtu) && (data.mtu as number) >= 576 && (data.mtu as number) <= 9000) {
    invite.mtu = data.mtu as number;
  }
  return { status: 'ok', invite };
}

export function encodeInviteToken(details: object): string {
  const bytes = new TextEncoder().encode(JSON.stringify(details));
  return `xrmesh://${btoa(String.fromCharCode(...bytes))}`;
}

/** Normalize a peer address to host:port (keeping ws/wss style schemes). Returns '' when unusable. */
export function sanitizePeerInput(raw: string, defaultPort?: number): string {
  if (!raw) return '';
  let p = raw.trim().replace(/\/+$/, '').replace(/:+$/, '');
  if (!p || p.startsWith(':') || /^\d+$/.test(p)) return '';
  let scheme = '';
  if (p.includes('://')) {
    const parts = p.split('://');
    scheme = parts[0].toLowerCase();
    p = parts[1];
  }
  p = p.replace(/:+$/, '');
  if (!p || p.startsWith(':') || /^\d+$/.test(p)) return '';

  let host = '';
  let pPort = defaultPort ? String(defaultPort) : '11010';

  if (p.includes('[') && p.includes(']')) {
    const m = p.match(/^(\[[^\]]+\])(?::+(\d+))?$/);
    if (!m) return '';
    host = m[1];
    pPort = m[2] || pPort;
  } else {
    const m = p.match(/^(.+?):+(\d+)$/);
    if (m) {
      host = m[1].replace(/:+$/, '');
      pPort = m[2];
    } else {
      host = p.replace(/:+$/, '');
    }
  }

  if (!host || host.startsWith(':') || host === ':' || /^\d+$/.test(host)) return '';
  const hp = `${host}:${pPort}`;
  if (scheme) {
    if (scheme === 'ws' || scheme === 'wss') return `${scheme}://${hp}/`;
    return `${scheme}://${hp}`;
  }
  return hp;
}

/** Random address in 10.144.144.2-254 (.1 is what a first node usually takes). */
export function suggestVirtualIp(exclude: string[] = []): string {
  const taken = new Set(exclude);
  for (let i = 0; i < 20; i++) {
    const ip = `10.144.144.${2 + Math.floor(Math.random() * 253)}`;
    if (!taken.has(ip)) return ip;
  }
  return '10.144.144.2';
}

/** 32 hex characters, same shape as `openssl rand -hex 16` used by the CLI. */
export function generateSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Persian and Arabic-Indic digits typed on a local keyboard become ASCII digits. */
export function toAsciiDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}
