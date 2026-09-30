# Tasks

## 1. Excerpt and archive marker

- [x] 1. When archive-time verification fails, the regressed marker holds the failing tests and names the event with the full output

## 2. Dead markers

- [x] 2. When a task dies on a failing verify, focused run, pre-spawn check, change verify, or baseline, its dead marker holds the output excerpt

## 3. Scope regression marker

- [x] 3. When a scope audit finds a done task's verify red, the scope regression marker holds the output excerpt

## 4. Equivalence test

- [x] 4. When a living spec differs from its replay, the equivalence test shows the first differing lines, not two whole specs
