# Tasks

## 1. TypeScript

- [x] 1. When git is on and the project root is below its repository's top level, every TypeScript command that reads git fails with the fix and writes nothing

## 2. Vcs kernel

- [x] 2. When a feature asks whether git is on at a project root, the vcs kernel answers once and refuses a root below the repository's top level

## 3. Rust features

- [x] 3. When approve or reject runs below its repository's top level with git on, the Rust approve feature refuses through the vcs kernel and writes nothing
- [x] 4. When archive, retry or run runs below its repository's top level with git on, each Rust feature refuses through the vcs kernel and writes nothing
- [x] 5. When land, sync or message runs below its repository's top level with git on, the Rust land feature refuses through the vcs kernel and writes nothing
- [x] 6. When show, report or inbox runs below its repository's top level with git on, each Rust feature refuses through the vcs kernel
- [x] 7. When plan, lint or doctor runs below its repository's top level with git on, each Rust feature refuses through the vcs kernel and writes nothing
