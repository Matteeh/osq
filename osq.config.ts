import { defineConfig } from './src/index.js';

export default defineConfig({
  harness: process.env.OSQ_HARNESS || 'opencode',
  maxConcurrency: 1,
  gates: {
    baselineVerify: 'pnpm verify',
    formatCommand:
      'pnpm exec biome check --linter-enabled=false --write --no-errors-on-unmatched {files}',
  },
  vcs: {
    enabled: true,
    author: 'osq <osq@noreply.invalid>',
    prepare: 'pnpm install --frozen-lockfile',
    afterLand: 'pnpm build',
  },
  capabilities: { requireGroups: true },
  pi: { provider: 'deepseek', model: 'deepseek-flash', thinking: 'high' },
  opencode: {
    bin: 'opencode',
    model: 'opencode-go/deepseek-v4-flash',
    agent: 'osq-coder',
    variant: 'high',
  },
  validator: { harness: 'claude', model: 'claude-opus-5-5' },
  notices: { rulePaths: ['src/harness/prompt.ts', 'src/core/foundation/init-blocks.ts'] },
  traceability: {
    capabilities: ['traceability'],
    mode: 'warn',
    focusedTests:
      'node --import tsx --import ./tests/git-test-env.ts --test --test-reporter=tap {files}',
    mutation: { command: 'npx stryker run', budgetSeconds: 300 },
  },
  queue: {
    maxPlanningSessions: 100,
    maxPlanningCost: 20,
  },
});
