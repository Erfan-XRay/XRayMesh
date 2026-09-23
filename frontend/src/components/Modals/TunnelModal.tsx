import React, { useState, useEffect } from 'react';
import { Peer, HaproxyTunnel, IptablesTunnel, GostTunnel, RealmTunnel } from '../../types';
import { fetchInterfaces } from '../../services/api';
import { X, Loader2 } from 'lucide-react';

export type TunnelModalType = 'haproxy' | 'iptables' | 'gost' | 'realm';

interface TunnelModalProps {
  isOpen: boolean;
  type: TunnelModalType;
  isEdit: boolean;
  initialData?: HaproxyTunnel | IptablesTunnel | GostTunnel | RealmTunnel | null;
  peers: Peer[];
  interfaces: string[];
  onClose: () => void;
  onSubmit: (formData: any) => Promise<void>;
  t: (key: any) => string;
}

export const TunnelModal: React.FC<TunnelModalProps> = ({
  isOpen,
  type,
  isEdit,
  initialData,
  peers,
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

  const [nodeInterfaces, setNodeInterfaces] = useState<string[]>(interfaces || ['any']);
  const [loadingInterfaces, setLoadingInterfaces] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isLoading) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onClose]);

  useEffect(() => {
    if (!isOpen || type !== 'iptables') return;

    let isMounted = true;
    setLoadingInterfaces(true);
    fetchInterfaces(originNode || undefined)
      .then((ifaces) => {
        if (isMounted) {
          setNodeInterfaces(ifaces);
          setIface((prev) => (ifaces.includes(prev) ? prev : 'any'));
        }
      })
      .catch(() => {
        if (isMounted) setNodeInterfaces(['any']);
      })
      .finally(() => {
        if (isMounted) setLoadingInterfaces(false);
      });

    return () => {
      isMounted = false;
    };
  }, [originNode, isOpen, type]);

  useEffect(() => {
    if (initialData && isEdit) {
      setName(initialData.TUNNEL_NAME || '');
      setOriginNode((initialData as any)._node_ip || '');
      setTarget(initialData.TARGET_IP || '');
      setPorts(initialData.PORT_SPEC || '');
      if (type === 'iptables') {
        const ipt = initialData as IptablesTunnel;
        setProtocol(ipt.FORWARD_PROTOCOL || 'udp');
        setIface(ipt.IN_IF || 'any');
        setSourceCidr(ipt.SOURCE_CIDR || '0.0.0.0/0');
      } else if (type === 'gost') {
        const gst = initialData as GostTunnel;
        setProtocol(gst.PROTOCOL || 'both');
      } else if (type === 'realm') {
        const rlm = initialData as RealmTunnel;
        setProtocol(rlm.PROTOCOL || 'both');
      }
    } else {
      setName('');
      setOriginNode('');
      setTarget('');
      setPorts('');
      setProtocol(type === 'gost' || type === 'realm' ? 'both' : 'udp');
      setIface('any');
      setSourceCidr('0.0.0.0/0');
    }
    setError(null);
  }, [initialData, isEdit, type, isOpen]);

  if (!isOpen) return null;

  const handleTargetSelect = (ip: string) => {
    if (ip) setTarget(ip);
  };

  const handlePresetClick = (presetVal: string) => {
    setPorts(presetVal);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !target.trim() || !ports.trim()) {
      setError('Please fill in all required fields');
      return;
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(name.trim())) {
      setError("Tunnel name must be 1-32 characters using only letters, numbers, '_' or '-'.");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      await onSubmit({
        isEdit,
        name: name.trim(),
        originNode: originNode.trim() || undefined,
        target: target.trim(),
        ports: ports.trim(),
        protocol,
        interface: iface,
        sourceCidr: sourceCidr.trim(),
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Action failed');
    } finally {
      setIsLoading(false);
    }
  };

  let title = '';
  let presets: { label: string; val: string }[] = [];

  if (type === 'haproxy') {
    title = isEdit ? 'Edit HAProxy TCP Tunnel' : 'Create HAProxy TCP Tunnel';
    presets = [
      { label: '80,443 (Web)', val: '80,443' },
      { label: '443 (HTTPS/TLS)', val: '443' },
      { label: '1234→443 (Map)', val: '1234:443' },
      { label: '8000-8010 (Range)', val: '8000-8010' },
      { label: '2222 (SSH)', val: '2222' },
    ];
  } else if (type === 'iptables') {
    title = isEdit ? 'Edit iptables UDP/TCP Tunnel' : 'Create iptables UDP/TCP Tunnel';
    presets = [
      { label: '443 (Hysteria/QUIC)', val: '443' },
      { label: '1234→443 (Map)', val: '1234:443' },
      { label: '20000-20100 (Hopping)', val: '20000-20100' },
      { label: '80,443 (Multi)', val: '80,443' },
      { label: '53 (DNS)', val: '53' },
    ];
  } else if (type === 'realm') {
    title = isEdit ? 'Edit Realm Relay Tunnel (Rust)' : 'Create Realm Relay Tunnel (Rust)';
    presets = [
      { label: '80,443 (Web Dual)', val: '80,443' },
      { label: '443 (HTTPS/TLS)', val: '443' },
      { label: '1234→443 (Map)', val: '1234:443' },
      { label: '8000-8010 (Range)', val: '8000-8010' },
      { label: '2222 (SSH)', val: '2222' },
    ];
  } else {
    title = isEdit ? 'Edit GOST TCP/UDP Tunnel' : 'Create GOST TCP/UDP Tunnel';
    presets = [
      { label: '80,443 (Web Dual)', val: '80,443' },
      { label: '443 (HTTPS/QUIC)', val: '443' },
      { label: '1234→443 (Map)', val: '1234:443' },
      { label: '8000-8010 (Range)', val: '8000-8010' },
      { label: '1080 (SOCKS5)', val: '1080' },
    ];
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-modal-in" role="dialog" aria-modal="true" aria-labelledby="tunnel-title">
      <div className="w-full max-w-lg max-h-[90dvh] overflow-y-auto p-5 sm:p-6 rounded-2xl bg-modal border border-card-border shadow-2xl relative">
        <div className="flex items-center justify-between mb-4">
          <h2 id="tunnel-title" className="text-base font-bold text-text-main">{title}</h2>
          <button
            onClick={onClose}
            aria-label={t('btn_cancel')}
            className="interactive-min-hit p-1 rounded-lg text-text-muted hover:text-text-main hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Origin Server (Host Node) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block font-medium text-text-muted">{t('tunnels_origin_server')}</label>
              <span className="text-[10px] text-text-subtle">{t('tunnels_origin_server_desc')}</span>
            </div>
            <select
              value={originNode}
              onChange={(e) => setOriginNode(e.target.value)}
              disabled={isEdit}
              className="w-full px-3.5 py-2 bg-input border border-card-border rounded-xl font-mono text-text-main focus:outline-none focus:border-primary disabled:opacity-60"
            >
              <option value="">{t('tunnels_origin_local')}</option>
              {peers.filter((p) => !p.is_current).map((p) => (
                <option key={p.ipv4} value={p.ipv4}>
                  {p.hostname || p.ipv4} ({p.ipv4})
                </option>
              ))}
            </select>
          </div>

          {/* Tunnel Name */}
          <div>
            <label className="block font-medium text-text-muted mb-1.5">{t('modal_tunnel_name')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isEdit}
              placeholder="e.g. web-forward"
maxLength={32}
              pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,31}"
              title="1-32 characters: letters, numbers, underscore, or hyphen"
              className="w-full px-3.5 py-2 bg-input border border-card-border rounded-xl font-mono text-text-main placeholder-text-subtle focus:outline-none focus:border-primary disabled:opacity-50"
              required
            />
          </div>

          {/* Destination Node Select / Manual IP */}
          <div>
            <label className="block font-medium text-text-muted mb-1.5">{t('modal_tunnel_dest')}</label>
            {peers.length > 0 ? (
              <div className="space-y-2">
                <select
                  onChange={(e) => handleTargetSelect(e.target.value)}
                  className="w-full px-3.5 py-2 bg-input border border-card-border rounded-xl font-mono text-text-main focus:outline-none focus:border-primary"
                  defaultValue=""
                >
                  <option value="" disabled>
                    {t('modal_tunnel_dest_select')}
                  </option>
                  {peers.map((p) => (
                    <option key={p.ipv4} value={p.ipv4}>
                      {p.hostname || p.ipv4} ({p.ipv4})
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder="Or enter target 10.x.x.x IP manually"
                  className="w-full px-3.5 py-2 bg-input border border-card-border rounded-xl font-mono text-text-main placeholder-text-subtle focus:outline-none focus:border-primary"
                  required
                />
              </div>
            ) : (
              <input
                type="text"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="Target Virtual IP (10.x.x.x)"
                className="w-full px-3.5 py-2 bg-input border border-card-border rounded-xl font-mono text-text-main placeholder-text-subtle focus:outline-none focus:border-primary"
                required
              />
            )}
          </div>

          {/* Protocol selector for iptables / GOST */}
          {type === 'iptables' && (
            <div>
              <label className="block font-medium text-text-muted mb-1.5">{t('modal_tunnel_proto')}</label>
              <div className="grid grid-cols-3 gap-2">
                {['udp', 'tcp', 'both'].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setProtocol(p)}
                    className={`py-1.5 rounded-lg border text-xs font-mono uppercase transition-all ${
                      protocol === p
                        ? 'bg-primary/20 border-primary text-primary font-bold'
                        : 'bg-white/5 border-card-border text-text-muted hover:text-text-main'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(type === 'gost' || type === 'realm') && (
            <div>
              <label className="block font-medium text-text-muted mb-1.5">{t('modal_tunnel_proto')}</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'both', label: 'TCP + UDP' },
                  { id: 'tcp', label: 'TCP Only' },
                  { id: 'udp', label: 'UDP Only' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setProtocol(item.id)}
                    className={`py-1.5 rounded-lg border text-xs font-mono transition-all ${
                      protocol === item.id
                        ? type === 'realm'
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 font-bold'
                          : 'bg-amber-500/20 border-amber-500 text-amber-400 font-bold'
                        : 'bg-white/5 border-card-border text-text-muted hover:text-text-main'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Ports & Preset Chips */}
          <div>
            <label className="block font-medium text-text-muted mb-1.5">{t('modal_tunnel_ports')}</label>
            <input
              type="text"
              value={ports}
              onChange={(e) => setPorts(e.target.value)}
placeholder="e.g. 80,443 · 8000-8010 · 1234:443"
              className="w-full px-3.5 py-2 bg-input border border-card-border rounded-xl font-mono text-text-main placeholder-text-subtle focus:outline-none focus:border-primary mb-1.5"
              required
            />
            <p className="text-[10px] text-text-subtle mb-2">{t('modal_tunnel_ports_help')}</p>
            {/* Chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-text-subtle">{t('modal_tunnel_presets')}:</span>
              {presets.map((pr) => (
                <button
                  key={pr.val}
                  type="button"
                  onClick={() => handlePresetClick(pr.val)}
                  className="px-2 py-0.5 rounded-md bg-white/5 hover:bg-primary/15 border border-card-border hover:border-primary/40 text-[11px] font-mono text-text-muted hover:text-primary transition-colors"
                >
                  {pr.label}
                </button>
              ))}
            </div>
          </div>

          {/* iptables interface & CIDR */}
          {type === 'iptables' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block font-medium text-text-muted">{t('modal_tunnel_interface')}</label>
                  {loadingInterfaces && (
                    <span className="flex items-center gap-1 text-[10px] text-primary animate-pulse font-mono">
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                      {t('modal_tunnel_loading_ifaces')}
                    </span>
                  )}
                </div>
                <select
                  value={iface}
                  onChange={(e) => setIface(e.target.value)}
                  disabled={loadingInterfaces}
                  className="w-full px-3 py-2 bg-input border border-card-border rounded-xl font-mono text-text-main focus:outline-none focus:border-primary disabled:opacity-60"
                >
                  {nodeInterfaces.map((i) => (
                    <option key={i} value={i}>
                      {i === 'any' ? 'any (All interfaces)' : i}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-text-muted mb-1.5">{t('modal_tunnel_source_cidr')}</label>
                <input
                  type="text"
                  value={sourceCidr}
                  onChange={(e) => setSourceCidr(e.target.value)}
                  placeholder="0.0.0.0/0"
                  className="w-full px-3.5 py-2 bg-input border border-card-border rounded-xl font-mono text-text-main focus:outline-none focus:border-primary"
                />
              </div>
            </div>
          )}

          {error && <div className="text-xs text-rose-400 font-medium">{error}</div>}

          {/* Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-card-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-text-muted hover:text-text-main font-medium transition-colors"
            >
              {t('btn_cancel')}
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2 rounded-xl bg-primary text-black font-semibold hover:bg-primary-hover disabled:opacity-50 flex items-center gap-1.5 transition-all shadow-md"
            >
              {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{isEdit ? t('btn_save') : t('btn_create')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
