---
queue_item: flaky-tests-fixed
queue_hash: sha256:e4ad463989909e285db2ccae0cba31cbf8fdd57d5ded419b2bd3a2aa447a584a
planner: null
date: 2026-10-07
---

### Goal

The three tests known to fail at random under full-suite load pass every time. Each one has killed a task whose code was correct and cost a whole executor rerun.

### Context

As of 2026-10-07 (Notion: "Why 153 task 2 died", "Why 155 task 2 died", "Making osq bulletproof" candidate 1):

- `tests/report-reads-once.test.ts` copies `fixture/report` with `fs.cp` in `copyFixture`, including `.osq/`. Other report tests open the fixture's read index in place, so `.osq/index.sqlite-shm` can vanish mid-copy (`ENOENT ... lstat 'fixture/report/.osq/index.sqlite-shm'`). This killed 147 task 1 and 154 task 2 at change verify.
- `tests/inbox.test.ts`, "reads the inbox through a core helper without advancing the cursor", reads the inbox in-process, then spawns the CLI, and asserts each running task's `elapsedSeconds` differs by at most 2. The spawn's own time counts toward the 2 s. Alone it takes about 0.9 s, and under the full suite 3–4 s. This killed 153 task 2 twice.
- `tests/watch-service-build.test.ts`, "clears the wait and spawns the pending task once src/ is no newer than dist/", removes its temp directory in `afterEach` while something the watcher cycle started still writes into it (`ENOTEMPTY ... rmdir '<tmp>/openspec'`). This killed 155 task 2. The landed workaround is `maxRetries: 10, retryDelay: 50` on that `fs.rm`, which hides the race.
- `osq query "select change, task, reason from dead_attempts"` lists every `change_verify_red` death; each one's dead marker under `.run/dead/` names the failing test.

### Requirements

- The report test no longer copies anything another test may be writing: it copies the fixture without `.osq/`, or every report test works on its own copy.
- The inbox test's assertion no longer depends on how long a CLI spawn takes.
- The watch-service-build teardown waits until nothing the test started still writes, then removes the directory without retries.
- Each fixed test still asserts what it asserted before.

### Non-goals

- A rerun-on-failure mechanism; that is `flaky-test-guard`.
- Fixing tests not named here. A further flaky test found on the way goes in `## Outside scope`.

### Notes for planning

- These are preexisting tests: each task that edits one sets `tests.modify: true` and scopes it.
- For the watch-service-build race, find what keeps writing after `runWatcherCycle` resolves before choosing the fix. If it is something osq itself leaves running after a cycle, that is a source bug and in scope.
- Look for the same patterns in other tests (in-place fixture indexes, timing tolerance around a spawn, teardown during a watcher cycle) and list them in the proposal; fix them only if cheap.
