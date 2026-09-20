# Tasks

## 1. Planner Configuration and Manifest Model Recording

- [x] 1. When a planner block is configured, defineConfig validates it and manifest reads the planner model from it

## 2. Interactive Harness Adapter Spawning

- [x] 2. When an adapter is asked for an interactive session, it spawns the harness with inherited stdio and returns the exit code

## 3. Opencode Planner Agent Setup

- [x] 3. When osq setup runs for opencode, .opencode/agent/osq-planner.md exists with stated tool limits and repeated runs are byte-identical

## 4. Interactive Planning CLI Command and Brief Writer

- [x] 4. When osq plan <name> runs, change folder and brief.md exist before session opens with ordered prompt sections and -print writes only to stdout