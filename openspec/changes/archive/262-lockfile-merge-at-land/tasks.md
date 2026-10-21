# Tasks

## 1. Lock file rebuild command

- [x] 1. When the languages kernel is asked how to rebuild a lock file, it gives cargo's offline update for Cargo.lock and nothing for other files

## 2. Sync rebuilds a conflicting lock file

- [x] 2. When a sync with the default branch conflicts only in Cargo.lock, osq rebuilds the lock file offline and commits the sync instead of stopping
