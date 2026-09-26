# Tasks

## 1. Port fixes

- [x] 1. When discard gets no paths it does nothing, it puts back staged files, and commit records only its own paths

## 2. Commit message

- [x] 2. When osq commits for a task, one function builds the message with its Osq trailers

## 3. Dead record

- [x] 3. When a task dies in an osq worktree, osq writes the patch, discards outside the change folder, and commits the dead record
