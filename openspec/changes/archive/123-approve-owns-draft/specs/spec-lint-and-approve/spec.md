## MODIFIED Requirements

### Requirement: Approval into a worktree
With `vcs.enabled` and `GitVcs` selected, `osq approve` SHALL lint, review,
and hash the change folder in the checkout, committed or not. It SHALL then
create branch `osq/<folder>` at HEAD's commit and add its worktree at the path
"Worktree location" gives. When `vcs.prepare` is set, it SHALL run that
command once in the worktree, bounded by `timeouts.verifyTimeoutSeconds`. It
SHALL copy the checkout's folder into the worktree, and in the worktree's copy
append observed planning records, write `.run/approved` with the checkout
copy's hash, `.run/base` with the commit the branch was cut from, and
`.run/approver` with `<user.name> <<user.email>>` from git config, and write
the manifest. It SHALL commit that folder in the worktree as the branch's
first commit, with subject `osq: <id> approved` and author `vcs.author`, and
print `  Worktree: <path>` and `  Branch: osq/<folder>`. After that commit it
SHALL remove the checkout's folder as "Checkout copy removed at approval"
says, and SHALL write nothing else to the checkout. A failing prepare SHALL
stop the approval with the command's output and the worktree and branch
names, and SHALL remove neither, nor the checkout's folder. With
`vcs.enabled` off or `NoVcs` selected, approval SHALL write in place as
before.

#### Scenario: Approve a draft
- **WHEN** a lint-clean uncommitted draft is approved with `vcs.enabled` on `main` of a temporary repository
- **THEN** branch `osq/<folder>` has one commit over HEAD, subject `osq: <id> approved`, author `vcs.author`, holding the folder with `.run/approved`, `.run/base`, and `.run/approver`, the checkout no longer holds `openspec/changes/<folder>`, and `git status` of the checkout lists nothing else that differs from before

#### Scenario: Prepare runs in the worktree
- **WHEN** `vcs.prepare` writes a file named `prepared` into its working directory
- **THEN** that file exists in the worktree, not in the checkout

#### Scenario: Prepare fails
- **WHEN** `vcs.prepare` exits 1 after printing `boom`
- **THEN** approve fails with a message containing `boom`, the branch and worktree remain, and the checkout still holds the folder

### Requirement: Stacked approval
With `vcs.enabled` and `GitVcs` selected, when "Stack dependency state"
reports any of the change's `depends_on` entries as `approved` or
`archived`, approve SHALL, after lint, the refusals, and the review, record a
stacked approval instead of creating a branch. It SHALL delete any stacked
approval of the folder, copy the checkout's folder to
`<changes>/<folder>` inside the stacked approval directory "Worktree
location" gives, and in that copy append observed planning records, write
`.run/approved` with the checkout copy's hash, the manifest, and
`.run/approver` as "Approval into a worktree" does, and write
`.run/stacked-on` with one `<dependency folder> <approved hash>` line per
such entry, in `depends_on` order. It SHALL create no branch, worktree, or
commit, SHALL then remove the checkout's folder as "Checkout copy removed at
approval" says, SHALL write nothing else to the checkout, and SHALL print
`  Waiting for: <folders>`, comma-separated, and `  Stacked: <path>`. When
no entry is `approved` or `archived`, approve SHALL approve into a worktree
as "Approval into a worktree" says and then delete any stacked approval of
the folder. When the change locations module finds the change in a stacked
tree, approve SHALL first restore it to the checkout as "Stacked draft
restore" says, then lint, review, hash, and approve that draft as above.
When that approval fails, approve SHALL remove the restored draft, so the
stacked approval stays the change's only copy, unchanged.

#### Scenario: Approve a dependent of a running change
- **WHEN** `001-a` was approved into a worktree and the lint-clean draft `002-b` with `depends_on: ["001"]` is approved
- **THEN** approve prints `  Waiting for: 001-a` and `  Stacked: ` with the stacked path, that path holds `002-b` with `.run/approved`, `.run/approver`, and `.run/stacked-on` reading `001-a <001-a's hash>`, no branch `osq/002-b` exists, and the checkout no longer holds `002-b`

#### Scenario: Dependency already landed
- **WHEN** the default branch holds `001-a`'s archive and `002-b` is approved
- **THEN** approve creates `osq/002-b` and its worktree as before and prints no `Waiting for` line

#### Scenario: Approve a stacked change again
- **WHEN** `002-b` is stacked, a task file in its stacked copy is edited, and `002-b` is approved again
- **THEN** the stacked approval's `.run/approved` holds the edited copy's new hash and the edited task file, and the checkout holds no `002-b`

#### Scenario: Approve again after the dependency is rejected
- **WHEN** `002-b` is stacked on `001-a`, `001-a` is rejected on its branch, and `002-b` is approved again
- **THEN** approve creates `osq/002-b` at HEAD with its worktree, the stacked approval directory of `002-b` no longer exists, the worktree's `002-b` has no `.run/stacked-on`, and the checkout holds no `002-b`

## ADDED Requirements

### Requirement: Checkout copy removed at approval
With `vcs.enabled` and `GitVcs` selected, once "Approval into a worktree" has
committed the change on its branch, or "Stacked approval" has written the
stacked approval, approve SHALL remove the change's folder from the
checkout's changes directory through `removeCheckoutDraft` in
`src/core/spec/checkout-draft.ts`, unless the checkout's HEAD holds that
folder, as `vcs.pathExists('HEAD', <folder path relative to the repository
root>)` reports.
A folder HEAD holds SHALL stay, because the land commit moves it into the
archive. When approval fails before that point, the checkout's folder SHALL
remain as it was. With `vcs.enabled` off or `NoVcs` selected, approval SHALL
remove nothing.

#### Scenario: Uncommitted draft removed
- **WHEN** an uncommitted draft is approved into a worktree
- **THEN** the checkout no longer holds its folder

#### Scenario: Committed draft stays
- **WHEN** the draft's folder is committed at the checkout's HEAD and the change is approved into a worktree
- **THEN** the checkout still holds the folder, and `git status` of the checkout lists nothing under it

#### Scenario: Failed approval keeps the draft
- **WHEN** approval refuses because HEAD is not on the default branch
- **THEN** the checkout still holds the folder unchanged

#### Scenario: Version control off
- **WHEN** `vcs.enabled` is off and a draft is approved
- **THEN** the folder stays in the checkout and holds `.run/approved`

### Requirement: Stacked draft restore
`restoreStackedDraft` in `src/core/spec/checkout-draft.ts` SHALL take the
project root, the config, and a change the change locations module found in
a stacked tree. It SHALL copy that change's folder to `<changes>/<folder>` in
the checkout's changes directory, replacing any folder there, and SHALL then
delete every entry of the copy's `.run/` except `manifest.json` and
`plan.jsonl`, so the copy reads as an unapproved draft. It SHALL leave the
stacked approval directory unchanged and SHALL return the copy's absolute
path.

#### Scenario: Restore a halted stacked change
- **WHEN** the stacked `002-b` holds `.run/approved`, `.run/approver`, `.run/stacked-on`, `.run/manifest.json`, `.run/plan.jsonl`, and a halt marker
- **THEN** `restoreStackedDraft` writes `openspec/changes/002-b` in the checkout with the same authored files and only `.run/manifest.json` and `.run/plan.jsonl`, and the stacked directory still holds every file it held

### Requirement: Change references across trees
`osq lint` SHALL treat a `depends_on` or `fixes` id as naming a change when
any folder `knownChangeFolders` returns starts with the id, zero-padded to
three digits, followed by `-`, or equals it. So a change running in a
worktree, a stacked change, and a change rejected on its `osq/` branch are
all found, though the checkout holds no copy of them.

#### Scenario: Depends on a running change
- **WHEN** `vcs.enabled` is on, `001-a` runs in its worktree and the checkout holds no `001-a`, and a draft declares `depends_on: ["001"]`
- **THEN** lint reports no `depends_on names missing change` finding

#### Scenario: Fixes a change rejected on its branch
- **WHEN** branch `osq/003-c` exists, no tree holds `003-c`, and a draft declares `fixes: ["3"]`
- **THEN** lint reports no `fixes names missing change` finding

#### Scenario: Still missing
- **WHEN** no tree and no branch holds change 099, and a draft declares `depends_on: ["099"]`
- **THEN** lint fails with `depends_on names missing change: 099`
