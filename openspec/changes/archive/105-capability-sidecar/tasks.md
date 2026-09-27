# Tasks

## 1. Config

- [x] 1. When a project opts in to capability groups, the config holds requireGroups

## 2. Sidecar and lint

- [x] 2. When a change carries or touches a sidecar, or creates with a group, lint reads and checks it

## 3. Archive

- [x] 3. When a change archives, its created and replacement sidecars are written, and approval records their hashes

## 4. Migrate

- [x] 4. When a project adopts groups, osq migrate sidecars scaffolds the missing sidecars

## 5. Report

- [x] 5. When a project has living specs, the report counts capabilities with and without a sidecar

## 6. Graph

- [x] 6. When capabilities have groups, the graph draws their lanes under group headers

## 7. osq itself

- [x] 7. When osq plans its own changes, every capability has a group and requireGroups is on
