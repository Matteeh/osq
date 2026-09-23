# Tasks

## 1. Merge parity

- [x] 1. When osq merges a delta, it writes what openspec archive writes and refuses what it refuses, and a differential test proves it

## 2. Validator version policy

- [x] 2. When the installed OpenSpec differs from the pin but sits inside the peer range, doctor and lint warn instead of failing

## 3. One proposal format

- [x] 3. When an OpenSpec-aware agent or osq new starts a proposal, both use osq's sections, and this repository validates under that schema

## 4. Scheduled upstream check

- [x] 4. When a week passes, CI runs the differential test against the latest OpenSpec and names its version on failure
