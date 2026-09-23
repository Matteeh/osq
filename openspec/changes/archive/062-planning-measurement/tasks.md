# Tasks

## 1. Preparation

- [x] 1. When the planning observation tests are split by topic, every assertion still passes unchanged
- [x] 2. When osq.config.ts sets a planning block, the idle gap and price table are validated and resolved

## 2. Slicing

- [x] 3. When a change is approved, each matched planning session is cut to the turns that change owns and the slice is recorded

## 3. Readers

- [x] 4. When a Claude Code transcript is read, each assistant message becomes one turn with its own token usage
- [x] 5. When a Codex rollout is read, each token_count becomes one turn with that response's usage and edits
- [x] 6. When the OpenCode database is read, each assistant message becomes one turn with its tokens, cost, and edits

## 4. Reporting

- [x] 7. When osq report runs, it shows planning economics per change and compares planning with execution
- [x] 8. When a change's planning sessions reported tokens but no cost, the dashboard shows its planning cost as not reported

## 5. Documentation

- [x] 9. When a user reads the README, planning slices, the planning config block, and the planning report are explained
