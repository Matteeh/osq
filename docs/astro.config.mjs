import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// The marketing site at / and the docs at /docs. Static output with no client framework:
// the landing page's few interactive bits are plain scripts in its components, and the
// docs are Starlight pages written in Markdown under src/content/docs/docs/.
export default defineConfig({
  // TODO: set to the real domain once it is bought, so canonical and social links are absolute.
  site: 'https://osq.dev',
  output: 'static',
  integrations: [
    starlight({
      title: 'osq docs',
      description: 'How to set up osq and run changes through it.',
      favicon: '/favicon.svg',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/Matteeh/osq' }],
      editLink: { baseUrl: 'https://github.com/Matteeh/osq/edit/main/docs/' },
      customCss: [
        '@fontsource/ibm-plex-sans/latin-400.css',
        '@fontsource/ibm-plex-sans/latin-500.css',
        '@fontsource/ibm-plex-sans/latin-600.css',
        '@fontsource/ibm-plex-mono/latin-400.css',
        '@fontsource/ibm-plex-mono/latin-500.css',
        '@fontsource/host-grotesk/latin-500.css',
        '@fontsource/host-grotesk/latin-600.css',
        './src/styles/tokens.css',
        './src/styles/starlight.css',
      ],
      components: { SiteTitle: './src/components/docs/SiteTitle.astro' },
      sidebar: [
        { label: 'Start here', items: [{ slug: 'docs' }, { slug: 'docs/getting-started' }] },
        { label: 'Reference', items: [{ slug: 'docs/reference/cli' }] },
      ],
    }),
  ],
});
