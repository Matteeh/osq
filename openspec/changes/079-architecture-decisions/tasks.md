# Tasks

## 1. Decision records

- [ ] 1. When osq reads the decisions folder, it parses and validates every ADR that has osq frontmatter

## 2. Project rules block

- [ ] 2. When osq init runs, AGENTS.md gets the project rules block, and osq doctor checks the ADRs and the block

## 3. Plan prompt

- [ ] 3. When a plan prompt is built, it lists every accepted ADR in an Architecture Decisions section

## 4. Proposal entry points

- [ ] 4. When osq new, an OpenSpec-aware agent, or the planner starts a proposal, every entry point asks for a Decisions section

## 5. Decisions lint

- [ ] 5. When a change is linted in a project with ADRs, lint checks its Decisions section and the project rules block

## 6. Approval digest

- [ ] 6. When a change is digested for approval, it lists the governing ADRs and flags each departure

## 7. Instructions drift

- [ ] 7. When AGENTS.md or a governing ADR changed after approval, the watcher warns before the task's first attempt and osq show marks it
