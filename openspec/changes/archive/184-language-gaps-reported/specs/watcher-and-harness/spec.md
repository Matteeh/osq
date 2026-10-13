## MODIFIED Requirements

### Requirement: Architectural import graph boundaries
The codebase SHALL enforce strict directional import boundaries across packages, preventing backward or cross-tier dependency leaks. Kernel slices under `src/kernel/` are shared code every layer may import (ADR 016).

#### Scenario: Core layer isolation
- **WHEN** import dependencies of `src/core/**` are analyzed
- **THEN** no module in `src/core` imports from any directory outside `src/core` and `src/kernel`

#### Scenario: Harness layer boundaries
- **WHEN** import dependencies of `src/harness/**` are analyzed
- **THEN** no module in `src/harness` imports from `src/watcher` or `src/cli`

#### Scenario: Watcher layer boundaries
- **WHEN** import dependencies of `src/watcher/**` are analyzed
- **THEN** no module in `src/watcher` imports from `src/cli`
