# Tasks

## 1. Gates and living spec writes

- [x] 1. When the archive feature's archive command runs on a done change, it merges the deltas and writes the living specs and sidecars, and it refuses a change that is not done or whose deltas do not apply, writing nothing

## 2. Move and checkboxes

- [x] 2. When the archive command has written the living specs, it moves the change under the archive with TypeScript's names, ticks its tasks.md checkboxes, and leaves TypeScript's tree byte for byte

## 3. Archive record

- [x] 3. When the archive command writes living files, it first writes TypeScript's archive record and puts every living file back from it when a write fails
