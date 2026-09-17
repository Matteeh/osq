# Tasks

- [x] 1. When an agent process times out, termination signals are managed by a shared helper
- [x] 2. When opencode configuration is loaded, default options are established, adapter is registered, README is updated
- [x] 3. When osq setup runs for opencode, the agent file is scaffolded idempotently, README auto caveat is documented
- [x] 4. When opencode adapter spawns a task, it runs opencode run with --auto, --format json, --dir, configured model, agent, attaching task.md, spec.md, named feature docs via --file
- [x] 5. When opencode stdout emits JSON events, tokens events are emitted with input, output, cached counts while unknown event types are ignored without error
- [x] 6. When watcher starts with opencode harness, preflight binary verification checks version before task dispatch
