## ADDED Requirements

### Requirement: Land view document
`WebChange` SHALL carry `land`, the `LandView` that `readLandView` returns
for an archived change and null for every other change. `getWebChange` SHALL
always set it from the details it already builds; the type declares it
optional so documents built before it stay valid, and a missing `land` SHALL
mean the same as null.

#### Scenario: Archived change document
- **WHEN** `GET /api/changes/<id>` serves an archived change
- **THEN** its `land` equals `readLandView` for the same change

#### Scenario: Active change document
- **WHEN** the change is active or rejected
- **THEN** `land` is null

### Requirement: Land view
For a change document with a `land`, the change view SHALL show a `Land`
section after the brief and before the actions and the task table, readable
at phone width, holding:

- a headline: `Landed`; `Git is off`; `Not landed. <branch> has <n> new
  commits since archive; Land will merge them and run verify again`;
  `Not landed. <branch> has not moved since archive`; or `Not landed. Branch
  osq/<folder> not found`, with `commit` for one commit
- `Gates at archive`: one item per gate with its name (`Task <n>`, `Verify`,
  `Check` or `Validator`), outcome, duration in whole seconds, the exit code
  of a failed gate, the validator's finding count, and its command as code;
  `None recorded` without gates
- `Diff`: `<files> files changed, +<added> -<removed>`, or `Unavailable`
- `Spec changes`: per capability its added, modified, removed and renamed
  requirement names, a rename as `<from> → <to>`; `None` without any
- `Executor disclosures`: per task its deviated and outside-scope text as
  plain preformatted text that wraps; `None` without any
- `Halted` with the reason and message when `halt` is set, and `Sync stopped`
  with the reason and message when `lastSyncStop` is set

The Land button stays the existing `land` action, and its result shows as
every action result does. A landed change SHALL show the same section, and
no Land button, because its actions hold no `land`. A change document
without a `land` SHALL render exactly as before this requirement.

#### Scenario: Ready to land
- **WHEN** the change view renders an archived change whose `land` says the default branch has 3 new commits
- **THEN** it shows the gates, diff, spec changes and disclosures, and says landing will merge the 3 commits and run verify again

#### Scenario: Landed record
- **WHEN** the change view renders a document whose `land.landed` is true
- **THEN** the section's headline is `Landed` and the other parts still show

#### Scenario: Land section before the actions
- **WHEN** the change view renders a document with a `land` and an action client
- **THEN** the `Land` heading comes before the actions panel and the task table

#### Scenario: Document without land unchanged
- **WHEN** the change view renders a document whose `land` is null or missing
- **THEN** the markup equals the markup it rendered before this requirement
