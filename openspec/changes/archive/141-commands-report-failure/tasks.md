# Tasks

## 1. Commands throw CommandError

- [x] 1. When osq lint finds an error, lintCommand throws a CommandError instead of setting the exit code
- [x] 2. When osq doctor has a failing check, doctorCommand throws a CommandError instead of setting the exit code
- [x] 3. When osq land or osq message refuses or stops, the command throws a CommandError with the line it printed
- [x] 4. When osq sync, osq graph, or osq migrate fails, the command throws a CommandError instead of setting the exit code
- [x] 5. When osq plan or osq serve fails, the command throws a CommandError and the CLI prints the same text as before
- [x] 6. When any file in src/cli other than run.ts sets process.exitCode or declares an exit option, a test fails
