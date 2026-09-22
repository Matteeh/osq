---
reason: verify_red
command: "pnpm verify"
exit_code: 1
---
Archive-time change-level verification failed.
> @matteeh/osq@0.1.0 verify /home/mathias/projects/osq
> pnpm typecheck:cli && pnpm typecheck:ui && pnpm build && pnpm test && pnpm lint


> @matteeh/osq@0.1.0 typecheck:cli /home/mathias/projects/osq
> tsc --noEmit -p packages/ui/tsconfig.cli.json


> @matteeh/osq@0.1.0 typecheck:ui /home/mathias/projects/osq
> pnpm --filter @osq/ui typecheck


> @osq/ui@0.0.0 typecheck /home/mathias/projects/osq/packages/ui
> tsc --noEmit -p tsconfig.json


> @matteeh/osq@0.1.0 build /home/mathias/projects/osq
> pnpm build:ui && pnpm stage:ui && pnpm build:cli


> @matteeh/osq@0.1.0 build:ui /home/mathias/projects/osq
> pnpm --filter @osq/ui build


> @osq/ui@0.0.0 build /home/mathias/projects/osq/packages/ui
> vite build

vite v8.3.0 building client environment for production...
transforming...
✓ 53 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.45 kB │ gzip:  0.28 kB
dist/assets/index-j6XEMGpc.css    1.41 kB │ gzip:  0.66 kB
dist/assets/index-9YTV6Loy.js   267.20 kB │ gzip: 81.79 kB

✓ built in 118ms

> @matteeh/osq@0.1.0 stage:ui /home/mathias/projects/osq
> node scripts/stage-ui.mjs

Staged UI build into ui/dist

> @matteeh/osq@0.1.0 build:cli /home/mathias/projects/osq
> tsc -p tsconfig.build.json


> @matteeh/osq@0.1.0 test /home/mathias/projects/osq
> node --import tsx --test 'tests/**/*.test.ts' && TSX_TSCONFIG_PATH=packages/ui/tsconfig.runtime.json node --import tsx --test 'tests/**/*.test.tsx'

▶ ADR 004: Pinned OpenSpec Validator
  ✔ records the accepted decision for the pinned validator (5.431858ms)
  ✔ defines the exact dependency pin, binary path, and peer range (2.143521ms)
  ✔ documents validation execution semantics (1.293721ms)
  ✔ defines doctor diagnostic verification and drift reporting semantics (1.818814ms)
  ✔ is indexed from the decisions README (1.386025ms)
✔ ADR 004: Pinned OpenSpec Validator (13.460584ms)
▶ Agy stream-json event translation
  ✔ buildAgyArgs adds --output-format stream-json to the arguments (69.742978ms)
  ✔ extracts token usage from step_update usage fields (24.477604ms)
  ✔ defaults missing usage fields and derives total from input plus output (13.04512ms)
  ✔ appends a tokens event for a step_update with usage (11.047426ms)
  ✔ extracts tool name and command/path summaries from step_update tool steps (7.819002ms)
  ✔ appends a tool event and logs it at verbose level from the shared handler (32.229977ms)
  ✔ persists the tool event while suppressing the verbose log at normal level (10.383745ms)
  ✔ parses fixture/agy-events.jsonl lines and emits a single tokens event (26.865828ms)
  ✔ falls back gracefully when stdout is plain text without valid JSON (12.926963ms)
[agy] Unknown event type: init
  ✔ translates stream events through the adapter spawn path with the shared logger (53.729301ms)
✔ Agy stream-json event translation (265.011875ms)
▶ osq approve
  ✔ findSpecFolder resolves spec folder by ID, padded number, or prefix (25.771042ms)
  ✔ approveSpec lints, hashes, and writes .run/approved for valid spec (168.281046ms)
  ✔ approveSpec rejects spec failing lint and does not write approved marker (101.730214ms)
  ✔ re-approves an existing spec after modifications (194.020618ms)
✔ osq approve (491.419272ms)
▶ archive-time verification
  ✔ extracts a proposal verify command into SpecData (42.045289ms)
  ✖ archives a clean change after re-running every task and change verify (505.974898ms)
  ✔ refuses task 2 before spawning when an earlier done scope was modified (286.981825ms)
  ✖ blocks archiving when the change-level verify fails (218.283611ms)
  ✖ halts archival and records final-task drift before the archive verifier runs (528.272388ms)
  ✔ records every stale done task in one archive audit without stopping at the first (453.483195ms)
  ✔ repeatedly halts without adding verification, marker, or event duplicates (405.896925ms)
  ✔ removes the transient plan-prompt.md from a successful archive (246.266066ms)
  ✖ leaves the transient plan-prompt.md in place when archive verification fails (214.403865ms)
✖ archive-time verification (2904.367029ms)
▶ Archiver and Delta Application
  ✔ applyOpenSpecDeltas creates and then updates capability specs from delta specs (45.629293ms)
  ✔ archiveSpecFolder moves spec folder whole to archive preserving .run markers (32.53446ms)
  ✔ archiveSpecFolder preserves full .run history including results and event logs (13.029494ms)
  ✔ archiveSpecFolder preserves history by disambiguating if destination already exists (22.621637ms)
  ✔ archiveSpecFolder resolves the destination through a custom openspecRoot (26.689514ms)
  ✔ archiveSpecFolder applies delta specs inside openspec/specs and moves to the OpenSpec archive path (16.927138ms)
  ✔ archiveSpecFolder ensures every archived tasks.md is fully ticked (16.12365ms)
  ✔ archiveSpecFolder ticks tasks.md under the canonical archive layout (20.073471ms)
  ✔ archiveSpecFolder appends exactly one archived event to the archived change stream after relocation (12.829079ms)
  ✔ archiveSpecFolder emits no archived event when relocation fails (10.859731ms)
  ✔ checkAndArchiveSpec emits no archived event when change-level verification fails (88.596361ms)
  ✔ checkAndArchiveSpec records change-level verify_ran before the archived event (113.779833ms)
  ✔ checkAndArchiveSpec applies deltas once then archives only when all tasks are marked done (89.889227ms)
✔ Archiver and Delta Application (511.933259ms)
▶ built bin execution
  ✔ preserves the executable shebang after compilation (8.757503ms)
  ✔ generates valid programmatic type declarations (1.762271ms)
  ✔ resolves the package version from package.json at runtime (3.749898ms)
  ✔ prints the package.json version when invoked directly from an isolated directory (221.791396ms)
  ✔ prints help with command listings from an isolated directory (155.951431ms)
✔ built bin execution (5752.81389ms)
▶ changelog and release documentation
  ✔ ships a changelog with a 0.1.0 release entry (9.259532ms)
  ✔ summarises the changes from specs 001 through 012 (2.074752ms)
  ✔ documents the release procedure in the README (0.303136ms)
  ✔ lists the exact release commands (0.147528ms)
✔ changelog and release documentation (12.913447ms)
error: option '--reason <text>' argument '   ' is invalid. a non-empty rejection reason is required
error: option '--reason <text>' argument '' is invalid. a non-empty rejection reason is required
error: required option '--reason <text>' not specified
▶ osq CLI
  ✔ configures program metadata and registered commands (3.270968ms)
  ✔ configures new command with required argument <name> (0.582403ms)
  ✔ configures approve command with variadic argument <ids...> (1.080078ms)
  ✔ configures watch command with once option (0.467645ms)
  ✔ configures reject command with required id argument and required reason option (0.446875ms)
  ✔ rejects an empty or whitespace-only reason at the CLI boundary (9.006479ms)
  ✔ requires the reject reason option to be supplied (0.638153ms)
  ✔ gives the root command an action and a --json inbox option (0.480914ms)
  ✔ keeps report --json scoped to the report subcommand (0.605993ms)
✔ osq CLI (18.376133ms)
▶ codex consumer guidance: scaffolded .env.example
  ✔ scaffolds commented Codex selection/binary/model guidance under the agy default (24.715222ms)
  ✔ contains no credentials or secret values (9.593132ms)
  ✔ mirrors the repository .env.example exactly (10.393133ms)
  ✔ preserves a consumer-edited example across repeated scaffolding (25.389961ms)
✔ codex consumer guidance: scaffolded .env.example (71.511543ms)
▶ codex consumer guidance: README
  ✔ lists codex and documents executor and independent planner examples with precedence (1.29623ms)
  ✔ covers installation, authentication, setup, diagnostics, permissions, and scope limits (1.299056ms)
  ✔ covers live smoke, fresh sessions, watcher verification, results, and observed costs (0.89283ms)
✔ codex consumer guidance: README (3.856951ms)
▶ Codex adapter registration, setup, and diagnostics
  ✔ registers the codex harness with a no-op setup that creates no files (47.525466ms)
Harness 'codex' setup completed successfully.
Harness 'codex' setup completed successfully.
  ✔ setupCommand preserves consumer Codex files, foreign blocks, and mixed-harness setup (199.262408ms)
  ✔ doctor probes the same configured Codex binary and reports failures (70.351096ms)
  ✔ buildManifest records the Codex model or default sentinel and configured effort (27.253866ms)
codex-cli 0.0.0-fake
  ✔ preflightCodex resolves CODEX_PATH and returns the version (102.618956ms)
✔ Codex adapter registration, setup, and diagnostics (449.310589ms)
▶ Codex noninteractive execution
  ✔ builds literal argv with sandboxing, approval, model, and effort controls (24.729331ms)
  ✔ names full task context including delta, living specs, prior result, and one-attempt rules (21.512719ms)
  ✔ spawns a fresh fake Codex with correct cwd, env, literal prompt, and translated events (73.244984ms)
  ✔ preserves failure, timeout, and terminal turn.failed diagnostics (1127.589411ms)
✔ Codex noninteractive execution (1248.031334ms)
▶ Codex configuration
  ✔ exports CodexConfig and resolution helpers from the public entry point (12.471361ms)
  ✔ centrally defaults preflight and kill-grace timeouts while preserving old timeout literals (2.295814ms)
  ✔ validateCodex settings via defineConfig and preserve native defaults (2.389413ms)
  ✔ resolves the Codex binary as codex.bin, then CODEX_PATH, then codex (1.7757ms)
  ✔ resolves the Codex model as codex.model, then OSQ_MODEL only for a Codex executor (1.577012ms)
  ✔ resolves effort and harness attribution with a default sentinel (1.160147ms)
  ✔ accepts a Codex planner with a model and rejects planner.agent (1.395584ms)
  ✔ loadConfig merges codex settings and applies OSQ_MODEL only to a Codex executor (221.877877ms)
✔ Codex configuration (246.627149ms)
▶ Codex planner selection
  ✔ uses the explicit planner model and never inherits the executor model (1.828954ms)
  ✔ falls back to the Codex executor and uses the default sentinel with no flag (0.229928ms)
✔ Codex planner selection (3.390826ms)
▶ Codex interactive adapter
  ✔ builds interactive argv with on-request approvals and no exec/JSON/effort flags (0.526164ms)
  ✔ rejects an unsupported agent and propagates spawn failures (294.851936ms)
✔ Codex interactive adapter (295.898045ms)
▶ planCommand with the Codex harness
  ✔ launches the fake interactive executable with inherited stdio and native model defaults (729.305427ms)
  ✔ uses the explicit planner model consistently in brief metadata and argv (622.743017ms)
  ✔ uses an explicit Codex planner without leaking the executor harness model (620.091792ms)
  ✔ propagates nonzero and signal exits from the interactive process (1033.762198ms)
  ✔ reuses an existing change and emits the print prompt without launching Codex (911.652605ms)
✔ planCommand with the Codex harness (3918.46159ms)
▶ Codex stream observations
  ✔ translates completed observations in order without duplicating lifecycle stages (13.105903ms)
  ✔ omits absent optional usage counters and never writes cost (2.6446ms)
  ✔ tolerates malformed and unknown records and flushes an unterminated final record (2.864928ms)
  ✔ relativizes absolute file-change paths to the project root (2.140566ms)
  ✔ treats turn.failed as terminal but a recoverable error followed by success as not terminal (2.103877ms)
✔ Codex stream observations (24.383237ms)
▶ Codex watcher preflight
  ✔ fails before task spawn on a missing, nonzero, or timed-out probe (208.339216ms)
  ✔ probes the configured binary and dispatches an approved task after a successful probe (367.961926ms)
✔ Codex watcher preflight (577.835215ms)
▶ Codex runner outcomes
  ✔ preserves a supplied result and reaches done only after watcher verification (205.966295ms)
  ✔ synthesizes a missing result from the last completed assistant text (223.691529ms)
  ✔ fails with no_result when neither a result file nor final text exists (139.296602ms)
  ✔ fails with verify_red when independent verification fails (196.736717ms)
  ✔ records crashed for a terminal turn.failed even when the process exits zero (128.898043ms)
{
  "completionRate": 100,
  "coverage": {
    "byChange": {
      "001-codex-fixture-feature": {
        "withEvents": [
          "1"
        ],
        "withoutEvents": []
      }
    },
    "withEvents": 1,
    "withoutEvents": 0
  },
  "cycle": {
    "byChange": [],
    "phases": {
      "approvalToFirstTask": {
        "averageSeconds": 0,
        "coveredChanges": 0,
        "totalChanges": 0,
        "totalSeconds": 0
      },
      "briefToApproval": {
        "averageSeconds": 0,
        "coveredChanges": 0,
        "totalChanges": 0,
        "totalSeconds": 0
      },
      "firstTaskToArchive": {
        "averageSeconds": 0,
        "coveredChanges": 0,
        "totalChanges": 0,
        "totalSeconds": 0
      },
      "total": {
        "averageSeconds": 0,
        "coveredChanges": 0,
        "totalChanges": 0,
        "totalSeconds": 0
      }
    }
  },
  "durations": {
    "avgMs": 24,
    "avgSeconds": 0,
    "formattedAvg": "0s",
    "formattedTotal": "0s",
    "totalMs": 24,
    "totalSeconds": 0
  },
  "fileChanges": {
    "totalChanges": 2,
    "uniqueCount": 2,
    "uniqueFiles": [
      "src/a.ts",
      "src/b.ts"
    ]
  },
  "history": {
    "attempts": {
      "byTask": {
        "001-codex-fixture-feature/1": 1
      },
      "multipleAttempts": [],
      "total": 1
    },
    "cost": {
      "coverage": {
        "reportedAttempts": 0,
        "totalAttempts": 1
      },
      "formattedTotal": "$0.0000",
      "perSpec": {},
      "provenance": "harness-reported",
      "total": 0
    },
    "deadByReason": {},
    "rejections": {
      "byPlannerModel": {},
      "total": 0
    },
    "scopeRegressions": {
      "detected": 0,
      "recertifiedByHuman": 0,
      "requeuedForAgent": 0,
      "verificationFailedAtDetection": 0,
      "verificationPassedAtDetection": 0
    },
    "sizes": {
      "byAcceptanceLines": [
        {
          "bucket": "1-2",
          "firstAttemptPassRate": 1,
          "meanAttempts": 1,
          "medianDurationSeconds": 0.08,
          "tasks": 1
        },
        {
          "bucket": "3-4",
          "firstAttemptPassRate": 0,
          "meanAttempts": 0,
          "medianDurationSeconds": null,
          "tasks": 0
        },
        {
          "bucket": "5-8",
          "firstAttemptPassRate": 0,
          "meanAttempts": 0,
          "medianDurationSeconds": null,
          "tasks": 0
        },
        {
          "bucket": "over-8",
          "firstAttemptPassRate": 0,
          "meanAttempts": 0,
          "medianDurationSeconds": null,
          "tasks": 0
        }
      ],
      "scopeFileSeries": [
        {
          "byScopeFiles": [
            {
              "bucket": "1-2",
              "firstAttemptPassRate": 0,
              "meanAttempts": 0,
              "medianDurationSeconds": null,
              "tasks": 0
            },
            {
              "bucket": "3-4",
              "firstAttemptPassRate": 0,
              "meanAttempts": 0,
              "medianDurationSeconds": null,
              "tasks": 0
            },
            {
              "bucket": "5-8",
              "firstAttemptPassRate": 0,
              "meanAttempts": 0,
              "medianDurationSeconds": null,
              "tasks": 0
            },
            {
              "bucket": "over-8",
              "firstAttemptPassRate": 0,
              "meanAttempts": 0,
              "medianDurationSeconds": null,
              "tasks": 0
            }
          ],
          "largestFirstAttemptPass": null,
          "resolver": "legacy",
          "startsAtChange": null
        },
        {
          "byScopeFiles": [
            {
              "bucket": "1-2",
              "firstAttemptPassRate": 1,
              "meanAttempts": 1,
              "medianDurationSeconds": 0.08,
              "tasks": 1
            },
            {
              "bucket": "3-4",
              "firstAttemptPassRate": 0,
              "meanAttempts": 0,
              "medianDurationSeconds": null,
              "tasks": 0
            },
            {
              "bucket": "5-8",
              "firstAttemptPassRate": 0,
              "meanAttempts": 0,
              "medianDurationSeconds": null,
              "tasks": 0
            },
            {
              "bucket": "over-8",
              "firstAttemptPassRate": 0,
              "meanAttempts": 0,
              "medianDurationSeconds": null,
              "tasks": 0
            }
          ],
          "largestFirstAttemptPass": {
            "acceptanceLines": 1,
            "change": "001-codex-fixture-feature",
            "scopeFiles": 0,
            "task": "1",
            "title": "When a Codex task runs"
          },
          "resolver": "resolver-2",
          "startsAtChange": "001-codex-fixture-feature"
        }
      ]
    },
    "unexplainedReruns": {
      "byTask": {},
      "total": 0
    },
    "verifyRuns": {
      "byTask": {
        "001-codex-fixture-feature/1": [
          0
        ]
      },
      "missingExitCode": 0,
      "total": 1
    }
  },
  "now": {
    "dead": 0,
    "done": 1,
    "manual": 0,
    "pending": 0,
    "regressed": 0,
    "running": 0,
    "total": 1,
    "verified": 1
  },
  "planning": {
    "changesWithPlanningRecords": 0,
    "cost": {
      "formattedTotal": "$0.0000",
      "provenance": "harness-reported",
      "total": 0
    },
    "coverage": {
      "reportedSessions": 0,
      "totalSessions": 0
    },
    "sessions": 0,
    "tokens": {
      "cached": 0,
      "input": 0,
      "output": 0,
      "reasoning": 0
    },
    "wallSeconds": 0,
    "wallSecondsByChange": {}
  },
  "queue": {
    "configured": false,
    "failures": [],
    "items": [],
    "landed": 0,
    "planning": {
      "cost": 0,
      "costCoverageComplete": false,
      "sessions": 0
    },
    "rejections": [],
    "total": 0
  },
  "specs": {
    "active": 1,
    "archived": 0,
    "total": 1
  },
  "tokens": {
    "cacheSharePercent": 28.6,
    "cached_input": 40,
    "input": 100,
    "output": 25,
    "reasoning": 7,
    "total": 125
  }
}
  ✔ reportCommand JSON consumes normalized usage and file events without double counting (180.398987ms)
✔ Codex runner outcomes (1076.17166ms)
▶ catalog-driven planner validation
  ✔ accepts every catalogued harness with any supported casing and normalizes the name (2.343693ms)
  ✔ retains the required non-empty planner model (0.444044ms)
  ✔ rejects uncatalogued harnesses naming the catalog entries (0.270237ms)
  ✔ rejects optional settings unsupported by the selected harness, naming harness and setting (0.422285ms)
  ✔ rejects malformed optional settings before harness-specific checks (0.159348ms)
✔ catalog-driven planner validation (4.900495ms)
▶ catalog-driven planner selection
  ✔ uses explicit planner values and the supported default agent (0.775571ms)
  ✔ never leaks executor effort or cross-harness defaults into an explicit planner (0.356925ms)
  ✔ falls back to the selected executor catalog entry with native attribution (0.563243ms)
  ✔ uses planner values for a mixed harness selection without executor leakage (0.359546ms)
✔ catalog-driven planner selection (2.5771ms)
▶ planner configuration integration and exports
  ✔ keeps defineConfig planner validation wired to the catalog (0.759271ms)
  ✔ exposes catalog planner helpers through the public entry point (0.139558ms)
✔ planner configuration integration and exports (1.059808ms)
▶ planner configuration and manifest attribution
  ✔ defineConfig accepts valid planner configurations (9.192599ms)
  ✔ defineConfig rejects invalid planner configurations (1.970068ms)
  ✔ loadConfig loads planner block from config file (211.609094ms)
  ✔ never populates manifest.planner from configuration alone (31.431348ms)
✔ planner configuration and manifest attribution (256.044728ms)
▶ queue configuration
  ✔ accepts a complete finite non-negative queue block (11.281253ms)
  ✔ leaves queue absent and invents no default ceilings (1.492623ms)
  ✔ rejects a partial queue block because both ceilings are required together (2.508602ms)
  ✔ rejects string, negative, NaN, and infinite values clearly (11.282686ms)
  ✔ rejects a non-object queue block (1.365602ms)
  ✔ loads a queue block from osq.config.ts (199.922266ms)
  ✔ exposes QueueConfig through the public package surface (4.56335ms)
✔ queue configuration (234.436189ms)
▶ OsqConfig
  ✔ provides specification-compliant default limits, paths, and timeouts (8.796212ms)
  ✔ allows overriding specific limits while retaining default paths and timeouts (1.327955ms)
  ✔ loadConfig returns DEFAULT_CONFIG if no config file exists (4.464314ms)
  ✔ loadConfig reads .env and loads osq.config.ts (207.056187ms)
  ✔ loadConfig reads a serve block from osq.config.ts (13.627675ms)
✔ OsqConfig (236.962574ms)
▶ serve configuration
  ✔ defaults the dashboard port and debounce interval (0.352526ms)
  ✔ merges a partial serve block over the defaults (0.204358ms)
  ✔ rejects non-finite, fractional, negative, and out-of-range ports (0.614383ms)
  ✔ rejects non-finite and negative debounce values (0.348976ms)
✔ serve configuration (2.110876ms)
▶ gates configuration
  ✔ defaults changeVerifyAfterTask to true (3.489961ms)
  ✔ preserves the incremental verification opt-out while keeping unrelated defaults (0.866156ms)
  ✔ rejects a non-boolean changeVerifyAfterTask (0.741082ms)
  ✔ rejects a non-object gates block (1.100458ms)
  ✔ loadConfig reads a gates block from osq.config.ts (11.331934ms)
✔ gates configuration (17.998115ms)
▶ Layout cut-over
  ✔ switches DEFAULT_CONFIG paths to the openspec layout (33.520128ms)
  ✔ monitors openspec/changes for approved change folders (285.656016ms)
  ✔ does not pick up change folders left in the legacy specs/ directory (32.712841ms)
  ✔ prints the Human steps outcome after the change completes (304.889399ms)
  ✔ never moves the legacy layout itself while cutting the runtime over (278.751952ms)
  ✔ removes obsolete legacy path identifiers from the runtime units (16.664443ms)
  ✔ extracts a Human steps section from a change document (13.3412ms)
✔ Layout cut-over (967.582506ms)
▶ Failure marker retention across approval and retry
  ✔ leaves active dead and regressed markers untouched when approval re-seals (295.395946ms)
  ✔ retains dead/1.1.md alongside done/1 after an explicit retry and successful rerun (328.780885ms)
  ✔ preserves an active dead marker when a task succeeds without re-approval (192.236637ms)
✔ Failure marker retention across approval and retry (818.010901ms)
▶ Delta merge engine
  ✔ parseDelta extracts ADDED, MODIFIED, REMOVED, and RENAMED blocks (2.964066ms)
  ✔ parseDelta returns empty operations for a delta with no requirement sections (0.433945ms)
  ✔ requirement parser extracts requirement names and scenario WHEN/THEN bullets (0.449015ms)
  ✔ merges operations in strict RENAMED -> REMOVED -> MODIFIED -> ADDED sequence (0.740481ms)
  ✔ applies RENAMED before REMOVED and MODIFIED (0.608073ms)
  ✔ throws a deterministic error when a MODIFIED target is missing (0.684692ms)
  ✔ throws a deterministic error when a REMOVED target is missing (0.744401ms)
  ✔ creates a new capability spec from the delta Purpose when no base exists (0.427876ms)
  ✔ golden-file test asserts byte-for-byte exact rebuilding across all four operations (0.563353ms)
✔ Delta merge engine (9.509473ms)
▶ Archiver OpenSpec delta application
  ✔ applyOpenSpecDeltas creates and then updates capability specs from delta specs (33.708332ms)
  ✔ applyOpenSpecDeltas ignores change folders without OpenSpec delta specs (4.176007ms)
✔ Archiver OpenSpec delta application (38.529052ms)
▶ Baseline living capability code ownership
  ✔ parses all five capability delta specs without syntax errors (22.500402ms)
  ✔ cleanly appends the Code ownership requirement to a base spec with existing requirements (0.326196ms)
  ✔ deterministically merges each delta into a valid spec containing the ownership globs (21.402591ms)
  ✔ applies all five deltas into a living OpenSpec root declaring Code ownership (20.188028ms)
✔ Baseline living capability code ownership (64.930372ms)
▶ runDoctorChecks
  ✔ passes all checks for a healthy repository (1530.668606ms)
  ✔ passes the validator check with the pinned version (19.907204ms)
  ✔ fails the validator check on version drift (9.042335ms)
  ✔ fails the validator check when the binary is unavailable (11.320382ms)
  ✔ fails the config check when config properties are invalid (556.433231ms)
  ✔ fails the config check when the loader throws (555.921892ms)
  ✔ fails the config check when openspecRoot is not a string (614.313396ms)
  ✔ fails the config check when the resolved gates value is missing or non-boolean (1214.094907ms)
  ✔ fails the harness check when the configured binary is unavailable (425.657662ms)
  ✔ fails the managed-blocks check when PLANNER.md lacks a managed block (392.342987ms)
  ✔ fails the managed-blocks check on a partial marker pair (383.64349ms)
  ✔ fails the managed-blocks check when AGENTS.md has no managed block (395.210316ms)
  ✔ fails the managed-blocks check when the Claude command is missing (412.681954ms)
  ✔ fails the managed-blocks check when the Claude command is stale (393.100876ms)
  ✔ fails the managed-blocks check on duplicate managed blocks (344.369705ms)
  ✔ fails the managed-blocks check on reversed markers (382.127318ms)
  ✔ scaffoldProject repairs drifted managed blocks without disturbing foreign content (30.582602ms)
  ✔ fails the locks check when an orphaned lock exists (345.904775ms)
  ✔ passes the locks check when the recorded pid is alive (319.838995ms)
  ✔ fails the archives check when an archived change is corrupt (344.344222ms)
  ✔ passes the archives check when archived changes are complete (395.364294ms)
  ✔ ignores legacy specs/archive contents when checking canonical archives (430.089074ms)
  ✔ fails the done-markers check when a marker lacks valid frontmatter (13.039436ms)
  ✔ passes the done-markers check for automated and manual markers (45.568018ms)
  ✔ fails the done-markers check when a manual marker has no reason (24.515925ms)
  ✔ ignores archived done markers when checking active changes (21.713656ms)
✔ runDoctorChecks (9615.453807ms)
▶ doctorCommand
  ✔ prints one line per check and exits non-zero only on failure (76.88288ms)
✔ doctorCommand (77.196236ms)
▶ active repository checkout
  ✔ passes all checks on the osq repository itself (872.534696ms)
✔ active repository checkout (872.755623ms)
▶ osq done command registration
  ✔ registers done <id> <task> with a required --manual option (2.730575ms)
✔ osq done command registration (3.594405ms)
Marked task 3 of 001-manual-done done (manual)
  Reason: flaky network in CI
▶ manual task completion
  ✔ writes manual frontmatter, appends a done_manual event, and ticks the checkbox (38.992201ms)
  ✔ refuses to mark a task that does not exist (16.232727ms)
  ✔ requires a non-empty manual reason (17.152943ms)
✔ manual task completion (73.049293ms)
▶ report manual vs verified accounting
  ▶ active specs
    ✔ counts verified and manual completions separately (48.380577ms)
  ✔ active specs (48.709752ms)
  ▶ archived specs
    ✔ counts manual done markers as manual (22.085283ms)
  ✔ archived specs (22.713606ms)
✔ report manual vs verified accounting (71.858903ms)
▶ Golden event streams
  ✔ normalizes timestamps, pids, versions, and project paths to stable tokens (44.826041ms)
  ✔ masks verify_ran duration to zero while preserving exit code and command (11.699074ms)
  ✔ masks measures scope hashes to stable tokens (12.565448ms)
  ✔ matches the checked-in golden events for a verified task (116.401405ms)
  ✔ matches the checked-in golden events for a dead task (70.499344ms)
✔ Golden event streams (257.8575ms)
▶ generic harness consumer architecture
  ✔ detects synthetic harness branches and ignores comments and prose (2.197415ms)
  ✔ covers every generic consumer and derives forbidden names from the catalog (5.955523ms)
  ✔ contains no harness-name comparisons or cross-harness fallbacks (20.045476ms)
✔ generic harness consumer architecture (30.076698ms)
▶ harness capability catalog
  ✔ contains every supported harness exactly once in ordered available names (1.739461ms)
  ✔ normalizes lookup across supported casing and reports catalog names when unknown (1.443254ms)
  ✔ resolves each harness executable through catalog metadata (0.524084ms)
  ✔ derives executor identity only from the selected harness, with a default sentinel (0.621353ms)
  ✔ declares planner-agent capability and native attribution per catalog entry (0.146338ms)
  ✔ keeps adapter factories at runtime parity with catalog names (0.431325ms)
  ✔ exposes the catalog through the public configuration entry point (0.193227ms)
✔ harness capability catalog (6.680675ms)
▶ doctor harness diagnostics resolve through the catalog
  ✔ probes each external executable and passes a no-binary harness without a process (154.058571ms)
  ✔ reports missing, nonzero, and timeout probes as failing harness checks (1062.561448ms)
  ✔ prints the harness result through the doctorCommand output contract (275.416093ms)
✔ doctor harness diagnostics resolve through the catalog (1494.085954ms)
▶ approval manifest uses the shared executor identity
  ✔ records the selected harness model or default and applicable effort (58.562724ms)
  ✔ never borrows manifest.planner from configuration or the executor identity (28.785682ms)
  ✔ attributes manifest.planner only from a recorded planning session (27.765143ms)
  ✔ approveSpec writes the same identity through the real approval path (94.546799ms)
✔ approval manifest uses the shared executor identity (210.789496ms)
▶ watcher preflight uses the adapter port
  ✔ invokes a supplied preflight and continues when the port is absent (19.783768ms)
  ✔ does not probe a catalogued no-binary harness even when a preflight is supplied (14.579061ms)
  ✔ probes the resolved opencode and codex executables before the first cycle (97.616078ms)
✔ watcher preflight uses the adapter port (133.160815ms)
▶ task started events use the shared executor identity
  ✔ records the selected harness and its model for agy, opencode, mock, and codex (565.169978ms)
✔ task started events use the shared executor identity (565.394016ms)
Created spec 001: 001-explicit-plan
  Path: /tmp/osq-generic-plan-6vbon2/openspec/changes/001-explicit-plan
▶ planCommand uses the shared planner selection
  ✔ uses explicit planner values in brief metadata and interactive arguments (65.244272ms)
Created spec 001: 001-implicit-agy
  Path: /tmp/osq-generic-plan-RKYCak/openspec/changes/001-implicit-agy
Created spec 002: 002-implicit-opencode
  Path: /tmp/osq-generic-plan-RKYCak/openspec/changes/002-implicit-opencode
Created spec 003: 003-implicit-mock
  Path: /tmp/osq-generic-plan-RKYCak/openspec/changes/003-implicit-mock
  ✔ falls back to the selected executor entry when no planner block exists (92.18846ms)
Created spec 001: 001-implicit-codex
  Path: /tmp/osq-generic-plan-NIBiGH/openspec/changes/001-implicit-codex
Created spec 002: 002-mixed-codex-plan
  Path: /tmp/osq-generic-plan-NIBiGH/openspec/changes/002-mixed-codex-plan
  ✔ records default and passes no invented model for native Codex planning (71.183451ms)
✔ planCommand uses the shared planner selection (228.98758ms)
▶ HarnessAdapter spawnInteractive
  ✔ OpencodeAdapter spawns fake binary with expected argv and returns exit code (47.346918ms)
  ✔ AgyAdapter spawns fake binary with expected -i argv and returns exit code (50.228101ms)
  ✔ OpencodeAdapter inherits child stdout and stderr without capturing them (342.538551ms)
  ✔ AgyAdapter inherits child stdout and stderr without capturing them (289.838723ms)
  ✔ MockAdapter records interactive spawns and returns configured exit code (1.88499ms)
✔ HarnessAdapter spawnInteractive (733.455766ms)
▶ Shared Process Execution and Timeout Helper
  ✔ spawnWithTimeout executes child process with given command, args, cwd, and environment (78.154979ms)
  ✔ spawnWithTimeout terminates process with SIGTERM when execution exceeds timeoutSeconds (1014.770077ms)
  ✔ DEFAULT_KILL_GRACE_PERIOD_MS remains 5000 (2.092156ms)
  ✔ spawnWithTimeout forces SIGKILL when SIGTERM fails to terminate (1106.014609ms)
  ✔ spawnWithTimeout marks timedOut true and returns non-zero exit code on timeout (1005.401988ms)
  ✔ AgyAdapter uses spawnWithTimeout helper preserving existing timeout behavior (1029.991106ms)
✔ Shared Process Execution and Timeout Helper (4238.237131ms)
▶ Harness capability rule prompt injection
  ✔ extractCapabilityRules reads delta specs under specs/<capability>/spec.md (24.502326ms)
  ✔ extractCapabilityRules returns an empty array when no delta specs exist (2.560357ms)
  ✔ buildAgyPrompt injects capabilityRules under a dedicated section in Rules (2.361404ms)
  ✔ buildOpencodePrompt injects capabilityRules under the same dedicated section in Rules (2.086767ms)
  ✔ builds standard default rules without empty headers when capability rules are absent (3.349622ms)
  ✔ treats an explicit empty capabilityRules array as no capability rules (1.78932ms)
  ✔ derives capability rules from the change folder when capabilityRules is absent (2.879757ms)
  ✔ renders one prior-context section naming attempt, failure reason, and prior result (4.829385ms)
  ✔ omits the prior-context section on a fresh first attempt without a prior result (2.619221ms)
  ✔ treats an explicit prior result as prior context even before a retry (2.407228ms)
  ✔ renders a failed verification output block inside the prior context (1.418614ms)
  ✔ bounds an oversized prior failure output deterministically (1.487524ms)
  ✔ renders the same failed-output block in every textual prompt (1.945288ms)
✔ Harness capability rule prompt injection (58.650572ms)
▶ shared harness stream helpers
  ▶ asRecord
    ✔ returns a plain object unchanged (0.87522ms)
    ✔ returns undefined for arrays, null, undefined, and primitives (0.174688ms)
  ✔ asRecord (4.159274ms)
  ▶ firstNonEmptyString
    ✔ returns the first non-empty string and skips empty or non-string values (1.75813ms)
    ✔ returns undefined when no candidate is a non-empty string (0.125129ms)
  ✔ firstNonEmptyString (2.231825ms)
  ▶ resolveEventTimestamp
    ✔ normalizes string timestamps to ISO form (0.845301ms)
    ✔ normalizes numeric epoch timestamps to ISO form (0.171008ms)
    ✔ falls back to a nested step_update timestamp (0.404516ms)
    ✔ returns the current time for missing or invalid timestamps (0.759031ms)
  ✔ resolveEventTimestamp (2.706349ms)
  ▶ EventStreamParser
    ✔ reassembles lines split across chunks and flushes the trailing partial line (1.73339ms)
    ✔ skips empty and whitespace-only lines (0.381395ms)
    ✔ awaits handlers serially in arrival order (26.398713ms)
    ✔ continues after a handler rejects and still resolves flush (0.539034ms)
    ✔ flushes an unterminated final line exactly once across repeated feeds (0.169728ms)
  ✔ EventStreamParser (34.949579ms)
✔ shared harness stream helpers (44.868559ms)
▶ Harness Adapter and Event Logging
  ✔ appendHarnessEvent appends valid JSONL events to .run/events/<n>.jsonl (54.029428ms)
  ✔ MockAdapter setup and spawn simulates task execution and emits events (37.688739ms)
  ✔ AgyAdapter initializes with correct name and can perform setup (17.112415ms)
  ✔ getHarnessAdapter resolves registered adapters and rejects unknown names (12.63759ms)
  ✔ AgyAdapter includes --print-timeout <n>s in args based on config timeouts (22.887042ms)
✔ Harness Adapter and Event Logging (146.713212ms)
▶ Folder Hasher
  ✔ produces deterministic SHA-256 hash for identical folder contents (41.244516ms)
  ✔ ignores .run directory and its marker files completely (15.592985ms)
  ✔ normalizeTasksMd normalizes checked boxes to unchecked boxes (14.449089ms)
  ✔ ticking a task checkbox in tasks.md produces identical hash (13.21711ms)
  ✔ deleting or modifying a task line in tasks.md changes the hash (17.094809ms)
  ✔ changes hash when any task or spec file is modified (19.898158ms)
  ✔ normalizes CRLF and LF to yield identical hashes across platforms (26.676829ms)
  ✔ verifyFolderHash returns true if and only if folder hash matches approved hash (23.830768ms)
  ✔ ignores additions, edits, and removals of the root plan-prompt.md (15.323244ms)
  ✔ covers a nested plan-prompt.md as authored content (27.707169ms)
✔ Folder Hasher (217.748946ms)
▶ import graph boundaries
  ✔ WatchCommandOptions is declared in src/watcher/dev.ts (15.396516ms)
  ✔ src/cli/watch.ts imports WatchCommandOptions from src/watcher/dev.ts (1.722564ms)
  ✔ src/core imports only from src/core (81.129048ms)
  ✔ src/harness imports from neither src/watcher nor src/cli (65.89724ms)
  ✔ src/watcher imports from no module in src/cli (63.59241ms)
  ✔ keeps UI runtime imports out of core and core imports out of UI (59.479321ms)
  ✔ rejects a runtime UI import from src (0.683703ms)
  ✔ allows erased type-only UI imports from src (0.974214ms)
  ✔ rejects any src import from packages/ui (0.459665ms)
  ✔ keeps fetch and EventSource inside the data module (12.215024ms)
✔ import graph boundaries (304.041807ms)
▶ runner lifecycle module line budget
  ✔ keeps every runner lifecycle module strictly under 200 lines (3.49772ms)
✔ runner lifecycle module line budget (3.723508ms)
▶ inbox needs-you projection
  ✔ projects every attention kind once in change/task order with exact commands (78.115997ms)
  ✔ ignores a change without proposal.md (6.167501ms)
✔ inbox needs-you projection (101.20109ms)
▶ inbox running projection
  ✔ includes only derived running tasks whose parsed lock PID is live and leaves markers (16.08151ms)
  ✔ omits malformed or non-finite locks without creating a running item (12.46087ms)
✔ inbox running projection (28.982275ms)
▶ inbox landed projection and cursor
  ✔ selects strictly later archives with a valid cursor and newest ten otherwise (50.402065ms)
  ✔ keys the cursor by sha256(realpath) and tolerates missing, malformed, or invalid content (8.473919ms)
✔ inbox landed projection and cursor (59.416348ms)
▶ inbox text and JSON contract
  ✔ collapses a completely empty inbox to exactly Inbox empty. (1.433949ms)
  ✔ renders all groups with one (none) line per empty group and command-terminated rows (10.469175ms)
  ✔ exposes exactly the documented JSON keys and value types (14.564037ms)
✔ inbox text and JSON contract (27.12326ms)
▶ bare osq CLI inbox integration
  ✔ renders text, advances and deletes the cursor, caps fallback at ten, and preserves change folders (1527.909449ms)
  ✔ emits exactly the documented JSON object for --json (634.87327ms)
  ✔ materializes the missing runtime lock directory from clean tracked fixture state (655.541705ms)
  ✔ prints exactly Inbox empty. for an empty project (368.822ms)
  ✔ keeps explicit status complete and report --json scoped without advancing the cursor (1149.509088ms)
  ✔ reads the inbox through a core helper without advancing the cursor (795.813712ms)
✔ bare osq CLI inbox integration (5133.209208ms)
▶ osq init PLANNER.md
  ✔ creates PLANNER.md with the managed block when missing (12.756941ms)
  ✔ replaces the managed block while preserving content outside the markers (3.147635ms)
  ✔ appends the managed block when markers are absent (3.257123ms)
  ✔ managed block instructs planners to write files with the file tool (0.999709ms)
  ✔ managed block states the handoff read, write-boundary, lint, and no-approval rules (0.704662ms)
  ✔ managed block encodes the slicing rule (3.333242ms)
  ✔ managed block encodes the detail rule (0.744022ms)
  ✔ managed block encodes the change-level verify rule (0.87209ms)
  ✔ managed block requires final-tree verification inside the Tasks guidance (1.140397ms)
  ✔ managed block requires ordered shared-file ownership inside the Tasks guidance (1.007419ms)
  ✔ repository PLANNER.md carries the file-tool instruction (1.006518ms)
  ✔ scaffoldProject initializes PLANNER.md and reports it on InitResult (12.110115ms)
  ✔ PLANNER.md, MANAGED_PLANNER_BLOCK, and templates/PLANNER.md are byte-for-byte equal (1.008189ms)
✔ osq init PLANNER.md (44.434022ms)
▶ planning consumer guidance
  ✔ describes prompt handoff, explicit session, print mode, and entry points (7.455035ms)
  ✔ describes approval observation and planning-tool-owned model choice (3.268764ms)
  ✔ generates a config with no required planner model (19.534058ms)
✔ planning consumer guidance (31.661471ms)
▶ osq init
  ✔ scaffolds only the OpenSpec layout and default files in a fresh repo (30.26187ms)
  ✔ does not create legacy specs/ or specs/_template/ during initialization (14.223951ms)
  ✔ does not overwrite existing osq.config.ts (15.647635ms)
  ✔ creates AGENTS.md with the managed block if missing (2.390613ms)
  ✔ managed AGENTS block carries the planning entry point without weakening the executor protocol (0.944229ms)
  ✔ managed block is clean, self-contained, and contains no self-referential repo text (1.145157ms)
  ✔ injects or updates the managed block in an existing AGENTS.md idempotently (19.243045ms)
  ✔ scaffolds openspec/config.yaml declaring the osq schema and per-artifact rules (43.639661ms)
  ✔ scaffolds openspec/schemas/osq/schema.yaml forked from spec-driven without design (36.81585ms)
  ✔ schema README documents tasks/<n>.md as an osq-specific execution unit (12.640225ms)
  ✔ refreshes the managed AGENTS.md block with OpenSpec layout instructions (2.422643ms)
  ✔ is strictly idempotent and preserves existing OpenSpec configuration (22.256731ms)
  ✔ creates the Claude plan command and classifies it in InitResult (17.970738ms)
  ✔ refreshes a stale Claude command while preserving surrounding content (14.889013ms)
  ✔ does not rewrite existing config, environment, schema, or unrelated files (11.969113ms)
✔ osq init (249.546021ms)
▶ instruction-shaped delta linting
  ✔ rejects a requirement named with "Update" (117.727569ms)
  ✔ rejects a requirement named with "Document" (96.756254ms)
  ✔ rejects instruction-shaped names case-insensitively (92.084586ms)
  ✔ names the capability and requirement title in the error (104.418404ms)
  ✔ inspects MODIFIED and REMOVED requirement sections (75.538368ms)
  ✔ accepts declarative delta requirements with zero errors (81.951675ms)
  ✔ prevents approval of a change folder with an instruction-shaped delta (93.105831ms)
✔ instruction-shaped delta linting (663.503914ms)
▶ layout path derivation
  ✔ derives the changes directory from a relative openspecRoot (1.272136ms)
  ✔ derives the changes directory from an absolute openspecRoot (0.162208ms)
  ✔ prepends an optional project root (0.209968ms)
  ✔ derives the archive directory from openspecRoot (1.214546ms)
  ✔ derives the specs directory from openspecRoot (0.181098ms)
  ✔ derives change-local directories from the change folder (0.229847ms)
  ✔ derives done, dead, and event artifact paths (0.250747ms)
  ✔ anchors absolute change folders without rebasing them (0.302211ms)
  ✔ derives deterministically and tracks the configured root (0.386986ms)
  ✔ keeps the layout module under 200 lines (16.167458ms)
✔ layout path derivation (22.609327ms)
▶ source line budget
  ✔ keeps every non-allow-listed source file at or under 250 lines (33.177628ms)
✔ source line budget (34.556983ms)
▶ UI source line budget
  ✔ keeps every authored UI source file at or under 250 lines (22.746615ms)
✔ UI source line budget (23.105771ms)
▶ Spec Linter
  ✔ passes a clean, compliant spec (103.813384ms)
  ✔ rejects a proposal declaring features.writes in frontmatter (104.741466ms)
  ✔ rejects more than one table under Contract (91.173016ms)
  ✔ rejects verify command that chains commands (90.609383ms)
  ✔ rejects depends_on naming a missing change (108.890437ms)
  ✔ accepts depends_on naming a change that lives in the archive (91.640843ms)
  ✔ accepts depends_on naming a change that lives in the rejected directory (97.692813ms)
  ✔ rejects acceptance checklist longer than maxAcceptanceLines (75.779374ms)
  ✔ permits task title containing " and " without warning (78.14171ms)
  ✔ resolves proposal.md as the change document when spec.md is absent (80.724068ms)
  ✔ rejects a change folder missing both proposal.md and spec.md (17.401146ms)
  ✔ rejects a proposal.md lacking a verify command (81.508214ms)
  ✔ accepts a proposal.md declaring a verify command (66.84909ms)
  ✔ rejects a non-boolean nested tests.modify declaration (93.618475ms)
  ✔ rejects a non-boolean flat tests.modify declaration (75.987977ms)
  ✔ accepts a boolean nested tests.modify declaration (92.882268ms)
  ✔ rejects scope touching an existing test file without tests.modify (107.082551ms)
  ✔ rejects a tests/** scope matching an existing test file without tests.modify (90.064161ms)
  ✔ passes a scope touching existing test files when tests.modify is true (114.116654ms)
  ✔ permits scope naming a new test file that does not exist yet (87.991522ms)
  ✔ warns without failing when harness scope omits the event fixture folder (90.747707ms)
  ✔ does not warn when an exact fixture file covers the event fixtures (90.292083ms)
  ✔ does not warn when a fixture directory declaration covers the event fixtures (107.116037ms)
  ✔ does not warn when a fixture glob declaration covers the event fixtures (107.780461ms)
  ✔ emits one harness fixture warning per affected task in task order (83.36645ms)
  ✔ executes local openspec validate for changes and specs under OPENSPEC_TELEMETRY=0 (96.600766ms)
  ✔ fails closed when no local openspec binary is installed (30.928789ms)
  ✔ parses JSON validation failures and prefixes them with openspec: (84.894517ms)
  ✔ logs the resolved OpenSpec version and does not warn when it matches the pin (123.548254ms)
  ✔ fails when the resolved OpenSpec version differs from the pin (96.011505ms)
  ✔ verifies delta target existence against base specs (113.771931ms)
  ✔ accepts a delta whose modified requirement exists in the base spec (98.545924ms)
  ✔ accepts an added-only delta for a capability with no base spec (99.148878ms)
  ✔ rejects an added delta requirement named with "Update" (111.678841ms)
  ✔ rejects an added delta requirement named with "Document" (106.023326ms)
  ✔ accepts a declarative added delta requirement with zero errors (105.192454ms)
  ✔ rejects the template placeholder in a proposal verify (98.758597ms)
  ✔ rejects the template placeholder in a task verify with one message (112.214742ms)
  ✔ rejects normalized placeholder equivalents (448.672907ms)
  ✔ rejects package-script invocations whose script is absent (468.397711ms)
  ✔ accepts a present package script without a path warning (91.983738ms)
  ✔ warns when a task verify names no path or package script (97.808525ms)
  ✔ warns when a proposal verify names no path or package script (83.213346ms)
  ✔ does not warn when a verify names an existing repository path (136.850136ms)
  ✔ accepts a path-shaped binary that exists (130.063603ms)
  ✔ handles a missing or malformed root package manifest deterministically (165.861631ms)
  ✔ retains the chaining diagnostic without reinterpreting it (118.222405ms)
  ✔ keeps checked-in fixture verification local and free of the placeholder (91.691042ms)
  ✔ registers the lint command in the CLI (36.720179ms)
  ✔ lint command exits non-zero when a change folder fails lint (79.274172ms)
  ✔ lint command exits zero when all change folders are valid (88.317849ms)
  ✔ excludes a root plan-prompt.md from artifact scanning without changing findings (149.326755ms)
  ✔ still scans and rejects a nested plan-prompt.md as authored content (91.038256ms)
✔ Spec Linter (5790.712923ms)
▶ Living spec delta equivalence
  ✔ re-seeds every living spec as the cumulative deterministic merge of 016..027 (142.387748ms)
  ✔ preserves requirements introduced by 017 and 020 through 027 (2.220805ms)
  ✔ contains zero legacy "Delta from" references and no loose spec markdown files (4.016901ms)
  ✔ git grep "Delta from" openspec/specs returns zero matches (5.281686ms)
  ✔ deletes the legacy prose appender applyDelta and calls applyOpenSpecDeltas directly (75.509903ms)
✔ Living spec delta equivalence (231.054894ms)
▶ Lock and Reaper
  ✔ acquireLock writes running marker exclusively (11.937263ms)
  ✔ releaseLock removes running marker cleanly (4.326952ms)
  ✔ isPidRunning accurately reports current process and non-existent process (1.7456ms)
  ✔ reapStaleLocks detects a dead pid and unlinks the lock without writing a dead marker (4.219602ms)
  ✔ reapStaleLocks detects an expired lock without writing a dead marker (5.28747ms)
✔ Lock and Reaper (29.301007ms)
▶ logger status interface
  ✔ exposes status(text) and clearStatus() (1.108387ms)
✔ logger status interface (3.045256ms)
▶ logger status on an interactive TTY sink
  ✔ clears the status row, writes the log line, and redraws status below (1.625362ms)
  ✔ prefixes every line of a multi-line log and redraws once below (0.821811ms)
  ✔ starts an unref'd 80ms interval that advances spinner frames (0.774091ms)
  ✔ does not disturb the status row when a message is suppressed by level (0.457175ms)
  ✔ clearStatus() clears the active row and stops the animation timer (0.298357ms)
  ✔ honours the isTTY option override for a non-TTY stream (0.232527ms)
  ✔ truncates an overflowing status to columns minus the spinner prefix, with no prefix (0.221737ms)
  ✔ keeps redrawn rows within the terminal width and clear of ghost characters (0.286357ms)
✔ logger status on an interactive TTY sink (5.34165ms)
▶ logger status in non-interactive sinks
  ✔ is a no-op when isTTY is false and renders no escape sequences (0.403005ms)
  ✔ is a no-op when process.env.CI is set, even on a TTY (11.879226ms)
  ✔ is a no-op at quiet level, even on a TTY (0.246627ms)
✔ logger status in non-interactive sinks (12.773825ms)
▶ createLogger
  ✔ exports createLogger and accepts a LogLevel (1.755306ms)
  ✔ writes exclusively to process.stderr with a bracketed prefix (0.302477ms)
  ✔ writes without a prefix when none is supplied (0.190848ms)
  ✔ prefixes every line of a multi-line message (0.165798ms)
  ✔ quiet level suppresses info and verbose messages but writes warn and error (0.206447ms)
  ✔ normal level outputs info, warn, and error while suppressing verbose (0.174608ms)
  ✔ verbose level outputs info, verbose, warn, and error (0.260187ms)
✔ createLogger (4.447385ms)
▶ watch command verbosity options
  ✔ registers --verbose and -q/--quiet options on watch (2.372563ms)
  ✔ parses --verbose and --quiet into the watch command options (0.842251ms)
✔ watch command verbosity options (3.509891ms)
▶ managed instructions block retired paths
  ▶ MANAGED_AGENTS_MD_BODY
    ✔ does not reference retired features/ paths (0.529344ms)
    ✔ does not reference "drift against features" (0.152069ms)
    ✔ does not reference a legacy root-level specs/ path (0.665953ms)
  ✔ MANAGED_AGENTS_MD_BODY (2.140015ms)
  ▶ AGENTS.md
    ✔ does not reference retired features/ paths (0.150428ms)
    ✔ does not reference "drift against features" (0.07388ms)
    ✔ does not reference a legacy root-level specs/ path (0.097709ms)
  ✔ AGENTS.md (0.517525ms)
✔ managed instructions block retired paths (3.095345ms)
▶ managed instructions block OpenSpec protocol
  ✔ documents the OpenSpec layout, markers, gates, and permissions (3.50548ms)
  ✔ is mirrored by the repository AGENTS.md guidance (0.131159ms)
✔ managed instructions block OpenSpec protocol (3.848456ms)
▶ repository managed instructions
  ✔ AGENTS.md managed block matches the installed constant (9.517522ms)
  ✔ PLANNER.md managed block matches the installed constant (1.701604ms)
  ✔ Claude command managed block matches the installed constant (0.775432ms)
✔ repository managed instructions (12.62021ms)
▶ planner managed block coexistence
  ✔ preserves foreign text and blocks across repeated initialization (6.759262ms)
  ✔ updates only the osq-managed block beside a foreign block (2.870568ms)
  ✔ refreshes only the osq block in the Claude command across repeated init (4.893954ms)
✔ planner managed block coexistence (15.042442ms)
▶ mangled change folder linting
  ✔ accepts clean files containing newlines and tabs (121.989292ms)
  ✔ rejects a nested file containing a bell character (75.771201ms)
  ✔ rejects a backspace character in a task file (99.475043ms)
  ✔ rejects a carriage return in a task file (77.139155ms)
  ✔ rejects a DEL control character in a change file (89.016583ms)
  ✔ ignores prohibited control characters under .run/ (66.146129ms)
  ✔ rejects fused acceptance lines in a task file (87.490154ms)
  ✔ allows a single acceptance item per line (81.455245ms)
  ✔ approveSpec refuses to seal a change folder with a control character (79.698651ms)
✔ mangled change folder linting (780.437053ms)
▶ run manifest
  ✔ writes .run/manifest.json with hashes and metadata on approval (151.303102ms)
  ✔ records null for a hashed file that does not exist (94.668951ms)
  ✔ counts valid plan_started records, including resumed sessions without exits (90.464506ms)
  ✔ tolerates a missing, empty, or partially malformed planning log (266.949772ms)
  ✔ changes planningSessions when only the plan log changes, keeping the approved hash (239.347072ms)
✔ run manifest (844.391324ms)
▶ measures
  ▶ countWords
    ✔ returns 0 for empty and whitespace-only input (24.54126ms)
    ✔ counts single and multiple whitespace-delimited words (1.473999ms)
  ✔ countWords (27.040917ms)
  ▶ gatherScopeCounts
    ✔ counts existing scoped files and their lines, ignoring missing ones (5.769535ms)
    ✔ returns zeros when no scoped file exists (0.995429ms)
    ✔ counts each file a glob resolves and zero for an unmatched glob (4.60077ms)
  ✔ gatherScopeCounts (11.890847ms)
  ▶ gatherRepoCounts
    ✔ totals text files while skipping ignored directories (5.174342ms)
    ✔ skips binary files containing null bytes (1.704921ms)
  ✔ gatherRepoCounts (7.227829ms)
  ▶ countImportFanIn
    ✔ counts non-scoped files that import a scoped file (3.881891ms)
    ✔ returns 0 when only scoped files import each other (2.21634ms)
    ✔ resolves a glob into its real import targets instead of the literal glob text (4.778056ms)
  ✔ countImportFanIn (11.274243ms)
  ▶ countDeltaRequirementsAndScenarios
    ✔ counts requirement and scenario headers across delta specs (4.36051ms)
    ✔ returns zeros when no delta specs exist (0.995773ms)
  ✔ countDeltaRequirementsAndScenarios (5.742646ms)
  ▶ snapshotScopeHashes and hashFileForMeasures
    ✔ hashes known content and returns null for missing files (3.688569ms)
    ✔ hashFileForMeasures returns null for an absent file (0.930453ms)
    ✔ keeps an exact missing path as null and omits unmatched globs (3.457043ms)
  ✔ snapshotScopeHashes and hashFileForMeasures (8.348332ms)
  ▶ gatherEndMeasures
    ✔ counts changed files and absolute line deltas for modified, added, and deleted files (6.324024ms)
    ✔ re-resolves a glob at end so added, modified, and deleted matches are visible (6.326659ms)
    ✔ reports zero changes and equal before/after hashes when scope is untouched (2.902898ms)
    ✔ carries every start-phase field into the end event (1.286825ms)
  ✔ gatherEndMeasures (17.707766ms)
  ▶ emitMeasures
    ✔ appends a measures start event to .run/events/<n>.jsonl (3.896746ms)
    ✔ uses one emission path for both start and end phases (7.860001ms)
  ✔ emitMeasures (11.989515ms)
  ▶ gatherStartMeasures
    ✔ collects scope, repo, word, and delta baselines for a task (19.417955ms)
  ✔ gatherStartMeasures (19.679763ms)
  ▶ runner integration
    ✔ emits start then end measures for a verified task (187.097717ms)
    ✔ reports changed files and lines for a scoped edit (145.684865ms)
    ✔ emits an end measures event for a crashed dead outcome (128.628401ms)
    ✔ emits end measures before the dead event on verify_red (134.678776ms)
  ✔ runner integration (596.844009ms)
✔ measures (719.573776ms)
▶ osq migrate openspec
  ✔ moves features/ to openspec/specs/ and specs/ to openspec/changes/ (45.438865ms)
  ✔ resolves every migration target through the canonical layout helpers (11.803679ms)
  ✔ migrates archived changes to openspec/changes/archive/ preserving .run/ markers (10.686989ms)
  ✔ converts spec.md to proposal.md with frontmatter and preserves prose under ## Delta (legacy) (13.671987ms)
  ✔ ticks every archived tasks.md (including already-checked and real copies) (69.388685ms)
  ✔ migrates fixture and real archived copies passing both validators (138.864457ms)
  ✔ creates the 017 stub change folder under openspec/changes/017-sample/ (27.219836ms)
  ✔ convertSpecToProposal drops features.writes and preserves delta prose (1.265337ms)
  ✔ tickAllCheckboxes ticks only unchecked boxes and preserves structure (0.757042ms)
  ✔ registers the migrate command with a required target argument (2.868967ms)
  ✔ migrate command rejects unsupported targets with a non-zero exit (1.736545ms)
  ✔ migrate command runs the openspec migration and reports a summary (24.538669ms)
✔ osq migrate openspec (350.780804ms)
▶ osq new
  ✔ slugify converts titles to valid kebab-case folder names (27.507295ms)
  ✔ getNextSpecNumber correctly increments existing spec numbers including archive (10.550598ms)
  ✔ createNewSpec generates numbered change folder from template with updated title (12.052244ms)
  ✔ createNewSpec respects options.specsDirName override (18.539693ms)
  ✔ createNewSpec rejects empty or invalid spec names (17.943899ms)
✔ osq new (88.592926ms)
▶ no skipped output in src
  ✔ contains zero case-insensitive occurrences of "skipped" under src/ (54.527898ms)
✔ no skipped output in src (56.025811ms)
▶ OpenCode Configuration and Adapter Registration
  ✔ OsqConfig interface defines opencode config with bin, model, agent, optional variant (7.16646ms)
  ✔ DEFAULT_CONFIG provides opencode defaults bin "opencode", model "deepseek/deepseek-flash", agent "osq-coder" (2.193728ms)
  ✔ OsqUserConfig accepts partial opencode fields and defineConfig merges them over DEFAULT_CONFIG (1.697701ms)
  ✔ DEFAULT_CONFIG defaults log.heartbeatSeconds to 60 and defineConfig preserves it (1.192916ms)
  ✔ loadConfig and defineConfig permit harness setting "opencode" (185.265219ms)
  ✔ getHarnessAdapter resolves "opencode" returning OpencodeAdapter instance (1.939773ms)
  ✔ README documents opencode in harness list with sample configuration block (1.459393ms)
✔ OpenCode Configuration and Adapter Registration (202.890319ms)
▶ OpenCode Event Stream and Token Metrics Translation
  ✔ Stdout JSON lines stream matching fixture/opencode-events.jsonl is parsed line by line (24.166858ms)
  ✔ step_finish event extracts input, output, total, and cache tokens with cost (9.612203ms)
  ✔ tokens event is appended to .run/events/<n>.jsonl with promptTokens, candidateTokens, totalTokens, cachedTokens, cost (59.328844ms)
  ✔ Unknown event types such as step_start and text are logged at verbose level without throwing (8.401486ms)
  ✔ Malformed or unparseable non-JSON stdout lines do not crash the adapter process (9.540444ms)
✔ OpenCode Event Stream and Token Metrics Translation (112.589107ms)
▶ OpencodeAdapter planner agent setup
  ✔ OpencodeAdapter setup writes .opencode/agent/osq-planner.md with expected permissions and body (28.184515ms)
  ✔ Running setup twice leaves .opencode/agent/osq-planner.md byte-identical (6.414597ms)
  ✔ OpencodeAdapter setup respects custom planner agent name in config (4.339346ms)
✔ OpencodeAdapter planner agent setup (40.467979ms)
▶ OpenCode Adapter Setup
  ✔ OpencodeAdapter setup creates directory .opencode/agent/ if absent (21.363771ms)
  ✔ OpencodeAdapter setup writes .opencode/agent/osq-coder.md with description and mode all frontmatter (11.287593ms)
  ✔ Frontmatter permissions allow read, edit, bash, glob, grep, denying webfetch, websearch (5.909158ms)
  ✔ Agent file body contains AGENTS.md task execution procedure enclosed in managed block markers (2.978632ms)
  ✔ Setup is idempotent and preserves user edits outside managed block markers (3.639239ms)
  ✔ README notes --auto flag approves any action the agent file does not deny (1.017259ms)
  ✔ OpencodeAdapter setup respects custom agent name configured in OsqConfig (1.997317ms)
✔ OpenCode Adapter Setup (49.85397ms)
▶ OpenCode Adapter Task Spawning
  ✔ spawnTask constructs arguments: run --agent <agent> --auto --format json --dir <projectRoot> --model <model> (45.495884ms)
  ✔ Optional variant flag --variant <variant> is included when configured (18.917981ms)
  ✔ attaches task, proposal, and existing living specs named by the task (14.193182ms)
  ✔ attaches a new capability delta without fabricating a living spec path (19.806993ms)
  ✔ Positional prompt argument defines task guidelines matching AGENTS.md protocol (14.649659ms)
  ✔ Fake opencode binary validates passed flags, handles non-zero exit, and respects timeout termination (1088.117159ms)
✔ OpenCode Adapter Task Spawning (1203.078982ms)
▶ OpenCode tool event translation
  ✔ adds 'tool' to HarnessEventType and exposes ToolEventData (22.295921ms)
  ✔ extracts file paths and patterns for read, edit, write, and glob tools (16.776625ms)
  ✔ extracts the first 60 characters of the command for the bash tool (23.70214ms)
  ✔ falls back to 60 characters of JSON for any other tool (33.440939ms)
  ✔ recognizes tool_use top-level and part.type tool-use events (13.298397ms)
  ✔ appends a tool event and logs it at verbose level from the shared handler (26.904873ms)
  ✔ persists the event while suppressing the verbose log at normal level (25.838425ms)
  ✔ recognizes tool_use lines in the stream parser and forwards the logger (31.780395ms)
  ✔ emits tool events through the adapter spawn path with the shared logger (68.174319ms)
✔ OpenCode tool event translation (264.21665ms)
▶ package hygiene
  ✔ packs only distribution assets (1011.825652ms)
  ✔ excludes source, tests, configs, workflows, and specs (967.512618ms)
  ✔ declares required package metadata (2.637481ms)
✔ package hygiene (1983.214807ms)
▶ package manager independence
  ✔ never spawns pnpm from any test under tests/ (72.331432ms)
✔ package manager independence (72.828037ms)
▶ runtime dependency boundary
  ✔ keeps frontend tooling in the private workspace, out of installed runtime dependencies (4.119343ms)
✔ runtime dependency boundary (4.47578ms)
▶ node baseline
  ✔ aligns package metadata, CI, and guidance on Node 24 LTS (2.661175ms)
✔ node baseline (3.17708ms)
▶ packed tarball consumer smoke test
  ✔ packs and installs the local tarball into an isolated temporary project (9169.86216ms)
  ✔ npx osq init scaffolds configuration, template directories, and AGENTS.md (271.913449ms)
  ✔ npx osq new smoke creates a valid change specification (247.914982ms)
  ✔ serves the packaged dashboard on an ephemeral loopback port and shuts down cleanly (220.013404ms)
✔ packed tarball consumer smoke test (10023.242361ms)
▶ staged dashboard asset budget
  ✔ stages the dashboard index below the one-million-byte budget (5.3611ms)
✔ staged dashboard asset budget (6.722666ms)
▶ Spec and Task Parser
  ✔ parseFrontmatter extracts YAML metadata and markdown content (5.089337ms)
  ✔ parseSpecMd extracts title, depends_on, reads, and markdown sections (2.902892ms)
  ✔ parseSpecMd extracts proposal frontmatter without requiring features.writes (1.407824ms)
  ✔ parseTaskMd extracts task metadata and acceptance criteria list (1.264676ms)
  ✔ parseTaskMd extracts entry and skills when populated (1.144037ms)
  ✔ parseTaskMd defaults testsModify to false when omitted (0.791431ms)
  ✔ parseTaskMd reads nested tests.modify booleans (1.037828ms)
  ✔ parseTaskMd accepts a flat tests.modify boolean key (0.487934ms)
  ✔ parseTaskMd ignores non-boolean tests.modify values (2.045717ms)
  ✔ parseTaskList parses OpenSpec grouped checklists with section headers and item numbers (0.736321ms)
  ✔ parseTaskList parses flat numbered checklists and unnumbered bullets (0.161268ms)
  ✔ handles empty sections or missing frontmatter safely (0.173258ms)
✔ Spec and Task Parser (18.845198ms)
▶ Code ownership parsing
  ✔ parseCodeOwnership extracts globs from a capability delta spec (0.469195ms)
  ✔ parseCodeOwnership extracts ownership from living markdown content (0.282067ms)
  ✔ parseCodeOwnership returns an empty array when the header is absent (0.110149ms)
✔ Code ownership parsing (1.124097ms)
▶ Change folder proposal resolution
  ✔ parseSpecMdFromFolder parses proposal.md when present with fallback to spec.md (20.463399ms)
  ✔ resolveChangeDoc prefers proposal.md and reports its kind (3.356343ms)
✔ Change folder proposal resolution (24.140998ms)
▶ Rewritten OpenSpec templates
  ✔ proposal template carries proposal frontmatter and delta spec guidance (2.920708ms)
  ✔ tasks template uses the OpenSpec numbered checklist format (0.560443ms)
✔ Rewritten OpenSpec templates (3.659289ms)
▶ osq plan prompt handoff
  ✔ writes a null brief, prompt file, and one-line handoff without a session (223.308706ms)
/tmp/osq-plan-handoff-nVZ4Fz/openspec/changes/001-exact-bytes: ask your planning tool to plan change 001-exact-bytes
  ✔ stores the exact buildOpeningPrompt bytes in the prompt file (34.876068ms)
  ✔ print mode creates the change and brief but no prompt file, process, or record (29.971273ms)
/tmp/osq-plan-handoff-N940Ro/openspec/changes/001-shared-bytes: ask your planning tool to plan change 001-shared-bytes
  ✔ print mode emits the same bytes as the prompt file for a resumed change (46.230372ms)
  ✔ resumed default reuses the folder, keeps the brief, and refreshes the prompt file (44.844112ms)
  ✔ default and print handoff succeed while an unusable planner is configured (38.991098ms)
  ✔ registers --session and rejects session combined with print before mutation (32.31368ms)
✔ osq plan prompt handoff (452.350899ms)
▶ transient plan-prompt lifecycle
  ✔ lint excludes the root prompt while keeping authored diagnostics (280.559021ms)
  ✔ hashChangeFolder ignores prompt add, edit, and removal but covers authored edits (92.709859ms)
  ✔ re-approval after a prompt refresh keeps the same authored seal (136.033785ms)
  ✔ runner conflict checking proceeds when only the prompt changed (188.318197ms)
  ✔ retry integrity proceeds when only the prompt changed (102.573083ms)
  ✖ failing archive verification leaves the active prompt untouched (220.920126ms)
  ✔ successful archive removes the prompt and retains authored and runtime content (243.570792ms)
  ✔ archiving succeeds and stays idempotent when the prompt is already absent (233.94789ms)
  ✔ a delta failure during archive keeps the folder and prompt recoverable (287.644333ms)
✖ transient plan-prompt lifecycle (1788.651259ms)
▶ planning telemetry
  ▶ core planning helpers
    ✔ hashes the exact brief bytes and resolves the package version (19.758938ms)
    ✔ skips malformed lines and correlates sessions defensively (8.535595ms)
    ✔ reads a missing planning log as empty (2.833761ms)
  ✔ core planning helpers (32.290392ms)
Created spec 001: 001-telemetry-oc
  Path: /tmp/osq-plan-telemetry-X3Zu1A/openspec/changes/001-telemetry-oc
  ▶ planCommand lifecycle
    ✔ appends a correlated pair with exact OpenCode usage before and after spawn (394.956619ms)
Created spec 001: 001-telemetry-exit
  Path: /tmp/osq-plan-telemetry-kHS9vQ/openspec/changes/001-telemetry-exit
    ✔ records a non-zero exit and preserves propagation (192.07331ms)
Created spec 001: 001-telemetry-nospawn
  Path: /tmp/osq-plan-telemetry-um7E5o/openspec/changes/001-telemetry-nospawn
    ✔ records plan_exited when the planner binary cannot spawn (58.403455ms)
Created spec 001: 001-telemetry-resume
  Path: /tmp/osq-plan-telemetry-Ft0XEW/openspec/changes/001-telemetry-resume
    ✔ resumes without rewriting the brief and keeps the approved hash independent (352.886901ms)
    ✔ print mode appends no planning event (35.05573ms)
  ✔ planCommand lifecycle (1034.322952ms)
Created spec 001: 001-telemetry-agy
  Path: /tmp/osq-plan-telemetry-Z8ayK1/openspec/changes/001-telemetry-agy
  ▶ all harness identities through planCommand
    ✔ records AGY timing with all-null usage (184.705585ms)
Created spec 001: 001-telemetry-codex
  Path: /tmp/osq-plan-telemetry-PJS1T1/openspec/changes/001-telemetry-codex
    ✔ records Codex identity with rollout usage and null cost (218.384993ms)
  ✔ all harness identities through planCommand (403.553502ms)
  ▶ harness usage readers
    ✔ OpenCode selects the one row by cwd and interval and sums cache counters (63.273306ms)
    ✔ OpenCode returns all null for ambiguity, malformed data, and read failure (90.566695ms)
    ✔ Codex selects the one new rollout by session_meta cwd (22.183429ms)
    ✔ Codex returns all null for ambiguity, cwd mismatch, and missing usage (26.486164ms)
    ✔ AGY returns explicit all-null usage (0.307926ms)
  ✔ harness usage readers (203.270756ms)
✔ planning telemetry (1674.175264ms)
Created spec 001: 001-smoke
  Path: /tmp/osq-plan-test-EKVJuo/openspec/changes/001-smoke
▶ osq plan command
  ✔ creates change folder and brief.md before spawning the interactive session (205.636623ms)
  ✔ -print writes the opening prompt to stdout only and does not spawn a session (30.496097ms)
Created spec 001: 001-resume-probe
  Path: /tmp/osq-plan-test-h9srtq/openspec/changes/001-resume-probe
  ✔ resumes an existing change with brief.md without creating a new change folder (40.645055ms)
  ✔ accepts the -print alias through the CLI without launching a harness (46.596597ms)
  ✔ builds five ordered sections with the sufficient repository record after the brief (89.952931ms)
  ✔ emits only the too-small record sentence below five measured tasks (30.006533ms)
Created spec 104: 104-record-probe
  Path: /tmp/osq-plan-test-ktKAe2/openspec/changes/104-record-probe
  ✔ uses one five-section prompt for interactive, resumed, and print planning (133.548651ms)
  ✔ emits the five-section prompt through the -print CLI alias (42.896074ms)
Created spec 104: 104-alpha
  Path: /tmp/osq-plan-test-GlV4sm/openspec/changes/104-alpha
  ✔ puts the repository record in a queue-selected planning prompt (90.804986ms)
✔ osq plan command (712.828647ms)
▶ osq plan command registration
  ✔ registers plan <name> with --brief, --print, and --session options (0.617613ms)
✔ osq plan command registration (0.745232ms)
Created spec 001: 001-integration-plan
  Path: /tmp/osq-planning-integration-GQEgOn/openspec/changes/001-integration-plan
▶ planning to report integration
  ✔ records a real planning session that the report surfaces even with null usage (427.083433ms)
✔ planning to report integration (428.22401ms)
▶ planning record source compatibility
  ✔ reads a legacy record without a source as owned (1.110857ms)
  ✔ parses observed records with nullable model, exit code, and usage (0.87361ms)
  ✔ writes source owned for new owned lifecycle records (20.818802ms)
✔ planning record source compatibility (24.172514ms)
▶ path containment
  ✔ accepts nested targets and rejects sibling prefixes and escapes (0.199288ms)
  ✔ resolves relative targets from the session directory (0.169318ms)
✔ path containment (0.614453ms)
▶ findPlanningSessions
  ✔ matches inclusive window boundaries and the segment-contained folder (15.55032ms)
  ✔ rejects sibling prefixes, escapes, and out-of-folder edits (1.562228ms)
  ✔ deduplicates by harness and native id and orders deterministically (0.89836ms)
  ✔ isolates reader failures and invalid windows (1.236026ms)
✔ findPlanningSessions (19.847637ms)
▶ Codex rollout observation
  ✔ reads apply_patch headers and ignores shell text and failed calls (0.759991ms)
  ✔ reads the event_msg cumulative total token usage without summing (0.195358ms)
  ✔ reads every rollout below the Codex data home and degrades a missing store (7.271948ms)
✔ Codex rollout observation (8.506454ms)
▶ OpenCode observation
  ✔ builds an edit-only join projected through json_extract (0.271647ms)
  ✔ groups completed edit parts by session and sums cache read plus write (34.165272ms)
  ✔ keeps a session model nullable (29.446579ms)
✔ OpenCode observation (64.256894ms)
▶ Claude session observation
  ✔ parses successful edits and the final cost-state without content (0.826881ms)
  ✔ returns null when no edit is present and leaves missing values null (0.134738ms)
✔ Claude session observation (1.089508ms)
▶ approval-time observation
  ✔ appends one observed pair, preserves usage/model, and never duplicates (193.561499ms)
  ✔ records no observed pair and leaves planner null when nothing matches (93.799397ms)
  ✔ attributes the newest observed model then the newest owned model, never config (224.088836ms)
  ✔ prefers a persisted creation time and rejects edits before it (33.384625ms)
  ✔ appends deterministically without re-reading a duplicate native session (12.313372ms)
✔ approval-time observation (557.88333ms)
▶ approve command planning notice
  ✔ prints exactly one no-record notice when no observed session matches (77.585598ms)
  ✔ prints no notice when a session matches (96.947716ms)
  ✔ supplies the default readers and still approves with empty local stores (89.090688ms)
  ✔ does not write approval artifacts when lint fails (76.502571ms)
✔ approve command planning notice (340.576528ms)
▶ proposal writes schema
  ✔ osq lint rejects a proposal declaring features.writes (177.402049ms)
  ✔ osq lint passes when features.writes is absent and deltas exist in specs/ (72.071231ms)
  ✔ derives written capabilities from delta specs for show and the manifest (14.369118ms)
  ✔ osq migrate openspec strips features.writes and removes redundant spec.md idempotently (20.032456ms)
✔ proposal writes schema (285.284548ms)
▶ queue planning usage aggregate
  ✔ counts valid starts across active, archived, and rejected attempts, including retired slugs (46.263754ms)
  ✔ reports complete coverage when every start has one finite-cost exit, zero included (6.088877ms)
  ✔ treats missing, null-cost, duplicate, and orphan exits as incomplete (16.843487ms)
  ✔ derives complete zero coverage when there are no prior sessions (3.577644ms)
✔ queue planning usage aggregate (73.896231ms)
▶ queue budget evaluation
  ✔ requires both ceilings for the spend gates (2.05778ms)
  ✔ refuses only when one more session would exceed the maximum (0.978569ms)
  ✔ refuses every launch under a zero session limit (1.182933ms)
  ✔ enforces the cost ceiling only with complete coverage and at or above the maximum (0.731761ms)
  ✔ ignores only the cost ceiling with incomplete coverage and notes it (1.007239ms)
  ✔ keeps enforcing the session ceiling with incomplete coverage (0.747251ms)
✔ queue budget evaluation (7.369517ms)
▶ prepareQueuePlan budget gate
  ✔ refuses before returning a selection when the budget is required but absent (2.74173ms)
  ✔ returns a notice and a selection when cost coverage is incomplete (9.262067ms)
✔ prepareQueuePlan budget gate (12.238264ms)
▶ queue modes without a queue config block
  ✔ keeps osq queue working without queue ceilings (157.945526ms)
✔ queue modes without a queue config block (158.271733ms)
▶ planCommand budget refusals
  ✔ refuses a non-print next plan without queue ceilings before any mutation (11.927108ms)
  ✔ lets print mode bypass the spend gates without a queue block (31.99412ms)
  ✔ allows a launch exactly at the session boundary (20.015589ms)
  ✔ refuses before folder creation when one more session would exceed the maximum (11.243959ms)
  ✔ refuses under a zero session limit and with a reached cost ceiling (17.87744ms)
Created spec 091: 091-alpha
  Path: /tmp/osq-queue-budget-XyEW1t/openspec/changes/091-alpha
  ✔ prints one note and proceeds when coverage is incomplete, still enforcing sessions (14.631676ms)
✔ planCommand budget refusals (108.389825ms)
▶ queue brief and prompt seeding
  ✔ writes only the item body plus planner, date, and queue metadata (15.647989ms)
  ✔ identifies landed dependency archive paths in the change context only when supplied (6.243595ms)
✔ queue brief and prompt seeding (23.309308ms)
▶ createNewSpec queue seeding
  ✔ uses an explicit slug, title, and numeric dependency ids while keeping the body (6.822993ms)
  ✔ numbers across active, archived, and rejected folders (4.632033ms)
✔ createNewSpec queue seeding (11.898192ms)
▶ queue next-item preparation
  ✔ selects the first unplanned item with landed dependencies and records archive paths (9.666912ms)
  ✔ skips active items and waits until a dependency lands (22.29334ms)
  ✔ refuses when every item is landed or active (8.691237ms)
✔ queue next-item preparation (41.144703ms)
▶ queue active failure gate
  ✔ halts before mutation on every dead, regressed, and change-level target (25.731621ms)
  ✔ treats attempt-suffixed history as inactive (14.072224ms)
✔ queue active failure gate (40.163021ms)
▶ queue rejection gate
  ✔ refuses a rejected first eligible item without replan and preserves history (9.203706ms)
  ✔ replans through the real command into one active attempt without touching rejected history (41.803542ms)
✔ queue rejection gate (51.429743ms)
▶ plan command modes
  ✔ registers the plan command with --next, --replan, and --session (4.212887ms)
  ✔ rejects missing and conflicting modes before any file is written (4.077415ms)
  ✔ plan --next --print creates the change and prints its prompt without spawning (17.368695ms)
  ✔ default plan --next hands off the prompt file and marks exactly one item planned (190.007608ms)
  ✔ rejects session combined with print before any mutation (1.113577ms)
✔ plan command modes (217.354311ms)
▶ brief queue planning through the real CLI and mock harness
  ✔ plans one item per invocation, halts on a dead task, retries, and lands all three (8207.786788ms)
✔ brief queue planning through the real CLI and mock harness (8208.783046ms)
▶ queue parser
  ✔ parses ordered items with earlier dependencies, bodies, and raw-section hashes (16.455335ms)
  ✔ accepts nothing and comma-separated earlier slugs with surrounding whitespace (1.875899ms)
  ✔ permits ordinary deeper headings inside a brief body (1.321171ms)
  ✔ rejects malformed headings, invalid slugs, empty titles, and duplicate slugs (1.936883ms)
  ✔ rejects missing, malformed, empty, and duplicate dependency lines (1.233647ms)
  ✔ rejects empty bodies (5.251616ms)
  ✔ rejects self, forward, and unknown dependencies with item context (0.730712ms)
  ✔ fails for a missing queue file with the queue path (1.160722ms)
✔ queue parser (34.381115ms)
▶ queue projection
  ✔ derives state precedence, selected change ids, and rejection counts (61.312322ms)
  ✔ retains rejected counts on a replanned active item and never lands done-but-unarchived (20.614087ms)
  ✔ derives unmet queue dependencies from landed associations only (12.424442ms)
  ✔ does not let a rejected dependency land an item (5.152555ms)
  ✔ annotates changed since planned from the selected association hash (25.58346ms)
  ✔ associates only through brief queue_item metadata, not folder names (7.390546ms)
  ✔ ignores malformed unrelated folders without hiding valid queue items (7.663895ms)
  ✔ reports ambiguous multiple active associations instead of choosing silently (3.975676ms)
  ✔ reports ambiguous multiple archived associations (4.769375ms)
  ✔ prefers an archived association over active and rejected ones (5.876977ms)
  ✔ derives state afresh on every call with no cache between projections (6.351576ms)
  ✔ formats every projected row deterministically (0.706342ms)
✔ queue projection (162.880492ms)
▶ osq queue CLI
  ✔ registers the queue command in the commander program (2.782319ms)
  ✔ prints the projection through createProgram without changing queue bytes or metadata (11.797036ms)
  ✔ prints identical output on repeated invocations (4.732662ms)
✔ osq queue CLI (19.583923ms)
▶ regressed status formatting
  ✔ formats a regressed task with the regressed indicator and label (0.691572ms)
  ✔ formats an active spec overview with a regressed indicator (0.231407ms)
  ✔ formats a regressed task outcome line with the fallback word (0.252547ms)
  ✔ formats a regressed task outcome line with the unicode failure symbol (0.126589ms)
✔ regressed status formatting (2.553931ms)
▶ regressed marker and event writers
  ✔ writes a regressed marker under .run/regressed (15.383998ms)
  ✔ writes a change-level regressed marker for the change target (4.805616ms)
  ✔ appends a typed regressed event to the task event stream (4.670112ms)
  ✔ lets event data override the default task and appends without clobbering (3.933685ms)
✔ regressed marker and event writers (29.345725ms)
▶ explicit rejection transition
  ✔ refuses an empty or whitespace-only reason without moving the folder (58.70923ms)
  ✔ rejects an unapproved active change into the canonical rejected directory (26.580766ms)
  ✔ rejects an approved change with an active dead marker (88.494143ms)
  ✔ rejects an approved change with an active regressed task marker (103.028073ms)
  ✔ rejects an approved change with a change-level regression (104.613199ms)
  ✔ refuses a healthy approved change and leaves it in place (111.04972ms)
  ✔ refuses an approved completed change (107.294976ms)
  ✔ refuses a running task even when a dead marker would win state precedence (109.728463ms)
  ✔ refuses a historical suffixed failure marker as not active (114.528837ms)
  ✔ refuses an archived change (22.208966ms)
  ✔ refuses an already rejected change (34.454493ms)
  ✔ refuses a missing change (43.389154ms)
  ✔ refuses a destination collision without moving or overwriting (33.766708ms)
  ✔ moves the complete record intact and appends one matching rejection event (109.583071ms)
✔ explicit rejection transition (1069.91938ms)
▶ release workflow
  ✔ triggers on v* tag push events (0.750882ms)
  ✔ installs with a frozen lockfile and runs the verification gate (0.182498ms)
  ✔ runs the consumer pack smoke test suite through pnpm test (0.333726ms)
  ✔ verifies tag version parity with package.json before publishing (0.268307ms)
  ✔ publishes with provenance and public access using OIDC permissions (0.163759ms)
  ✔ contains no static npm token secrets or npmrc authentication (0.132259ms)
  ✔ sets up the runner with checkout, pnpm, and Node 24 (0.178938ms)
✔ release workflow (3.172494ms)
▶ pnpm setup version delegation
  ✔ pins an exact pnpm version through packageManager in package.json (0.286207ms)
  ✔ uses pnpm/action-setup@v4 without with.version in release.yml (0.219428ms)
  ✔ uses pnpm/action-setup@v4 without with.version in ci.yml (0.166348ms)
✔ pnpm setup version delegation (0.964779ms)
▶ report cost metrics
  ▶ fixture/report
    ✔ sums cost reported in event data per spec and in total under history (115.159957ms)
    ✔ identifies harness-reported provenance and attempt coverage (52.324108ms)
    ✔ formats the total as a currency string (42.099354ms)
    ✔ exposes total, perSpec, formattedTotal, provenance, and coverage on CostHistory (68.777747ms)
    ✔ prints the harness-reported cost line with attempt coverage (37.228674ms)
  ✔ fixture/report (316.843925ms)
  ▶ cost formatting
    ✔ uses four decimals for amounts below one cent (11.028524ms)
    ✔ counts an attempt at most once even when several events report cost (7.249649ms)
  ✔ cost formatting (18.64202ms)
  ▶ cost-free project
    ✔ reports zero cost and zero coverage without estimating (8.673504ms)
  ✔ cost-free project (8.90272ms)
  ▶ README
    ✔ notes that reported cost reflects the harness price table rather than the invoice (2.174876ms)
  ✔ README (2.330114ms)
✔ report cost metrics (347.390542ms)
▶ report event coverage
  ▶ fixture/report
    ✔ lists tasks with and without event files grouped by change (104.363978ms)
  ✔ fixture/report (105.12602ms)
  ▶ mixed coverage
    ✔ accounts for every task and sorts task numbers per change (23.783503ms)
    ✔ treats an existing empty event file as covered (16.889707ms)
    ✔ treats a missing event file as uncovered (17.73471ms)
  ✔ mixed coverage (59.004264ms)
✔ report event coverage (164.596658ms)
▶ report cycle metrics
  ▶ fixture/report
    ✔ emits one sorted row per archived change with nullable phases (119.535905ms)
    ✔ aggregates each phase over only its covered changes (42.627442ms)
    ✔ prints only aggregate phase lines with the coverage phrase (44.979446ms)
  ✔ fixture/report (208.657146ms)
  ▶ phase derivation
    ✔ derives a complete lifecycle and its total in seconds (11.041956ms)
    ✔ keeps missing, invalid, and reversed endpoints null (16.603414ms)
    ✔ excludes active changes from cycle rows (4.981633ms)
    ✔ uses only numeric task streams for first start and excludes change.jsonl spans (4.710806ms)
  ✔ phase derivation (38.501827ms)
  ▶ JSON contract
    ✔ exposes cycle phases and rows on the MetricsReport object (34.379125ms)
  ✔ JSON contract (34.816151ms)
✔ report cycle metrics (282.771574ms)
▶ report failure breakdown
  ▶ fixture/report
    ✔ retains the historical crashed failure of a retried task while reporting zero current dead tasks (121.868143ms)
    ✔ formats the historical dead reasons per reason (41.143167ms)
  ✔ fixture/report (164.319566ms)
  ▶ event history
    ✔ counts every dead event in history grouped by reason (27.302915ms)
    ✔ retains dead events for tasks that are later retried and completed (12.637468ms)
    ✔ defaults a dead event without a reason to unknown (17.465494ms)
  ✔ event history (57.946861ms)
  ▶ marker independence
    ✔ counts dead markers in current state without inventing history (18.2639ms)
    ✔ ignores dead markers even when some tasks have dead events (36.870471ms)
  ✔ marker independence (55.783394ms)
  ▶ formatting
    ✔ prints (none) when there are no dead events (10.793324ms)
  ✔ formatting (10.948932ms)
✔ report failure breakdown (289.834452ms)
▶ report file change metrics
  ▶ fixture/report
    ✔ counts edit and write tool events and deduplicates their paths (110.240423ms)
    ✔ stores edit and write tool events with duplicate paths in the 009 event stream (1.096048ms)
  ✔ fixture/report (112.474878ms)
  ▶ path extraction and normalization
    ✔ extracts paths from summary, path, filePath, and file and normalizes them (15.620153ms)
    ✔ is case-insensitive on the tool name and ignores non edit/write tools (5.531207ms)
    ✔ counts edit and write events without a usable path in the change total only (15.054013ms)
    ✔ deduplicates the same normalized path across all specs (11.256063ms)
    ✔ retains legacy file_changed events and normalizes their paths (6.544827ms)
  ✔ path extraction and normalization (54.722086ms)
✔ report file change metrics (167.779847ms)
▶ report execution history
  ✔ counts every started event as an attempt and lists tasks with multiple attempts (71.037362ms)
  ✔ identifies started events with no intervening dead or regressed event (24.015017ms)
  ✔ groups dead events by reason and treats an absent reason as unknown (15.310401ms)
  ✔ records ordered verify exit codes and counts missing exit codes (16.968376ms)
  ✔ attributes cost to attempts and counts an attempt at most once (14.234019ms)
  ✔ does not associate cost with an attempt when no started event precedes it (15.767198ms)
  ✔ ignores change.jsonl for task attempts and coverage (12.346913ms)
  ✔ parses malformed lines defensively (15.674923ms)
✔ report execution history (188.161867ms)
▶ serializeSortedJson
  ✔ recursively sorts object keys and preserves array order (2.518982ms)
  ✔ is deterministic across repeated calls (0.438545ms)
  ✔ passes through primitives and null unchanged (0.457985ms)
✔ serializeSortedJson (5.394628ms)
▶ report --json
  ✔ emits a single valid JSON document with the stable MetricsReport keys (86.860136ms)
  ✔ orders the emitted top-level keys alphabetically in the raw text (36.240093ms)
  ✔ matches the checked-in fixture byte for byte through the real report command (36.150135ms)
  ✔ matches the structured MetricsReport shape without compatibility aliases (28.729022ms)
  ✔ keeps the non-JSON path rendering the formatted report (79.157977ms)
✔ report --json (268.203372ms)
▶ formatMetricsReport
  ✔ renders exclusively from the values held by the MetricsReport object (0.760622ms)
  ✔ always renders the historical cost line, including at zero (0.347926ms)
✔ formatMetricsReport (1.358315ms)
▶ osq report CLI flag
  ✔ registers --json so commander parses it to options.json (2.830373ms)
✔ osq report CLI flag (2.916653ms)
▶ report current state
  ✔ derives all eight task counts from markers and separates manual from verified (75.347054ms)
  ✔ always includes zero-valued verified and manual counts in JSON and text (15.206594ms)
  ✔ keeps a historical dead event out of current dead when the marker is done (15.528255ms)
  ✔ does not treat a done event as a current completion (11.487932ms)
✔ report current state (118.859751ms)
▶ report planning metrics
  ▶ fixture/report
    ✔ aggregates correlated sessions across active and archived changes (121.288619ms)
    ✔ renders the planning totals and the exact coverage phrase in text (55.609735ms)
  ✔ fixture/report (178.598296ms)
  ▶ aggregation rules
    ✔ counts every valid start once, sums matched exits, and never estimates nulls (9.098278ms)
    ✔ treats missing, empty, and malformed logs as zero without throwing (16.079839ms)
  ✔ aggregation rules (25.782921ms)
  ▶ mixed sources
    ✔ treats observed, explicit owned, and source-less legacy starts identically (8.94549ms)
    ✔ counts each covered change once and excludes exit-only and malformed lines (7.948945ms)
  ✔ mixed sources (17.330831ms)
  ▶ reportCommand JSON
    ✔ exposes the planning block deterministically through the report command (68.464249ms)
  ✔ reportCommand JSON (68.715756ms)
✔ report planning metrics (291.448782ms)
▶ queue report view
  ✔ returns an unconfigured empty queue view and leaves existing aggregates unchanged (80.833792ms)
  ✔ fails a malformed configured queue with its actionable parse error (10.621152ms)
  ✔ projects ordered item rows with state, drift, rejections, and elapsed time (58.701673ms)
  ✔ uses the earliest plan start across attempts and nulls missing or reversed endpoints (70.337506ms)
  ✔ reads active dead, regressed, and change-level failure reasons, defaulting to unavailable (51.18562ms)
  ✔ counts queue planning sessions and finite cost across rejected attempts only for the queue block (20.126895ms)
  ✔ reports complete queue cost coverage when every counted session records finite cost (14.370959ms)
  ✔ renders a concise Queue section and deterministic stable JSON (68.723519ms)
  ✔ renders an unconfigured Queue section for a repository without a queue (8.673593ms)
  ✔ keeps the checked-in report fixture unconfigured without a queue file (51.77541ms)
✔ queue report view (437.586154ms)
▶ osq report rejection history
  ✔ counts each rejected folder once only when a valid rejected event exists (101.849089ms)
  ✔ groups a missing or empty planner value as unknown (18.017178ms)
  ✔ excludes rejected artifacts from every non-rejection aggregate (14.875234ms)
  ✔ renders rejection totals and planner-model counts in the History text section (17.157697ms)
  ✔ exposes history.rejections through the JSON report command (24.796051ms)
✔ osq report rejection history (178.713846ms)
▶ report scope-regression history
  ✔ always exposes the five counters as integers even when no scope events exist (52.230273ms)
  ✔ counts detection only for typed scope regressions and classifies finite exit codes (24.303812ms)
  ✔ classifies only exact recertification outcomes without guessing malformed ones (16.276453ms)
  ✔ aggregates active and archived numbered streams only, never markers, results, or rejected folders (35.687127ms)
  ✔ does not add attempts, unexplained reruns, dead reasons, or cost coverage (9.204816ms)
  ✔ leaves current-state regression counts to markers alone (9.95728ms)
  ✔ renders the history block in text and the counters in stable JSON (9.900998ms)
✔ report scope-regression history (159.370138ms)
▶ report sizes over the checked-in fixture
  ✔ exposes ordered legacy scope buckets and an empty resolver-2 series (84.246925ms)
  ✔ orders the scope series legacy first then resolver-2 (33.626584ms)
  ✔ selects the largest first-attempt pass within the legacy series (23.168044ms)
  ✔ emits labeled size tables, the boundary, and exactly one near-limit hint line (38.185717ms)
  ✔ omits the hint when the largest pass is not near a limit (53.071195ms)
  ✔ renders stable JSON with ordered scope series and acceptance buckets (49.473562ms)
  ✔ is deterministic across repeated derivations (51.167341ms)
✔ report sizes over the checked-in fixture (334.914967ms)
▶ measured task projection
  ✔ ignores tasks without a valid start measure and results files (8.601406ms)
  ✔ uses the first valid start measure and counts started attempts (6.31227ms)
  ✔ treats only a typed done before the next outcome as a first-attempt pass (8.591436ms)
  ✔ discards reversed and incomplete measure pairs for duration (4.214772ms)
  ✔ preserves pre-existing report fields and the queue view (14.131518ms)
✔ measured task projection (42.422795ms)
▶ repository record derivation
  ✔ derives aggregates and dead outcomes from the checked-in fixture (9.557311ms)
  ✔ inspects only the 20 highest numeric archived changes (63.313626ms)
  ✔ uses resolver-2 scope evidence for the record when the window has any (33.125264ms)
  ✔ labels the legacy fallback when no resolver-2 evidence exists (36.680578ms)
  ✔ derives no largest pass when every measured task has a malformed resolver (7.320308ms)
  ✔ truncates dead outcomes to ten in change, task, event order (25.803591ms)
  ✔ never reads results files when deriving the record (6.757408ms)
✔ repository record derivation (183.254579ms)
▶ formatRepositoryRecordBody
  ✔ prints the four labeled groups for a sufficient record (0.156308ms)
  ✔ prints only the too-small sentence below five measured tasks (0.080029ms)
✔ formatRepositoryRecordBody (0.334957ms)
▶ mixed resolver generations
  ✔ keeps legacy and resolver-2 scope buckets and largest passes separate (23.783011ms)
  ✔ aggregates acceptance sizes across generations in one combined series (25.418774ms)
  ✔ labels both series, marks the boundary, and hints from resolver-2 only (82.846581ms)
✔ mixed resolver generations (132.421923ms)
▶ report task states
  ▶ fixture/report
    ✔ contains archived specs 008, 009, and 010 with the expected event shapes (13.263036ms)
    ✔ reports 17 total tasks with current state derived from markers (86.181783ms)
  ✔ fixture/report (101.492651ms)
  ▶ active specs
    ✔ tallies task states from deriveSpecState (57.889726ms)
  ✔ active specs (58.309412ms)
  ▶ archived specs
    ✔ derives current state from markers, not terminal events (30.100048ms)
    ✔ derives archived task status from done and dead markers (14.495948ms)
    ✔ reports archived tasks with no markers as pending (12.516668ms)
    ✔ does not count a done event as a current completion (24.475806ms)
  ✔ archived specs (82.322223ms)
✔ report task states (242.921107ms)
▶ report token metrics
  ▶ fixture/report
    ✔ sums neutral token categories and cache share across all specs (92.574392ms)
    ✔ exposes only the canonical neutral TokenMetrics fields (64.789455ms)
    ✔ formats the neutral token labels with the cache share percentage (55.291071ms)
  ✔ fixture/report (213.957743ms)
  ▶ event mapping
    ✔ maps opencode cache.read to cached_input and reasoning to reasoning (10.095575ms)
    ✔ maps Antigravity usage fields to neutral categories (6.553878ms)
    ✔ derives the total from the neutral categories when no total is reported (9.470094ms)
    ✔ derives the remaining cached input only when no cache field is reported (20.425662ms)
    ✔ prefers reported cached tokens over the remainder when a cache field exists (11.321642ms)
    ✔ uses real-world opencode counts where reasoning is not counted as cache (19.090616ms)
    ✔ defaults cache share percent to zero when there is no input at all (14.691606ms)
  ✔ event mapping (92.541162ms)
  ▶ adapter token extraction
    ✔ extracts opencode reasoning tokens from reasoning or reasoningTokens (0.332177ms)
    ✔ extracts agy reasoning tokens from thinking_tokens or reasoning_tokens (0.216858ms)
    ✔ emits reasoningTokens on opencode tokens events (3.882416ms)
    ✔ emits reasoningTokens on agy tokens events (3.56499ms)
  ✔ adapter token extraction (8.326956ms)
✔ report token metrics (315.473895ms)
▶ osq report
  ✔ getMetricsReport aggregates spec and task counts across active and archived directories (62.800739ms)
  ✔ getMetricsReport calculates completion rate and current dead tasks from markers (31.033373ms)
  ✔ getMetricsReport aggregates event durations, token usage, and file changes (34.737725ms)
  ✔ reportCommand prints formatted terminal report and supports raw JSON output (24.360698ms)
  ✔ aggregates undeclared_test_change in the historical failure breakdown for text and JSON output (19.249393ms)
  ✔ CLI registers report command in commander program (12.457096ms)
✔ osq report (186.996118ms)
▶ retry attempt numbering
  ✔ records attempt 1 on an initial execution (216.666138ms)
  ✔ matches the preceding retry attempt and carries the failure reason (175.006373ms)
✔ retry attempt numbering (392.963768ms)
▶ scope regression recertification
  ✔ passing recertification refreshes canonical done and records outcome passed (202.346503ms)
  ✔ never replaces original_scope_hash across repeated passing recertifications (107.707086ms)
  ✔ requeues on failing recertification with the failed output and next attempt (131.064367ms)
  ✔ requeues with the timeout result when recertification exceeds the configured timeout (1110.405096ms)
  ✔ preserves the established retry transition for a dead task without verification (94.035186ms)
  ✔ preserves the established retry transition for a non-scope regression (129.174403ms)
  ✔ falls back to the preserving transition when no automated done marker exists (132.608703ms)
  ✔ refuses a malformed done marker as a recertification target (120.122444ms)
  ✔ uses the shared target-wide ordinal when a recertification requeues (147.617506ms)
  ✔ renders the failed recertification output in every textual prompt after restart (141.721991ms)
  ✔ passes the requeued failure context into the next agent spawn (218.107356ms)
  ✔ reports recertification and requeue distinctly through the CLI (150.376416ms)
✔ scope regression recertification (2687.984936ms)
▶ retry through the real watcher CLI with the mock harness
  ✔ dies once, retries without deleting diagnostics, then lands and archives (1636.275093ms)
✔ retry through the real watcher CLI with the mock harness (1637.53215ms)
▶ explicit retry transition
  ✔ registers the retry command with id and target arguments (124.697612ms)
  ✔ renames an active dead marker to the next ordinal and records the retry (87.678912ms)
  ✔ counts retained dead and regressed history in one shared ordinal (98.795429ms)
  ✔ retains a task regression done marker so the task derives pending (131.499171ms)
  ✔ retries a change-level regression into history and makes archiving eligible (119.290218ms)
  ✔ preserves both active failure kinds under one ordinal with regression reason (106.616175ms)
  ✔ refuses a running target without mutating markers or events (97.879883ms)
  ✔ refuses a missing approval and names osq approve without mutation (84.222607ms)
  ✔ refuses a mismatched approval hash and names osq approve without mutation (94.403712ms)
  ✔ refuses a target with no active failure (119.789561ms)
  ✔ refuses a change target without a change-level regression (122.987189ms)
  ✔ refuses any non-numeric non-change target (133.345075ms)
✔ explicit retry transition (1323.790014ms)
▶ Runner already_running lock collision
  ✔ aborts with already_running without a dead marker or dead event (110.639065ms)
  ✔ logs the already_running outcome summary to stderr (112.832155ms)
  ✔ does not report the lock collision as a task failure in osq report (89.393588ms)
  ✔ only writes a dead event when an explicit dead marker is written (151.375753ms)
✔ Runner already_running lock collision (465.977457ms)
▶ tickTaskCheckboxContent format handling
  ✔ ticks a matching item in a flat numbered checklist without touching neighbours (1.119258ms)
  ✔ ticks a matching item in a grouped numbered checklist under its section header (0.226407ms)
  ✔ ticks a grouped unnumbered item whose number lives on the section header (0.159768ms)
  ✔ is idempotent and leaves already ticked checkboxes untouched (0.219328ms)
  ✔ prefers an explicit item number over the enclosing section number (0.260927ms)
✔ tickTaskCheckboxContent format handling (3.188614ms)
▶ Runner checkbox projection
  ✔ writes the ticked checkbox through tickTaskCheckbox (63.538566ms)
  ✔ is a no-op when tasks.md is absent (11.457943ms)
  ✔ does not invalidate the approved hash or modify .run/ markers (99.742483ms)
  ✔ derives task and spec state from .run/ markers, never tasks.md checkboxes (120.522944ms)
  ✔ writes .run/done/<n> and ticks tasks.md after an independent verify pass (239.918907ms)
✔ Runner checkbox projection (536.063598ms)
▶ Archived task checkboxes
  ✔ all fifteen (or more) archived tasks.md files are fully ticked (16.110008ms)
✔ Archived task checkboxes (16.367315ms)
▶ Runner done and dead events
  ✔ defines the done and dead event payloads (141.396136ms)
  ✔ parameterizes every dead RunTaskFailureReason and isolates already_running (105.73148ms)
  ✔ appends a done event alongside the done marker on success (189.956886ms)
  ✔ appends a dead event alongside the dead marker for no_result (171.630617ms)
  ✔ appends a dead event alongside the dead marker for crashed (142.673332ms)
  ✔ appends a dead event alongside the dead marker for timeout (113.543257ms)
  ✔ appends a dead event alongside the dead marker for verify_red (188.270354ms)
  ✔ appends a dead event alongside the dead marker for spec_conflict (tampered task) (100.463772ms)
  ✔ appends a dead event alongside the dead marker for spec_conflict (missing approval) (84.842637ms)
  ✔ appends a dead event alongside the dead marker for undeclared_test_change (156.63946ms)
  ✔ writes neither a dead marker nor a dead event for already_running (115.397568ms)
✔ Runner done and dead events (1513.755937ms)
▶ Runner lifecycle logging
  ✔ spawnWithTimeout captures the child pid and elapsed duration in milliseconds (169.148794ms)
  ✔ SpawnProcessResult and SpawnResult expose optional pid and elapsedMs fields (87.37845ms)
  ✔ logs a started summary and records a started event with pid and timeout (207.379286ms)
  ✔ logs an exited summary at verbose level and records an exited event with exit code and elapsed time (208.560957ms)
  ✔ demotes the exited summary to verbose while the started summary stays at info (182.66598ms)
  ✔ emits each lifecycle log line from the same code path as its events.jsonl entry (158.682641ms)
  ✔ does not log lifecycle lines when no logger is supplied (149.100749ms)
  ✔ exposes relativizeToolSummary from core and re-exports it from heartbeat (78.948576ms)
  ✔ models every event as a typed member of the OsqEvent union (111.470011ms)
  ✔ relativizes opencode tool summaries to the project root at write time (97.172656ms)
  ✔ relativizes agy tool summaries to the project root at write time (134.184111ms)
  ✔ records harness, model, and osqVersion on the started event (205.420557ms)
  ✔ emits exactly one started and one exited event through MockAdapter (222.446957ms)
✔ Runner lifecycle logging (2014.986237ms)
▶ Runner lifecycle PID ownership
  ✔ AgyAdapter forwards onSpawn, returns pid/elapsedMs, and emits no lifecycle events (189.753863ms)
  ✔ runTask through AgyAdapter records exactly one started and one exited with matching pid (243.235204ms)
  ✔ OpencodeAdapter forwards onSpawn, returns pid/elapsedMs, and emits no lifecycle events (115.333424ms)
  ✔ runTask through OpencodeAdapter records exactly one started and one exited with matching pid (182.432476ms)
✔ Runner lifecycle PID ownership (732.14787ms)
▶ Runner outcome logging
  ✔ does not export the legacy formatTaskOutcomeSummary helper (152.175633ms)
  ▶ formatTaskOutcomeLine
    ✔ renders a verified line with elapsed time and no (passed) suffix (105.688995ms)
    ✔ renders unicode symbols when enabled (112.893257ms)
    ✔ renders a dead line for every failure reason (93.820018ms)
    ✔ appends the detail string before the elapsed time (78.093815ms)
    ✔ produces a single line for every outcome (102.167188ms)
  ✔ formatTaskOutcomeLine (493.669782ms)
  ✔ logs exactly one verified line upon successful verification (187.346956ms)
  ✔ logs exactly one dead line and writes the marker upon verification failure (212.834375ms)
  ✔ logs timed_out detail when verification times out (1270.031233ms)
  ✔ logs a timeout dead line when the agent exceeds its timeout (123.858856ms)
  ✔ logs a crashed dead line with the exit code when the agent crashes (128.712537ms)
  ✔ logs a no_result dead line when the agent writes no result (128.531965ms)
  ✔ logs a spec_conflict dead line when the folder changes after approval (114.805755ms)
  ✔ logs an already_running dead line when the task lock is held (97.652594ms)
  ✔ does not log an outcome line when no logger is supplied (227.466111ms)
✔ Runner outcome logging (3140.81395ms)
▶ Outcome module shape
  ✔ exposes the outcome failure types and formatter (0.172878ms)
  ✔ exposes the lifecycle, dead, done, and checkbox writers (0.112169ms)
  ✔ keeps outcome.ts under 200 lines (1.78731ms)
✔ Outcome module shape (2.363703ms)
▶ Done marker scope hash frontmatter
  ✔ writes YAML frontmatter and an ISO timestamp when metadata is provided (30.378612ms)
  ✔ keeps timestamp-only content when no metadata is provided (3.33106ms)
✔ Done marker scope hash frontmatter (34.973998ms)
▶ computeTaskScopeHash
  ✔ is deterministic regardless of scope ordering (3.948991ms)
  ✔ changes when a scoped file content changes (2.785839ms)
  ✔ records null for a missing scoped file (2.785069ms)
  ✔ classifies added, modified, and deleted glob matches through the resolver (9.644907ms)
✔ computeTaskScopeHash (19.65969ms)
▶ Pre-spawn scope comparison
  ✔ records the completed scope hash in the done marker (202.905102ms)
  ✔ proceeds to spawn when every earlier done scope is unchanged (276.913551ms)
  ✔ detects a changed earlier scope and refuses to spawn (193.433882ms)
  ✔ reports a deleted earlier scope file as differing (193.816053ms)
✔ Pre-spawn scope comparison (867.70776ms)
▶ Runner synthesized result
  ✔ HarnessEventType includes text and TextEventData carries a text string (166.79939ms)
  ✔ extractFinalTextFromStream returns null when no text event exists (117.212441ms)
  ✔ extractFinalTextFromStream returns null when the event stream is missing (96.95947ms)
  ✔ extractFinalTextFromStream returns the last emitted text message (81.1341ms)
  ✔ extractFinalTextFromStream ignores raw harness payload shapes (fallback candidate list dropped) (83.00795ms)
  ✔ synthesizeResultFile writes synthesized: true frontmatter and an attribution header (88.589008ms)
  ✔ verify.ts exports the synthesis and gating helpers (93.056067ms)
  ✔ verify.ts stays under the 200 line lifecycle module budget (107.50579ms)
  ✔ snapshotTestFiles and findUndeclaredTestChanges report edits and deletions but allow new files (139.629391ms)
  ✔ runVerificationGate passes a zero exit and reports a non-zero diagnostic (165.738173ms)
  ✔ runVerificationGate enforces the timeout and reports timedOut (1117.129229ms)
  ✔ AgyAdapter emits a text event carrying the completed assistant message (142.600546ms)
  ✔ AgyAdapter exit 0 with no result file synthesizes from the last text event (232.901727ms)
  ✔ OpencodeAdapter emits a text event carrying the completed assistant message (132.301271ms)
  ✔ OpencodeAdapter exit 0 with no result file synthesizes from the last text event (279.78749ms)
  ✔ case B: real adapter exit 0 with neither result file nor text is dead with reason no_result (142.543547ms)
  ✔ README documents the synthesized result behavior for the no_result reason (109.166631ms)
✔ Runner synthesized result (3298.68627ms)
▶ Runner terminal status
  ▶ formatTaskStatusRow
    ✔ renders task number, elapsed, tool count, tokens, cost, and summary (171.333585ms)
    ✔ omits cost and summary when they are not reported (105.853568ms)
    ✔ renders the token count abbreviated in the status row (123.814963ms)
    ✔ assembles the full row without truncating, leaving fitting to the logger sink (84.822743ms)
  ✔ formatTaskStatusRow (487.010467ms)
  ▶ formatTokens
    ✔ abbreviates counts at the 1k and 1M boundaries (78.569185ms)
    ✔ is applied identically to the heartbeat line (75.926453ms)
  ✔ formatTokens (154.975323ms)
  ▶ relativizeToolSummary
    ✔ strips the project root and its trailing separator from absolute paths (110.460638ms)
    ✔ normalizes a trailing separator on the supplied root (103.170673ms)
    ✔ falls back to process.cwd() when no root is supplied (108.354765ms)
    ✔ leaves absolute paths outside the project root untouched (104.281032ms)
    ✔ relativizes an exact root match to a dot (105.000966ms)
  ✔ relativizeToolSummary (532.234674ms)
  ▶ computeTaskHeartbeatStats
    ✔ counts tool events, sums tokens and cost, and keeps the last tool summary (118.359396ms)
    ✔ accumulates new events in memory instead of re-reading already-counted lines (115.384233ms)
    ✔ tolerates a missing event file with zeroed counters (86.643659ms)
    ✔ relativizes tool summaries against the project root but keeps the raw event intact (83.070699ms)
    ✔ falls back to process.cwd() for tool summaries when projectRoot is omitted (89.007658ms)
    ✔ renders the relativized tool path in the status row without a leading slash (95.021079ms)
  ✔ computeTaskHeartbeatStats (588.194245ms)
  ▶ task start and outcome lines
    ✔ logs a single started line with the title truncated to the terminal width (213.877094ms)
    ✔ logs a verified outcome line with elapsed seconds (199.091888ms)
    ✔ logs a dead outcome line with the reason and elapsed seconds (224.395259ms)
  ✔ task start and outcome lines (637.816657ms)
  ▶ end-to-end status via the real opencode stream parser
    ✔ redraws a TTY status row with the live tool count, tokens, cost, and summary (541.25075ms)
    ✔ redraws the status row with a repo-relative tool path from an absolute summary (537.395861ms)
    ✔ derives the non-TTY heartbeat log from the same counters (465.436269ms)
    ✔ demotes the periodic heartbeat log to verbose on a TTY (433.533002ms)
    ✔ still emits the periodic heartbeat at verbose on a TTY (419.938285ms)
  ✔ end-to-end status via the real opencode stream parser (2398.117501ms)
✔ Runner terminal status (4799.208087ms)
▶ Runner test modification gating
  ✔ RunTaskFailureReason includes undeclared_test_change (30.463771ms)
  ✔ records preexisting tests before spawn: a deletion is detected (122.810977ms)
  ✔ a modified preexisting test writes the dead marker and dead event, and skips verify (118.993592ms)
  ✔ creating a brand new test file without tests.modify proceeds to verify (165.259899ms)
  ✔ tests.modify: true permits editing a preexisting test file in resolved scope (156.502786ms)
  ✔ tests.modify: true authorizes an in-scope deletion of a preexisting test (195.451948ms)
  ✔ tests.modify: true still forbids a preexisting test outside the resolved scope (123.945232ms)
  ✔ sorts unauthorized diagnostics by test path and names each required scope entry (145.969114ms)
  ✔ runs the enabled proposal verify after task verification and attributes its event to change (166.677657ms)
  ✔ a failing proposal verify kills the task with change_verify_red and full evidence (165.645059ms)
  ✔ disabling changeVerifyAfterTask skips the proposal verifier and completes (121.580597ms)
  ✔ a failing task verify stays verify_red and never runs the proposal verifier (125.397699ms)
✔ Runner test modification gating (1641.109263ms)
▶ Task Runner and Verification Gate
  ✔ fails with reason: spec_conflict if folder is modified after approval (147.343294ms)
  ✔ fails with reason: no_result if agent exits without writing .run/results/<n>.md (213.137517ms)
  ✔ fails with reason: timeout if agent times out (193.171099ms)
  ✔ fails with reason: verify_red if task verify fails (192.478803ms)
  ✔ fails with reason: verify_red and timed_out: true if task verify hangs (1161.946348ms)
  ✔ succeeds, creates .run/done/<n>, and ticks checkbox on valid task and passing verify (263.410923ms)
✔ Task Runner and Verification Gate (2173.727769ms)
▶ OpenSpec schema execution authority instructions
  ✔ tasks artifact restricts execution to osq watch (20.55208ms)
  ✔ tasks artifact states archiving is osq-owned and never openspec archive (3.533835ms)
  ✔ tasks artifact states checkboxes are a runner-written write-only projection (4.324066ms)
  ✔ apply instruction hands task execution off to osq watch (4.232057ms)
  ✔ config context states execution and archive authority belongs strictly to osq (2.029877ms)
  ✔ config tasks rules forbid direct execution and archive (1.868389ms)
  ✔ schema README documents runtime and archive authority boundaries (1.041929ms)
✔ OpenSpec schema execution authority instructions (39.351533ms)
▶ Resolved scope lint integration
  ✔ warns once when two tasks resolve the same exact file (143.730829ms)
  ✔ warns only for the glob-matched file two tasks share (94.6019ms)
  ✔ emits one warning per stable task pair for a file shared by three tasks (96.322711ms)
  ✔ orders warnings by path within a task pair (83.711793ms)
  ✔ does not self-warn for duplicate declarations inside one task (83.788209ms)
  ✔ never warns for missing exact paths or unmatched globs (75.217737ms)
  ✔ keeps overlap warnings non-failing with independent errors present (89.12843ms)
  ✔ keeps maxScopeFiles counting declared patterns despite resolved overlap (75.151139ms)
  ✔ requires tests.modify for an existing exact test path (77.350335ms)
  ✔ requires tests.modify for a glob matching an existing test file (72.025802ms)
  ✔ permits a missing exact new test path and an unmatched test glob (81.312799ms)
  ✔ exits zero through the lint entrypoint when only overlap warnings exist (80.871623ms)
✔ Resolved scope lint integration (1055.471391ms)
▶ Pre-dispatch scope recertification audit
  ✔ verifies every stale task in one audit and blocks without touching the upcoming task (229.044038ms)
  ✔ does not re-verify or rewrite an already-active regression on a later cycle (183.796645ms)
  ✔ retains the timeout result when detection verification exceeds the configured timeout (1141.093242ms)
  ✔ records differing paths in deterministic sorted order (244.834007ms)
  ✔ leaves manual and malformed done markers outside the audit (307.679021ms)
✔ Pre-dispatch scope recertification audit (2108.284083ms)
▶ Scope recertification attribution
  ✔ attributes a path to a sole later editor with no recorded completion hash (174.079488ms)
  ✔ attributes a path when the current hash agrees with the later completion hash (145.553732ms)
  ✔ records ambiguous when more than one later task named the path (133.160896ms)
  ✔ records unknown when no later task named the path (115.308897ms)
  ✔ records unknown when a sole candidate completion hash contradicts the tree (130.27566ms)
✔ Scope recertification attribution (699.245244ms)
▶ Resolver-versioned completion records
  ✔ writes scope_resolver: 2 on automated completion and leaves timestamp-only markers unchanged (225.553157ms)
  ✔ detects a version-only legacy marker with empty differing paths and resolver-upgrade context (130.037467ms)
  ✔ records differing resolved glob paths alongside the resolver upgrade (125.325915ms)
  ✔ keeps repeated watcher cycles idempotent for an active version regression (115.102971ms)
  ✔ freshly recertifies a version-stale task after explicit retry (289.209859ms)
  ✔ leaves archived markers untouched and does not scan them (124.669912ms)
  ✔ treats wrong and malformed resolver versions as stale while excluding manual markers (155.466051ms)
  ✔ blocks the pre-archive audit for a version-stale completion (133.841232ms)
  ✔ requeues a failed recertification without leaving a canonical done marker (190.239798ms)
✔ Resolver-versioned completion records (1491.684937ms)
▶ Resolver upgrade guidance
  ✔ documents exactly one Upgrading note with the detection and retry contract (1.321049ms)
✔ Resolver upgrade guidance (1.522217ms)
▶ resolveScope
  ✔ resolves an exact path to its readable absolute file path (23.971585ms)
  ✔ retains a missing exact path with a null file path (12.914891ms)
  ✔ expands a segment * within a single directory level (7.298764ms)
  ✔ expands ? to a single non-separator character (4.993769ms)
  ✔ expands ** across nested directories (4.716047ms)
  ✔ expands a trailing-directory form recursively (3.783997ms)
  ✔ deduplicates an exact entry also matched by a glob (3.684359ms)
  ✔ contributes no entry for an unmatched glob (3.639665ms)
  ✔ returns empty for an empty scope (4.394491ms)
  ✔ normalizes ./ prefixes and platform separators (4.028025ms)
  ✔ is independent of declaration order and produces identical bytes (6.362859ms)
  ✔ never resolves outside the project tree (4.192274ms)
  ✔ does not read a file outside the project root when hashing (4.104214ms)
✔ resolveScope (90.295084ms)
▶ computeTaskScopeHash resolver projection
  ✔ keys the aggregate by expanded resolver paths rather than glob text (3.048431ms)
✔ computeTaskScopeHash resolver projection (3.204459ms)
▶ SCOPE_RESOLVER_VERSION
  ✔ exposes resolver version 2 (0.077809ms)
✔ SCOPE_RESOLVER_VERSION (0.138569ms)
▶ linter resolver cut-over
  ✔ removes the legacy glob matcher and its private tree walker (1.847289ms)
✔ linter resolver cut-over (1.956878ms)
▶ invalidation hub ownership and batching
  ✔ creates one watcher for the configured root and closes it idempotently (50.316247ms)
  ✔ classifies change paths by location and treats shared paths as global (17.539794ms)
  ✔ accumulates one debounced batch with sorted unique numeric ids (29.425449ms)
  ✔ uses an empty id list for shared documents and when any path is global (33.282206ms)
  ✔ starts a new debounce window and clears pending state on cancel and close (35.750644ms)
✔ invalidation hub ownership and batching (168.1792ms)
▶ events HTTP transport
  ✔ serves a keep-open framed stream with no-store headers and no CORS (68.546858ms)
  ✔ answers HEAD with matching headers and no stream or body (54.244055ms)
  ✔ fans one batch out to every client and cleans up disconnects idempotently (49.377532ms)
  ✔ clears the timer, ends clients, closes the watcher, then the listener (34.744651ms)
  ✔ closes every created resource when watcher initialization fails (25.273427ms)
  ✔ closes the watcher and rejects once when HTTP startup fails (27.321885ms)
✔ events HTTP transport (260.386759ms)
▶ real chokidar invalidation
  ✔ debounces change writes and emits one event for capability refresh (559.530409ms)
✔ real chokidar invalidation (559.776835ms)
▶ serve configuration and CLI registration
  ✔ parses only integer ports from 0 through 65535 (46.528503ms)
  ✔ registers serve with port and open options (30.345601ms)
error: option '--port <n>' argument '1.5' is invalid. port must be an integer from 0 through 65535
error: option '--port <n>' argument '70000' is invalid. port must be an integer from 0 through 65535
  ✔ rejects an invalid CLI port before dispatching the command (27.940042ms)
  ✔ uses the configured port and lets the CLI port override it (41.612043ms)
  ✔ opens the printed URL once after listening and exposes platform commands (111.431252ms)
  ✔ closes the listener when browser launch fails (29.989844ms)
  ✔ reports EADDRINUSE without printing a URL or leaking a listener (31.071175ms)
✔ serve configuration and CLI registration (320.893228ms)
▶ loopback read-only API
  ✔ binds loopback and returns the exact report with no-store deterministic JSON (133.720843ms)
  ✔ serves the graph document and the read-only inbox without advancing the cursor (96.568102ms)
  ✔ serves a selected change and maps absent and ambiguous selectors (88.878773ms)
  ✔ rejects unsafe and malformed change selectors (40.776514ms)
  ✔ rejects every other method before route lookup with Allow GET, HEAD (43.694882ms)
  ✔ answers HEAD with matching status and headers and no body (105.354258ms)
  ✔ returns JSON failures without terminating the listener (68.064038ms)
  ✔ never mutates project or cursor state for methods and inbox reads (215.05824ms)
  ✔ recomputes every document from current files on each request (119.111594ms)
  ✔ keeps process termination out of core server, static, and config modules (22.669572ms)
  ✔ closes idempotently (36.691524ms)
✔ loopback read-only API (971.971623ms)
▶ static dashboard delivery
  ✔ resolves the package-root ui/dist for tsx and compiled layouts (41.701652ms)
  ✔ serves the index at / and /index.html with a self-only CSP and revalidation (63.488539ms)
  ✔ serves correct content types and caches only fingerprinted assets immutably (110.67086ms)
  ✔ rejects traversal, directory listing, and missing paths without an SPA fallback (84.177197ms)
  ✔ answers HEAD for the index without a body (48.391178ms)
✔ static dashboard delivery (349.333866ms)
▶ AGENTS.md managed block coexistence
  ✔ adds the osq block while preserving an existing OpenSpec block and user notes (14.22853ms)
  ✔ is idempotent across repeated updates and preserves both blocks intact (4.96464ms)
Harness 'mock' setup completed successfully.
Harness 'mock' setup completed successfully.
  ✔ osq setup refreshes AGENTS.md and both blocks survive repeated setup executions (158.179533ms)
✔ AGENTS.md managed block coexistence (178.640988ms)
▶ osq show
  ✔ getSpecDetails resolves change folder across active and archived directories (55.152292ms)
  ✔ getSpecDetails extracts spec metadata, tasks, results, and dead markers (35.891188ms)
  ✔ getSpecDetails parses event timeline from .run/events/<n>.jsonl (30.847213ms)
  ✔ showCommand prints formatted spec inspection with results and events (126.441615ms)
  ✔ formats undeclared_test_change status line and show diagnostic details (91.867391ms)
  ✔ getSpecDetails correlates planning sessions in start order for active and archived changes (48.933951ms)
  ✔ renders Planning Sessions before the event timeline without exposing usage (23.897522ms)
  ✔ lists observed records through the same fields and ordering as owned records (11.328803ms)
  ✔ missing and malformed planning logs leave task details and timeline intact (12.921874ms)
  ✔ CLI registers show <id> command in commander program (9.820281ms)
  ✔ derives ordered recertification rows with attribution from typed events (13.590562ms)
  ✔ derives recertification rows for archived changes (16.888166ms)
  ✔ orders recertification rows by valid timestamp then numeric task and event order (34.270487ms)
  ✔ renders malformed recertification data as unavailable without hiding other output (18.232966ms)
  ✔ renders and labels the Recertifications section only when rows exist (19.329718ms)
  ✔ does not infer recertification history from done marker metadata (32.890016ms)
✔ osq show (585.189861ms)
▶ smoke test error reporting
  ✔ reports a failed test naming the command and zero cancelledByParent when setup fails (758.01132ms)
✔ smoke test error reporting (760.854334ms)
▶ rejected dependency resolution
  ✔ treats a rejected dependency as unmet even when the rejected folder is all-done (59.81037ms)
  ✔ lets an archived dependency satisfy resolution (25.381645ms)
✔ rejected dependency resolution (87.254568ms)
▶ deriveSpecState from in-memory snapshots
  ✔ derives an unapproved spec when no approval hash is present (10.24624ms)
  ✔ derives a ready (pending) spec with a next task from pure data (1.996698ms)
  ✔ is synchronous and never returns a promise (1.091623ms)
  ✔ derives a running spec from the running pid map (1.105877ms)
  ✔ derives a done spec from the done marker set (1.466704ms)
  ✔ derives a dead spec and surfaces the dead reason (0.994279ms)
  ✔ resolves a conflicted task in favor of completion (0.764561ms)
  ✔ reports dead when a conflicted spec mixes done and dead tasks (1.500433ms)
  ✔ derives a blocked spec from unmet dependencies without touching disk (0.967199ms)
  ✔ derives a regressed task and spec from a regressed marker (1.071713ms)
  ✔ prefers a regressed marker over a stale done marker (0.863656ms)
  ✔ derives a regressed spec from a change-level regressed marker (1.656372ms)
  ✔ ignores regressed markers that match no task or the change (2.082327ms)
✔ deriveSpecState from in-memory snapshots (28.116866ms)
▶ State Derivation
  ✔ deriveTaskState correctly determines pending, running, done, and dead states (42.38218ms)
  ✔ deriveSpecState detects unapproved, pending, running, dead, and done states (52.312458ms)
  ✔ deriveSpecState from an in-memory snapshot is synchronous and preserves folderPath (20.001606ms)
✔ State Derivation (115.991021ms)
▶ osq status rejected group
  ✔ discovers rejected folders separately with folder, title, reason, and timestamp (52.227963ms)
  ✔ renders a deterministic Rejected specs group with reason and timestamp (41.782277ms)
  ✔ keeps malformed or missing rejection metadata visible as unavailable (46.126139ms)
  ✔ orders rejected folders deterministically by numeric prefix (23.345179ms)
✔ osq status rejected group (165.088041ms)
▶ osq status
  ✔ getStatusOverview returns all active specs with derived spec and task states (154.39236ms)
  ✔ getStatusOverview returns count of archived change folders (16.247447ms)
  ✔ statusCommand prints formatted status overview with state indicators (318.623239ms)
  ✔ CLI registers status command in commander program (20.292543ms)
  ✔ status output clearly distinguishes pending, running, done, and dead tasks (95.57387ms)
✔ osq status (606.978038ms)
▶ Unrecognised harness stream events
  ✔ opencode routes unrecognised event types to logger.verbose without touching stdout (10.198019ms)
  ✔ opencode stays silent at normal level for unrecognised event types (12.838033ms)
  ✔ opencode does not use console.debug for unrecognised event types (7.305747ms)
  ✔ agy routes unrecognised event types to logger.verbose without touching stdout (4.610474ms)
  ✔ agy routes malformed non-JSON lines to logger.verbose without touching stdout (4.891261ms)
  ✔ agy stays silent at normal level for unrecognised events and malformed lines (3.734027ms)
  ✔ unrecognised events write nothing to the append-only events.jsonl stream (4.339215ms)
✔ Unrecognised harness stream events (49.773516ms)
▶ pinned OpenSpec validator failure gating
  ✔ fails validateWithOpenSpec when the validator binary is missing (18.111482ms)
  ✔ fails validateWithOpenSpec when the validator version drifts (103.198794ms)
  ✔ passes validateWithOpenSpec when the pinned version is installed (127.60395ms)
  ✔ fails osq lint when the validator binary is missing (15.192369ms)
  ✔ fails osq approve when the validator binary is missing (7.385738ms)
  ✔ fails osq lint when the validator version drifts (116.317055ms)
  ✔ fails osq approve when the validator version drifts (65.088141ms)
✔ pinned OpenSpec validator failure gating (454.912316ms)
▶ Build identity resolution
  ✔ returns the package version and a git commit or dist hash (16.019133ms)
  ✔ falls back to the dist hash when git is unavailable (15.837427ms)
  ✔ falls back to unknown when neither git nor dist is present (4.144565ms)
✔ Build identity resolution (37.452757ms)
▶ Runner build identity events
  ✔ records version and commit in the started lifecycle event data (202.732176ms)
✔ Runner build identity events (203.159681ms)
▶ Watcher dev mode
  ✔ builds a worker invocation that runs tsx from src/cli/bin.ts (21.276422ms)
  ✔ delegates to the supervisor only in dev mode outside the worker process (3.719663ms)
  ✔ spawns a tsx worker and watches src/ for changes (4.159283ms)
  ✔ waits for the running task to finish before restarting on a source change (2.448787ms)
  ✔ coalesces repeated source changes into a single pending restart (2.177865ms)
  ✔ terminates the worker on SIGINT and never restarts (4.356162ms)
  ✔ exits non-zero when there is no src/ checkout to run (4.686133ms)
✔ Watcher dev mode (44.535406ms)
▶ Runner heartbeat
  ✔ defaults config.log.heartbeatSeconds to 60 seconds (143.983607ms)
  ✔ computeTaskHeartbeatStats reports elapsed seconds, event count, and total tokens (120.566994ms)
  ✔ computeTaskHeartbeatStats tolerates a missing event file (96.742489ms)
  ✔ logs multiple periodic heartbeat updates with elapsed, events, and tokens (525.425363ms)
  ✔ starts the heartbeat timer unreferenced via unref() (483.446915ms)
  ✔ clears the heartbeat timer in the finally block so it stops on completion (733.303958ms)
✔ Runner heartbeat (2105.215507ms)
▶ Watcher lifecycle modules
  ✔ acquires and releases a task lock through the watcher wrapper (3.048136ms)
  ✔ keeps lock.ts and heartbeat.ts under the 200 line module budget (0.96248ms)
✔ Watcher lifecycle modules (4.257072ms)
▶ Watcher loop permanent logging
  ✔ logs a single pick-up line when an approved spec is detected (297.814872ms)
  ✔ logs a single archive line when a completed spec is archived (218.811024ms)
  ✔ logs a single halt line when a task dies (105.15059ms)
  ✔ logs watcher errors at error level on permanent lines (18.410489ms)
✔ Watcher loop permanent logging (642.089969ms)
▶ Watcher loop symbol formatting
  ✔ resolveSymbol returns unicode when enabled and plain words otherwise (15.218054ms)
  ✔ uses unicode symbols on an interactive TTY (185.272637ms)
  ✔ uses plain words when stderr is not a TTY (170.700284ms)
  ✔ uses plain words when CI is set (152.860786ms)
  ✔ uses plain words when NO_COLOR is present (143.900547ms)
✔ Watcher loop symbol formatting (668.609382ms)
▶ Watcher idle status
  ✔ formats the build prefix, watching path, approved waiting count, and last archived spec (13.229517ms)
  ✔ sets an idle status with the waiting count and last archived spec (197.521862ms)
✔ Watcher idle status (210.963325ms)
▶ Watcher SIGINT handling
  ✔ clears status, restores the cursor, logs waiting, then exits on second SIGINT (147.095291ms)
✔ Watcher SIGINT handling (147.23478ms)
▶ Watcher Preflight Verification
  ✔ Watcher start runs preflight check when harness is opencode (90.928368ms)
  ✔ Preflight executes <bin> --version before any task is picked or spawned (216.393119ms)
  ✔ Missing binary prints single clear line naming bin path and exits non-zero without dispatching tasks (96.39173ms)
  ✔ Failing binary prints single clear line naming bin path and exits non-zero without dispatching tasks (40.897692ms)
  ✔ Missing binary in standalone child process exits non-zero and prints single line to stderr (181.31324ms)
  ✔ Successful execution logs resolved version string and proceeds to task cycle (222.130797ms)
  ✔ preflightOpencode helper resolves binary from config or environment and returns version info (56.14211ms)
✔ Watcher Preflight Verification (906.233019ms)
▶ Watcher stale build preflight
  ✔ exits with code 1 and exactly one stderr line when src/ is newer than dist/ (118.974157ms)
  ✔ exits with code 1 when a checkout has src/ but no dist/ (98.898802ms)
  ✔ continues when allowStale is true even with a stale layout (95.820666ms)
  ✔ continues for an installed package with no src/ directory (99.165338ms)
  ✔ continues when dist/ is newer than src/ (95.861185ms)
✔ Watcher stale build preflight (510.41641ms)
▶ Watcher Loop and CLI
  ✔ runWatcherOnce processes approved specs, executes tasks, and archives on completion (243.996386ms)
  ✔ runWatcherOnce executes multiple tasks sequentially in a multi-task spec without hash conflict and archives (266.037561ms)
  ✔ CLI registers watch and setup commands with expected options (16.693829ms)
✔ Watcher Loop and CLI (528.103096ms)
▶ web data graph nodes
  ✔ reads current capabilities plus active, archived, and rejected changes deterministically (114.704106ms)
  ✔ carries recorded lifecycle metadata and separate observed summaries (49.84781ms)
  ✔ keeps archived and rejected evidence separate and never estimates planning (45.378261ms)
  ✔ emits one deterministic edge per declared relationship (43.367094ms)
✔ web data graph nodes (254.929753ms)
▶ web data change detail
  ✔ resolves a numeric id and exposes task evidence without inference (49.859191ms)
  ✔ distinguishes ambiguous and absent selectors and resolves exact keys (43.204476ms)
  ✔ ignores malformed optional lines and missing history without dropping evidence (41.553435ms)
✔ web data change detail (135.131025ms)
ℹ tests 1244
ℹ suites 272
ℹ pass 1239
ℹ fail 5
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 13084.183512

✖ failing tests:

test at tests/archive-verification.test.ts:16:1252
✖ archives a clean change after re-running every task and change verify (505.974898ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  3 !== 1
  
      at TestContext.<anonymous> (/home/mathias/projects/osq/tests/archive-verification.test.ts:194:12)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 3,
    expected: 1,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at tests/archive-verification.test.ts:16:3874
✖ blocks archiving when the change-level verify fails (218.283611ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  false !== true
  
      at TestContext.<anonymous> (/home/mathias/projects/osq/tests/archive-verification.test.ts:237:12)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at tests/archive-verification.test.ts:16:4992
✖ halts archival and records final-task drift before the archive verifier runs (528.272388ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  3 !== 0
  
      at TestContext.<anonymous> (/home/mathias/projects/osq/tests/archive-verification.test.ts:317:12)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 3,
    expected: 0,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at tests/archive-verification.test.ts:16:10376
✖ leaves the transient plan-prompt.md in place when archive verification fails (214.403865ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  false !== true
  
      at TestContext.<anonymous> (/home/mathias/projects/osq/tests/archive-verification.test.ts:400:12)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at tests/plan-prompt-lifecycle.test.ts:33:5433
✖ failing archive verification leaves the active prompt untouched (220.920126ms)
  AssertionError [ERR_ASSERTION]: {"success":false,"reason":"change_verify_red","error":"Process exited with code 1"}
  
  false !== true
  
      at runSingleTask (/home/mathias/projects/osq/tests/plan-prompt-lifecycle.test.ts:198:12)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/plan-prompt-lifecycle.test.ts:286:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }
 ELIFECYCLE  Test failed. See above for more details.
 ELIFECYCLE  Command failed with exit code 1.
