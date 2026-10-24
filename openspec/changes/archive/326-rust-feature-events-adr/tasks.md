# Tasks

## 1. Core

- [x] 1. When a feature lists the event kinds it reacts to, core gives every event its kind and a Reaction to handle it, with defaults that change no feature

## 2. Storage

- [x] 2. When osq replaces a small state file, the storage kernel writes it durably so a crash leaves the old file or the new one

## 3. Loop

- [x] 3. When a command runs through the loop kernel, it delivers new events at least once to the features that react, from a durable cursor under a lock per change, and reports each failure

## 4. CLI

- [x] 4. When a human runs a Rust command, the CLI runs it through the loop kernel's entry point and prints each reaction failure on stderr with exit code 1

## 5. Decision

- [x] 5. When osq reads its decisions, ADR 030 on Rust feature events is accepted for group rust, names its tests, is linked from the index and is named by ADR 028
