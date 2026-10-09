# Tasks

## 1. Assumptions section

- [x] 1. When osq seeds or describes a proposal, it carries a fixed Assumptions section after Decisions
- [x] 2. When a proposal is linted, an empty Assumptions section is an error and its lines can be read

## 2. Notices

- [x] 3. When a change folder is read for approval, osq derives its notices, sorts them by severity and folds the rest by config
- [x] 4. When osq lint passes on a named unapproved change, osq records the plan as ready with its hash and notices
- [x] 5. When a change is approved, osq prints its notices, refuses unopened red notices when told which were opened, and records them in the manifest

## 3. Dashboard

- [x] 6. When the web document is built for an unapproved change, its review carries the notices, and an approve request carries the opened notices to the command
- [x] 7. When the change view opens on an unapproved change, it leads with the notice block and keeps Approve disabled until each red notice is opened

## 4. History

- [x] 8. When osq query runs, a notices table lists each recorded notice of an archived or rejected change with what followed
