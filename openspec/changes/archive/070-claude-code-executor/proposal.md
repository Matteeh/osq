---
title: Claude Code executor harness
depends_on: ["069"]
verify: pnpm verify
features:
  reads:
    - watcher-and-harness
    - cli-foundation
---
## Goal

osq can run executor tasks with Claude Code in headless mode, with the same
guarantees as other harnesses and better containment than OpenCode or Agy.
Each task runs in a stripped-down Claude Code process that loads only six
built-in tools, no MCP servers, skills, plugins, hooks, user settings, saved
sessions, or auto-memory, so the agent does not pay tokens for harness features
a coding task never uses.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New offline tests under
`tests/claude/` drive a fake `claude` executable that replays a real captured
run. They prove the exact arguments and settings osq passes, including the
stripped tool surface, the `git` deny rule, `--bare` only with an API key, and
the sandbox settings. They also prove that the captured run translates into the
expected osq events, that token cost sums to the run's reported cost, that a
failing run becomes a crashed dead letter, and that doctor fails below the
minimum Claude Code version. No test needs a network, a TTY, credentials, or a
real model.

## Non-goals

- Planning through this adapter. Tool-native planning through
  `.claude/commands/osq-plan.md` already covers Claude Code; the adapter has no
  `spawnInteractive`.
- The Agent SDK as a dependency.
- Config keys to re-enable tools, MCP servers, skills, plugins, hooks, or user
  settings.
- Replacing Claude Code's own system prompt. That would cut more tokens but
  risks the agent's quality; the executor prompt stays the shared one.
- Translating Claude Code's API retry records into `harness_retry` events. Their
  shape is unverified.
- Recording containment for the other harnesses. The catalog field is optional
  and only `claude` sets it now.

## Surface

- Added: `claude` (harness)
- Added: `claude.bin`, `claude.model`, `claude.sandbox` (config keys)
- Added: `started.harnessAuth`, `api_key` or `login` (event field)
- Added: `containment` on harness catalog entries (optional catalog field)
- Added: `harness-version` and `harness-containment` doctor checks for `claude`

## Background

Facts this change relies on, checked on this machine against Claude Code
2.1.278 with a logged-in account and no `ANTHROPIC_API_KEY`, and against
https://code.claude.com/docs/en/sandboxing:

- `claude -p --output-format stream-json --verbose -- "<prompt>"` runs once and
  writes JSONL to stdout. The allow and deny flags are variadic, so the prompt
  goes after `--`; that was verified. Stdin stays closed, as
  `spawnWithTimeout` already does.
- The stream starts with `system`/`init`, which lists the loaded `tools`,
  `mcp_servers`, `skills`, `plugins`, `permissionMode`, and `apiKeySource`.
  Then come `assistant` and `user` records and some `system` records
  (`thinking_tokens`, `permission_denied`), and it ends with one `result`
  record. `assistant` and `user` records carry a `timestamp`.
- An `assistant` record carries `message.content` blocks of type `text`,
  `thinking`, or `tool_use` (`id`, `name`, `input`). A `user` record carries
  `tool_result` blocks (`tool_use_id`, `content`, `is_error` only when true).
  Each content block arrives in its own `assistant` record repeating the same
  message usage, so per-message usage must not be summed.
- The `result` record carries `subtype` (`success` or an error subtype),
  `is_error`, `result` (final text), `total_cost_usd`, `usage`, and
  `modelUsage`, keyed by model, with `inputTokens` (uncached),
  `cacheReadInputTokens`, `cacheCreationInputTokens`, `outputTokens`,
  `thinkingTokens`, and `costUSD`. The `costUSD` values sum to
  `total_cost_usd`; they include Claude Code's own small side calls, which
  `usage` does not.
- Tool inputs: `Bash` has `command`; `Read`, `Edit`, and `Write` have
  absolute `file_path`; `Glob` and `Grep` have `pattern`.

Measured cost of the harness surface on a one-line prompt with Haiku:

| Run | Tools | MCP servers | Skills | Input tokens per request |
|---|---|---|---|---|
| default `claude -p` | 36 | 5 | 28 | about 29,500 |
| stripped flags below | 6 | 0 | 0 | about 13,300 |

The stripped flags and what each removes:

- `--tools Bash,Read,Edit,Write,Glob,Grep`: every other built-in tool,
  including subagents, web fetch and search, todo, cron, notebook, and tool
  search.
- `--strict-mcp-config` with no `--mcp-config`: every MCP server, including
  claude.ai connectors.
- `--disable-slash-commands`: every skill.
- `--setting-sources ""`: user, project, and local settings files, so no
  hooks, plugins, output styles, or permission rules from the user or the
  consumer's `.claude/`. A login still works.
- `--no-session-persistence`: no saved session to resume.
- `--settings` with `"autoMemoryEnabled": false`: no auto-memory directory.
- `--bare`, only when `ANTHROPIC_API_KEY` is non-empty: also skips LSP, plugin
  sync, attribution, keychain reads, background prefetches, and `CLAUDE.md`
  discovery. `--bare` never reads a login, which is why it depends on the key.
  The prompt already names `AGENTS.md`.

Permission baseline: `--permission-mode dontAsk`, which denies anything not
allowed instead of prompting, with the allow rules `Bash`, `Read`,
`Edit(./**)`, `Write(./**)`, `Glob`, `Grep` and the deny rule `Bash(git:*)`.
Verified: `git status`, `echo a && git status`, and `cd .. && git log -1` were
all denied, a `Write` outside the project root was denied, and one inside it
succeeded. `Bash` itself stays unconfined, so a shell command could still write
outside the project or reach the network. This baseline was chosen over
sandboxed Bash with auto-approval because it works on every platform without
extra packages and can never stall on a prompt. The sandbox needs bubblewrap
and socat on Linux and WSL2, which this machine lacks.

`claude.sandbox: true` adds to `--settings`:
`"sandbox": {"enabled": true, "failIfUnavailable": true, "autoAllowBashIfSandboxed": true, "allowUnsandboxedCommands": false, "network": {"allowedDomains": [], "strictAllowlist": true}}`.
Sandboxed Bash can then write only to the project and the session temp
directory and reach no host. `strictAllowlist` makes unknown hosts fail
instead of prompting, and needs Claude Code 2.1.219 or later. With
`failIfUnavailable` a missing sandbox stops Claude Code at startup. Verified
here: it exits 1 and prints `sandbox required but unavailable`, naming the
missing packages. With `allowUnsandboxedCommands: false`, a failing command
cannot be retried outside the sandbox.

The minimum Claude Code version is 2.1.278, the version every flag above was
verified on. It is one constant in `src/core/foundation/config-claude.ts`.
Claude Code updates itself, so bumping or lowering it is a one-line change.
Doctor and preflight fail below it.

The golden fixture is a real run captured during planning, with the exact
flags above and Haiku, on a throwaway repository. It covers `Read`, `Write`,
`Edit`, two `Bash` calls (one of them a denied `git status`), `Grep`, `Glob`,
text, and the final `result`. The project path is replaced with `/project`;
file contents, tool output, thinking, and text are replaced with placeholders;
and the rate-limit record keeps only its status. It lives in this change folder
as `fixtures/claude-run.jsonl`, and task 1 copies it to
`tests/fixtures/claude/run.jsonl` unchanged.

The existing `src/harness/claude/` holds the planning usage reader
(`claude-usage.ts`, `claude-turns.ts`), which this change does not touch. The
executor files sit beside them with a `claude-exec` prefix. The planning
report already labels Claude Code planning sessions `claude`, which matches the
new harness name.

File budgets: `src/core/foundation/config.ts` is 249 lines and
`harness-catalog.ts` 249, against the 250-line cap. A rough version of the
catalog entry and config field measured 251 and 258 lines, so task 2 moves code
out of both first. `src/watcher/spawn.ts` is 192 lines against the strict
under-200 budget. The same rough version broke no test other than the two line
budgets, so no existing test changes.

## Contract

### Requirement: Claude task execution
The `claude` adapter SHALL run each task as a fresh `claude -p` process in the
project root with stdin closed, the stripped tool surface, the `dontAsk`
permission baseline, and the shared executor prompt after `--`.

#### Scenario: Stripped run
- **WHEN** a task spawns with harness `claude`
- **THEN** Claude Code receives the fixed flags, loads six tools and no MCP servers, and gets the prompt `buildExecutorPrompt` returns

### Requirement: Claude stream translation
The captured stream SHALL translate into `tool`, `text`, `file_changed`, and
per-model `tokens` events whose cost sums to the run's `total_cost_usd`.

#### Scenario: Captured run
- **WHEN** `tests/fixtures/claude/run.jsonl` is replayed
- **THEN** it yields one `tool` event per `tool_use` block and `tokens` events summing to its `total_cost_usd`

## Human steps

- Optional: to use `claude.sandbox: true` on Linux or WSL2, install bubblewrap
  and socat (`apt install bubblewrap socat`).
- Review the proposal, delta specs, and task bodies, then run `osq approve 070`
  yourself.

## Delta

- `specs/watcher-and-harness/spec.md` adds `Claude task execution`, `Claude
  tool surface`, `Claude permissions and containment`, `Claude stream
  translation`, `Claude token accounting`, `Claude failure and result handling`, and `Claude execution
  attribution`.
- `specs/cli-foundation/spec.md` adds `Claude configuration and resolution`,
  `Claude diagnostics`, and `Claude consumer guidance`.

No file is shared between tasks. Task 1 writes the stream module that task 2's
adapter imports. Task 3 documents what task 2 built.
