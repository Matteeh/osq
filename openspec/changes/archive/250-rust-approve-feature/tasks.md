# Tasks

## 1. Lookup, steering and the marker

- [x] 1. When the approve feature runs approve on an active change, it finds the folder as findChange does, refuses one that needs steering, writes TypeScript's seal to .run/approved and prints the approval lines

## 2. Validation

- [x] 2. When the approve feature runs approve on a change whose delta specs fail the specs kernel's validation, it refuses with TypeScript's lint wrapper and writes nothing
