# Tasks

## 1. Configuration and allowlist

- [x] 1. When a project declares role environment names in config, osq validates them and builds each role's environment from the allowlist

## 2. Verify and prepare

- [x] 2. When osq runs prepare, a recorded check, a retry recertification, a sync verify, a focused run, or a mutation check, the command gets only its role's environment
- [x] 3. When the watcher runs a baseline, task, change, archive, regression, or mutation verify, the command gets only the verify role's environment

## 3. Agent

- [x] 4. When osq spawns an agent, it gets only the agent role's environment, and Claude and a new opencode agent file deny git, network tools, and sudo

## 4. Decision

- [x] 5. When osq reads its decisions, ADR 007 is accepted and indexed, its rule is in AGENTS.md, and the README explains role environments
