---
planner: gpt-5
date: 2026-09-21
---

# Planning telemetry and cycle time

Record every `osq plan` session under the change's `.run/`, including exact wall
time and harness-reported usage when local session artifacts expose it. Add the
planning totals and per-change wall time to `osq report`, record planning-session
count at approval, list sessions in `osq show`, and report the lifecycle from
brief through approval, first task start, and archive.

Usage must never be estimated. OpenCode and Codex read only confirmed local
usage artifacts; AGY still records the complete lifecycle and wall time but
records null usage fields. Headless planning, queueing, task-event changes, and
prompt-length token estimates are out of scope.
