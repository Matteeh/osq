import { defineConfig } from './src/index.js';

export default defineConfig({
  harness: process.env.OSQ_HARNESS || 'opencode',
  maxConcurrency: 1,
  gates: {
    baselineVerify: 'pnpm verify',
  },
  opencode: {
    bin: 'opencode',
    model: 'deepseek/deepseek-flash',
    agent: 'osq-coder',
    variant: 'thinking',
  },
});
