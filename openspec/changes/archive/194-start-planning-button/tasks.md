# Tasks

## 1. Decision

- [x] 1. When osq's decisions are read, ADR 019 is accepted and records how a planner a human starts runs

## 2. Records

- [x] 2. When a planner runs, its record names the process, and osq tells a live planner from one whose process is gone

## 3. Status

- [x] 3. When a planner runs for a change, its next step is planning, its document carries the run, and the page model says so

## 4. Command

- [x] 4. When osq plan <id> --run runs, a detached osq process plans the change in its own tree and records the outcome

## 5. Server

- [x] 5. When the dashboard posts a plan action, the server runs osq plan <id> --run through the same command function
- [x] 6. When a planner runs for a change, osq approve waits for it, and a server-aimed osq plan --run starts it on the server

## 6. Page

- [x] 7. When the Change page shows the hand-off, it offers Start planning, and while the planner runs it shows how long
