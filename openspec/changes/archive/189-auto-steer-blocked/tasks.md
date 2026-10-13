# Tasks

## 1. Decision

- [x] 1. When osq's decisions are read, ADR 018 is accepted and records how the watcher runs a steering planner

## 2. Configuration

- [x] 2. When osq.config.ts sets autoSteer, defineConfig resolves it and plannerRunConfig gives the planner's harness, model and agent

## 3. Watcher

- [x] 3. When a run trigger fires with autoSteer on, the watcher runs the planner once on the steering prompt, puts back what it wrote outside the plan, lints, and records the outcome

## 4. Inbox

- [x] 4. When the automatic planner leaves a ready plan, the inbox, dispatch and next step offer osq approve with the changed files, and other outcomes are named beside osq plan

## 5. Wiring

- [x] 5. When osq watch runs with autoSteer on, the planner gets the prompt osq plan <id> --print prints
