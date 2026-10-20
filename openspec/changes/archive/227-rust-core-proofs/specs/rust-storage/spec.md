## MODIFIED Requirements

### Requirement: Change folder seal
`change_folder_seal` SHALL give the seal of a change folder as
`hashChangeFolder` does: it SHALL walk the folder without following symbolic
links, leave out every path with a `.run`, `.git` or `.DS_Store` segment at any
depth and `plan-prompt.md` at the folder's root only, read every regular file
as bytes, pass each relative path, with `/` separators, and its bytes to
rust-core's `compute_seal`, and return the `ComputedSeal` it gives, so the
result can approve a change. A file or folder it cannot read SHALL be a
`StorageError` naming its path.

#### Scenario: Fixture folder seals
- **WHEN** `change_folder_seal` reads each folder under `tests/fixtures/seal/`
- **THEN** its seal is the one `tests/golden/seals.json` gives for the folder's name, as `hashChangeFolder` printed it:

| Folder | Seal |
|---|---|
| `plain` | `sha256:04b069baa8fc74930547d24536bf9adf89bb9cbbc42ed4a424a6d95c4dd7a5dd` |
| `plan-prompt` | `sha256:6bef426385ab92db4a312a13e3390e4698eee6e779ec005f011bc2a5db21f4d3` |
| `ticked` | `sha256:5dc64102a380b020a16fa5b5b6567d7efb7a41a14f196bf09a6afea1c20473b0` |
| `undecodable` | `sha256:ac76a0c3f8f2715a692dccc3440f2b3492ff854c1bdcf6ccfe0bdc794ef57653` |
| `unicode-order` | `sha256:85a79ea72b560017a34fe04906aa20267044480e67b5269c87d6af85c1d7d588` |

#### Scenario: Paths left out of the seal
- **WHEN** a temporary copy of `tests/fixtures/seal/plain` gains each addition below, one copy per row
- **THEN** its seal is still `sha256:04b069baa8fc74930547d24536bf9adf89bb9cbbc42ed4a424a6d95c4dd7a5dd`:

| Addition |
|---|
| `.run/approved` holding `sha256:` and 64 `a` |
| `.git/HEAD` holding `ref: refs/heads/main` |
| `specs/.DS_Store` holding `x` |
| `specs/demo/.run/done/1` holding nothing |
| `plan-prompt.md` holding `prompt` |
| a symbolic link `link.md` to `proposal.md` |
| `proposal.md` rewritten with every LF as CRLF |

#### Scenario: Empty folder seal
- **WHEN** `change_folder_seal` reads an empty folder
- **THEN** its seal is `sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`

#### Scenario: Unreadable change folder
- **WHEN** `change_folder_seal` reads a path that does not exist
- **THEN** it gives a `StorageError` that names that path
