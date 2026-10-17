# Tasks

## 1. Configuration

- [x] 1. When osq.config.ts holds an autopilot block, the loaded config holds enabled, and any other key or value fails loading

## 2. Queue approval

- [x] 2. When a human runs osq queue approve, osq records every item's hash and clears an autopilot stop, and osq queue shows what the approval covers

## 3. Next step

- [x] 3. When the watcher asks what autopilot does next, osq reads the queue, its approval and the item's change and names one step

## 4. Watcher

- [x] 4. When autopilot is on, the watcher plans, approves, runs and lands each approved queue item in order through the command functions, and stops with one record when a step needs a human

## 5. Inbox and status

- [x] 5. When autopilot has stopped, osq inbox and osq status show the reason and the one command that resumes the queue

## 6. Dashboard

- [x] 6. When the home view lists an autopilot stop, it shows the reason and links the title only when the stop names a change
