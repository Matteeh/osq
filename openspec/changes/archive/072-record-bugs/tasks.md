# Tasks

## 1. Manifest

- [x] 1. When osq plan creates a change and osq approve approves it, the manifest keeps the creation time and only approval writes approvedAt

## 2. Approval gate

- [x] 2. When a change has no .run/approved, automatic retry, the dashboard, and planning turn attribution ignore its manifest approvedAt

## 3. Report

- [x] 3. When the report reads archived changes, it measures brief to approval from creation, sizes tasks by their end scope, and prints counts in the repository record
