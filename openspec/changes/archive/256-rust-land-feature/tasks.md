# Tasks

## 1. Land facts

- [x] 1. When storage reads a change folder for a land, read_land_facts gives its message, archive and stack facts and passes over what it cannot use

## 2. The land commit

- [x] 2. When land runs on an archived worktree change, it commits the branch tip's tree onto the default branch with TypeScript's message, fast-forwards the checkout and prints the changed paths

## 3. Refusals

- [x] 3. When land runs on a stacked change, off the default branch, with an unclean worktree or after an earlier unlanded change on a shared capability, it refuses with TypeScript's message and writes nothing
