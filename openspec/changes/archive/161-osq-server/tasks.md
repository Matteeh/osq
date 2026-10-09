# Tasks

## 1. osq server

- [x] 1. When osq reads the serve config, allowed hosts and the server block are validated, and the write guard accepts the listed hosts and their https origins
- [x] 2. When osq fetches or pushes a branch, the Vcs port fetches without moving local branches and pushes only a fast-forward, never forcing
- [x] 3. When a land runs with publish, it fetches origin, catches up or stops, pushes the land commit before the branch moves, and stops when origin moved
- [x] 4. When the supervisor runs a server, it spawns the server worker, logs to server.log, restarts it like the watch service, and removes server.json on stop
- [x] 5. When startWebServer is given a site, every path lives under /p/<project>/, / redirects there, and api/server reports the server and its watcher service
- [x] 6. When a user runs osq server start or stop, the dashboard server and the watch service start in the background or stop, and a land tapped there publishes to origin
- [x] 7. When the dashboard is served under /p/<project>/, it requests its documents there, names the project and server in the header, and shows a Service panel on home
- [x] 8. When osq's decisions are read, ADR 013 is accepted, ADR 009 is superseded by it, and ADR 014 lists the tests that enforce it
