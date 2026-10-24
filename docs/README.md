# osq website

The landing page for osq at `/` and its docs at `/docs`, built with [Astro](https://astro.build). The landing page is static HTML and CSS with about 10 KB of plain scripts for the hero: the circuit board behind it, the self-playing demo card, and the copy button. The docs are [Starlight](https://starlight.astro.build) pages written in Markdown. No client framework ships yet.

`docs/` is ungoverned in osq (see `ungoverned` in the README), so the site is edited directly on the default branch with no change folder.

## Run it

Needs Node.js 22.22 or newer and pnpm.

```sh
cd docs
pnpm install
pnpm dev       # http://localhost:4321, docs at /docs
pnpm build     # static site in docs/dist
pnpm cli-reference  # regenerate the CLI reference page only
pnpm check     # type-check .astro and .ts files
```

The site is its own pnpm workspace (`docs/pnpm-workspace.yaml`), so its dependencies stay out of the osq package and its lockfile.

## Where things are

```
src/styles/tokens.css   theme colors for light and dark; every color on the site comes from here
src/styles/global.css   base type, layout wrapper, pills, cards, buttons
src/data/               links and supported agents
src/components/         one component per section; Hero and DemoCard hold the interactive parts
src/scripts/            circuit.ts (hero background) and demo.ts (the demo card loop)
src/layouts/Base.astro  page shell, fonts, meta tags
src/content/docs/docs/  the docs pages; the sidebar is set in astro.config.mjs
src/styles/starlight.css  maps Starlight's theme onto tokens.css
scripts/cli-reference.mjs  writes docs/reference/cli.md from the CLI's command definitions
```

## Docs

Each page under `src/content/docs/docs/` is a Markdown file served at `/docs/<path>/`. Add a new page to `sidebar` in `astro.config.mjs`.

The CLI reference is generated. `pnpm dev` and `pnpm build` regenerate it from `createProgram` in `src/cli` first, so it lists exactly what the CLI parses. That step needs the osq package's dependencies installed at the repository root. Without them it keeps the committed page and prints a warning, so commit the regenerated page whenever a command changes.

The feature list lives in the docs, in `src/content/docs/docs/index.md`. "What you get" lists only what ships in the current npm release and "Coming in the rebuild" what the Rust rebuild adds. Move an item when it ships, never before.

## Later

- `osq docs` writes the generated capability and ADR pages to `docs/osq/`. The site can render them as its documentation section.
- To share React components with the dashboard in `packages/ui`, add Astro's React integration and link the package. Use it only for parts that need it, so the landing page stays light.

## Deploy

Any static host works. With Cloudflare Pages or Netlify, set the root directory to `docs`, the build command to `pnpm build` and the output directory to `dist`, then point the domain at it. Set `site` in `astro.config.mjs` to the real domain.
