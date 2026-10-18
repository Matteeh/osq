import { defineConfig } from 'astro/config';

// The marketing site and, later, the docs. Static output with no client framework:
// the few interactive bits are plain scripts in their components.
export default defineConfig({
  // TODO: set to the real domain once it is bought, so canonical and social links are absolute.
  site: 'https://osq.dev',
  output: 'static',
});
