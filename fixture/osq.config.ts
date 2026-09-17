import { defineConfig } from '../../src/core/config.js';

export default defineConfig({
  harness: 'mock',
  maxConcurrency: 1,
});
