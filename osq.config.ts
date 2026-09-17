import { defineConfig } from './src/index.js';

export default defineConfig({
  harness: process.env.OSQ_HARNESS || 'agy',
  maxConcurrency: 1,
});
