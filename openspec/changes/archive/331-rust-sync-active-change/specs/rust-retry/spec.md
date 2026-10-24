## MODIFIED Requirements

### Requirement: Recertified done marker
A recertification SHALL take the task's scope hash from rust-storage
`task_scope_hash` of the tree root with the task file's `scope`, and, when
the verify passes, rewrite the done marker with rust-storage
`refresh_done_marker`, passing the recorded hash, that scope hash and the
current time as an ISO 8601 UTC timestamp to the millisecond. A
`DoneMarkerError` SHALL fail `retry` with a `Failed` error for the command
`retry` whose message is its display. The retry crate SHALL keep no scope
resolver, scope hash or frontmatter writer of its own.

#### Scenario: Recertified scope files
- **WHEN** a new copy of `crates/features/retry/tests/fixtures/recert-project/` has `openspec/changes/001-recert/tasks/4.md` rewritten to `---`, `title: t`, `verify: sh checks/pass.sh`, `scope:` and one `  - <entry as a JSON string>` line per row entry, then `---`, each line followed by a newline, and `.run/approved` rewritten to rust-storage `change_folder_seal` of that folder and a newline, and `retry` runs with `1`, `4`
- **THEN** the rewritten `.run/done/4` holds the row's `scope_hash` line, and its `scope_files` line and the indented lines after it are the row's:

| Scope entries | `scope_hash` | `scope_files` lines |
|---|---|---|
| `../outside.txt` | `sha256:985bc8dcecaee4913c191e1d3b327a931d48951f486500edd41ab73a57918030` | `scope_files:`, `  ../outside.txt: null` |
| `/abs/file.txt` | `sha256:d84705e84283af54e8d2e9a3d8f1a7f34c018c3aeb577b80d8186dd3577d841a` | `scope_files:`, `  /abs/file.txt: null` |
| `../*.txt`, `/abs/*.txt` | `sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | `scope_files: {}` |
| `src` | `sha256:7aaf195b39732b39c116a660cd4ffe54eae09e8fc8a4970b2d7e295e68ad4892` | `scope_files:`, `  src: null` |
| `.\src\one.txt` | `sha256:3cfb4fa0947b1fa72f558e0825b1115022423a0aeea283d1bef4ae6536db3a06` | `scope_files:`, `  src/one.txt: sha256:7ebb69bac93710c46aa44d35d31ef4965e35c47dd614e1305bfd4a9f96a411ae` |
| `src/two/*` | `sha256:30f9c1fbb55d70fb0e7a241e42ceb8099db0c1fe1d5e8fe749159a2b7964bb7d` | `scope_files:`, `  src/two/a.txt: sha256:87428fc522803d31065e7bce3cf03fe475096631e5e07bbd7a0fde60c4cf25c7` |
| `src/two/deep/?.txt` | `sha256:3515f8747e9ad61510ae928351f0d194a568fb85538f2a36a8cf865bcc42f53a` | `scope_files:`, `  src/two/deep/b.txt: sha256:0263829989b6fd954f72baaf2fc64bc2e2f01d692d4de72986ea808f6e99813f` |
| `src/one.txt`, `./src/one.txt` | `sha256:3cfb4fa0947b1fa72f558e0825b1115022423a0aeea283d1bef4ae6536db3a06` | `scope_files:`, `  src/one.txt: sha256:7ebb69bac93710c46aa44d35d31ef4965e35c47dd614e1305bfd4a9f96a411ae` |
| `src/two/**/*.txt` | `sha256:aa7da01efad91002a86deb7638a3a1648fea7b55632fc4b30e17e1bb57d74342` | `scope_files:`, `  src/two/a.txt: sha256:87428fc522803d31065e7bce3cf03fe475096631e5e07bbd7a0fde60c4cf25c7`, `  src/two/deep/b.txt: sha256:0263829989b6fd954f72baaf2fc64bc2e2f01d692d4de72986ea808f6e99813f` |
| `src/**` | `sha256:d21bc7711678dcf1a2bd9bc1c5e7be5282b4baa70f6d001ba39ab0937d5ef4ac` | `scope_files:`, `  src/one.txt: sha256:7ebb69bac93710c46aa44d35d31ef4965e35c47dd614e1305bfd4a9f96a411ae`, `  src/two/a.txt: sha256:87428fc522803d31065e7bce3cf03fe475096631e5e07bbd7a0fde60c4cf25c7`, `  src/two/deep/b.txt: sha256:0263829989b6fd954f72baaf2fc64bc2e2f01d692d4de72986ea808f6e99813f` |

#### Scenario: Recertified marker text
- **WHEN** a new copy of `crates/features/retry/tests/fixtures/recert-project/` has `openspec/changes/001-recert/.run/done/4` rewritten to `---`, `scope_hash: sha256:2222222222222222222222222222222222222222222222222222222222222222`, the row's frontmatter line, `---` and `2026-10-01T10:00:00.000Z`, each line followed by a newline, and `retry` runs with `1`, `4`
- **THEN** the rewritten marker's lines start with `---`, `scope_hash: sha256:3cfb4fa0947b1fa72f558e0825b1115022423a0aeea283d1bef4ae6536db3a06` and the row's lines:

| Frontmatter line | Lines |
|---|---|
| `flag: true` | `flag: true` |
| `note: ""` | `note: ""` |
| `stamp: "0x1f"` | `stamp: "0x1f"` |
| `stamp: "12e45"` | `stamp: "12e45"` |
| `stamp: "-1"` | `stamp: "-1"` |
| `stamp: "True"` | `stamp: "True"` |
| `stamp: "a:"` | `stamp: "a:"` |
| `stamp: a.b/c_d-e+f:g@h` | `stamp: a.b/c_d-e+f:g@h` |
| `stamp: 1.2.3` | `stamp: 1.2.3` |
| `nothing:` | `nothing: null` |
| `list: [{a: 1, b: [x]}, [y, z], {}, []]` | `list:`, `  - a: 1`, `    b:`, `      - x`, `  - - y`, `    - z`, `  - {}`, `  - []` |
| `nested: {a: {b: c}}` | `nested:`, `  a:`, `    b: c` |
| `codes: {7: seven}` | `codes:`, `  "7": seven` |
| `recertification_count: 0` | `recertification_count: 1`, `original_scope_hash: sha256:2222222222222222222222222222222222222222222222222222222222222222` |
| `recertification_count: "3"` | `recertification_count: 1`, `original_scope_hash: sha256:2222222222222222222222222222222222222222222222222222222222222222` |
| `original_scope_hash: ""` | `original_scope_hash: sha256:2222222222222222222222222222222222222222222222222222222222222222`, `scope_files:` |
