# Tasks

## 1. Configuration and parsing

- [x] 1. When a task declares verify_starts or config sets gates.preSpawnVerify, osq parses both, and tests that count verify runs ignore pre-spawn runs

## 2. Pre-spawn check

- [x] 2. When a task starts its first attempt, the watcher runs verify before spawn and warns or kills on a mismatch

## 3. Visibility

- [x] 3. When task streams hold pre-spawn verify runs, osq report counts runs and mismatches apart from verification runs
- [x] 4. When a task has a pre-spawn verify run, osq show prints its outcome and any mismatch

## 4. Documentation

- [x] 5. When a planner or user reads the docs, verify_starts and gates.preSpawnVerify are explained
