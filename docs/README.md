# XRayMesh docs

The documentation site, built with [Starlight](https://starlight.astro.build) (Astro) in English and Persian.
Every push to `main` that touches `docs/` builds it and deploys it to GitHub Pages (`.github/workflows/docs.yml`).

```bash
npm ci
npm run dev          # http://localhost:4321/XRayMesh/
npm run build        # static site in dist/
npm run check-links  # after build: every internal link and #anchor must resolve
```

## Adding a page

1. Add `src/content/docs/<section>/<page>.mdx` (English) and the same path under `src/content/docs/fa/` (Persian).
   A page with no Persian version shows the English text with a "not translated yet" notice.
2. Add its slug to `sidebar` in `astro.config.mjs`. The sidebar label comes from each page's `title`.
3. Link between pages with **relative** links (`../installation/`, `../../reference/cli/`), so the site works under
   `/XRayMesh/` on GitHub Pages and at `/` on a mirror (`DOCS_SITE=… DOCS_BASE=/ npm run build`).

## Components

| Component | Use |
| :--- | :--- |
| `<InstallCommand />` | The one-line installer with a copy button. |
| `<UiPath items={['Node', 'Peers & invite']} />` | Where to click in the panel. Use the panel's own EN/FA labels from `frontend/src/i18n/translations.ts`. |
| `<MeshDiagram />` | Two servers joined by the mesh, used on the introduction page. |
| Starlight's `Steps`, `Tabs`, `Card`, `LinkCard`, asides (`:::note`) | See the [Starlight docs](https://starlight.astro.build/components/using-components/). |

Strings used inside these components live in `src/content/i18n/{en,fa}.json`.

## Style

- Colours come from the Firouzeh tokens in `src/styles/theme.css`, the same palette as the web panel.
  Don't hardcode colours in pages or components.
- Persian text uses Vazirmatn and Latin text uses Inter, chosen automatically by script.
- In Persian prose, write quantities with Persian digits (`۶۰ دقیقه`). Keep anything people type or copy,
  like commands, IPs, ports and versions, in `code`: it stays left-to-right and in Latin digits.
- Don't put a middle dot `·` next to a Persian digit. The Persian zero `۰` is a dot too, so it misreads.
