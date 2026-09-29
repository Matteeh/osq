# Tasks

## 1. Watcher

- [x] 1. When osq's source gets newer than its build during a watcher run, the watcher finishes the running task, starts nothing new, and exits 1 with the stale line

## 2. Land

- [x] 2. When osq land runs on a stale build it refuses, and when it lands a change to osq's own source it says to rebuild and restart the watcher
