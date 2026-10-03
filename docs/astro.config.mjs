// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// GitHub Pages serves the project under /XRayMesh. A mirror on its own domain
// (e.g. Cloudflare Pages) builds with DOCS_SITE=https://docs.example.com DOCS_BASE=/
const site = process.env.DOCS_SITE ?? 'https://erfan-xray.github.io';
const base = process.env.DOCS_BASE ?? '/XRayMesh';

export default defineConfig({
	site,
	base,
	trailingSlash: 'always',
	integrations: [
		starlight({
			title: { en: 'XRayMesh Docs', fa: 'مستندات XRayMesh' },
			description: 'Mesh networking, tunnels and a web panel for Linux servers.',
			logo: { src: './src/assets/logo.svg', replacesTitle: false },
			favicon: '/favicon.svg',
			defaultLocale: 'root',
			locales: {
				root: { label: 'English', lang: 'en' },
				fa: { label: 'فارسی', lang: 'fa', dir: 'rtl' },
			},
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/Erfan-XRay/XRayMesh' },
			],
			editLink: {
				baseUrl: 'https://github.com/Erfan-XRay/XRayMesh/edit/main/docs/',
			},
			lastUpdated: true,
			customCss: [
				'@fontsource-variable/inter',
				'@fontsource-variable/vazirmatn',
				'@fontsource-variable/jetbrains-mono',
				'./src/styles/theme.css',
			],
			components: {
				Hero: './src/components/Hero.astro',
			},
			head: [
				{ tag: 'meta', attrs: { name: 'theme-color', content: '#0b0e13', media: '(prefers-color-scheme: dark)' } },
				{ tag: 'meta', attrs: { name: 'theme-color', content: '#ffffff', media: '(prefers-color-scheme: light)' } },
			],
			expressiveCode: {
				themes: ['github-dark-default', 'github-light-default'],
				styleOverrides: {
					borderRadius: '0.75rem',
					borderColor: 'var(--xr-border)',
					codeFontFamily: 'var(--__sl-font-mono)',
					codeFontSize: '0.875rem',
					codeLineHeight: '1.7',
					codeBackground: 'var(--xr-code-bg)',
					frames: {
						frameBoxShadowCssValue: 'none',
						editorTabBarBackground: 'var(--xr-surface)',
						editorActiveTabBackground: 'var(--xr-code-bg)',
						editorActiveTabIndicatorTopColor: 'var(--sl-color-accent)',
						terminalBackground: 'var(--xr-code-bg)',
						terminalTitlebarBackground: 'var(--xr-surface)',
						terminalTitlebarBorderBottomColor: 'var(--xr-border)',
						terminalTitlebarDotsOpacity: '0.35',
						inlineButtonBorder: 'var(--xr-border-strong)',
						inlineButtonBackground: 'var(--sl-color-accent)',
						tooltipSuccessBackground: 'var(--sl-color-accent)',
						tooltipSuccessForeground: 'var(--sl-color-text-invert)',
					},
				},
			},
			sidebar: [
				{
					label: 'Start here',
					translations: { fa: 'شروع کار' },
					items: [
						{ slug: 'start/introduction' },
						{ slug: 'start/requirements' },
						{ slug: 'start/installation' },
						{ slug: 'start/first-login' },
						{ slug: 'start/create-mesh' },
						{ slug: 'start/add-servers' },
					],
				},
				{
					label: 'Guides',
					translations: { fa: 'راهنماها' },
					items: [
						{ slug: 'guides/tunnels' },
						{ slug: 'guides/transports' },
						{ slug: 'guides/safesync' },
						{ slug: 'guides/updates' },
						{ slug: 'guides/scheduled-restart' },
						{ slug: 'guides/security' },
						{ slug: 'guides/ping-speedtest' },
					],
				},
				{
					label: 'Help',
					translations: { fa: 'کمک' },
					items: [{ slug: 'troubleshooting' }, { slug: 'support' }],
				},
				{
					label: 'Reference',
					translations: { fa: 'مرجع' },
					items: [{ slug: 'reference/cli' }],
				},
			],
		}),
	],
});
