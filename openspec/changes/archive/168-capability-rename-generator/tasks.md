# Tasks

## 1. Capability moves osq generates

- [x] 1. When a delta leaves its capability with no requirement, archive and the land sync remove its folder, lint does not validate it, and the replay test covers every capability
- [x] 2. When a proposal carries generated, lint fails any moved requirement whose text differs from the living one or that lands nowhere
- [x] 3. When generateCapabilityMove runs a rename or a split, it writes the byte-for-byte deltas, sidecars, Code ownership and proposal section into the unapproved change
- [x] 4. When a planner runs osq capability rename or split, the CLI writes the move into the change, lists it under Plumbing, and a generated rename replays to the archived specs
