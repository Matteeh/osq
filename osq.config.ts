import { defineConfig } from './src/index.js';

export default defineConfig({
  harness: process.env.OSQ_HARNESS || 'opencode',
  maxConcurrency: 1,
});
