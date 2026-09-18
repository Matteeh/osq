# Tasks

- [x] 1. When osq.config.ts sets opencode options, defineConfig typechecks with full schema support
- [x] 2. When CLI commands execute, a shared logger writes prefixed lines to stderr controlled by verbosity flags
- [x] 3. When the runner records started or exited events, process lifecycle summaries are logged to stderr
- [x] 4. When a task runs, periodic heartbeats log elapsed time, event counts, token totals until process exit
- [x] 5. When the opencode adapter sees a tool_use event, a tool event is emitted to events.jsonl, logged at verbose level
- [x] 6. When the agy adapter runs with stream-json format, structured stream events are translated into harness events
- [x] 7. When an agent exits cleanly without a result file, the runner synthesizes results from stream text before verify
- [x] 8. When verification completes or dead markers are written, task outcomes are logged on a single line
