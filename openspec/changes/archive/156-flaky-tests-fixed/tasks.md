# Tasks

## 1. Flaky tests

- [x] 1. When the reads-once report test copies the report fixture, it skips the fixture's .osq index another test may be writing
- [x] 2. When the inbox test compares the core helper with the CLI, the running task's elapsed time is bounded by clocks taken around the spawn
- [x] 3. When a watcher's abort signal fires, it starts nothing more and its promise resolves once no cycle runs, and the watch-service-build tests await it
