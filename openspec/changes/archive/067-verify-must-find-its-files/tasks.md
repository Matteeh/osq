# Tasks

## 1. Named paths and lint

- [x] 1. When a verify names paths, one shared module finds them and lint warns about starts that contradict the task or paths no task can create

## 2. Watcher

- [x] 2. When the agent exits and a path its task verify names is missing, the task dies with verify_path_missing and is retried automatically
- [x] 3. When archive verification finds a path its command names missing, the change regresses without running that command

## 3. Approval

- [x] 4. When a task declares green or any while its verify names a test it creates, the approval digest raises verify_starts_conflict

## 4. Inspection

- [x] 5. When osq report runs, it counts pre-spawn runs with missing paths and by declared start, and reports verify_starts_conflict outcomes
- [x] 6. When osq show prints a pre-spawn result that recorded missing paths, the line names them

## 5. Documentation

- [x] 7. When a planner reads PLANNER.md or README, they learn the verify_starts rules, the verify_path_missing reason, and the verify_starts_conflict flag
