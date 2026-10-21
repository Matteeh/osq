# Tasks

## 1. Pi preflight

- [x] 1. When a caller preflights pi, the harnesses kernel resolves the binary, probes its version, warns outside the tested range and checks credentials as TypeScript's preflightPi does

## 2. Pi task run

- [x] 2. When the runners kernel starts pi through PiHarness, pi runs through the process runner, its stdout becomes core events, and it is stopped a grace period after agent_settled

## 3. Sync recertification lines

- [x] 3. When core reads a recertification line that TypeScript's sync wrote without output, it parses the line and writes it back without one

## 4. Parallel fake pi starts

- [x] 4. When the pi harness run tests start the fake pi in parallel, each start runs the committed fixture in place and none fails with Text file busy
