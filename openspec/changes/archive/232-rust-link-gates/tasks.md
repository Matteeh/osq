# Tasks

## 1. Functions in the graph

- [x] 1. When the tag reader and the graph builder see an item, they record whether it is a function

## 2. The link rules

- [x] 2. When link_gates runs on a project, each of the four link rules reports what breaks it, with the file, line and one fix

## 3. Gates for a change in flight

- [x] 3. When change_link_gates runs with a change folder, what the change's deltas add, modify or rename to counts as live

## 4. The repository gate

- [x] 4. When verify-rust.sh runs for a change, the link gates find no broken reference, untagged public function or incomplete capability in this repository

## 5. ADR 024's checks

- [x] 5. When osq reads ADR 024, its checks name the link gate tests
