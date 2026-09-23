import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs so a static snapshot works from any host or subpath.
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
