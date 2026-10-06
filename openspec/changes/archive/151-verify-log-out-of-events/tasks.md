# Tasks

## 1. Verify logs and event tails

- [x] 1. When the watcher records a verify run, its full output goes to an ignored log file, the event keeps the tail, and markers point at the log
- [x] 2. When a sync records a verify, or osq records a halt or a human recertification, the event keeps only the tail and a sync's full output goes to a log
