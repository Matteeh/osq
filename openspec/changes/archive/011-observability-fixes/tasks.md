# Tasks

- [x] 1. When a task is spawned, onSpawn records started with pid while the runner alone manages lifecycle events
- [x] 2. When an agent outputs assistant text, adapters emit text events while the runner synthesizes results
- [x] 3. When a task lock collision occurs, already_running aborts without appending a dead event
- [x] 4. When adapters extract tokens, reasoning is emitted while the report prefers reported cache
- [x] 5. When shared harness helpers are extracted, duplicate stream parsers with legacy report aliases are removed