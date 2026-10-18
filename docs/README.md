# osq website

The landing page for osq, built with [Astro](https://astro.build). It is static HTML and CSS with about 10 KB of plain scripts for the hero: the circuit board behind it, the self-playing demo card, and the copy button. No client framework ships yet.

`docs/` is ungoverned in osq (see `ungoverned` in the README), so the site is edited directly on the default branch with no change folder.

## Run it

Needs Node.js 22.22 or newer and pnpm.

```sh
cd docs
pnpm install
pnpm dev       # http://localhost:4321
pnpm build     # static site in docs/dist
pnpm check     # type-check .astro and .ts files
```

The site is its own pnpm workspace (`docs/pnpm-workspace.yaml`), so its dependencies stay out of the osq package and its lockfile.

## Where things are

```
src/styles/tokens.css   theme colors for light and dark; every color on the site comes from here
src/styles/global.css   base type, layout wrapper, pills, cards, buttons
src/data/               links, supported agents, and the feature cards
src/components/         one component per section; Hero and DemoCard hold the interactive parts
src/scripts/            circuit.ts (hero background) and demo.ts (the demo card loop)
src/layouts/Base.astro  page shell, fonts, meta tags
```

Feature cards live in `src/data/features.ts`. `available` lists only what ships in the current npm release and `roadmap` what the Rust rebuild adds. Move a card when it ships, never before.

## Later

- `osq docs` writes the generated capability and ADR pages to `docs/osq/`. The site can render them as its documentation section.
- To share React components with the dashboard in `packages/ui`, add Astro's React integration and link the package. Use it only for parts that need it, so the landing page stays light.

## Deploy

Any static host works. With Cloudflare Pages or Netlify, set the root directory to `docs`, the build command to `pnpm build` and the output directory to `dist`, then point the domain at it. Set `site` in `astro.config.mjs` to the real domain.
