---
title: Smoke test
depends_on: []
features:
  reads: []
  writes: []
---
## Goal

Verify that osq watch spawns agy with Gemini 3.8 Flash, completes a task, verifies it, and archives.

## Contract

| Input | Expected Output |
|---|---|
| osq watch | agy creates smoke.txt and watcher verifies it |

## Non-goals

- None

## Delta

None
