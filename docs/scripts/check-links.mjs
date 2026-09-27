// Checks every internal link and #anchor in the built site (dist/). Run after `astro build`.
// The docs use relative links so they work under any base path, which Starlight's own
// link validators skip, so this checks the real output instead.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const base = (process.env.DOCS_BASE ?? '/XRayMesh').replace(/\/?$/, '/');

const htmlFiles = [];
(function walk(dir) {
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) walk(path);
		else if (name.endsWith('.html')) htmlFiles.push(path);
	}
})(dist);

const idCache = new Map();
function idsOf(file) {
	if (!idCache.has(file)) {
		const html = readFileSync(file, 'utf8');
		idCache.set(file, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
	}
	return idCache.get(file);
}

// Map a site path such as /XRayMesh/fa/start/ to its file in dist/.
function fileFor(pathname) {
	if (!pathname.startsWith(base)) return null;
	let rest = decodeURIComponent(pathname.slice(base.length));
	if (rest === '' || rest.endsWith('/')) rest += 'index.html';
	const file = join(dist, ...rest.split('/'));
	return existsSync(file) ? file : null;
}

const errors = [];
for (const file of htmlFiles) {
	const rel = relative(dist, file).split(sep).join('/');
	const pageUrl = new URL(base + rel.replace(/index\.html$/, ''), 'https://docs.invalid');
	const html = readFileSync(file, 'utf8');
	for (const [, attr, value] of html.matchAll(/\s(href|src)="([^"]*)"/g)) {
		if (!value || /^(https?:|mailto:|data:|javascript:)/i.test(value) || value.startsWith('//')) continue;
		const url = new URL(value.replace(/&amp;/g, '&'), pageUrl);
		if (url.origin !== pageUrl.origin) continue;
		const target = fileFor(url.pathname);
		if (!target) {
			errors.push(`${rel}: ${attr}="${value}" -> ${url.pathname} does not exist`);
			continue;
		}
		const hash = decodeURIComponent(url.hash.slice(1));
		if (hash && target.endsWith('.html') && !idsOf(target).has(hash)) {
			errors.push(`${rel}: ${attr}="${value}" -> no element with id "${hash}"`);
		}
	}
}

if (errors.length) {
	console.error(`Broken links (${errors.length}):\n  ${errors.join('\n  ')}`);
	process.exit(1);
}
console.log(`Links OK: ${htmlFiles.length} pages checked.`);
