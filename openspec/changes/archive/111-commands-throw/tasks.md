# Tasks

## 1. Foundation

- [x] 1. When status, show, or report fails, it throws a CommandError that runCli prints without ending the process

## 2. Change commands

- [x] 2. When new, done, reject, retry, queue, or the inbox fails, it throws a CommandError with the message it used to print

## 3. Verification commands

- [x] 3. When check or verified fails, it throws a CommandError, and a failed check leaves stderr empty

## 4. Approve

- [x] 4. When approve fails, it throws a CommandError carrying the next step, and no command under src/cli calls process.exit
