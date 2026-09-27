import { defineConfig } from "./src/index.js";

export default defineConfig({
  harness: process.env.OSQ_HARNESS || "pi",
  maxConcurrency: 1,
  gates: {
    baselineVerify: "pnpm verify",
  },
  vcs: {
    enabled: true,
    author: "osq <osq@noreply.invalid>",
    prepare: "pnpm install --frozen-lockfile",
  },
  pi: { provider: "deepseek", model: "deepseek-flash", thinking: "high" },
  opencode: {
    bin: "opencode",
    model: "deepseek/deepseek-flash",
    agent: "osq-coder",
    variant: "thinking",
  },
  queue: {
    maxPlanningSessions: 100,
    maxPlanningCost: 20,
  },
});
