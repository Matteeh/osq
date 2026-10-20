## ADDED Requirements

### Requirement: osq's own change concurrency
osq's own `osq.config.ts` SHALL set `maxConcurrency` to 3, so the watcher runs
up to three independent approved changes of osq itself at once, as
watcher-and-harness "Parallel change lanes" describes.

#### Scenario: Own change concurrency
- **WHEN** `loadConfig` reads osq's own repository
- **THEN** its `maxConcurrency` is 3
