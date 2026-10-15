## ADDED Requirements

### Requirement: Manual edit keeping
`keepManualEdits` in `src/core/vcs/manual-edits.ts` SHALL keep the checkout's
uncommitted edits as one manual change with the human's comment. Without named
paths it keeps every uncommitted status entry that is not untracked; with
named paths, the entries each names exactly or as a folder prefix, untracked
ones included. It never keeps an entry under `<openspecRoot>/changes/`. It
SHALL refuse, writing nothing, with the first message that applies:

| when | message |
| --- | --- |
| `vcs.manualEdits` is `block` | `vcs.manualEdits is "block" in osq.config.ts; plan a change for these edits instead` |
| `vcs.enabled` is off or git is unavailable | `osq manual needs vcs.enabled and a git checkout` |
| the trimmed comment is empty | `osq manual needs a comment: osq manual "<why>"` |
| a named path is under the changes folder | `<path> belongs to a change; osq manual keeps edits outside openspec/changes` |
| a named path names no uncommitted entry | `<path> has no uncommitted edits` |
| nothing is left to keep | `nothing to keep: the checkout has no uncommitted edits outside openspec/changes` |

#### Scenario: Named untracked file
- **WHEN** the checkout has an edited tracked `osq.config.ts` and an untracked `notes.txt`, and `keepManualEdits` runs with the comment `add notes` and the path `notes.txt`
- **THEN** the new commit holds `notes.txt` and the record, and `osq.config.ts` is still modified and uncommitted

#### Scenario: Change folders are never kept
- **WHEN** the only uncommitted entry is the untracked folder `openspec/changes/005-draft/`, and `keepManualEdits` runs with the comment `tidy`
- **THEN** it fails with `nothing to keep: the checkout has no uncommitted edits outside openspec/changes` and HEAD is unchanged

#### Scenario: Manual edit refusals
- **WHEN** the checkout has an edited tracked `osq.config.ts` and `keepManualEdits` runs as the row says
- **THEN** it fails with the row's message, HEAD is unchanged, and no record exists

| run | message |
| --- | --- |
| config sets `vcs.manualEdits: 'block'`, comment `x` | `vcs.manualEdits is "block" in osq.config.ts; plan a change for these edits instead` |
| comment `   ` | `osq manual needs a comment: osq manual "<why>"` |
| comment `x`, path `openspec/changes/005-draft/proposal.md` | `openspec/changes/005-draft/proposal.md belongs to a change; osq manual keeps edits outside openspec/changes` |
| comment `x`, path `src/none.ts` | `src/none.ts has no uncommitted edits` |

### Requirement: Manual edit commit
Once nothing refuses, `keepManualEdits` SHALL write the record "Manual edit
record" describes and commit the kept paths, each kept rename's source, and
the record together through `vcs.commit` on the checkout's current branch. The
subject SHALL be `osq: manual <first comment line>`, with the other comment
lines as the body, authored as `<user.name> <<user.email>>` from git config,
or `vcs.author` when either is unset. A failed commit SHALL remove the record.
It SHALL return `Kept <paths> as <short commit>` and, when untracked entries
were left out, `Left out untracked: <paths>; name them to keep them`, paths
sorted and joined with `, `.

#### Scenario: Keep tracked edits
- **WHEN** the checkout has an edited tracked `osq.config.ts` and an untracked `notes.txt`, and `keepManualEdits` runs with the comment `raise the verify timeout`
- **THEN** HEAD is one new commit with subject `osq: manual raise the verify timeout` holding `osq.config.ts` and the record, `notes.txt` is still untracked, and the lines are `Kept osq.config.ts as <short commit>` and `Left out untracked: notes.txt; name them to keep them`

### Requirement: Manual edit record
Each kept edit SHALL leave one file `<openspecRoot>/manual/<stamp>.md`, where
`<stamp>` is the keep time in ISO-8601 UTC with every `:` and `.` replaced by
`-`. Its YAML frontmatter SHALL hold `kept_at`, that time in ISO-8601 UTC;
`paths`, the kept paths and rename sources, sorted; and `capabilities`, the
sorted living capabilities whose Code ownership covers a kept path, by
`readCapabilityOwnership` and `ownerCapabilities`. The trimmed comment SHALL
follow as the body. `readManualEditRecords(projectRoot, config)` in
`src/core/vcs/manual-records.ts` SHALL return every record, in `kept_at`
order, leaving out a file without a string `kept_at` or a `paths` list.

#### Scenario: Record of a kept edit
- **WHEN** `keepManualEdits` keeps `osq.config.ts` at `2026-10-15T20:01:02.123Z` with the comment `raise the verify timeout`, and the living `cli-foundation` spec's Code ownership covers `osq.config.ts`
- **THEN** `openspec/manual/2026-10-15T20-01-02-123Z.md` holds `kept_at: 2026-10-15T20:01:02.123Z`, `paths: [osq.config.ts]`, `capabilities: [cli-foundation]` and the body `raise the verify timeout`, and `readManualEditRecords` returns it

#### Scenario: Edit no capability owns
- **WHEN** `keepManualEdits` keeps only `notes/todo.txt`, which no Code ownership covers
- **THEN** the record's `capabilities` is empty

## MODIFIED Requirements

### Requirement: Land from the verified tree
After the refusals, `landChange` SHALL run `syncWithDefaultBranch` for the
change, passing on its progress callback, and stop with the sync's message
when it stops, after recording the stop as "Land records a steering stop"
says. It SHALL run no other `verify`: when the sync reports no merge,
the branch tip is the tree archive verified. It SHALL then take the worktree's
HEAD as the tip and the checkout's HEAD as the base, and stop with `<default
branch> moved while landing; run osq land <id> again` when the base is not an
ancestor of the tip. It SHALL build the land commit with `commitTree(tip,
base, message, vcs.author)`, where the message is what "Squash commit
message" builds at that moment, and move the checkout to it only through
`fastForward`. When `fastForward` returns `blocked`, it SHALL stop with `The
checkout has uncommitted changes in files this land writes: <paths>; keep them
with osq manual "<why>", or commit or stash them, then run osq land <id>
again`, or, when `vcs.manualEdits` is `block`, with `The checkout has
uncommitted changes in files this land writes: <paths>; commit or stash them,
then run osq land <id> again`. When `fastForward` fails and the
checkout's HEAD is no longer the base, it SHALL stop with the moved message,
and on any other failure with git's output. Every refusal and stop SHALL leave
the default branch, the checkout's index, and its tree as they were. On
success it SHALL print `Landed <folder> as <commit>`, clean up as "Land
cleanup" says, print `Kept branch osq/<folder>`, and exit zero. It SHALL never
push.

#### Scenario: Land after archive
- **WHEN** a change approved into a worktree has archived and the default branch has not moved
- **THEN** `osq land <id>` makes one commit on the default branch whose only parent is the old tip, whose tree equals the branch tip, whose message equals what `osq message <id>` printed before, whose `Osq-Head` is the branch tip, and whose author is `vcs.author`; the worktree is gone, the checkout holds the change only under the archive directory, and `osq/<folder>` still exists

#### Scenario: Two changes land in order
- **WHEN** `001` and `002` were cut from the same default branch and both add a requirement to `orders`, and `osq land 001` then `osq land 002` run
- **THEN** both succeed, `orders`'s living spec equals applying `001`'s delta and then `002`'s to the original spec, `osq/002-<words>` holds `osq: 002 sync main`, and the second commit's `Osq-Head` is that sync commit

#### Scenario: Stop leaves the checkout alone
- **WHEN** the sync stops on a code conflict
- **THEN** `osq land` exits one with the sync's message, and the checkout's HEAD and status are what they were

#### Scenario: Unrelated uncommitted work stays
- **WHEN** the checkout has a modified tracked `README.md`, a staged `notes.txt`, and an untracked draft folder of another change, none of which the change touches
- **THEN** `osq land` lands the change, `README.md` is still modified, `notes.txt` is still staged, and the draft folder remains

#### Scenario: Uncommitted file the change writes
- **WHEN** the checkout has a modified tracked file that the change also changes
- **THEN** `osq land` exits one with the uncommitted-files stop naming that file, the default branch has not moved, and the file keeps its edit

#### Scenario: Default branch moves during the land
- **WHEN** a commit lands on the default branch while the sync runs
- **THEN** `osq land` exits one with `main moved while landing; run osq land <id> again`, and the default branch is at that commit with no land commit on it

#### Scenario: Land commit runs no hook
- **WHEN** the repository's `pre-commit` hook exits 1 with `blocked by hook`
- **THEN** `osq land` lands the change, and its output does not hold `blocked by hook`

#### Scenario: No verify without a merge
- **WHEN** the default branch has not moved since archive and the proposal's `verify` would now exit 1
- **THEN** `osq land` lands the change without running it

#### Scenario: Uncommitted file under each mode
- **WHEN** the checkout has a modified tracked `src/one.txt` that change `001` also changes, and `osq land 001` runs with `vcs.manualEdits` as the row says
- **THEN** it exits one with the row's message

| vcs.manualEdits | message |
| --- | --- |
| unset | `The checkout has uncommitted changes in files this land writes: src/one.txt; keep them with osq manual "<why>", or commit or stash them, then run osq land 001 again` |
| `block` | `The checkout has uncommitted changes in files this land writes: src/one.txt; commit or stash them, then run osq land 001 again` |
