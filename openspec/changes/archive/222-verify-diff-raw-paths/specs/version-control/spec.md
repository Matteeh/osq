## ADDED Requirements

### Requirement: Patch names raw paths
The diff `patch` returns SHALL name every path as raw UTF-8, never quoted with
octal escapes, whatever the repository's `core.quotepath` setting is.

#### Scenario: Patch with a non-ASCII path
- **WHEN** a repository with `core.quotepath` set to true has an untracked file `a-😀.md` and `patch()` runs
- **THEN** the diff holds the line `diff --git a/a-😀.md b/a-😀.md`, holds no `\360`, and applying it to a clean copy creates `a-😀.md` with the same content
