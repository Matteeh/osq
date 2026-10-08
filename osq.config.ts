import { defineConfig } from "./src/index.js";

export default defineConfig({
  harness: process.env.OSQ_HARNESS || "pi",
  maxConcurrency: 1,
  gates: {
    baselineVerify: "pnpm verify",
    formatCommand:
      "pnpm exec biome check --linter-enabled=false --write --no-errors-on-unmatched {files}",
  },
  vcs: {
    enabled: true,
    author: "osq <osq@noreply.invalid>",
    prepare: "pnpm install --frozen-lockfile",
  },
  capabilities: { requireGroups: true },
  pi: { provider: "deepseek", model: "deepseek-flash", thinking: "high" },
  opencode: {
    bin: "opencode",
    model: "deepseek/deepseek-flash",
    agent: "osq-coder",
    variant: "thinking",
  },
  validator: { harness: "claude", model: "claude-opus-5-5" },
  traceability: {
    capabilities: ["traceability"],
    mode: "warn",
    focusedTests:
      "node --import tsx --import ./tests/git-test-env.ts --test --test-reporter=tap {files}",
    mutation: { command: "npx stryker run", budgetSeconds: 300 },
  },
  queue: {
    maxPlanningSessions: 100,
    maxPlanningCost: 20,
  },
});
