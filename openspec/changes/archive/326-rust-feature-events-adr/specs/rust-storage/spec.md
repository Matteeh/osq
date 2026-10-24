## ADDED Requirements

### Requirement: Durable write
`write_durable(path: &Path, bytes: &[u8]) -> std::io::Result<()>` in
`osq-kernel-storage` SHALL replace the file at `path` with `bytes` so that a
crash leaves either the old file or the new one, as ADR 030 says. It writes
`bytes` to `.<file name>.tmp` in the same folder, calls `sync_all` on it,
renames it over `path`, and on Unix opens the folder and calls `sync_all`
on it. It creates no folder. When a step fails it returns that error, and
removes the temporary file when the rename did not happen.

#### Scenario: Durable writes
- **WHEN** `write_durable` writes `new\n` to the row's path in a new folder under `CARGO_TARGET_TMPDIR`
- **THEN** it gives the row's result, and the folder holds no `.<file name>.tmp` afterwards:

| Path | Before | Result |
|---|---|---|
| `cursor` in the folder | no file | `Ok`, and `cursor` holds `new\n` |
| `cursor` in the folder | `cursor` holding `old\n` | `Ok`, and `cursor` holds `new\n` |
| `missing/cursor` in the folder | no `missing` folder | an `Err` of kind `NotFound`, and no `missing` folder |
| `cursor` in the folder | `cursor` is a folder | an `Err`, and `cursor` is still a folder |
