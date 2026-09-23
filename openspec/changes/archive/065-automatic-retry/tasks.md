# Tasks

## 1. Shared transition

- [x] 1. When retrySpec is asked for an automatic retry, the shared transition records automatic true on the retry event

## 2. Failure evidence

- [x] 2. When the watcher writes a dead marker, the marker records a fingerprint that ignores volatile details
- [x] 3. When a dead task is retried manually or automatically, the next prompt carries the retained marker's body

## 3. Watcher

- [x] 4. When an eligible task dies, the watcher retries it once automatically, or marks it stuck when the same failure repeats

## 4. Inspection

- [x] 5. When a dead task is stuck, the inbox and osq --json mark it stuck with its fingerprint
- [x] 6. When osq show lists a task with retries, it counts automatic ones and marks a stuck task
- [x] 7. When osq report runs, it shows automatic and manual retry outcomes and what automatic attempts cost

## 5. Documentation

- [x] 8. When a user reads the README, automatic retries, fingerprints, stuck tasks, and the retry report are explained
