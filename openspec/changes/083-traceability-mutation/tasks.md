# Tasks

## 1. Mutation config

- [ ] 1. When osq.config.ts sets traceability.mutation, osq validates the command and budget

## 2. Function ranges and baseline

- [ ] 2. When a task starts, osq records the hash of each tagged function in scope and can find any function's mutation ranges

## 3. Pick and run

- [ ] 3. When a task passes, osq picks the covered functions it changed or newly tested and can run one mutation command and read its report

## 4. Watcher check

- [ ] 4. When a task passes with mutation on, the watcher runs its picks under the budget and records each without ever failing the task

## 5. Show, report, and docs

- [ ] 5. When tasks recorded mutation results, osq show lists them per task and osq report scores each capability
