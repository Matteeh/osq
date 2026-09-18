# osq OpenSpec schema

This is a fork of the built-in `spec-driven` schema. It keeps the same artifact
graph shape but drops the optional `design` artifact:

```
proposal -> specs -> tasks
```

The `apply` phase waits for `tasks` and tracks `tasks.md`.

## tasks/<n>.md is an osq-specific execution unit

`tasks/<n>.md` sits outside the schema artifact graph. OpenSpec only knows about
the `proposal.md`, `specs/**/*.md`, and `tasks.md` artifacts declared in
`schema.yaml`; `tasks/<n>.md` is an osq-specific execution unit, not an OpenSpec
artifact. Each `tasks/<n>.md` is the single unit of work handed to a coding
agent: it carries the task title, a `verify` command, `scope`, `entry`,
`skills`, and an acceptance checklist. Runtime completion is derived from
`.run/` markers and the watcher's independent verify run, while `tasks.md` is
only a write-only checkbox projection.
