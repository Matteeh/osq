# Tasks

## 1. Watch service

- [x] 1. When osq reads its config and watch records, the watch block has validated defaults and each project has one state folder under ~/.osq/watch
- [x] 2. When a service worker finds a new osq build, it exits between passes, and when the build is stale or still being written, it waits instead of exiting
- [x] 3. When the watch service's worker exits, the supervisor restarts it at once on a new build, after a backoff on a crash, and not at all after a stop
- [x] 4. When a user runs osq watch --background or --stop, the service starts detached or stops after its running task, and no two watchers run for one project
- [x] 5. When a user runs osq or osq status, the last line says whether a watcher runs, where, on which build, and status prints the service log's path
- [x] 6. When osq's decisions are read, ADR 012 records that the watcher runs in the background under osq's own supervisor and why not a system unit
