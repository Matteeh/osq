# Tasks

## 1. Flaky test guard

- [x] 1. When osq reads gates.changeVerifyReruns, it defaults to 1, keeps 0, rejects any other value, and README describes the rerun
- [x] 2. When a change verify fails only in tests unrelated to the task, the runner reruns it and records a change_verify_rerun event
- [x] 3. When osq report reads passing change_verify_rerun events, it lists each flaky test with how often it flaked
