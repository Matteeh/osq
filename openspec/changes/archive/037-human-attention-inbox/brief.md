---
planner: gpt-5
date: 2026-09-21
---

# Human attention inbox

Make bare `osq` show only what needs a person, what is running, and what landed
since the previous look. Every row ends with the command that acts on it, and
`osq --json` returns the same three groups as the stable contract a later
`osq serve` can expose unchanged.

The last-look cursor is per project under `~/.osq/`, is advanced by every bare
invocation, and is safe to delete; without it the inbox shows the newest ten
recorded archives. `osq status` remains the complete queue table. A TUI, HTTP,
interactive prompts, watching, colour, and writes inside change folders are
out of scope.
