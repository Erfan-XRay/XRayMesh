type ParsedVersion = [number, number, number, number, string, number];

/** Mirrors parse_semver() in web/server.py so both sides agree on "newer". */
function parseVersion(v: string): ParsedVersion {
  const m = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-?([a-zA-Z]+)(?:\.?(\d+))?)?/.exec(String(v || '').trim().replace(/^v/, ''));
  if (!m) return [0, 0, 0, 0, '', 0];
  const tag = m[4];
  return [Number(m[1] || 0), Number(m[2] || 0), Number(m[3] || 0), tag === undefined ? 1 : 0, (tag || '').toLowerCase(), Number(m[5] || 0)];
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}
