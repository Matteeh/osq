# Tasks

## 1. Entry files exist

- [x] 1. When a task's entry names a missing file, the watcher ends it as entry_missing before the executor starts, and the change waits for steering
- [x] 2. When a task died with entry_missing, its inbox item names the missing files and osq plan <id>
- [x] 3. When osq lint runs on a change whose task entry names a file neither the default branch nor the change provides, it reports an error
