# Tasks

## 1. Land runs the after-land command

- [x] 1. When a land moves the default branch and vcs.afterLand is set, osq runs it in the checkout, records a failure, and runs it again on the next land of that change
- [x] 2. When a recorded after-land command failed, bare osq, osq status and the dashboard show it with osq land <id>
- [x] 3. When osq plans or lands itself, its config runs pnpm build after every land, ADR 012 and README say so, and the plan prompt names the command
