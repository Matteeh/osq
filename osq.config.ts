import { defineConfig } from './src/index.js';

export default defineConfig({
  harness: process.env.OSQ_HARNESS || 'pi',
  maxConcurrency: 1,
  gates: {
    baselineVerify: 'pnpm verify',
  },
  pi: { provider: 'deepseek', model: 'deepseek-flash', thinking: 'high' },
  opencode: {
    bin: 'opencode',
    model: 'deepseek/deepseek-flash',
    agent: 'osq-coder',
    variant: 'thinking',
  },
});
