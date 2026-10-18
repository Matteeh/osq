# Tasks

## 1. Reading change folders

- [x] 1. When storage reads a project, it lists its change folders and reads each into a snapshot with folded events, and a malformed event line is an error

## 2. Read model

- [x] 2. When the read model is built, SQLite holds the changes, tasks and dead_attempts rows of the archived changes, and a rebuild gives the same rows

## 3. Corpus tests

- [x] 3. When a Rust test reads data outside its crate, it is a marked corpus test that verify runs and cargo-mutants does not

## 4. Archive corpus

- [x] 4. When the archive is replayed, every fold matches its done markers and every golden row matches TypeScript's
