## ADDED Requirements

### Requirement: Change ids
Core SHALL read the change id a human gives a Rust command with
`parse_change_id(input: &str, slug: bool) -> Result<ChangeId, ChangeIdError>`,
doing no IO, and every Rust feature SHALL match a change id only through it.
With `trimmed` the input without the surrounding whitespace `str::trim`
removes, and a name being one or more parts joined by single `-`, each part
one or more ASCII lowercase letters or ASCII digits:

- When `trimmed` is one or more ASCII digits, it is `ChangeId::Number`
  holding `trimmed`. It names a folder whose name starts with one or more
  ASCII digits that equal `trimmed` once leading zeros are removed from both,
  followed by the end of the name or by `-`.
- Otherwise, when `trimmed` is a name and `slug` is false, it is
  `ChangeId::Folder` holding `trimmed`. It names only a folder whose name
  equals `trimmed`.
- Otherwise, when `trimmed` is a name and `slug` is true, it is
  `ChangeId::Slug` holding `trimmed`. It names a folder whose name equals
  `trimmed`, or is one or more ASCII digits followed by `-` and `trimmed`.
- Anything else is a `ChangeIdError` holding the input as given and `slug`.

`ChangeId::names(&self, folder: &str) -> bool` SHALL tell whether the id
names a folder name, as these rules say. `ChangeIdError` SHALL implement
`std::error::Error`, and its display SHALL be
`"<input>" is not a change id; give the change's number, such as 7 or 007, or its full folder name`
when `slug` is false, and
`"<input>" is not a change id; give the change's number, such as 7 or 007, its full folder name, or that name without its number`
when it is true, `<input>` being the input as given.

#### Scenario: Change id names a folder
- **WHEN** a test parses the row's input with the row's `slug` and asks whether the id names the row's folder
- **THEN** the answer is the row's:

| Input | Slug | Folder | Names |
|---|---|---|---|
| `310` | false | `310-rust-land` | yes |
| `0310` | false | `310-rust-land` | yes |
| `  7  ` | false | `007-alpha` | yes |
| `7` | false | `0007` | yes |
| `0` | false | `000-zero` | yes |
| `31` | false | `310-rust-land` | no |
| `310` | false | `3100-other` | no |
| `310` | false | `310x` | no |
| `310` | false | `rust-land` | no |
| `310-rust-land` | false | `310-rust-land` | yes |
| `310-rust` | false | `310-rust-land` | no |
| `310-wrong-slug` | false | `310-rust-land` | no |
| `310x` | false | `310-rust-land` | no |
| `x-y` | false | `x-y` | yes |
| `rust-land` | false | `310-rust-land` | no |
| `rust-land` | true | `310-rust-land` | yes |
| `rust-land` | true | `rust-land` | yes |
| `land` | true | `310-rust-land` | no |
| `rust-land` | true | `x-rust-land` | no |

#### Scenario: Change id refused
- **WHEN** a test parses the row's input with the row's `slug`
- **THEN** it gives a `ChangeIdError` displayed as the row's text, where `<forms>` is `give the change's number, such as 7 or 007, or its full folder name` and `<slug forms>` is `give the change's number, such as 7 or 007, its full folder name, or that name without its number`:

| Input | Slug | Display |
|---|---|---|
| `310]` | false | `"310]" is not a change id; <forms>` |
| `31O` | false | `"31O" is not a change id; <forms>` |
| empty | false | `"" is not a change id; <forms>` |
| `  ` | false | `"  " is not a change id; <forms>` |
| `-2` | false | `"-2" is not a change id; <forms>` |
| `310-` | false | `"310-" is not a change id; <forms>` |
| `310--x` | false | `"310--x" is not a change id; <forms>` |
| `310_x` | false | `"310_x" is not a change id; <forms>` |
| `Rust-Land` | true | `"Rust-Land" is not a change id; <slug forms>` |
| `-2` | true | `"-2" is not a change id; <slug forms>` |
| `rust land` | true | `"rust land" is not a change id; <slug forms>` |
