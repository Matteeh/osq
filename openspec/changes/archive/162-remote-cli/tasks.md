# Tasks

## 1. Remote CLI

- [x] 1. When an osq server has a command runner, it streams forwarded commands as NDJSON and moves change folder files behind the write guard
- [x] 2. When a command reaches the server, it runs the same command function and streams the same output, and the client reads OSQ_SERVER and talks to the server
- [x] 3. When a planner plans against a server, osq plan downloads the change folder to a working copy and osq lint uploads it before linting
- [x] 4. When OSQ_SERVER is set, the osq CLI forwards each command to the server and refuses the local-only ones in one line, and when it is unset nothing changes
- [x] 5. When osq's decisions are read, ADR 014 lists the forwarded-command and upload tests that enforce it
