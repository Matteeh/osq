# Tasks

## 1. Recovery scenarios

- [x] 1. When a task dies and a human retries it, the watcher runs it again, archives the change, and osq land lands it
- [x] 2. When a task is stuck and its plan is revised and approved again, the watcher runs it, archives the change, and osq land lands it
- [x] 3. When a watcher is killed mid-task, osq retry names the stopped watcher, and the next watch reaps the lock, retries the task, and the change lands
- [x] 4. When a sync conflict halts an active change and its revised plan is approved, osq restarts it from main, runs it, and osq land lands it
- [x] 5. When osq land stops on a conflict and the revised plan is approved, osq restarts the change, runs it, and the next land lands it
- [x] 6. When osq land stops on a red verify and a task is added and approved, osq merges main, runs only the new task, and the next land lands it
- [x] 7. When a change halts, approval of a revised plan or osq retry for a halt that needs no steering resumes the run, and osq land lands it
