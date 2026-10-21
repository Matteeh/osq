## REMOVED Requirements

### Requirement: Code ownership
**Reason**: `crates/apps/cli`, the last placeholder crate rust-workspace held, now has its own capability, rust-cli, as this requirement said it would. With no requirement left, archive removes the rust-workspace capability.
**Migration**: rust-cli's "Code ownership" maps `crates/apps/cli/**` to rust-cli.
