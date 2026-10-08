# Tasks

## 1. osq runs the formatter

- [x] 1. When osq reads gates.formatCommand, it keeps a command with {files}, rejects any other value, osq init shows it, and osq sets its own
- [x] 2. When an agent exits having changed scoped files, the watcher runs the format command on them before verify and records a format_ran event
