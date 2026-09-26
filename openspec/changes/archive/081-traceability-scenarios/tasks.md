# Tasks

## 1. Scenario outcomes

- [x] 1. When a scenario has AND lines or a table under a THEN, osq parses them as outcomes and lint accepts the table

## 2. Traceability config

- [x] 2. When osq.config.ts sets traceability, osq resolves and validates it

## 3. OSQ_CHANGE

- [x] 3. When the watcher runs a verify, the command sees its change folder in OSQ_CHANGE

## 4. Effective scenario lookup

- [x] 4. When a test or lint asks for a scenario, osq returns its outcomes from the effective spec

## 5. Test helper

- [x] 5. When a test proves a scenario with the helper, it fails on any outcome left unasserted or wrong

## 6. Scanner and index

- [x] 6. When lint, report, or show scans the source, osq indexes tags, scenario calls, and unreadable forms

## 7. Traceability lint

- [x] 7. When a change touches scenarios, lint checks the traceability links and lists the tests a changed scenario touches

## 8. Report and show

- [x] 8. When a capability is opted in, osq report lists its traceability gaps and osq show lists each task's scenarios

## 9. Instruction blocks

- [x] 9. When a capability is opted in, osq init writes the traceability instruction blocks and doctor checks them
