# Tasks

## 1. Pre-dispatch scope audit

- [x] 1. When completed scope hashes differ before dispatch, every stale task is verified before execution halts

## 2. Archive scope audit

- [x] 2. When completed scope hashes differ before archival, stale tasks block the existing archive verifier

## 3. Human recertification

- [x] 3. When a regressed task is retried, verification recertifies it or requeues agent work

## 4. Verify-command lint

- [x] 4. When a verify command cannot identify local behavior, lint reports an error or warning

## 5. Planner guidance

- [x] 5. When planner guidance is scaffolded, verification remains reusable on the final tree

## 6. Regression history

- [x] 6. When delivery history includes scope regressions, detection and recertification outcomes are counted

## 7. Recertification inspection

- [x] 7. When a recertified change is shown, the task attribution is listed

## 8. Verify-fixture migration

- [x] 8. When verify-command trust lint is active, every approved test fixture uses a real local verifier
