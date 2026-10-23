# Tasks

- [x] 1. When a vcs kernel test starts a program that cannot start, it names it as /nonexistent/osq-missing-git, so no PATH search can turn NotFound into an I/O error
- [x] 2. When a TypeScript test starts a git or harness binary that cannot start, it names it under /nonexistent/, so no PATH search can turn ENOENT into EIO
