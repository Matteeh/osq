# Tasks

## 1. Manual edits

- [x] 1. When osq.config.ts sets vcs.manualEdits, the loaded config holds keep or block, and any other value fails loading
- [x] 2. When a human runs osq manual with a comment, osq commits the checkout's uncommitted edits together with a record of what they touched
- [x] 3. When approve or land stops on uncommitted edits, the message offers osq manual unless vcs.manualEdits is block
- [x] 4. When osq query runs, a manual_edits table lists every manual edit record, listed last after recertifications
- [x] 5. When a change is planned, the plan prompt ends with the manual edits whose capabilities no change has written since
