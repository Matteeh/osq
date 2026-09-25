# Tasks

## 1. Checks and denied packages

- [x] 1. When an ADR names checks or denied packages, osq reads them and doctor fails on a missing check file

## 2. Check modification flag

- [x] 2. When a task may modify an accepted ADR's check file, the approval digest flags it and osq report counts the flag

## 3. Dependency gate

- [x] 3. When an agent adds a package to a scoped package.json, the watcher records it and kills the task if an accepted ADR denies it

## 4. Show and report

- [x] 4. When tasks added dependencies, osq show lists them per task and osq report per change
