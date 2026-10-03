# Tasks

## 1. Commands take their inputs as arguments

- [x] 1. When a command needs its inputs, command-inputs.ts resolves them and tests capture every process write
- [x] 2. When osq status, queue, show, or the bare osq command runs, it takes the command inputs and writes exact text
- [x] 3. When osq report, query, or digest runs, it takes the command inputs and writes exact text
- [x] 4. When osq doctor or osq serve runs, it takes the command inputs and writes exact text
- [x] 5. When osq land, message, sync, graph, or spec runs, it takes the command inputs from command-inputs.ts
- [x] 6. When osq new, init, or setup runs, it takes the command inputs and prints through stdout
- [x] 7. When osq reject or retry runs, it takes the command inputs and prints through stdout
- [x] 8. When osq approve runs, it takes the command inputs and prints its digest, prompt lines, and warnings through them
- [x] 9. When osq inbox runs, its text, JSON, card session, follow loop, wait log, and sound print through the command inputs
- [x] 10. When osq plan runs, it takes the command inputs and prints the prompt, handoff, created change, and notice through them
- [x] 11. When osq lint, migrate, or watch runs, it takes the command inputs and logs through commandLogger
- [x] 12. When any file in src/cli other than command-inputs.ts prints directly, or a command lacks the command inputs, a test fails
