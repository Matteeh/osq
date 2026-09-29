## REMOVED Requirements

### Requirement: Test gating configuration
**Reason**: It described configurable test file patterns defaulting to `tests/**`. No such configuration key exists; the frozen-test gate always governed `tests/` alone.
**Migration**: See "Test gate paths" in watcher-and-harness, which defines the gate's paths and names every consumer. Nothing in `osq.config.ts` changes.
