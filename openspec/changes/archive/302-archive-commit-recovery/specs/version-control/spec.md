## ADDED Requirements

### Requirement: Land refuses a failed archive commit
Before it checks that the change's worktree is clean, `osq land <id>`
SHALL refuse an archived change whose `.run/regressed/change.md`, in its
own worktree, has reason `commit_failed`, with the error
`<folder>'s archive commit failed; fix the cause, then run osq retry <id> change`,
and change nothing.

#### Scenario: Land on a failed archive commit
- **WHEN** change 002, folder `002-orders`, archived in its worktree with the move uncommitted and `.run/regressed/change.md` with reason `commit_failed`, and a human runs `osq land 002`
- **THEN** it exits 1 and prints `002-orders's archive commit failed; fix the cause, then run osq retry 002 change`, not the list of uncommitted paths, and the default branch and the worktree are unchanged
