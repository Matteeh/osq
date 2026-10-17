# Tasks

## 1. Typed events

- [x] 1. When osq-core reads an event line, it yields the typed Event or a read error, and writes it back with the same JSON value

## 2. Folds

- [x] 2. When a change's event streams are folded, task and change state follow the transition tables and the status order

## 3. Typestate gates

- [x] 3. When a change is approved or archived, only a matching seal or a done change passes, and the compiler refuses any other path
