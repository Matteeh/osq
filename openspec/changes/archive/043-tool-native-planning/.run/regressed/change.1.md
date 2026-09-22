---
reason: verify_red
command: "pnpm verify"
exit_code: 1
---
Archive-time change-level verification failed.
> @matteeh/osq@0.1.0 verify /home/mathias/projects/osq
> pnpm tsc --noEmit && pnpm test && pnpm lint


> @matteeh/osq@0.1.0 test /home/mathias/projects/osq
> node --import tsx --test 'tests/**/*.test.ts'

▶ ADR 004: Pinned OpenSpec Validator
  ✔ records the accepted decision for the pinned validator (6.825739ms)
  ✔ defines the exact dependency pin, binary path, and peer range (1.579971ms)
  ✔ documents validation execution semantics (0.88495ms)
  ✔ defines doctor diagnostic verification and drift reporting semantics (0.85434ms)
  ✔ is indexed from the decisions README (0.687602ms)
✔ ADR 004: Pinned OpenSpec Validator (12.271915ms)
▶ Agy stream-json event translation
  ✔ buildAgyArgs adds --output-format stream-json to the arguments (37.437076ms)
  ✔ extracts token usage from step_update usage fields (10.072453ms)
  ✔ defaults missing usage fields and derives total from input plus output (13.027113ms)
  ✔ appends a tokens event for a step_update with usage (24.653786ms)
  ✔ extracts tool name and command/path summaries from step_update tool steps (23.106781ms)
  ✔ appends a tool event and logs it at verbose level from the shared handler (15.611439ms)
  ✔ persists the tool event while suppressing the verbose log at normal level (32.719602ms)
  ✔ parses fixture/agy-events.jsonl lines and emits a single tokens event (73.223915ms)
  ✔ falls back gracefully when stdout is plain text without valid JSON (32.157586ms)
[agy] Unknown event type: init
  ✔ translates stream events through the adapter spawn path with the shared logger (73.610914ms)
✔ Agy stream-json event translation (338.624763ms)
▶ osq approve
  ✔ findSpecFolder resolves spec folder by ID, padded number, or prefix (59.49722ms)
  ✔ approveSpec lints, hashes, and writes .run/approved for valid spec (190.872566ms)
  ✔ approveSpec rejects spec failing lint and does not write approved marker (121.031097ms)
  ✔ re-approves an existing spec after modifications (232.978688ms)
✔ osq approve (605.915084ms)
▶ archive-time verification
  ✔ extracts a proposal verify command into SpecData (47.34399ms)
  ✔ archives a clean change after re-running every task and change verify (579.837446ms)
  ✔ refuses task 2 before spawning when an earlier done scope was modified (270.204178ms)
  ✔ blocks archiving when the change-level verify fails (399.674154ms)
  ✔ halts archival and records final-task drift before the archive verifier runs (412.844608ms)
  ✔ records every stale done task in one archive audit without stopping at the first (423.422083ms)
  ✔ repeatedly halts without adding verification, marker, or event duplicates (366.602486ms)
  ✔ removes the transient plan-prompt.md from a successful archive (237.961203ms)
  ✔ leaves the transient plan-prompt.md in place when archive verification fails (294.881055ms)
✔ archive-time verification (3035.06022ms)
▶ Archiver and Delta Application
  ✔ applyOpenSpecDeltas creates and then updates capability specs from delta specs (47.238351ms)
  ✔ archiveSpecFolder moves spec folder whole to archive preserving .run markers (20.759519ms)
  ✔ archiveSpecFolder preserves full .run history including results and event logs (17.429026ms)
  ✔ archiveSpecFolder preserves history by disambiguating if destination already exists (10.473844ms)
  ✔ archiveSpecFolder resolves the destination through a custom openspecRoot (18.846526ms)
  ✔ archiveSpecFolder applies delta specs inside openspec/specs and moves to the OpenSpec archive path (20.61012ms)
  ✔ archiveSpecFolder ensures every archived tasks.md is fully ticked (14.605546ms)
  ✔ archiveSpecFolder ticks tasks.md under the canonical archive layout (26.338738ms)
  ✔ archiveSpecFolder appends exactly one archived event to the archived change stream after relocation (35.409958ms)
  ✔ archiveSpecFolder emits no archived event when relocation fails (21.004356ms)
  ✔ checkAndArchiveSpec emits no archived event when change-level verification fails (173.853193ms)
  ✔ checkAndArchiveSpec records change-level verify_ran before the archived event (104.770145ms)
  ✔ checkAndArchiveSpec applies deltas once then archives only when all tasks are marked done (135.110104ms)
✔ Archiver and Delta Application (649.764708ms)
▶ built bin execution
  ✔ preserves the executable shebang after compilation (3.838611ms)
  ✔ generates valid programmatic type declarations (2.213184ms)
  ✔ resolves the package version from package.json at runtime (4.748ms)
  ✔ prints the package.json version when invoked directly from an isolated directory (146.823418ms)
  ✔ prints help with command listings from an isolated directory (140.495721ms)
✔ built bin execution (4133.851989ms)
▶ changelog and release documentation
  ✔ ships a changelog with a 0.1.0 release entry (3.993339ms)
  ✔ summarises the changes from specs 001 through 012 (1.579087ms)
  ✔ documents the release procedure in the README (0.275307ms)
  ✔ lists the exact release commands (0.136898ms)
✔ changelog and release documentation (7.270145ms)
error: option '--reason <text>' argument '   ' is invalid. a non-empty rejection reason is required
error: option '--reason <text>' argument '' is invalid. a non-empty rejection reason is required
error: required option '--reason <text>' not specified
▶ osq CLI
  ✔ configures program metadata and registered commands (3.943929ms)
  ✔ configures new command with required argument <name> (0.536893ms)
  ✔ configures approve command with variadic argument <ids...> (0.422185ms)
  ✔ configures watch command with once option (0.505194ms)
  ✔ configures reject command with required id argument and required reason option (3.083535ms)
  ✔ rejects an empty or whitespace-only reason at the CLI boundary (3.893695ms)
  ✔ requires the reject reason option to be supplied (1.106518ms)
  ✔ gives the root command an action and a --json inbox option (1.061457ms)
  ✔ keeps report --json scoped to the report subcommand (0.647003ms)
✔ osq CLI (17.578781ms)
▶ codex consumer guidance: scaffolded .env.example
  ✔ scaffolds commented Codex selection/binary/model guidance under the agy default (40.36376ms)
  ✔ contains no credentials or secret values (11.842333ms)
  ✔ mirrors the repository .env.example exactly (31.649011ms)
  ✔ preserves a consumer-edited example across repeated scaffolding (23.898438ms)
✔ codex consumer guidance: scaffolded .env.example (109.741955ms)
▶ codex consumer guidance: README
  ✔ lists codex and documents executor and independent planner examples with precedence (3.590279ms)
  ✔ covers installation, authentication, setup, diagnostics, permissions, and scope limits (5.15886ms)
  ✔ covers live smoke, fresh sessions, watcher verification, results, and observed costs (0.90997ms)
✔ codex consumer guidance: README (10.35932ms)
▶ Codex adapter registration, setup, and diagnostics
  ✔ registers the codex harness with a no-op setup that creates no files (96.140992ms)
Harness 'codex' setup completed successfully.
Harness 'codex' setup completed successfully.
  ✔ setupCommand preserves consumer Codex files, foreign blocks, and mixed-harness setup (260.134554ms)
  ✔ doctor probes the same configured Codex binary and reports failures (105.398428ms)
  ✔ buildManifest records the Codex model or default sentinel and configured effort (41.068409ms)
codex-cli 0.0.0-fake
  ✔ preflightCodex resolves CODEX_PATH and returns the version (114.153623ms)
✔ Codex adapter registration, setup, and diagnostics (618.637635ms)
▶ Codex noninteractive execution
  ✔ builds literal argv with sandboxing, approval, model, and effort controls (20.395139ms)
  ✔ names full task context including delta, living specs, prior result, and one-attempt rules (18.237756ms)
  ✔ spawns a fresh fake Codex with correct cwd, env, literal prompt, and translated events (55.570195ms)
  ✔ preserves failure, timeout, and terminal turn.failed diagnostics (1161.398341ms)
✔ Codex noninteractive execution (1256.54628ms)
▶ Codex configuration
  ✔ exports CodexConfig and resolution helpers from the public entry point (10.138967ms)
  ✔ centrally defaults preflight and kill-grace timeouts while preserving old timeout literals (4.928422ms)
  ✔ validateCodex settings via defineConfig and preserve native defaults (1.839775ms)
  ✔ resolves the Codex binary as codex.bin, then CODEX_PATH, then codex (2.325293ms)
  ✔ resolves the Codex model as codex.model, then OSQ_MODEL only for a Codex executor (1.012509ms)
  ✔ resolves effort and harness attribution with a default sentinel (1.252766ms)
  ✔ accepts a Codex planner with a model and rejects planner.agent (1.895978ms)
  ✔ loadConfig merges codex settings and applies OSQ_MODEL only to a Codex executor (239.468196ms)
✔ Codex configuration (264.607595ms)
▶ Codex planner selection
  ✔ uses the explicit planner model and never inherits the executor model (2.099665ms)
  ✔ falls back to the Codex executor and uses the default sentinel with no flag (0.280386ms)
✔ Codex planner selection (3.918535ms)
▶ Codex interactive adapter
  ✔ builds interactive argv with on-request approvals and no exec/JSON/effort flags (0.396645ms)
  ✔ rejects an unsupported agent and propagates spawn failures (334.115134ms)
✔ Codex interactive adapter (335.439778ms)
▶ planCommand with the Codex harness
  ✔ launches the fake interactive executable with inherited stdio and native model defaults (739.59507ms)
  ✔ uses the explicit planner model consistently in brief metadata and argv (630.579958ms)
  ✔ uses an explicit Codex planner without leaking the executor harness model (634.097317ms)
  ✔ propagates nonzero and signal exits from the interactive process (1182.413199ms)
  ✔ reuses an existing change and emits the print prompt without launching Codex (998.508999ms)
✔ planCommand with the Codex harness (4186.386979ms)
▶ Codex stream observations
  ✔ translates completed observations in order without duplicating lifecycle stages (25.187847ms)
  ✔ omits absent optional usage counters and never writes cost (7.855179ms)
  ✔ tolerates malformed and unknown records and flushes an unterminated final record (2.544551ms)
  ✔ relativizes absolute file-change paths to the project root (3.617053ms)
  ✔ treats turn.failed as terminal but a recoverable error followed by success as not terminal (4.144147ms)
✔ Codex stream observations (49.805266ms)
▶ Codex watcher preflight
  ✔ fails before task spawn on a missing, nonzero, or timed-out probe (269.908915ms)
  ✔ probes the configured binary and dispatches an approved task after a successful probe (395.61928ms)
✔ Codex watcher preflight (667.864523ms)
▶ Codex runner outcomes
  ✔ preserves a supplied result and reaches done only after watcher verification (176.864171ms)
  ✔ synthesizes a missing result from the last completed assistant text (214.082867ms)
  ✔ fails with no_result when neither a result file nor final text exists (135.89632ms)
  ✔ fails with verify_red when independent verification fails (182.925783ms)
  ✔ records crashed for a terminal turn.failed even when the process exits zero (141.158239ms)
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
    "avgMs": 27,
    "avgSeconds": 0,
    "formattedAvg": "0s",
    "formattedTotal": "0s",
    "totalMs": 27,
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
          "medianDurationSeconds": 0.06,
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
              "medianDurationSeconds": 0.06,
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
  ✔ reportCommand JSON consumes normalized usage and file events without double counting (180.376297ms)
✔ Codex runner outcomes (1032.689211ms)
▶ catalog-driven planner validation
  ✔ accepts every catalogued harness with any supported casing and normalizes the name (1.343625ms)
  ✔ retains the required non-empty planner model (0.345466ms)
  ✔ rejects uncatalogued harnesses naming the catalog entries (0.308517ms)
  ✔ rejects optional settings unsupported by the selected harness, naming harness and setting (1.062003ms)
  ✔ rejects malformed optional settings before harness-specific checks (0.178518ms)
✔ catalog-driven planner validation (4.552058ms)
▶ catalog-driven planner selection
  ✔ uses explicit planner values and the supported default agent (0.706772ms)
  ✔ never leaks executor effort or cross-harness defaults into an explicit planner (0.342536ms)
  ✔ falls back to the selected executor catalog entry with native attribution (0.544653ms)
  ✔ uses planner values for a mixed harness selection without executor leakage (0.344176ms)
✔ catalog-driven planner selection (2.467011ms)
▶ planner configuration integration and exports
  ✔ keeps defineConfig planner validation wired to the catalog (0.79617ms)
  ✔ exposes catalog planner helpers through the public entry point (0.122308ms)
✔ planner configuration integration and exports (1.063098ms)
▶ planner configuration and manifest attribution
  ✔ defineConfig accepts valid planner configurations (17.98556ms)
  ✔ defineConfig rejects invalid planner configurations (1.653586ms)
  ✔ loadConfig loads planner block from config file (247.370267ms)
  ✔ never populates manifest.planner from configuration alone (36.627213ms)
✔ planner configuration and manifest attribution (305.602464ms)
▶ queue configuration
  ✔ accepts a complete finite non-negative queue block (17.24566ms)
  ✔ leaves queue absent and invents no default ceilings (4.311619ms)
  ✔ rejects a partial queue block because both ceilings are required together (2.756108ms)
  ✔ rejects string, negative, NaN, and infinite values clearly (1.974468ms)
  ✔ rejects a non-object queue block (1.158847ms)
  ✔ loads a queue block from osq.config.ts (192.727679ms)
  ✔ exposes QueueConfig through the public package surface (8.311604ms)
✔ queue configuration (231.653816ms)
▶ OsqConfig
  ✔ provides specification-compliant default limits, paths, and timeouts (11.548506ms)
  ✔ allows overriding specific limits while retaining default paths and timeouts (3.275612ms)
  ✔ loadConfig returns DEFAULT_CONFIG if no config file exists (6.25677ms)
  ✔ loadConfig reads .env and loads osq.config.ts (223.751458ms)
✔ OsqConfig (246.534847ms)
▶ Layout cut-over
  ✔ switches DEFAULT_CONFIG paths to the openspec layout (61.91568ms)
  ✔ monitors openspec/changes for approved change folders (333.198437ms)
  ✔ does not pick up change folders left in the legacy specs/ directory (20.576399ms)
  ✔ prints the Human steps outcome after the change completes (247.792089ms)
  ✔ never moves the legacy layout itself while cutting the runtime over (262.860222ms)
  ✔ removes obsolete legacy path identifiers from the runtime units (32.384725ms)
  ✔ extracts a Human steps section from a change document (22.111392ms)
✔ Layout cut-over (982.91535ms)
▶ Failure marker retention across approval and retry
  ✔ leaves active dead and regressed markers untouched when approval re-seals (400.451768ms)
  ✔ retains dead/1.1.md alongside done/1 after an explicit retry and successful rerun (328.243119ms)
  ✔ preserves an active dead marker when a task succeeds without re-approval (162.555879ms)
✔ Failure marker retention across approval and retry (893.527499ms)
▶ Delta merge engine
  ✔ parseDelta extracts ADDED, MODIFIED, REMOVED, and RENAMED blocks (3.099954ms)
  ✔ parseDelta returns empty operations for a delta with no requirement sections (0.391045ms)
  ✔ requirement parser extracts requirement names and scenario WHEN/THEN bullets (0.529653ms)
  ✔ merges operations in strict RENAMED -> REMOVED -> MODIFIED -> ADDED sequence (0.759071ms)
  ✔ applies RENAMED before REMOVED and MODIFIED (3.34916ms)
  ✔ throws a deterministic error when a MODIFIED target is missing (0.578623ms)
  ✔ throws a deterministic error when a REMOVED target is missing (0.499004ms)
  ✔ creates a new capability spec from the delta Purpose when no base exists (0.401755ms)
  ✔ golden-file test asserts byte-for-byte exact rebuilding across all four operations (0.487234ms)
✔ Delta merge engine (11.727752ms)
▶ Archiver OpenSpec delta application
  ✔ applyOpenSpecDeltas creates and then updates capability specs from delta specs (30.779213ms)
  ✔ applyOpenSpecDeltas ignores change folders without OpenSpec delta specs (3.40905ms)
✔ Archiver OpenSpec delta application (34.708698ms)
▶ Baseline living capability code ownership
  ✔ parses all five capability delta specs without syntax errors (25.857289ms)
  ✔ cleanly appends the Code ownership requirement to a base spec with existing requirements (0.357216ms)
  ✔ deterministically merges each delta into a valid spec containing the ownership globs (32.216894ms)
  ✔ applies all five deltas into a living OpenSpec root declaring Code ownership (33.987517ms)
✔ Baseline living capability code ownership (92.89571ms)
▶ runDoctorChecks
  ✔ passes all checks for a healthy repository (1583.532961ms)
  ✔ passes the validator check with the pinned version (14.298103ms)
  ✔ fails the validator check on version drift (13.103607ms)
  ✔ fails the validator check when the binary is unavailable (11.24959ms)
  ✔ fails the config check when config properties are invalid (720.284979ms)
  ✔ fails the config check when the loader throws (679.728461ms)
  ✔ fails the config check when openspecRoot is not a string (613.847222ms)
  ✔ fails the harness check when the configured binary is unavailable (474.780349ms)
  ✔ fails the managed-blocks check when PLANNER.md lacks a managed block (412.166152ms)
  ✔ fails the managed-blocks check on a partial marker pair (453.423508ms)
  ✔ fails the managed-blocks check when AGENTS.md has no managed block (436.148433ms)
  ✔ fails the managed-blocks check when the Claude command is missing (422.524349ms)
  ✔ fails the managed-blocks check when the Claude command is stale (419.506532ms)
  ✔ fails the managed-blocks check on duplicate managed blocks (466.20909ms)
  ✔ fails the managed-blocks check on reversed markers (399.925461ms)
  ✔ scaffoldProject repairs drifted managed blocks without disturbing foreign content (33.522744ms)
  ✔ fails the locks check when an orphaned lock exists (499.445021ms)
  ✔ passes the locks check when the recorded pid is alive (456.052582ms)
  ✔ fails the archives check when an archived change is corrupt (374.014656ms)
  ✔ passes the archives check when archived changes are complete (374.126255ms)
  ✔ ignores legacy specs/archive contents when checking canonical archives (374.623238ms)
  ✔ fails the done-markers check when a marker lacks valid frontmatter (23.703864ms)
  ✔ passes the done-markers check for automated and manual markers (22.313061ms)
  ✔ fails the done-markers check when a manual marker has no reason (32.816158ms)
  ✔ ignores archived done markers when checking active changes (23.348378ms)
✔ runDoctorChecks (9338.790291ms)
▶ doctorCommand
  ✔ prints one line per check and exits non-zero only on failure (78.575204ms)
✔ doctorCommand (78.86999ms)
▶ active repository checkout
  ✔ passes all checks on the osq repository itself (1065.088502ms)
✔ active repository checkout (1065.378228ms)
▶ osq done command registration
  ✔ registers done <id> <task> with a required --manual option (3.066985ms)
✔ osq done command registration (3.951874ms)
Marked task 3 of 001-manual-done done (manual)
  Reason: flaky network in CI
▶ manual task completion
  ✔ writes manual frontmatter, appends a done_manual event, and ticks the checkbox (70.195913ms)
  ✔ refuses to mark a task that does not exist (10.902294ms)
  ✔ requires a non-empty manual reason (12.01504ms)
✔ manual task completion (93.775429ms)
▶ report manual vs verified accounting
  ▶ active specs
    ✔ counts verified and manual completions separately (63.47276ms)
  ✔ active specs (64.055834ms)
  ▶ archived specs
    ✔ counts manual done markers as manual (22.348676ms)
  ✔ archived specs (22.738372ms)
✔ report manual vs verified accounting (87.140922ms)
▶ Golden event streams
  ✔ normalizes timestamps, pids, versions, and project paths to stable tokens (52.252501ms)
  ✔ masks verify_ran duration to zero while preserving exit code and command (21.835431ms)
  ✔ masks measures scope hashes to stable tokens (17.032498ms)
  ✔ matches the checked-in golden events for a verified task (108.929499ms)
  ✔ matches the checked-in golden events for a dead task (117.811235ms)
✔ Golden event streams (319.769981ms)
▶ generic harness consumer architecture
  ✔ detects synthetic harness branches and ignores comments and prose (4.131722ms)
  ✔ covers every generic consumer and derives forbidden names from the catalog (11.034285ms)
  ✔ contains no harness-name comparisons or cross-harness fallbacks (23.371187ms)
✔ generic harness consumer architecture (41.262729ms)
▶ harness capability catalog
  ✔ contains every supported harness exactly once in ordered available names (1.547332ms)
  ✔ normalizes lookup across supported casing and reports catalog names when unknown (0.700262ms)
  ✔ resolves each harness executable through catalog metadata (0.440865ms)
  ✔ derives executor identity only from the selected harness, with a default sentinel (0.577353ms)
  ✔ declares planner-agent capability and native attribution per catalog entry (0.209118ms)
  ✔ keeps adapter factories at runtime parity with catalog names (0.249418ms)
  ✔ exposes the catalog through the public configuration entry point (0.142738ms)
✔ harness capability catalog (5.157609ms)
▶ doctor harness diagnostics resolve through the catalog
  ✔ probes each external executable and passes a no-binary harness without a process (177.363595ms)
  ✔ reports missing, nonzero, and timeout probes as failing harness checks (1071.838815ms)
  ✔ prints the harness result through the doctorCommand output contract (283.765931ms)
✔ doctor harness diagnostics resolve through the catalog (1534.394894ms)
▶ approval manifest uses the shared executor identity
  ✔ records the selected harness model or default and applicable effort (63.803118ms)
  ✔ never borrows manifest.planner from configuration or the executor identity (22.347969ms)
  ✔ attributes manifest.planner only from a recorded planning session (22.089044ms)
  ✔ approveSpec writes the same identity through the real approval path (114.803895ms)
✔ approval manifest uses the shared executor identity (223.691399ms)
▶ watcher preflight uses the adapter port
  ✔ invokes a supplied preflight and continues when the port is absent (46.742947ms)
  ✔ does not probe a catalogued no-binary harness even when a preflight is supplied (30.550345ms)
  ✔ probes the resolved opencode and codex executables before the first cycle (89.606538ms)
✔ watcher preflight uses the adapter port (167.394474ms)
▶ task started events use the shared executor identity
  ✔ records the selected harness and its model for agy, opencode, mock, and codex (614.381705ms)
✔ task started events use the shared executor identity (614.681471ms)
Created spec 001: 001-explicit-plan
  Path: /tmp/osq-generic-plan-65fcVK/openspec/changes/001-explicit-plan
▶ planCommand uses the shared planner selection
  ✔ uses explicit planner values in brief metadata and interactive arguments (72.861567ms)
Created spec 001: 001-implicit-agy
  Path: /tmp/osq-generic-plan-OnqL7s/openspec/changes/001-implicit-agy
Created spec 002: 002-implicit-opencode
  Path: /tmp/osq-generic-plan-OnqL7s/openspec/changes/002-implicit-opencode
Created spec 003: 003-implicit-mock
  Path: /tmp/osq-generic-plan-OnqL7s/openspec/changes/003-implicit-mock
  ✔ falls back to the selected executor entry when no planner block exists (121.860379ms)
Created spec 001: 001-implicit-codex
  Path: /tmp/osq-generic-plan-0kNrlh/openspec/changes/001-implicit-codex
Created spec 002: 002-mixed-codex-plan
  Path: /tmp/osq-generic-plan-0kNrlh/openspec/changes/002-mixed-codex-plan
  ✔ records default and passes no invented model for native Codex planning (67.904821ms)
✔ planCommand uses the shared planner selection (263.036093ms)
▶ HarnessAdapter spawnInteractive
  ✔ OpencodeAdapter spawns fake binary with expected argv and returns exit code (61.667483ms)
  ✔ AgyAdapter spawns fake binary with expected -i argv and returns exit code (72.212187ms)
  ✔ OpencodeAdapter inherits child stdout and stderr without capturing them (307.943223ms)
  ✔ AgyAdapter inherits child stdout and stderr without capturing them (250.944502ms)
  ✔ MockAdapter records interactive spawns and returns configured exit code (5.999841ms)
✔ HarnessAdapter spawnInteractive (700.511276ms)
▶ Shared Process Execution and Timeout Helper
  ✔ spawnWithTimeout executes child process with given command, args, cwd, and environment (59.773096ms)
  ✔ spawnWithTimeout terminates process with SIGTERM when execution exceeds timeoutSeconds (1007.585602ms)
  ✖ spawnWithTimeout forces SIGKILL after 5000ms grace period if SIGTERM fails to terminate (49.106108ms)
  ✔ spawnWithTimeout marks timedOut true and returns non-zero exit code on timeout (1005.874075ms)
  ✔ AgyAdapter uses spawnWithTimeout helper preserving existing timeout behavior (1033.33772ms)
✖ Shared Process Execution and Timeout Helper (3157.602199ms)
▶ Harness capability rule prompt injection
  ✔ extractCapabilityRules reads delta specs under specs/<capability>/spec.md (34.584328ms)
  ✔ extractCapabilityRules returns an empty array when no delta specs exist (5.650343ms)
  ✔ buildAgyPrompt injects capabilityRules under a dedicated section in Rules (5.806092ms)
  ✔ buildOpencodePrompt injects capabilityRules under the same dedicated section in Rules (3.090389ms)
  ✔ builds standard default rules without empty headers when capability rules are absent (5.537422ms)
  ✔ treats an explicit empty capabilityRules array as no capability rules (3.383441ms)
  ✔ derives capability rules from the change folder when capabilityRules is absent (3.744636ms)
  ✔ renders one prior-context section naming attempt, failure reason, and prior result (3.46959ms)
  ✔ omits the prior-context section on a fresh first attempt without a prior result (1.878168ms)
  ✔ treats an explicit prior result as prior context even before a retry (1.407944ms)
  ✔ renders a failed verification output block inside the prior context (2.430432ms)
  ✔ bounds an oversized prior failure output deterministically (1.589822ms)
  ✔ renders the same failed-output block in every textual prompt (2.338733ms)
✔ Harness capability rule prompt injection (77.439799ms)
▶ shared harness stream helpers
  ▶ asRecord
    ✔ returns a plain object unchanged (2.201393ms)
    ✔ returns undefined for arrays, null, undefined, and primitives (0.186528ms)
  ✔ asRecord (3.899515ms)
  ▶ firstNonEmptyString
    ✔ returns the first non-empty string and skips empty or non-string values (0.39086ms)
    ✔ returns undefined when no candidate is a non-empty string (0.160078ms)
  ✔ firstNonEmptyString (0.834085ms)
  ▶ resolveEventTimestamp
    ✔ normalizes string timestamps to ISO form (0.757661ms)
    ✔ normalizes numeric epoch timestamps to ISO form (0.151148ms)
    ✔ falls back to a nested step_update timestamp (0.347776ms)
    ✔ returns the current time for missing or invalid timestamps (0.752822ms)
  ✔ resolveEventTimestamp (2.522581ms)
  ▶ EventStreamParser
    ✔ reassembles lines split across chunks and flushes the trailing partial line (1.554562ms)
    ✔ skips empty and whitespace-only lines (0.318916ms)
    ✔ awaits handlers serially in arrival order (18.341828ms)
    ✔ continues after a handler rejects and still resolves flush (0.607007ms)
    ✔ flushes an unterminated final line exactly once across repeated feeds (0.191225ms)
  ✔ EventStreamParser (21.412462ms)
✔ shared harness stream helpers (29.402995ms)
▶ Harness Adapter and Event Logging
  ✔ appendHarnessEvent appends valid JSONL events to .run/events/<n>.jsonl (58.285097ms)
  ✔ MockAdapter setup and spawn simulates task execution and emits events (61.220449ms)
  ✔ AgyAdapter initializes with correct name and can perform setup (15.880557ms)
  ✔ getHarnessAdapter resolves registered adapters and rejects unknown names (19.486142ms)
  ✔ AgyAdapter includes --print-timeout <n>s in args based on config timeouts (10.32907ms)
✔ Harness Adapter and Event Logging (167.579601ms)
▶ Folder Hasher
  ✔ produces deterministic SHA-256 hash for identical folder contents (76.578277ms)
  ✔ ignores .run directory and its marker files completely (20.121209ms)
  ✔ normalizeTasksMd normalizes checked boxes to unchecked boxes (12.590974ms)
  ✔ ticking a task checkbox in tasks.md produces identical hash (33.148668ms)
  ✔ deleting or modifying a task line in tasks.md changes the hash (24.24676ms)
  ✔ changes hash when any task or spec file is modified (25.968836ms)
  ✔ normalizes CRLF and LF to yield identical hashes across platforms (18.861956ms)
  ✔ verifyFolderHash returns true if and only if folder hash matches approved hash (18.994052ms)
  ✔ ignores additions, edits, and removals of the root plan-prompt.md (16.916255ms)
  ✔ covers a nested plan-prompt.md as authored content (25.67715ms)
✔ Folder Hasher (275.486081ms)
▶ import graph boundaries
  ✔ WatchCommandOptions is declared in src/watcher/dev.ts (8.860382ms)
  ✔ src/cli/watch.ts imports WatchCommandOptions from src/watcher/dev.ts (1.65287ms)
  ✔ src/core imports only from src/core (73.882411ms)
  ✔ src/harness imports from neither src/watcher nor src/cli (66.246671ms)
  ✔ src/watcher imports from no module in src/cli (51.300484ms)
  ✔ has zero import violations overall (46.472149ms)
✔ import graph boundaries (250.728191ms)
▶ runner lifecycle module line budget
  ✔ keeps every runner lifecycle module strictly under 200 lines (2.898147ms)
✔ runner lifecycle module line budget (3.549718ms)
▶ inbox needs-you projection
  ✔ projects every attention kind once in change/task order with exact commands (96.149387ms)
  ✔ ignores a change without proposal.md (9.53139ms)
✔ inbox needs-you projection (107.136994ms)
▶ inbox running projection
  ✔ includes only derived running tasks whose parsed lock PID is live and leaves markers (11.195601ms)
  ✔ omits malformed or non-finite locks without creating a running item (17.885313ms)
✔ inbox running projection (29.612937ms)
▶ inbox landed projection and cursor
  ✔ selects strictly later archives with a valid cursor and newest ten otherwise (77.4224ms)
  ✔ keys the cursor by sha256(realpath) and tolerates missing, malformed, or invalid content (7.037858ms)
✔ inbox landed projection and cursor (85.101811ms)
▶ inbox text and JSON contract
  ✔ collapses a completely empty inbox to exactly Inbox empty. (2.864071ms)
  ✔ renders all groups with one (none) line per empty group and command-terminated rows (9.249979ms)
  ✔ exposes exactly the documented JSON keys and value types (9.279686ms)
✔ inbox text and JSON contract (22.004278ms)
▶ bare osq CLI inbox integration
  ✔ renders text, advances and deletes the cursor, caps fallback at ten, and preserves change folders (1527.033884ms)
  ✔ emits exactly the documented JSON object for --json (791.348924ms)
  ✔ materializes the missing runtime lock directory from clean tracked fixture state (653.373047ms)
  ✔ prints exactly Inbox empty. for an empty project (345.071888ms)
  ✔ keeps explicit status complete and report --json scoped without advancing the cursor (1178.863762ms)
✔ bare osq CLI inbox integration (4496.378072ms)
▶ osq init PLANNER.md
  ✔ creates PLANNER.md with the managed block when missing (12.243407ms)
  ✔ replaces the managed block while preserving content outside the markers (3.910198ms)
  ✔ appends the managed block when markers are absent (2.803808ms)
  ✔ managed block instructs planners to write files with the file tool (1.142237ms)
  ✔ managed block states the handoff read, write-boundary, lint, and no-approval rules (0.927149ms)
  ✔ managed block encodes the slicing rule (2.959837ms)
  ✔ managed block encodes the detail rule (0.717542ms)
  ✔ managed block encodes the change-level verify rule (0.648683ms)
  ✔ managed block requires final-tree verification inside the Tasks guidance (1.179731ms)
  ✔ managed block requires ordered shared-file ownership inside the Tasks guidance (1.544762ms)
  ✔ repository PLANNER.md carries the file-tool instruction (1.869879ms)
  ✔ scaffoldProject initializes PLANNER.md and reports it on InitResult (17.368148ms)
  ✔ PLANNER.md, MANAGED_PLANNER_BLOCK, and templates/PLANNER.md are byte-for-byte equal (1.442088ms)
✔ osq init PLANNER.md (51.11693ms)
▶ planning consumer guidance
  ✔ describes prompt handoff, explicit session, print mode, and entry points (7.158141ms)
  ✔ describes approval observation and planning-tool-owned model choice (2.314017ms)
  ✔ generates a config with no required planner model (21.009616ms)
✔ planning consumer guidance (31.936708ms)
▶ osq init
  ✔ scaffolds only the OpenSpec layout and default files in a fresh repo (38.302116ms)
  ✔ does not create legacy specs/ or specs/_template/ during initialization (13.492132ms)
  ✔ does not overwrite existing osq.config.ts (15.718997ms)
  ✔ creates AGENTS.md with the managed block if missing (2.474201ms)
  ✔ managed AGENTS block carries the planning entry point without weakening the executor protocol (3.223688ms)
  ✔ managed block is clean, self-contained, and contains no self-referential repo text (2.604905ms)
  ✔ injects or updates the managed block in an existing AGENTS.md idempotently (5.517786ms)
  ✔ scaffolds openspec/config.yaml declaring the osq schema and per-artifact rules (28.158212ms)
  ✔ scaffolds openspec/schemas/osq/schema.yaml forked from spec-driven without design (28.095915ms)
  ✔ schema README documents tasks/<n>.md as an osq-specific execution unit (18.775873ms)
  ✔ refreshes the managed AGENTS.md block with OpenSpec layout instructions (2.897783ms)
  ✔ is strictly idempotent and preserves existing OpenSpec configuration (33.709632ms)
  ✔ creates the Claude plan command and classifies it in InitResult (19.335691ms)
  ✔ refreshes a stale Claude command while preserving surrounding content (11.642895ms)
  ✔ does not rewrite existing config, environment, schema, or unrelated files (21.08255ms)
✔ osq init (247.909881ms)
▶ instruction-shaped delta linting
  ✔ rejects a requirement named with "Update" (125.094975ms)
  ✔ rejects a requirement named with "Document" (124.750339ms)
  ✔ rejects instruction-shaped names case-insensitively (89.769698ms)
  ✔ names the capability and requirement title in the error (95.910093ms)
  ✔ inspects MODIFIED and REMOVED requirement sections (86.017651ms)
  ✔ accepts declarative delta requirements with zero errors (93.271065ms)
  ✔ prevents approval of a change folder with an instruction-shaped delta (81.263029ms)
✔ instruction-shaped delta linting (698.058498ms)
▶ layout path derivation
  ✔ derives the changes directory from a relative openspecRoot (1.260345ms)
  ✔ derives the changes directory from an absolute openspecRoot (0.183897ms)
  ✔ prepends an optional project root (0.165708ms)
  ✔ derives the archive directory from openspecRoot (0.192408ms)
  ✔ derives the specs directory from openspecRoot (1.444349ms)
  ✔ derives change-local directories from the change folder (0.180488ms)
  ✔ derives done, dead, and event artifact paths (0.235298ms)
  ✔ anchors absolute change folders without rebasing them (0.204468ms)
  ✔ derives deterministically and tracks the configured root (0.343356ms)
  ✔ keeps the layout module under 200 lines (10.948022ms)
✔ layout path derivation (17.145595ms)
▶ source line budget
  ✔ keeps every non-allow-listed source file at or under 250 lines (53.059784ms)
✔ source line budget (54.683805ms)
▶ Spec Linter
  ✔ passes a clean, compliant spec (176.501124ms)
  ✔ rejects a proposal declaring features.writes in frontmatter (72.172112ms)
  ✔ rejects more than one table under Contract (79.409506ms)
  ✔ rejects verify command that chains commands (91.550835ms)
  ✔ rejects depends_on naming a missing change (107.153354ms)
  ✔ accepts depends_on naming a change that lives in the archive (95.44758ms)
  ✔ accepts depends_on naming a change that lives in the rejected directory (104.804426ms)
  ✔ rejects acceptance checklist longer than maxAcceptanceLines (87.584926ms)
  ✔ permits task title containing " and " without warning (84.217525ms)
  ✔ resolves proposal.md as the change document when spec.md is absent (94.538196ms)
  ✔ rejects a change folder missing both proposal.md and spec.md (19.929329ms)
  ✔ rejects a proposal.md lacking a verify command (105.996492ms)
  ✔ accepts a proposal.md declaring a verify command (99.889649ms)
  ✔ rejects a non-boolean nested tests.modify declaration (109.415252ms)
  ✔ rejects a non-boolean flat tests.modify declaration (146.485866ms)
  ✔ accepts a boolean nested tests.modify declaration (116.357609ms)
  ✔ rejects scope touching an existing test file without tests.modify (96.288869ms)
  ✔ rejects a tests/** scope matching an existing test file without tests.modify (147.120494ms)
  ✔ passes a scope touching existing test files when tests.modify is true (102.686218ms)
  ✔ permits scope naming a new test file that does not exist yet (94.452895ms)
  ✔ executes local openspec validate for changes and specs under OPENSPEC_TELEMETRY=0 (109.730565ms)
  ✔ fails closed when no local openspec binary is installed (24.08812ms)
  ✔ parses JSON validation failures and prefixes them with openspec: (111.181716ms)
  ✔ logs the resolved OpenSpec version and does not warn when it matches the pin (97.065572ms)
  ✔ fails when the resolved OpenSpec version differs from the pin (126.855946ms)
  ✔ verifies delta target existence against base specs (125.947745ms)
  ✔ accepts a delta whose modified requirement exists in the base spec (77.785729ms)
  ✔ accepts an added-only delta for a capability with no base spec (86.388012ms)
  ✔ rejects an added delta requirement named with "Update" (115.798212ms)
  ✔ rejects an added delta requirement named with "Document" (114.760106ms)
  ✔ accepts a declarative added delta requirement with zero errors (117.081822ms)
  ✔ rejects the template placeholder in a proposal verify (88.539597ms)
  ✔ rejects the template placeholder in a task verify with one message (134.476077ms)
  ✔ rejects normalized placeholder equivalents (493.433672ms)
  ✔ rejects package-script invocations whose script is absent (565.768251ms)
  ✔ accepts a present package script without a path warning (139.547997ms)
  ✔ warns when a task verify names no path or package script (161.411734ms)
  ✔ warns when a proposal verify names no path or package script (111.316686ms)
  ✔ does not warn when a verify names an existing repository path (155.68772ms)
  ✔ accepts a path-shaped binary that exists (121.083453ms)
  ✔ handles a missing or malformed root package manifest deterministically (181.359081ms)
  ✔ retains the chaining diagnostic without reinterpreting it (103.494717ms)
  ✔ keeps checked-in fixture verification local and free of the placeholder (111.566194ms)
  ✔ registers the lint command in the CLI (51.458411ms)
  ✔ lint command exits non-zero when a change folder fails lint (135.294301ms)
  ✔ lint command exits zero when all change folders are valid (104.176191ms)
  ✔ excludes a root plan-prompt.md from artifact scanning without changing findings (176.374966ms)
  ✔ still scans and rejects a nested plan-prompt.md as authored content (198.776468ms)
✔ Spec Linter (6178.303912ms)
▶ Living spec delta equivalence
  ✔ re-seeds every living spec as the cumulative deterministic merge of 016..027 (165.562074ms)
  ✔ preserves requirements introduced by 017 and 020 through 027 (2.519041ms)
  ✔ contains zero legacy "Delta from" references and no loose spec markdown files (3.408ms)
  ✔ git grep "Delta from" openspec/specs returns zero matches (11.15042ms)
  ✔ deletes the legacy prose appender applyDelta and calls applyOpenSpecDeltas directly (83.488049ms)
✔ Living spec delta equivalence (267.998773ms)
▶ Lock and Reaper
  ✔ acquireLock writes running marker exclusively (12.010662ms)
  ✔ releaseLock removes running marker cleanly (4.580507ms)
  ✔ isPidRunning accurately reports current process and non-existent process (1.938898ms)
  ✔ reapStaleLocks detects a dead pid and unlinks the lock without writing a dead marker (4.176655ms)
  ✔ reapStaleLocks detects an expired lock without writing a dead marker (6.264513ms)
✔ Lock and Reaper (30.924437ms)
▶ logger status interface
  ✔ exposes status(text) and clearStatus() (1.045408ms)
✔ logger status interface (2.651019ms)
▶ logger status on an interactive TTY sink
  ✔ clears the status row, writes the log line, and redraws status below (1.943602ms)
  ✔ prefixes every line of a multi-line log and redraws once below (0.686542ms)
  ✔ starts an unref'd 80ms interval that advances spinner frames (1.146741ms)
  ✔ does not disturb the status row when a message is suppressed by level (1.115067ms)
  ✔ clearStatus() clears the active row and stops the animation timer (0.501934ms)
  ✔ honours the isTTY option override for a non-TTY stream (0.258137ms)
  ✔ truncates an overflowing status to columns minus the spinner prefix, with no prefix (0.379236ms)
  ✔ keeps redrawn rows within the terminal width and clear of ghost characters (0.445505ms)
✔ logger status on an interactive TTY sink (7.184037ms)
▶ logger status in non-interactive sinks
  ✔ is a no-op when isTTY is false and renders no escape sequences (0.393465ms)
  ✔ is a no-op when process.env.CI is set, even on a TTY (0.279257ms)
  ✔ is a no-op at quiet level, even on a TTY (0.277277ms)
✔ logger status in non-interactive sinks (1.195897ms)
▶ createLogger
  ✔ exports createLogger and accepts a LogLevel (1.844693ms)
  ✔ writes exclusively to process.stderr with a bracketed prefix (0.314746ms)
  ✔ writes without a prefix when none is supplied (0.184488ms)
  ✔ prefixes every line of a multi-line message (0.241877ms)
  ✔ quiet level suppresses info and verbose messages but writes warn and error (0.270187ms)
  ✔ normal level outputs info, warn, and error while suppressing verbose (0.198878ms)
  ✔ verbose level outputs info, verbose, warn, and error (0.303697ms)
✔ createLogger (4.68334ms)
▶ watch command verbosity options
  ✔ registers --verbose and -q/--quiet options on watch (2.508501ms)
  ✔ parses --verbose and --quiet into the watch command options (1.022869ms)
✔ watch command verbosity options (4.242491ms)
▶ managed instructions block retired paths
  ▶ MANAGED_AGENTS_MD_BODY
    ✔ does not reference retired features/ paths (0.685702ms)
    ✔ does not reference "drift against features" (0.150648ms)
    ✔ does not reference a legacy root-level specs/ path (0.633503ms)
  ✔ MANAGED_AGENTS_MD_BODY (2.319563ms)
  ▶ AGENTS.md
    ✔ does not reference retired features/ paths (1.236406ms)
    ✔ does not reference "drift against features" (0.120708ms)
    ✔ does not reference a legacy root-level specs/ path (0.249897ms)
  ✔ AGENTS.md (1.904528ms)
✔ managed instructions block retired paths (4.899294ms)
▶ managed instructions block OpenSpec protocol
  ✔ documents the OpenSpec layout, markers, gates, and permissions (0.813061ms)
  ✔ is mirrored by the repository AGENTS.md guidance (0.155458ms)
✔ managed instructions block OpenSpec protocol (1.197156ms)
▶ repository managed instructions
  ✔ AGENTS.md managed block matches the installed constant (13.330206ms)
  ✔ PLANNER.md managed block matches the installed constant (1.013668ms)
  ✔ Claude command managed block matches the installed constant (1.138537ms)
✔ repository managed instructions (15.924406ms)
▶ planner managed block coexistence
  ✔ preserves foreign text and blocks across repeated initialization (6.581904ms)
  ✔ updates only the osq-managed block beside a foreign block (15.575802ms)
  ✔ refreshes only the osq block in the Claude command across repeated init (3.607844ms)
✔ planner managed block coexistence (26.105365ms)
▶ mangled change folder linting
  ✔ accepts clean files containing newlines and tabs (148.283801ms)
  ✔ rejects a nested file containing a bell character (90.20313ms)
  ✔ rejects a backspace character in a task file (96.252067ms)
  ✔ rejects a carriage return in a task file (93.558097ms)
  ✔ rejects a DEL control character in a change file (96.089802ms)
  ✔ ignores prohibited control characters under .run/ (102.575137ms)
  ✔ rejects fused acceptance lines in a task file (72.19227ms)
  ✔ allows a single acceptance item per line (115.630247ms)
  ✔ approveSpec refuses to seal a change folder with a control character (110.80912ms)
✔ mangled change folder linting (928.045633ms)
▶ run manifest
  ✔ writes .run/manifest.json with hashes and metadata on approval (155.553092ms)
  ✔ records null for a hashed file that does not exist (104.23962ms)
  ✔ counts valid plan_started records, including resumed sessions without exits (123.452402ms)
  ✔ tolerates a missing, empty, or partially malformed planning log (265.525612ms)
  ✔ changes planningSessions when only the plan log changes, keeping the approved hash (246.626312ms)
✔ run manifest (897.333286ms)
▶ measures
  ▶ countWords
    ✔ returns 0 for empty and whitespace-only input (20.415665ms)
    ✔ counts single and multiple whitespace-delimited words (2.040513ms)
  ✔ countWords (23.578775ms)
  ▶ gatherScopeCounts
    ✔ counts existing scoped files and their lines, ignoring missing ones (8.996126ms)
    ✔ returns zeros when no scoped file exists (1.162536ms)
    ✔ counts each file a glob resolves and zero for an unmatched glob (6.629693ms)
  ✔ gatherScopeCounts (17.582956ms)
  ▶ gatherRepoCounts
    ✔ totals text files while skipping ignored directories (4.74444ms)
    ✔ skips binary files containing null bytes (2.889032ms)
  ✔ gatherRepoCounts (8.020577ms)
  ▶ countImportFanIn
    ✔ counts non-scoped files that import a scoped file (9.434531ms)
    ✔ returns 0 when only scoped files import each other (4.215341ms)
    ✔ resolves a glob into its real import targets instead of the literal glob text (4.301999ms)
  ✔ countImportFanIn (18.309588ms)
  ▶ countDeltaRequirementsAndScenarios
    ✔ counts requirement and scenario headers across delta specs (7.473446ms)
    ✔ returns zeros when no delta specs exist (1.118804ms)
  ✔ countDeltaRequirementsAndScenarios (8.917135ms)
  ▶ snapshotScopeHashes and hashFileForMeasures
    ✔ hashes known content and returns null for missing files (6.599394ms)
    ✔ hashFileForMeasures returns null for an absent file (1.664114ms)
    ✔ keeps an exact missing path as null and omits unmatched globs (3.391537ms)
  ✔ snapshotScopeHashes and hashFileForMeasures (11.987481ms)
  ▶ gatherEndMeasures
    ✔ counts changed files and absolute line deltas for modified, added, and deleted files (13.750431ms)
    ✔ re-resolves a glob at end so added, modified, and deleted matches are visible (11.474804ms)
    ✔ reports zero changes and equal before/after hashes when scope is untouched (2.131446ms)
    ✔ carries every start-phase field into the end event (0.881739ms)
  ✔ gatherEndMeasures (29.407307ms)
  ▶ emitMeasures
    ✔ appends a measures start event to .run/events/<n>.jsonl (3.614009ms)
    ✔ uses one emission path for both start and end phases (5.310491ms)
  ✔ emitMeasures (9.178128ms)
  ▶ gatherStartMeasures
    ✔ collects scope, repo, word, and delta baselines for a task (21.32749ms)
  ✔ gatherStartMeasures (21.561978ms)
  ▶ runner integration
    ✔ emits start then end measures for a verified task (157.386377ms)
    ✔ reports changed files and lines for a scoped edit (168.227196ms)
    ✔ emits an end measures event for a crashed dead outcome (103.141162ms)
    ✔ emits end measures before the dead event on verify_red (151.647416ms)
  ✔ runner integration (581.291479ms)
✔ measures (731.371374ms)
▶ osq migrate openspec
  ✔ moves features/ to openspec/specs/ and specs/ to openspec/changes/ (75.884126ms)
  ✔ resolves every migration target through the canonical layout helpers (27.015467ms)
  ✔ migrates archived changes to openspec/changes/archive/ preserving .run/ markers (14.692424ms)
  ✔ converts spec.md to proposal.md with frontmatter and preserves prose under ## Delta (legacy) (14.267039ms)
  ✔ ticks every archived tasks.md (including already-checked and real copies) (78.014146ms)
  ✔ migrates fixture and real archived copies passing both validators (131.083793ms)
  ✔ creates the 017 stub change folder under openspec/changes/017-sample/ (20.864391ms)
  ✔ convertSpecToProposal drops features.writes and preserves delta prose (1.536293ms)
  ✔ tickAllCheckboxes ticks only unchecked boxes and preserves structure (1.617481ms)
  ✔ registers the migrate command with a required target argument (3.485135ms)
  ✔ migrate command rejects unsupported targets with a non-zero exit (0.84817ms)
  ✔ migrate command runs the openspec migration and reports a summary (37.199113ms)
✔ osq migrate openspec (409.084883ms)
▶ osq new
  ✔ slugify converts titles to valid kebab-case folder names (38.911947ms)
  ✔ getNextSpecNumber correctly increments existing spec numbers including archive (16.095664ms)
  ✔ createNewSpec generates numbered change folder from template with updated title (16.272491ms)
  ✔ createNewSpec respects options.specsDirName override (25.676255ms)
  ✔ createNewSpec rejects empty or invalid spec names (29.295153ms)
✔ osq new (128.04709ms)
▶ no skipped output in src
  ✔ contains zero case-insensitive occurrences of "skipped" under src/ (63.201231ms)
✔ no skipped output in src (64.689514ms)
▶ OpenCode Configuration and Adapter Registration
  ✔ OsqConfig interface defines opencode config with bin, model, agent, optional variant (9.43641ms)
  ✔ DEFAULT_CONFIG provides opencode defaults bin "opencode", model "deepseek/deepseek-flash", agent "osq-coder" (1.584446ms)
  ✔ OsqUserConfig accepts partial opencode fields and defineConfig merges them over DEFAULT_CONFIG (2.807062ms)
  ✔ DEFAULT_CONFIG defaults log.heartbeatSeconds to 60 and defineConfig preserves it (1.106797ms)
  ✔ loadConfig and defineConfig permit harness setting "opencode" (185.274287ms)
  ✔ getHarnessAdapter resolves "opencode" returning OpencodeAdapter instance (1.260015ms)
  ✔ README documents opencode in harness list with sample configuration block (1.858308ms)
✔ OpenCode Configuration and Adapter Registration (205.172759ms)
▶ OpenCode Event Stream and Token Metrics Translation
  ✔ Stdout JSON lines stream matching fixture/opencode-events.jsonl is parsed line by line (39.90668ms)
  ✔ step_finish event extracts input, output, total, and cache tokens with cost (24.944884ms)
  ✔ tokens event is appended to .run/events/<n>.jsonl with promptTokens, candidateTokens, totalTokens, cachedTokens, cost (88.625713ms)
  ✔ Unknown event types such as step_start and text are logged at verbose level without throwing (18.206606ms)
  ✔ Malformed or unparseable non-JSON stdout lines do not crash the adapter process (33.322712ms)
✔ OpenCode Event Stream and Token Metrics Translation (207.420757ms)
▶ OpencodeAdapter planner agent setup
  ✔ OpencodeAdapter setup writes .opencode/agent/osq-planner.md with expected permissions and body (23.178062ms)
  ✔ Running setup twice leaves .opencode/agent/osq-planner.md byte-identical (7.354234ms)
  ✔ OpencodeAdapter setup respects custom planner agent name in config (8.951086ms)
✔ OpencodeAdapter planner agent setup (41.093562ms)
▶ OpenCode Adapter Setup
  ✔ OpencodeAdapter setup creates directory .opencode/agent/ if absent (23.244969ms)
  ✔ OpencodeAdapter setup writes .opencode/agent/osq-coder.md with description and mode all frontmatter (12.454766ms)
  ✔ Frontmatter permissions allow read, edit, bash, glob, grep, denying webfetch, websearch (7.071558ms)
  ✔ Agent file body contains AGENTS.md task execution procedure enclosed in managed block markers (6.940689ms)
  ✔ Setup is idempotent and preserves user edits outside managed block markers (8.132766ms)
  ✔ README notes --auto flag approves any action the agent file does not deny (1.413298ms)
  ✔ OpencodeAdapter setup respects custom agent name configured in OsqConfig (3.655804ms)
✔ OpenCode Adapter Setup (64.776828ms)
▶ OpenCode Adapter Task Spawning
  ✔ spawnTask constructs arguments: run --agent <agent> --auto --format json --dir <projectRoot> --model <model> (76.032693ms)
  ✔ Optional variant flag --variant <variant> is included when configured (27.757686ms)
  ✔ Attached files include --file <task.md>, --file <spec.md>, --file <featureDoc> for each feature named in task (26.626162ms)
  ✔ Positional prompt argument defines task guidelines matching AGENTS.md protocol (17.529435ms)
  ✔ Fake opencode binary validates passed flags, handles non-zero exit, and respects timeout termination (1126.362683ms)
✔ OpenCode Adapter Task Spawning (1276.490943ms)
▶ OpenCode tool event translation
  ✔ adds 'tool' to HarnessEventType and exposes ToolEventData (38.469244ms)
  ✔ extracts file paths and patterns for read, edit, write, and glob tools (24.695252ms)
  ✔ extracts the first 60 characters of the command for the bash tool (37.122188ms)
  ✔ falls back to 60 characters of JSON for any other tool (16.263553ms)
  ✔ recognizes tool_use top-level and part.type tool-use events (20.423152ms)
  ✔ appends a tool event and logs it at verbose level from the shared handler (22.323844ms)
  ✔ persists the event while suppressing the verbose log at normal level (25.831956ms)
  ✔ recognizes tool_use lines in the stream parser and forwards the logger (11.144155ms)
  ✔ emits tool events through the adapter spawn path with the shared logger (49.974844ms)
✔ OpenCode tool event translation (248.472741ms)
▶ package hygiene
  ✔ packs only distribution assets (974.632913ms)
  ✔ excludes source, tests, configs, workflows, and specs (951.14212ms)
  ✔ declares required package metadata (6.122703ms)
✔ package hygiene (1933.162622ms)
▶ package manager independence
  ✔ never spawns pnpm from any test under tests/ (44.506673ms)
✔ package manager independence (44.836459ms)
▶ packed tarball consumer smoke test
  ✔ packs and installs the local tarball into an isolated temporary project (8251.550535ms)
  ✔ npx osq init scaffolds configuration, template directories, and AGENTS.md (271.899491ms)
  ✔ npx osq new smoke creates a valid change specification (254.058691ms)
✔ packed tarball consumer smoke test (8909.120967ms)
▶ Spec and Task Parser
  ✔ parseFrontmatter extracts YAML metadata and markdown content (9.928165ms)
  ✔ parseSpecMd extracts title, depends_on, reads, and markdown sections (3.333871ms)
  ✔ parseSpecMd extracts proposal frontmatter without requiring features.writes (1.094577ms)
  ✔ parseTaskMd extracts task metadata and acceptance criteria list (0.91481ms)
  ✔ parseTaskMd extracts entry and skills when populated (1.130417ms)
  ✔ parseTaskMd defaults testsModify to false when omitted (0.613023ms)
  ✔ parseTaskMd reads nested tests.modify booleans (0.89553ms)
  ✔ parseTaskMd accepts a flat tests.modify boolean key (0.535844ms)
  ✔ parseTaskMd ignores non-boolean tests.modify values (1.634901ms)
  ✔ parseTaskList parses OpenSpec grouped checklists with section headers and item numbers (1.017968ms)
  ✔ parseTaskList parses flat numbered checklists and unnumbered bullets (0.203537ms)
  ✔ handles empty sections or missing frontmatter safely (0.130298ms)
✔ Spec and Task Parser (22.982903ms)
▶ Code ownership parsing
  ✔ parseCodeOwnership extracts globs from a capability delta spec (0.694162ms)
  ✔ parseCodeOwnership extracts ownership from living markdown content (0.189568ms)
  ✔ parseCodeOwnership returns an empty array when the header is absent (0.069299ms)
✔ Code ownership parsing (1.239856ms)
▶ Change folder proposal resolution
  ✔ parseSpecMdFromFolder parses proposal.md when present with fallback to spec.md (27.029064ms)
  ✔ resolveChangeDoc prefers proposal.md and reports its kind (8.695109ms)
✔ Change folder proposal resolution (36.02863ms)
▶ Rewritten OpenSpec templates
  ✔ proposal template carries proposal frontmatter and delta spec guidance (1.695951ms)
  ✔ tasks template uses the OpenSpec numbered checklist format (1.656512ms)
✔ Rewritten OpenSpec templates (3.541399ms)
▶ osq plan prompt handoff
  ✔ writes a null brief, prompt file, and one-line handoff without a session (272.126455ms)
/tmp/osq-plan-handoff-jA71Fd/openspec/changes/001-exact-bytes: ask your planning tool to plan change 001-exact-bytes
  ✔ stores the exact buildOpeningPrompt bytes in the prompt file (38.577966ms)
  ✔ print mode creates the change and brief but no prompt file, process, or record (36.723594ms)
/tmp/osq-plan-handoff-Eg4GBs/openspec/changes/001-shared-bytes: ask your planning tool to plan change 001-shared-bytes
  ✔ print mode emits the same bytes as the prompt file for a resumed change (35.153187ms)
  ✔ resumed default reuses the folder, keeps the brief, and refreshes the prompt file (44.7063ms)
  ✔ default and print handoff succeed while an unusable planner is configured (39.651613ms)
  ✔ registers --session and rejects session combined with print before mutation (15.897452ms)
✔ osq plan prompt handoff (486.752601ms)
▶ transient plan-prompt lifecycle
  ✔ lint excludes the root prompt while keeping authored diagnostics (324.421192ms)
  ✔ hashChangeFolder ignores prompt add, edit, and removal but covers authored edits (121.366548ms)
  ✔ re-approval after a prompt refresh keeps the same authored seal (166.77659ms)
  ✔ runner conflict checking proceeds when only the prompt changed (174.957191ms)
  ✔ retry integrity proceeds when only the prompt changed (94.918326ms)
  ✔ failing archive verification leaves the active prompt untouched (271.727452ms)
  ✔ successful archive removes the prompt and retains authored and runtime content (276.619394ms)
  ✔ archiving succeeds and stays idempotent when the prompt is already absent (287.541356ms)
  ✔ a delta failure during archive keeps the folder and prompt recoverable (401.692378ms)
✔ transient plan-prompt lifecycle (2124.47915ms)
▶ planning telemetry
  ▶ core planning helpers
    ✔ hashes the exact brief bytes and resolves the package version (27.266932ms)
    ✔ skips malformed lines and correlates sessions defensively (9.394891ms)
    ✔ reads a missing planning log as empty (10.799975ms)
  ✔ core planning helpers (48.758644ms)
Created spec 001: 001-telemetry-oc
  Path: /tmp/osq-plan-telemetry-Eu6qAr/openspec/changes/001-telemetry-oc
  ▶ planCommand lifecycle
    ✔ appends a correlated pair with exact OpenCode usage before and after spawn (437.215766ms)
Created spec 001: 001-telemetry-exit
  Path: /tmp/osq-plan-telemetry-l2wbFd/openspec/changes/001-telemetry-exit
    ✔ records a non-zero exit and preserves propagation (185.480493ms)
Created spec 001: 001-telemetry-nospawn
  Path: /tmp/osq-plan-telemetry-jDzlbr/openspec/changes/001-telemetry-nospawn
    ✔ records plan_exited when the planner binary cannot spawn (46.534442ms)
Created spec 001: 001-telemetry-resume
  Path: /tmp/osq-plan-telemetry-j2DRlT/openspec/changes/001-telemetry-resume
    ✔ resumes without rewriting the brief and keeps the approved hash independent (365.602321ms)
    ✔ print mode appends no planning event (26.293062ms)
  ✔ planCommand lifecycle (1062.040282ms)
Created spec 001: 001-telemetry-agy
  Path: /tmp/osq-plan-telemetry-7Gys5g/openspec/changes/001-telemetry-agy
  ▶ all harness identities through planCommand
    ✔ records AGY timing with all-null usage (180.09598ms)
Created spec 001: 001-telemetry-codex
  Path: /tmp/osq-plan-telemetry-kjf91w/openspec/changes/001-telemetry-codex
    ✔ records Codex identity with rollout usage and null cost (221.281902ms)
  ✔ all harness identities through planCommand (401.819756ms)
  ▶ harness usage readers
    ✔ OpenCode selects the one row by cwd and interval and sums cache counters (67.14613ms)
    ✔ OpenCode returns all null for ambiguity, malformed data, and read failure (129.222286ms)
    ✔ Codex selects the one new rollout by session_meta cwd (53.424504ms)
    ✔ Codex returns all null for ambiguity, cwd mismatch, and missing usage (45.61928ms)
    ✔ AGY returns explicit all-null usage (0.351706ms)
  ✔ harness usage readers (297.580766ms)
✔ planning telemetry (1811.206794ms)
Created spec 001: 001-smoke
  Path: /tmp/osq-plan-test-uEQRmV/openspec/changes/001-smoke
▶ osq plan command
  ✔ creates change folder and brief.md before spawning the interactive session (263.156721ms)
  ✔ -print writes the opening prompt to stdout only and does not spawn a session (34.405303ms)
Created spec 001: 001-resume-probe
  Path: /tmp/osq-plan-test-blvYsq/openspec/changes/001-resume-probe
  ✔ resumes an existing change with brief.md without creating a new change folder (44.663122ms)
  ✔ accepts the -print alias through the CLI without launching a harness (57.725548ms)
  ✔ builds five ordered sections with the sufficient repository record after the brief (90.351075ms)
  ✔ emits only the too-small record sentence below five measured tasks (28.761714ms)
Created spec 104: 104-record-probe
  Path: /tmp/osq-plan-test-tBHLvy/openspec/changes/104-record-probe
  ✔ uses one five-section prompt for interactive, resumed, and print planning (76.512492ms)
  ✔ emits the five-section prompt through the -print CLI alias (42.319815ms)
Created spec 104: 104-alpha
  Path: /tmp/osq-plan-test-I6X07P/openspec/changes/104-alpha
  ✔ puts the repository record in a queue-selected planning prompt (62.340956ms)
✔ osq plan command (702.775929ms)
▶ osq plan command registration
  ✔ registers plan <name> with --brief, --print, and --session options (0.781032ms)
✔ osq plan command registration (0.92438ms)
Created spec 001: 001-integration-plan
  Path: /tmp/osq-planning-integration-RNQhFe/openspec/changes/001-integration-plan
▶ planning to report integration
  ✔ records a real planning session that the report surfaces even with null usage (461.232156ms)
✔ planning to report integration (462.598941ms)
▶ planning record source compatibility
  ✔ reads a legacy record without a source as owned (1.013628ms)
  ✔ parses observed records with nullable model, exit code, and usage (0.773361ms)
  ✔ writes source owned for new owned lifecycle records (27.641609ms)
✔ planning record source compatibility (30.9794ms)
▶ path containment
  ✔ accepts nested targets and rejects sibling prefixes and escapes (0.224877ms)
  ✔ resolves relative targets from the session directory (0.190908ms)
✔ path containment (0.682022ms)
▶ findPlanningSessions
  ✔ matches inclusive window boundaries and the segment-contained folder (11.433076ms)
  ✔ rejects sibling prefixes, escapes, and out-of-folder edits (1.345335ms)
  ✔ deduplicates by harness and native id and orders deterministically (9.338952ms)
  ✔ isolates reader failures and invalid windows (0.957559ms)
✔ findPlanningSessions (23.820973ms)
▶ Codex rollout observation
  ✔ reads apply_patch headers and ignores shell text and failed calls (0.666682ms)
  ✔ reads the event_msg cumulative total token usage without summing (0.305066ms)
  ✔ reads every rollout below the Codex data home and degrades a missing store (5.56057ms)
✔ Codex rollout observation (6.737417ms)
▶ OpenCode observation
  ✔ builds an edit-only join projected through json_extract (0.163599ms)
  ✔ groups completed edit parts by session and sums cache read plus write (44.799734ms)
  ✔ keeps a session model nullable (41.614656ms)
✔ OpenCode observation (86.915434ms)
▶ Claude session observation
  ✔ parses successful edits and the final cost-state without content (0.755241ms)
  ✔ returns null when no edit is present and leaves missing values null (0.133148ms)
✔ Claude session observation (1.023148ms)
▶ approval-time observation
  ✔ appends one observed pair, preserves usage/model, and never duplicates (192.002067ms)
  ✔ records no observed pair and leaves planner null when nothing matches (133.013443ms)
  ✔ attributes the newest observed model then the newest owned model, never config (231.565141ms)
  ✔ prefers a persisted creation time and rejects edits before it (17.886588ms)
  ✔ appends deterministically without re-reading a duplicate native session (13.315726ms)
✔ approval-time observation (588.356999ms)
▶ approve command planning notice
  ✔ prints exactly one no-record notice when no observed session matches (117.955911ms)
  ✔ prints no notice when a session matches (100.073592ms)
  ✔ supplies the default readers and still approves with empty local stores (110.460456ms)
  ✔ does not write approval artifacts when lint fails (86.318226ms)
✔ approve command planning notice (415.33586ms)
▶ proposal writes schema
  ✔ osq lint rejects a proposal declaring features.writes (187.813526ms)
  ✔ osq lint passes when features.writes is absent and deltas exist in specs/ (72.735723ms)
  ✔ derives written capabilities from delta specs for show and the manifest (13.01663ms)
  ✔ osq migrate openspec strips features.writes and removes redundant spec.md idempotently (29.325318ms)
✔ proposal writes schema (304.449809ms)
▶ queue planning usage aggregate
  ✔ counts valid starts across active, archived, and rejected attempts, including retired slugs (65.810233ms)
  ✔ reports complete coverage when every start has one finite-cost exit, zero included (7.706941ms)
  ✔ treats missing, null-cost, duplicate, and orphan exits as incomplete (17.003303ms)
  ✔ derives complete zero coverage when there are no prior sessions (6.939573ms)
✔ queue planning usage aggregate (98.828674ms)
▶ queue budget evaluation
  ✔ requires both ceilings for the spend gates (1.854505ms)
  ✔ refuses only when one more session would exceed the maximum (0.798681ms)
  ✔ refuses every launch under a zero session limit (0.907519ms)
  ✔ enforces the cost ceiling only with complete coverage and at or above the maximum (0.877169ms)
  ✔ ignores only the cost ceiling with incomplete coverage and notes it (1.267614ms)
  ✔ keeps enforcing the session ceiling with incomplete coverage (1.3373ms)
✔ queue budget evaluation (7.846419ms)
▶ prepareQueuePlan budget gate
  ✔ refuses before returning a selection when the budget is required but absent (4.970957ms)
  ✔ returns a notice and a selection when cost coverage is incomplete (15.605579ms)
✔ prepareQueuePlan budget gate (20.871144ms)
▶ queue modes without a queue config block
  ✔ keeps osq queue working without queue ceilings (181.804284ms)
✔ queue modes without a queue config block (182.007252ms)
▶ planCommand budget refusals
  ✔ refuses a non-print next plan without queue ceilings before any mutation (17.187017ms)
  ✔ lets print mode bypass the spend gates without a queue block (35.143916ms)
  ✔ allows a launch exactly at the session boundary (20.066077ms)
  ✔ refuses before folder creation when one more session would exceed the maximum (27.111269ms)
  ✔ refuses under a zero session limit and with a reached cost ceiling (37.574478ms)
Created spec 091: 091-alpha
  Path: /tmp/osq-queue-budget-Qn7rzO/openspec/changes/091-alpha
  ✔ prints one note and proceeds when coverage is incomplete, still enforcing sessions (19.158708ms)
✔ planCommand budget refusals (157.43399ms)
▶ queue brief and prompt seeding
  ✔ writes only the item body plus planner, date, and queue metadata (12.319752ms)
  ✔ identifies landed dependency archive paths in the change context only when supplied (18.869132ms)
✔ queue brief and prompt seeding (32.928193ms)
▶ createNewSpec queue seeding
  ✔ uses an explicit slug, title, and numeric dependency ids while keeping the body (8.245083ms)
  ✔ numbers across active, archived, and rejected folders (3.12677ms)
✔ createNewSpec queue seeding (11.712439ms)
▶ queue next-item preparation
  ✔ selects the first unplanned item with landed dependencies and records archive paths (8.718957ms)
  ✔ skips active items and waits until a dependency lands (23.131572ms)
  ✔ refuses when every item is landed or active (13.817144ms)
✔ queue next-item preparation (46.278272ms)
▶ queue active failure gate
  ✔ halts before mutation on every dead, regressed, and change-level target (29.310928ms)
  ✔ treats attempt-suffixed history as inactive (35.937771ms)
✔ queue active failure gate (65.882292ms)
▶ queue rejection gate
  ✔ refuses a rejected first eligible item without replan and preserves history (13.369235ms)
  ✔ replans through the real command into one active attempt without touching rejected history (17.101225ms)
✔ queue rejection gate (30.767296ms)
▶ plan command modes
  ✔ registers the plan command with --next, --replan, and --session (7.623558ms)
  ✔ rejects missing and conflicting modes before any file is written (1.535322ms)
  ✔ plan --next --print creates the change and prints its prompt without spawning (14.949547ms)
  ✔ default plan --next hands off the prompt file and marks exactly one item planned (177.448776ms)
  ✔ rejects session combined with print before any mutation (1.358824ms)
✔ plan command modes (206.166258ms)
▶ brief queue planning through the real CLI and mock harness
  ✔ plans one item per invocation, halts on a dead task, retries, and lands all three (8376.797201ms)
✔ brief queue planning through the real CLI and mock harness (8378.031727ms)
▶ queue parser
  ✔ parses ordered items with earlier dependencies, bodies, and raw-section hashes (26.17546ms)
  ✔ accepts nothing and comma-separated earlier slugs with surrounding whitespace (1.71441ms)
  ✔ permits ordinary deeper headings inside a brief body (1.355751ms)
  ✔ rejects malformed headings, invalid slugs, empty titles, and duplicate slugs (1.519552ms)
  ✔ rejects missing, malformed, empty, and duplicate dependency lines (1.805679ms)
  ✔ rejects empty bodies (1.329224ms)
  ✔ rejects self, forward, and unknown dependencies with item context (1.012159ms)
  ✔ fails for a missing queue file with the queue path (5.654334ms)
✔ queue parser (42.397076ms)
▶ queue projection
  ✔ derives state precedence, selected change ids, and rejection counts (65.801016ms)
  ✔ retains rejected counts on a replanned active item and never lands done-but-unarchived (30.353081ms)
  ✔ derives unmet queue dependencies from landed associations only (17.794869ms)
  ✔ does not let a rejected dependency land an item (10.581167ms)
  ✔ annotates changed since planned from the selected association hash (19.533952ms)
  ✔ associates only through brief queue_item metadata, not folder names (7.852829ms)
  ✔ ignores malformed unrelated folders without hiding valid queue items (16.298711ms)
  ✔ reports ambiguous multiple active associations instead of choosing silently (17.793671ms)
  ✔ reports ambiguous multiple archived associations (5.143871ms)
  ✔ prefers an archived association over active and rejected ones (7.005728ms)
  ✔ derives state afresh on every call with no cache between projections (13.397664ms)
  ✔ formats every projected row deterministically (2.486546ms)
✔ queue projection (215.302313ms)
▶ osq queue CLI
  ✔ registers the queue command in the commander program (3.038474ms)
  ✔ prints the projection through createProgram without changing queue bytes or metadata (13.642566ms)
  ✔ prints identical output on repeated invocations (15.591329ms)
✔ osq queue CLI (32.611955ms)
▶ regressed status formatting
  ✔ formats a regressed task with the regressed indicator and label (0.662342ms)
  ✔ formats an active spec overview with a regressed indicator (0.238498ms)
  ✔ formats a regressed task outcome line with the fallback word (0.281307ms)
  ✔ formats a regressed task outcome line with the unicode failure symbol (0.168848ms)
✔ regressed status formatting (2.750493ms)
▶ regressed marker and event writers
  ✔ writes a regressed marker under .run/regressed (37.603823ms)
  ✔ writes a change-level regressed marker for the change target (7.648886ms)
  ✔ appends a typed regressed event to the task event stream (5.329374ms)
  ✔ lets event data override the default task and appends without clobbering (4.984822ms)
✔ regressed marker and event writers (56.297646ms)
▶ explicit rejection transition
  ✔ refuses an empty or whitespace-only reason without moving the folder (47.026603ms)
  ✔ rejects an unapproved active change into the canonical rejected directory (37.612269ms)
  ✔ rejects an approved change with an active dead marker (123.719681ms)
  ✔ rejects an approved change with an active regressed task marker (117.167662ms)
  ✔ rejects an approved change with a change-level regression (120.654898ms)
  ✔ refuses a healthy approved change and leaves it in place (137.036986ms)
  ✔ refuses an approved completed change (131.695668ms)
  ✔ refuses a running task even when a dead marker would win state precedence (128.526987ms)
  ✔ refuses a historical suffixed failure marker as not active (135.383256ms)
  ✔ refuses an archived change (39.401262ms)
  ✔ refuses an already rejected change (45.097155ms)
  ✔ refuses a missing change (36.93447ms)
  ✔ refuses a destination collision without moving or overwriting (29.067714ms)
  ✔ moves the complete record intact and appends one matching rejection event (116.43402ms)
✔ explicit rejection transition (1248.435189ms)
▶ release workflow
  ✔ triggers on v* tag push events (0.778881ms)
  ✔ installs with a frozen lockfile and runs the verification gate (0.525773ms)
  ✔ runs the consumer pack smoke test suite through pnpm test (0.294406ms)
  ✔ verifies tag version parity with package.json before publishing (0.305957ms)
  ✔ publishes with provenance and public access using OIDC permissions (0.200297ms)
  ✔ contains no static npm token secrets or npmrc authentication (0.164478ms)
  ✔ sets up the runner with checkout, pnpm, and Node 22 (0.264177ms)
✔ release workflow (3.948694ms)
▶ pnpm setup version delegation
  ✔ pins an exact pnpm version through packageManager in package.json (0.345526ms)
  ✔ uses pnpm/action-setup@v4 without with.version in release.yml (0.144408ms)
  ✔ uses pnpm/action-setup@v4 without with.version in ci.yml (0.151798ms)
✔ pnpm setup version delegation (0.893489ms)
▶ report cost metrics
  ▶ fixture/report
    ✔ sums cost reported in event data per spec and in total under history (185.564717ms)
    ✔ identifies harness-reported provenance and attempt coverage (58.108925ms)
    ✔ formats the total as a currency string (54.518387ms)
    ✔ exposes total, perSpec, formattedTotal, provenance, and coverage on CostHistory (35.173539ms)
    ✔ prints the harness-reported cost line with attempt coverage (46.011765ms)
  ✔ fixture/report (381.326476ms)
  ▶ cost formatting
    ✔ uses four decimals for amounts below one cent (18.195224ms)
    ✔ counts an attempt at most once even when several events report cost (24.677407ms)
  ✔ cost formatting (43.39215ms)
  ▶ cost-free project
    ✔ reports zero cost and zero coverage without estimating (5.725453ms)
  ✔ cost-free project (6.02572ms)
  ▶ README
    ✔ notes that reported cost reflects the harness price table rather than the invoice (1.586342ms)
  ✔ README (1.74483ms)
✔ report cost metrics (433.176259ms)
▶ report event coverage
  ▶ fixture/report
    ✔ lists tasks with and without event files grouped by change (129.19351ms)
  ✔ fixture/report (130.230057ms)
  ▶ mixed coverage
    ✔ accounts for every task and sorts task numbers per change (41.821408ms)
    ✔ treats an existing empty event file as covered (19.075072ms)
    ✔ treats a missing event file as uncovered (12.017851ms)
  ✔ mixed coverage (73.428266ms)
✔ report event coverage (204.233506ms)
▶ report cycle metrics
  ▶ fixture/report
    ✔ emits one sorted row per archived change with nullable phases (111.269577ms)
    ✔ aggregates each phase over only its covered changes (69.423484ms)
    ✔ prints only aggregate phase lines with the coverage phrase (77.299241ms)
  ✔ fixture/report (259.188147ms)
  ▶ phase derivation
    ✔ derives a complete lifecycle and its total in seconds (26.273395ms)
    ✔ keeps missing, invalid, and reversed endpoints null (16.207197ms)
    ✔ excludes active changes from cycle rows (10.275871ms)
    ✔ uses only numeric task streams for first start and excludes change.jsonl spans (4.072622ms)
  ✔ phase derivation (57.495058ms)
  ▶ JSON contract
    ✔ exposes cycle phases and rows on the MetricsReport object (47.36331ms)
  ✔ JSON contract (47.689875ms)
✔ report cycle metrics (365.045516ms)
▶ report failure breakdown
  ▶ fixture/report
    ✔ retains the historical crashed failure of a retried task while reporting zero current dead tasks (147.484255ms)
    ✔ formats the historical dead reasons per reason (53.494927ms)
  ✔ fixture/report (202.349486ms)
  ▶ event history
    ✔ counts every dead event in history grouped by reason (30.858292ms)
    ✔ retains dead events for tasks that are later retried and completed (40.830554ms)
    ✔ defaults a dead event without a reason to unknown (13.541312ms)
  ✔ event history (85.738224ms)
  ▶ marker independence
    ✔ counts dead markers in current state without inventing history (33.764968ms)
    ✔ ignores dead markers even when some tasks have dead events (18.211997ms)
  ✔ marker independence (52.45729ms)
  ▶ formatting
    ✔ prints (none) when there are no dead events (24.624454ms)
  ✔ formatting (24.895002ms)
✔ report failure breakdown (366.523087ms)
▶ report file change metrics
  ▶ fixture/report
    ✔ counts edit and write tool events and deduplicates their paths (146.512213ms)
    ✔ stores edit and write tool events with duplicate paths in the 009 event stream (3.101834ms)
  ✔ fixture/report (150.908221ms)
  ▶ path extraction and normalization
    ✔ extracts paths from summary, path, filePath, and file and normalizes them (11.735484ms)
    ✔ is case-insensitive on the tool name and ignores non edit/write tools (14.309444ms)
    ✔ counts edit and write events without a usable path in the change total only (13.969146ms)
    ✔ deduplicates the same normalized path across all specs (22.145764ms)
    ✔ retains legacy file_changed events and normalizes their paths (10.547918ms)
  ✔ path extraction and normalization (73.435648ms)
✔ report file change metrics (224.915192ms)
▶ report execution history
  ✔ counts every started event as an attempt and lists tasks with multiple attempts (71.708317ms)
  ✔ identifies started events with no intervening dead or regressed event (45.26225ms)
  ✔ groups dead events by reason and treats an absent reason as unknown (23.971711ms)
  ✔ records ordered verify exit codes and counts missing exit codes (14.438624ms)
  ✔ attributes cost to attempts and counts an attempt at most once (23.828325ms)
  ✔ does not associate cost with an attempt when no started event precedes it (41.563863ms)
  ✔ ignores change.jsonl for task attempts and coverage (25.828041ms)
  ✔ parses malformed lines defensively (25.856238ms)
✔ report execution history (274.706142ms)
▶ serializeSortedJson
  ✔ recursively sorts object keys and preserves array order (0.859561ms)
  ✔ is deterministic across repeated calls (0.208238ms)
  ✔ passes through primitives and null unchanged (0.244157ms)
✔ serializeSortedJson (2.487982ms)
▶ report --json
  ✔ emits a single valid JSON document with the stable MetricsReport keys (183.465117ms)
  ✔ orders the emitted top-level keys alphabetically in the raw text (47.874903ms)
  ✔ matches the checked-in fixture byte for byte through the real report command (47.118253ms)
  ✔ matches the structured MetricsReport shape without compatibility aliases (45.896126ms)
  ✔ keeps the non-JSON path rendering the formatted report (31.566637ms)
✔ report --json (357.012333ms)
▶ formatMetricsReport
  ✔ renders exclusively from the values held by the MetricsReport object (0.385095ms)
  ✔ always renders the historical cost line, including at zero (0.262357ms)
✔ formatMetricsReport (0.8884ms)
▶ osq report CLI flag
  ✔ registers --json so commander parses it to options.json (2.391367ms)
✔ osq report CLI flag (2.480257ms)
▶ report current state
  ✔ derives all eight task counts from markers and separates manual from verified (59.085464ms)
  ✔ always includes zero-valued verified and manual counts in JSON and text (18.014919ms)
  ✔ keeps a historical dead event out of current dead when the marker is done (22.296612ms)
  ✔ does not treat a done event as a current completion (16.451368ms)
✔ report current state (117.427665ms)
▶ report planning metrics
  ▶ fixture/report
    ✔ aggregates correlated sessions across active and archived changes (106.398164ms)
    ✔ renders the planning totals and the exact coverage phrase in text (63.347825ms)
  ✔ fixture/report (172.17331ms)
  ▶ aggregation rules
    ✔ counts every valid start once, sums matched exits, and never estimates nulls (11.296082ms)
    ✔ treats missing, empty, and malformed logs as zero without throwing (22.872124ms)
  ✔ aggregation rules (34.598642ms)
  ▶ mixed sources
    ✔ treats observed, explicit owned, and source-less legacy starts identically (4.539677ms)
    ✔ counts each covered change once and excludes exit-only and malformed lines (7.014849ms)
  ✔ mixed sources (11.887532ms)
  ▶ reportCommand JSON
    ✔ exposes the planning block deterministically through the report command (67.852285ms)
  ✔ reportCommand JSON (68.3583ms)
✔ report planning metrics (287.669406ms)
▶ queue report view
  ✔ returns an unconfigured empty queue view and leaves existing aggregates unchanged (60.443176ms)
  ✔ fails a malformed configured queue with its actionable parse error (22.612964ms)
  ✔ projects ordered item rows with state, drift, rejections, and elapsed time (39.680738ms)
  ✔ uses the earliest plan start across attempts and nulls missing or reversed endpoints (46.773362ms)
  ✔ reads active dead, regressed, and change-level failure reasons, defaulting to unavailable (47.396118ms)
  ✔ counts queue planning sessions and finite cost across rejected attempts only for the queue block (22.103292ms)
  ✔ reports complete queue cost coverage when every counted session records finite cost (17.495492ms)
  ✔ renders a concise Queue section and deterministic stable JSON (91.706948ms)
  ✔ renders an unconfigured Queue section for a repository without a queue (6.863121ms)
  ✔ keeps the checked-in report fixture unconfigured without a queue file (103.401248ms)
✔ queue report view (460.98846ms)
▶ osq report rejection history
  ✔ counts each rejected folder once only when a valid rejected event exists (77.541521ms)
  ✔ groups a missing or empty planner value as unknown (31.839656ms)
  ✔ excludes rejected artifacts from every non-rejection aggregate (16.916824ms)
  ✔ renders rejection totals and planner-model counts in the History text section (22.168904ms)
  ✔ exposes history.rejections through the JSON report command (17.977174ms)
✔ osq report rejection history (168.156218ms)
▶ report scope-regression history
  ✔ always exposes the five counters as integers even when no scope events exist (40.196608ms)
  ✔ counts detection only for typed scope regressions and classifies finite exit codes (18.362163ms)
  ✔ classifies only exact recertification outcomes without guessing malformed ones (6.390549ms)
  ✔ aggregates active and archived numbered streams only, never markers, results, or rejected folders (16.159857ms)
  ✔ does not add attempts, unexplained reruns, dead reasons, or cost coverage (7.133581ms)
  ✔ leaves current-state regression counts to markers alone (5.171891ms)
  ✔ renders the history block in text and the counters in stable JSON (22.11027ms)
✔ report scope-regression history (117.097041ms)
▶ report sizes over the checked-in fixture
  ✔ exposes ordered legacy scope buckets and an empty resolver-2 series (108.042022ms)
  ✔ orders the scope series legacy first then resolver-2 (28.310362ms)
  ✔ selects the largest first-attempt pass within the legacy series (28.885843ms)
  ✔ emits labeled size tables, the boundary, and exactly one near-limit hint line (32.420398ms)
  ✔ omits the hint when the largest pass is not near a limit (21.413776ms)
  ✔ renders stable JSON with ordered scope series and acceptance buckets (24.694624ms)
  ✔ is deterministic across repeated derivations (60.169619ms)
✔ report sizes over the checked-in fixture (306.561894ms)
▶ measured task projection
  ✔ ignores tasks without a valid start measure and results files (15.932226ms)
  ✔ uses the first valid start measure and counts started attempts (15.978974ms)
  ✔ treats only a typed done before the next outcome as a first-attempt pass (22.436369ms)
  ✔ discards reversed and incomplete measure pairs for duration (17.173601ms)
  ✔ preserves pre-existing report fields and the queue view (87.053218ms)
✔ measured task projection (159.270009ms)
▶ repository record derivation
  ✔ derives aggregates and dead outcomes from the checked-in fixture (41.825986ms)
  ✔ inspects only the 20 highest numeric archived changes (152.81244ms)
  ✔ uses resolver-2 scope evidence for the record when the window has any (26.319273ms)
  ✔ labels the legacy fallback when no resolver-2 evidence exists (28.481ms)
  ✔ derives no largest pass when every measured task has a malformed resolver (9.945453ms)
  ✔ truncates dead outcomes to ten in change, task, event order (53.001239ms)
  ✔ never reads results files when deriving the record (6.692637ms)
✔ repository record derivation (319.960198ms)
▶ formatRepositoryRecordBody
  ✔ prints the four labeled groups for a sufficient record (0.195288ms)
  ✔ prints only the too-small sentence below five measured tasks (0.091179ms)
✔ formatRepositoryRecordBody (0.400835ms)
▶ mixed resolver generations
  ✔ keeps legacy and resolver-2 scope buckets and largest passes separate (57.337114ms)
  ✔ aggregates acceptance sizes across generations in one combined series (65.136882ms)
  ✔ labels both series, marks the boundary, and hints from resolver-2 only (102.36898ms)
✔ mixed resolver generations (225.272011ms)
▶ report task states
  ▶ fixture/report
    ✔ contains archived specs 008, 009, and 010 with the expected event shapes (30.573035ms)
    ✔ reports 17 total tasks with current state derived from markers (71.86295ms)
  ✔ fixture/report (103.602351ms)
  ▶ active specs
    ✔ tallies task states from deriveSpecState (34.794703ms)
  ✔ active specs (35.160058ms)
  ▶ archived specs
    ✔ derives current state from markers, not terminal events (23.616023ms)
    ✔ derives archived task status from done and dead markers (14.898745ms)
    ✔ reports archived tasks with no markers as pending (20.605096ms)
    ✔ does not count a done event as a current completion (18.11649ms)
  ✔ archived specs (77.994055ms)
✔ report task states (217.455677ms)
▶ report token metrics
  ▶ fixture/report
    ✔ sums neutral token categories and cache share across all specs (90.015842ms)
    ✔ exposes only the canonical neutral TokenMetrics fields (44.985583ms)
    ✔ formats the neutral token labels with the cache share percentage (65.447979ms)
  ✔ fixture/report (201.850964ms)
  ▶ event mapping
    ✔ maps opencode cache.read to cached_input and reasoning to reasoning (14.462363ms)
    ✔ maps Antigravity usage fields to neutral categories (12.435506ms)
    ✔ derives the total from the neutral categories when no total is reported (6.321146ms)
    ✔ derives the remaining cached input only when no cache field is reported (5.654074ms)
    ✔ prefers reported cached tokens over the remainder when a cache field exists (9.696538ms)
    ✔ uses real-world opencode counts where reasoning is not counted as cache (11.967481ms)
    ✔ defaults cache share percent to zero when there is no input at all (7.362455ms)
  ✔ event mapping (68.95643ms)
  ▶ adapter token extraction
    ✔ extracts opencode reasoning tokens from reasoning or reasoningTokens (0.290057ms)
    ✔ extracts agy reasoning tokens from thinking_tokens or reasoning_tokens (0.338956ms)
    ✔ emits reasoningTokens on opencode tokens events (5.847097ms)
    ✔ emits reasoningTokens on agy tokens events (5.253078ms)
  ✔ adapter token extraction (12.190123ms)
✔ report token metrics (283.705627ms)
▶ osq report
  ✔ getMetricsReport aggregates spec and task counts across active and archived directories (93.983272ms)
  ✔ getMetricsReport calculates completion rate and current dead tasks from markers (24.001577ms)
  ✔ getMetricsReport aggregates event durations, token usage, and file changes (28.864764ms)
  ✔ reportCommand prints formatted terminal report and supports raw JSON output (20.422694ms)
  ✔ aggregates undeclared_test_change in the historical failure breakdown for text and JSON output (16.846444ms)
  ✔ CLI registers report command in commander program (11.640735ms)
✔ osq report (199.442221ms)
▶ retry attempt numbering
  ✔ records attempt 1 on an initial execution (205.178373ms)
  ✔ matches the preceding retry attempt and carries the failure reason (150.287773ms)
✔ retry attempt numbering (356.78588ms)
▶ scope regression recertification
  ✔ passing recertification refreshes canonical done and records outcome passed (208.031545ms)
  ✔ never replaces original_scope_hash across repeated passing recertifications (202.546175ms)
  ✔ requeues on failing recertification with the failed output and next attempt (149.540412ms)
  ✔ requeues with the timeout result when recertification exceeds the configured timeout (1151.566256ms)
  ✔ preserves the established retry transition for a dead task without verification (136.081942ms)
  ✔ preserves the established retry transition for a non-scope regression (152.746587ms)
  ✔ falls back to the preserving transition when no automated done marker exists (107.558538ms)
  ✔ refuses a malformed done marker as a recertification target (105.145501ms)
  ✔ uses the shared target-wide ordinal when a recertification requeues (187.214599ms)
  ✔ renders the failed recertification output in every textual prompt after restart (177.125245ms)
  ✔ passes the requeued failure context into the next agent spawn (190.009122ms)
  ✔ reports recertification and requeue distinctly through the CLI (189.697548ms)
✔ scope regression recertification (2959.916778ms)
▶ retry through the real watcher CLI with the mock harness
  ✔ dies once, retries without deleting diagnostics, then lands and archives (1600.478642ms)
✔ retry through the real watcher CLI with the mock harness (1601.783237ms)
▶ explicit retry transition
  ✔ registers the retry command with id and target arguments (149.904432ms)
  ✔ renames an active dead marker to the next ordinal and records the retry (127.530481ms)
  ✔ counts retained dead and regressed history in one shared ordinal (94.290289ms)
  ✔ retains a task regression done marker so the task derives pending (124.812097ms)
  ✔ retries a change-level regression into history and makes archiving eligible (136.221688ms)
  ✔ preserves both active failure kinds under one ordinal with regression reason (87.747251ms)
  ✔ refuses a running target without mutating markers or events (82.855906ms)
  ✔ refuses a missing approval and names osq approve without mutation (111.120939ms)
  ✔ refuses a mismatched approval hash and names osq approve without mutation (109.384312ms)
  ✔ refuses a target with no active failure (100.476187ms)
  ✔ refuses a change target without a change-level regression (122.3872ms)
  ✔ refuses any non-numeric non-change target (125.300377ms)
✔ explicit retry transition (1374.789837ms)
▶ Runner already_running lock collision
  ✔ aborts with already_running without a dead marker or dead event (160.480332ms)
  ✔ logs the already_running outcome summary to stderr (119.193065ms)
  ✔ does not report the lock collision as a task failure in osq report (127.737839ms)
  ✔ only writes a dead event when an explicit dead marker is written (137.705084ms)
✔ Runner already_running lock collision (546.81791ms)
▶ tickTaskCheckboxContent format handling
  ✔ ticks a matching item in a flat numbered checklist without touching neighbours (1.635825ms)
  ✔ ticks a matching item in a grouped numbered checklist under its section header (0.218688ms)
  ✔ ticks a grouped unnumbered item whose number lives on the section header (0.237247ms)
  ✔ is idempotent and leaves already ticked checkboxes untouched (0.200207ms)
  ✔ prefers an explicit item number over the enclosing section number (0.147568ms)
✔ tickTaskCheckboxContent format handling (3.912589ms)
▶ Runner checkbox projection
  ✔ writes the ticked checkbox through tickTaskCheckbox (61.335542ms)
  ✔ is a no-op when tasks.md is absent (12.707948ms)
  ✔ does not invalidate the approved hash or modify .run/ markers (110.280912ms)
  ✔ derives task and spec state from .run/ markers, never tasks.md checkboxes (91.438267ms)
  ✔ writes .run/done/<n> and ticks tasks.md after an independent verify pass (199.222992ms)
✔ Runner checkbox projection (475.747163ms)
▶ Archived task checkboxes
  ✔ all fifteen (or more) archived tasks.md files are fully ticked (16.150953ms)
✔ Archived task checkboxes (16.4015ms)
▶ Runner done and dead events
  ✔ defines the done and dead event payloads (151.0256ms)
  ✔ parameterizes every dead RunTaskFailureReason and isolates already_running (134.668784ms)
  ✔ appends a done event alongside the done marker on success (174.306642ms)
  ✔ appends a dead event alongside the dead marker for no_result (155.204842ms)
  ✔ appends a dead event alongside the dead marker for crashed (125.390651ms)
  ✔ appends a dead event alongside the dead marker for timeout (164.172843ms)
  ✔ appends a dead event alongside the dead marker for verify_red (264.892599ms)
  ✔ appends a dead event alongside the dead marker for spec_conflict (tampered task) (112.512642ms)
  ✔ appends a dead event alongside the dead marker for spec_conflict (missing approval) (107.179712ms)
  ✔ appends a dead event alongside the dead marker for undeclared_test_change (160.572962ms)
  ✔ writes neither a dead marker nor a dead event for already_running (240.069445ms)
✔ Runner done and dead events (1792.708908ms)
▶ Runner lifecycle logging
  ✔ spawnWithTimeout captures the child pid and elapsed duration in milliseconds (192.337818ms)
  ✔ SpawnProcessResult and SpawnResult expose optional pid and elapsedMs fields (127.459788ms)
  ✔ logs a started summary and records a started event with pid and timeout (139.789485ms)
  ✔ logs an exited summary at verbose level and records an exited event with exit code and elapsed time (176.203162ms)
  ✔ demotes the exited summary to verbose while the started summary stays at info (158.201566ms)
  ✔ emits each lifecycle log line from the same code path as its events.jsonl entry (181.309325ms)
  ✔ does not log lifecycle lines when no logger is supplied (174.787004ms)
  ✔ exposes relativizeToolSummary from core and re-exports it from heartbeat (111.320665ms)
  ✔ models every event as a typed member of the OsqEvent union (121.272059ms)
  ✔ relativizes opencode tool summaries to the project root at write time (143.082148ms)
  ✔ relativizes agy tool summaries to the project root at write time (140.638918ms)
  ✔ records harness, model, and osqVersion on the started event (258.816459ms)
  ✔ emits exactly one started and one exited event through MockAdapter (150.73091ms)
✔ Runner lifecycle logging (2079.725816ms)
▶ Runner lifecycle PID ownership
  ✔ AgyAdapter forwards onSpawn, returns pid/elapsedMs, and emits no lifecycle events (197.895279ms)
  ✔ runTask through AgyAdapter records exactly one started and one exited with matching pid (212.892603ms)
  ✔ OpencodeAdapter forwards onSpawn, returns pid/elapsedMs, and emits no lifecycle events (199.147401ms)
  ✔ runTask through OpencodeAdapter records exactly one started and one exited with matching pid (172.052865ms)
✔ Runner lifecycle PID ownership (783.926942ms)
▶ Runner outcome logging
  ✔ does not export the legacy formatTaskOutcomeSummary helper (136.691791ms)
  ▶ formatTaskOutcomeLine
    ✔ renders a verified line with elapsed time and no (passed) suffix (91.439118ms)
    ✔ renders unicode symbols when enabled (115.093375ms)
    ✔ renders a dead line for every failure reason (113.454064ms)
    ✔ appends the detail string before the elapsed time (92.662463ms)
    ✔ produces a single line for every outcome (90.123072ms)
  ✔ formatTaskOutcomeLine (503.70429ms)
  ✔ logs exactly one verified line upon successful verification (159.548294ms)
  ✔ logs exactly one dead line and writes the marker upon verification failure (244.377989ms)
  ✔ logs timed_out detail when verification times out (1242.355321ms)
  ✔ logs a timeout dead line when the agent exceeds its timeout (128.990487ms)
  ✔ logs a crashed dead line with the exit code when the agent crashes (129.134398ms)
  ✔ logs a no_result dead line when the agent writes no result (120.509307ms)
  ✔ logs a spec_conflict dead line when the folder changes after approval (117.214649ms)
  ✔ logs an already_running dead line when the task lock is held (128.676818ms)
  ✔ does not log an outcome line when no logger is supplied (201.555144ms)
✔ Runner outcome logging (3116.072953ms)
▶ Outcome module shape
  ✔ exposes the outcome failure types and formatter (0.205517ms)
  ✔ exposes the lifecycle, dead, done, and checkbox writers (0.106629ms)
  ✔ keeps outcome.ts under 200 lines (2.185305ms)
✔ Outcome module shape (2.716289ms)
▶ Done marker scope hash frontmatter
  ✔ writes YAML frontmatter and an ISO timestamp when metadata is provided (65.407417ms)
  ✔ keeps timestamp-only content when no metadata is provided (9.29561ms)
✔ Done marker scope hash frontmatter (76.215319ms)
▶ computeTaskScopeHash
  ✔ is deterministic regardless of scope ordering (6.710553ms)
  ✔ changes when a scoped file content changes (5.501367ms)
  ✔ records null for a missing scoped file (3.47848ms)
  ✔ classifies added, modified, and deleted glob matches through the resolver (9.314197ms)
✔ computeTaskScopeHash (25.52089ms)
▶ Pre-spawn scope comparison
  ✔ records the completed scope hash in the done marker (214.412362ms)
  ✔ proceeds to spawn when every earlier done scope is unchanged (215.227798ms)
  ✔ detects a changed earlier scope and refuses to spawn (227.148508ms)
  ✔ reports a deleted earlier scope file as differing (162.754856ms)
✔ Pre-spawn scope comparison (820.195557ms)
▶ Runner synthesized result
  ✔ HarnessEventType includes text and TextEventData carries a text string (141.04587ms)
  ✔ extractFinalTextFromStream returns null when no text event exists (101.939544ms)
  ✔ extractFinalTextFromStream returns null when the event stream is missing (111.036358ms)
  ✔ extractFinalTextFromStream returns the last emitted text message (90.999142ms)
  ✔ extractFinalTextFromStream ignores raw harness payload shapes (fallback candidate list dropped) (93.133642ms)
  ✔ synthesizeResultFile writes synthesized: true frontmatter and an attribution header (95.670567ms)
  ✔ verify.ts exports the synthesis and gating helpers (100.642043ms)
  ✔ verify.ts stays under the 200 line lifecycle module budget (144.497897ms)
  ✔ snapshotTestFiles and findUndeclaredTestChanges report edits and deletions but allow new files (163.858829ms)
  ✔ runVerificationGate passes a zero exit and reports a non-zero diagnostic (242.668153ms)
  ✔ runVerificationGate enforces the timeout and reports timedOut (1127.491292ms)
  ✔ AgyAdapter emits a text event carrying the completed assistant message (131.802865ms)
  ✔ AgyAdapter exit 0 with no result file synthesizes from the last text event (220.725862ms)
  ✔ OpencodeAdapter emits a text event carrying the completed assistant message (148.142655ms)
  ✔ OpencodeAdapter exit 0 with no result file synthesizes from the last text event (162.958287ms)
  ✔ case B: real adapter exit 0 with neither result file nor text is dead with reason no_result (153.476298ms)
  ✔ README documents the synthesized result behavior for the no_result reason (110.656814ms)
✔ Runner synthesized result (3343.771183ms)
▶ Runner terminal status
  ▶ formatTaskStatusRow
    ✔ renders task number, elapsed, tool count, tokens, cost, and summary (134.573625ms)
    ✔ omits cost and summary when they are not reported (92.321379ms)
    ✔ renders the token count abbreviated in the status row (101.358534ms)
    ✔ assembles the full row without truncating, leaving fitting to the logger sink (126.064876ms)
  ✔ formatTaskStatusRow (455.716303ms)
  ▶ formatTokens
    ✔ abbreviates counts at the 1k and 1M boundaries (117.538542ms)
    ✔ is applied identically to the heartbeat line (91.339798ms)
  ✔ formatTokens (209.575931ms)
  ▶ relativizeToolSummary
    ✔ strips the project root and its trailing separator from absolute paths (83.680681ms)
    ✔ normalizes a trailing separator on the supplied root (100.560195ms)
    ✔ falls back to process.cwd() when no root is supplied (110.76891ms)
    ✔ leaves absolute paths outside the project root untouched (171.212538ms)
    ✔ relativizes an exact root match to a dot (107.517949ms)
  ✔ relativizeToolSummary (574.613561ms)
  ▶ computeTaskHeartbeatStats
    ✔ counts tool events, sums tokens and cost, and keeps the last tool summary (125.533518ms)
    ✔ accumulates new events in memory instead of re-reading already-counted lines (149.355281ms)
    ✔ tolerates a missing event file with zeroed counters (159.210657ms)
    ✔ relativizes tool summaries against the project root but keeps the raw event intact (115.799407ms)
    ✔ falls back to process.cwd() for tool summaries when projectRoot is omitted (115.722858ms)
    ✔ renders the relativized tool path in the status row without a leading slash (91.220739ms)
  ✔ computeTaskHeartbeatStats (757.829589ms)
  ▶ task start and outcome lines
    ✔ logs a single started line with the title truncated to the terminal width (218.825826ms)
    ✔ logs a verified outcome line with elapsed seconds (190.532328ms)
    ✔ logs a dead outcome line with the reason and elapsed seconds (286.507334ms)
  ✔ task start and outcome lines (696.55131ms)
  ▶ end-to-end status via the real opencode stream parser
    ✔ redraws a TTY status row with the live tool count, tokens, cost, and summary (521.056225ms)
    ✔ redraws the status row with a repo-relative tool path from an absolute summary (479.627165ms)
    ✔ derives the non-TTY heartbeat log from the same counters (439.484336ms)
    ✔ demotes the periodic heartbeat log to verbose on a TTY (424.663126ms)
    ✔ still emits the periodic heartbeat at verbose on a TTY (417.201414ms)
  ✔ end-to-end status via the real opencode stream parser (2282.60603ms)
✔ Runner terminal status (4977.909963ms)
▶ Runner test modification gating
  ✔ RunTaskFailureReason includes undeclared_test_change (46.206433ms)
  ✔ records preexisting tests before spawn: a deletion is detected (159.863892ms)
  ✔ a modified preexisting test writes the dead marker and dead event, and skips verify (131.913499ms)
  ✔ creating a brand new test file without tests.modify proceeds to verify (160.42059ms)
  ✔ tests.modify: true permits editing a preexisting test file (127.468837ms)
✔ Runner test modification gating (627.521132ms)
▶ Task Runner and Verification Gate
  ✔ fails with reason: spec_conflict if folder is modified after approval (184.932209ms)
  ✔ fails with reason: no_result if agent exits without writing .run/results/<n>.md (201.823983ms)
  ✔ fails with reason: timeout if agent times out (344.760191ms)
  ✔ fails with reason: verify_red if task verify fails (222.172285ms)
  ✔ fails with reason: verify_red and timed_out: true if task verify hangs (1259.515578ms)
  ✔ succeeds, creates .run/done/<n>, and ticks checkbox on valid task and passing verify (225.115788ms)
✔ Task Runner and Verification Gate (2442.123794ms)
▶ OpenSpec schema execution authority instructions
  ✔ tasks artifact restricts execution to osq watch (22.089154ms)
  ✔ tasks artifact states archiving is osq-owned and never openspec archive (20.097084ms)
  ✔ tasks artifact states checkboxes are a runner-written write-only projection (7.398175ms)
  ✔ apply instruction hands task execution off to osq watch (14.851973ms)
  ✔ config context states execution and archive authority belongs strictly to osq (2.878276ms)
  ✔ config tasks rules forbid direct execution and archive (3.479458ms)
  ✔ schema README documents runtime and archive authority boundaries (2.730838ms)
✔ OpenSpec schema execution authority instructions (75.313003ms)
▶ Resolved scope lint integration
  ✔ warns once when two tasks resolve the same exact file (176.271861ms)
  ✔ warns only for the glob-matched file two tasks share (105.424252ms)
  ✔ emits one warning per stable task pair for a file shared by three tasks (85.452041ms)
  ✔ orders warnings by path within a task pair (80.197481ms)
  ✔ does not self-warn for duplicate declarations inside one task (120.223791ms)
  ✔ never warns for missing exact paths or unmatched globs (93.167124ms)
  ✔ keeps overlap warnings non-failing with independent errors present (92.227007ms)
  ✔ keeps maxScopeFiles counting declared patterns despite resolved overlap (86.761754ms)
  ✔ requires tests.modify for an existing exact test path (107.631874ms)
  ✔ requires tests.modify for a glob matching an existing test file (86.59208ms)
  ✔ permits a missing exact new test path and an unmatched test glob (87.474103ms)
  ✔ exits zero through the lint entrypoint when only overlap warnings exist (104.442134ms)
✔ Resolved scope lint integration (1228.67103ms)
▶ Pre-dispatch scope recertification audit
  ✔ verifies every stale task in one audit and blocks without touching the upcoming task (280.450254ms)
  ✔ does not re-verify or rewrite an already-active regression on a later cycle (223.532919ms)
  ✔ retains the timeout result when detection verification exceeds the configured timeout (1167.678407ms)
  ✔ records differing paths in deterministic sorted order (246.126024ms)
  ✔ leaves manual and malformed done markers outside the audit (304.852216ms)
✔ Pre-dispatch scope recertification audit (2224.514269ms)
▶ Scope recertification attribution
  ✔ attributes a path to a sole later editor with no recorded completion hash (143.314259ms)
  ✔ attributes a path when the current hash agrees with the later completion hash (121.911518ms)
  ✔ records ambiguous when more than one later task named the path (116.735732ms)
  ✔ records unknown when no later task named the path (113.521188ms)
  ✔ records unknown when a sole candidate completion hash contradicts the tree (143.377325ms)
✔ Scope recertification attribution (639.91553ms)
▶ Resolver-versioned completion records
  ✔ writes scope_resolver: 2 on automated completion and leaves timestamp-only markers unchanged (199.123777ms)
  ✔ detects a version-only legacy marker with empty differing paths and resolver-upgrade context (186.095499ms)
  ✔ records differing resolved glob paths alongside the resolver upgrade (152.138898ms)
  ✔ keeps repeated watcher cycles idempotent for an active version regression (136.13152ms)
  ✔ freshly recertifies a version-stale task after explicit retry (332.981832ms)
  ✔ leaves archived markers untouched and does not scan them (174.217363ms)
  ✔ treats wrong and malformed resolver versions as stale while excluding manual markers (227.447577ms)
  ✔ blocks the pre-archive audit for a version-stale completion (157.626885ms)
  ✔ requeues a failed recertification without leaving a canonical done marker (212.851362ms)
✔ Resolver-versioned completion records (1781.306969ms)
▶ Resolver upgrade guidance
  ✔ documents exactly one Upgrading note with the detection and retry contract (1.67249ms)
✔ Resolver upgrade guidance (1.875618ms)
▶ resolveScope
  ✔ resolves an exact path to its readable absolute file path (40.601588ms)
  ✔ retains a missing exact path with a null file path (11.982604ms)
  ✔ expands a segment * within a single directory level (17.183696ms)
  ✔ expands ? to a single non-separator character (9.590498ms)
  ✔ expands ** across nested directories (10.375579ms)
  ✔ expands a trailing-directory form recursively (16.528027ms)
  ✔ deduplicates an exact entry also matched by a glob (8.883538ms)
  ✔ contributes no entry for an unmatched glob (18.486809ms)
  ✔ returns empty for an empty scope (7.598511ms)
  ✔ normalizes ./ prefixes and platform separators (6.344807ms)
  ✔ is independent of declaration order and produces identical bytes (8.511192ms)
  ✔ never resolves outside the project tree (4.051558ms)
  ✔ does not read a file outside the project root when hashing (3.999572ms)
✔ resolveScope (166.520024ms)
▶ computeTaskScopeHash resolver projection
  ✔ keys the aggregate by expanded resolver paths rather than glob text (3.805121ms)
✔ computeTaskScopeHash resolver projection (4.436628ms)
▶ SCOPE_RESOLVER_VERSION
  ✔ exposes resolver version 2 (0.158423ms)
✔ SCOPE_RESOLVER_VERSION (0.252993ms)
▶ linter resolver cut-over
  ✔ removes the legacy glob matcher and its private tree walker (2.531134ms)
✔ linter resolver cut-over (2.703603ms)
▶ AGENTS.md managed block coexistence
  ✔ adds the osq block while preserving an existing OpenSpec block and user notes (11.110655ms)
  ✔ is idempotent across repeated updates and preserves both blocks intact (7.527353ms)
Harness 'mock' setup completed successfully.
Harness 'mock' setup completed successfully.
  ✔ osq setup refreshes AGENTS.md and both blocks survive repeated setup executions (216.612475ms)
✔ AGENTS.md managed block coexistence (236.807649ms)
▶ osq show
  ✔ getSpecDetails resolves change folder across active and archived directories (97.565224ms)
  ✔ getSpecDetails extracts spec metadata, tasks, results, and dead markers (73.828662ms)
  ✔ getSpecDetails parses event timeline from .run/events/<n>.jsonl (32.119105ms)
  ✔ showCommand prints formatted spec inspection with results and events (122.044899ms)
  ✔ formats undeclared_test_change status line and show diagnostic details (100.371122ms)
  ✔ getSpecDetails correlates planning sessions in start order for active and archived changes (47.176741ms)
  ✔ renders Planning Sessions before the event timeline without exposing usage (29.725905ms)
  ✔ lists observed records through the same fields and ordering as owned records (25.791889ms)
  ✔ missing and malformed planning logs leave task details and timeline intact (31.897708ms)
  ✔ CLI registers show <id> command in commander program (33.352388ms)
  ✔ derives ordered recertification rows with attribution from typed events (28.35368ms)
  ✔ derives recertification rows for archived changes (26.328453ms)
  ✔ orders recertification rows by valid timestamp then numeric task and event order (30.121769ms)
  ✔ renders malformed recertification data as unavailable without hiding other output (24.672033ms)
  ✔ renders and labels the Recertifications section only when rows exist (28.784616ms)
  ✔ does not infer recertification history from done marker metadata (26.811202ms)
✔ osq show (762.375361ms)
▶ smoke test error reporting
  ✔ reports a failed test naming the command and zero cancelledByParent when setup fails (761.647589ms)
✔ smoke test error reporting (764.174885ms)
▶ rejected dependency resolution
  ✔ treats a rejected dependency as unmet even when the rejected folder is all-done (51.453152ms)
  ✔ lets an archived dependency satisfy resolution (20.362102ms)
✔ rejected dependency resolution (73.143349ms)
▶ deriveSpecState from in-memory snapshots
  ✔ derives an unapproved spec when no approval hash is present (8.314584ms)
  ✔ derives a ready (pending) spec with a next task from pure data (1.7798ms)
  ✔ is synchronous and never returns a promise (0.90562ms)
  ✔ derives a running spec from the running pid map (0.912224ms)
  ✔ derives a done spec from the done marker set (1.232915ms)
  ✔ derives a dead spec and surfaces the dead reason (0.702927ms)
  ✔ resolves a conflicted task in favor of completion (0.571653ms)
  ✔ reports dead when a conflicted spec mixes done and dead tasks (1.061467ms)
  ✔ derives a blocked spec from unmet dependencies without touching disk (0.946194ms)
  ✔ derives a regressed task and spec from a regressed marker (0.84087ms)
  ✔ prefers a regressed marker over a stale done marker (0.395356ms)
  ✔ derives a regressed spec from a change-level regressed marker (1.125357ms)
  ✔ ignores regressed markers that match no task or the change (1.67531ms)
✔ deriveSpecState from in-memory snapshots (23.97023ms)
▶ State Derivation
  ✔ deriveTaskState correctly determines pending, running, done, and dead states (59.458284ms)
  ✔ deriveSpecState detects unapproved, pending, running, dead, and done states (41.639266ms)
  ✔ deriveSpecState from an in-memory snapshot is synchronous and preserves folderPath (21.65895ms)
✔ State Derivation (124.359656ms)
▶ osq status rejected group
  ✔ discovers rejected folders separately with folder, title, reason, and timestamp (46.728407ms)
  ✔ renders a deterministic Rejected specs group with reason and timestamp (28.81877ms)
  ✔ keeps malformed or missing rejection metadata visible as unavailable (30.308048ms)
  ✔ orders rejected folders deterministically by numeric prefix (32.250305ms)
✔ osq status rejected group (139.858716ms)
▶ osq status
  ✔ getStatusOverview returns all active specs with derived spec and task states (185.145969ms)
  ✔ getStatusOverview returns count of archived change folders (15.549692ms)
  ✔ statusCommand prints formatted status overview with state indicators (318.295726ms)
  ✔ CLI registers status command in commander program (16.636916ms)
  ✔ status output clearly distinguishes pending, running, done, and dead tasks (110.610234ms)
✔ osq status (648.082716ms)
▶ Unrecognised harness stream events
  ✔ opencode routes unrecognised event types to logger.verbose without touching stdout (12.028164ms)
  ✔ opencode stays silent at normal level for unrecognised event types (7.271801ms)
  ✔ opencode does not use console.debug for unrecognised event types (3.542269ms)
  ✔ agy routes unrecognised event types to logger.verbose without touching stdout (3.484339ms)
  ✔ agy routes malformed non-JSON lines to logger.verbose without touching stdout (3.647651ms)
  ✔ agy stays silent at normal level for unrecognised events and malformed lines (6.470965ms)
  ✔ unrecognised events write nothing to the append-only events.jsonl stream (23.052241ms)
✔ Unrecognised harness stream events (61.597255ms)
▶ pinned OpenSpec validator failure gating
  ✔ fails validateWithOpenSpec when the validator binary is missing (18.454776ms)
  ✔ fails validateWithOpenSpec when the validator version drifts (84.445682ms)
  ✔ passes validateWithOpenSpec when the pinned version is installed (72.203758ms)
  ✔ fails osq lint when the validator binary is missing (20.542641ms)
  ✔ fails osq approve when the validator binary is missing (7.417789ms)
  ✔ fails osq lint when the validator version drifts (74.432194ms)
  ✔ fails osq approve when the validator version drifts (84.379801ms)
✔ pinned OpenSpec validator failure gating (363.918928ms)
▶ Build identity resolution
  ✔ returns the package version and a git commit or dist hash (25.858719ms)
  ✔ falls back to the dist hash when git is unavailable (22.494947ms)
  ✔ falls back to unknown when neither git nor dist is present (6.164729ms)
✔ Build identity resolution (55.76519ms)
▶ Runner build identity events
  ✔ records version and commit in the started lifecycle event data (172.419829ms)
✔ Runner build identity events (172.709135ms)
▶ Watcher dev mode
  ✔ builds a worker invocation that runs tsx from src/cli/bin.ts (36.00634ms)
  ✔ delegates to the supervisor only in dev mode outside the worker process (3.135918ms)
  ✔ spawns a tsx worker and watches src/ for changes (6.829826ms)
  ✔ waits for the running task to finish before restarting on a source change (3.724122ms)
  ✔ coalesces repeated source changes into a single pending restart (3.684313ms)
  ✔ terminates the worker on SIGINT and never restarts (4.18986ms)
  ✔ exits non-zero when there is no src/ checkout to run (6.890024ms)
✔ Watcher dev mode (65.972616ms)
▶ Runner heartbeat
  ✔ defaults config.log.heartbeatSeconds to 60 seconds (142.357317ms)
  ✔ computeTaskHeartbeatStats reports elapsed seconds, event count, and total tokens (148.342195ms)
  ✔ computeTaskHeartbeatStats tolerates a missing event file (98.424543ms)
  ✔ logs multiple periodic heartbeat updates with elapsed, events, and tokens (493.661218ms)
  ✔ starts the heartbeat timer unreferenced via unref() (501.060163ms)
  ✔ clears the heartbeat timer in the finally block so it stops on completion (723.531518ms)
✔ Runner heartbeat (2109.4247ms)
▶ Watcher lifecycle modules
  ✔ acquires and releases a task lock through the watcher wrapper (2.978146ms)
  ✔ keeps lock.ts and heartbeat.ts under the 200 line module budget (1.282725ms)
✔ Watcher lifecycle modules (4.550967ms)
▶ Watcher loop permanent logging
  ✔ logs a single pick-up line when an approved spec is detected (260.702385ms)
  ✔ logs a single archive line when a completed spec is archived (205.513048ms)
  ✔ logs a single halt line when a task dies (131.289371ms)
  ✔ logs watcher errors at error level on permanent lines (31.00667ms)
✔ Watcher loop permanent logging (629.977648ms)
▶ Watcher loop symbol formatting
  ✔ resolveSymbol returns unicode when enabled and plain words otherwise (29.317959ms)
  ✔ uses unicode symbols on an interactive TTY (194.60829ms)
  ✔ uses plain words when stderr is not a TTY (170.528609ms)
  ✔ uses plain words when CI is set (179.311982ms)
  ✔ uses plain words when NO_COLOR is present (163.384995ms)
✔ Watcher loop symbol formatting (737.911894ms)
▶ Watcher idle status
  ✔ formats the build prefix, watching path, approved waiting count, and last archived spec (17.589286ms)
  ✔ sets an idle status with the waiting count and last archived spec (201.558053ms)
✔ Watcher idle status (219.570354ms)
▶ Watcher SIGINT handling
  ✔ clears status, restores the cursor, logs waiting, then exits on second SIGINT (137.812136ms)
✔ Watcher SIGINT handling (137.982565ms)
▶ Watcher Preflight Verification
  ✔ Watcher start runs preflight check when harness is opencode (94.685737ms)
  ✔ Preflight executes <bin> --version before any task is picked or spawned (205.615917ms)
  ✔ Missing binary prints single clear line naming bin path and exits non-zero without dispatching tasks (97.802691ms)
  ✔ Failing binary prints single clear line naming bin path and exits non-zero without dispatching tasks (56.7832ms)
  ✔ Missing binary in standalone child process exits non-zero and prints single line to stderr (235.263231ms)
  ✔ Successful execution logs resolved version string and proceeds to task cycle (228.321642ms)
  ✔ preflightOpencode helper resolves binary from config or environment and returns version info (56.808402ms)
✔ Watcher Preflight Verification (977.197769ms)
▶ Watcher stale build preflight
  ✔ exits with code 1 and exactly one stderr line when src/ is newer than dist/ (123.916606ms)
  ✔ exits with code 1 when a checkout has src/ but no dist/ (94.736553ms)
  ✔ continues when allowStale is true even with a stale layout (88.908679ms)
  ✔ continues for an installed package with no src/ directory (100.541095ms)
  ✔ continues when dist/ is newer than src/ (109.692582ms)
✔ Watcher stale build preflight (519.569345ms)
▶ Watcher Loop and CLI
  ✔ runWatcherOnce processes approved specs, executes tasks, and archives on completion (233.878907ms)
  ✔ runWatcherOnce executes multiple tasks sequentially in a multi-task spec without hash conflict and archives (308.975968ms)
  ✔ CLI registers watch and setup commands with expected options (17.747889ms)
✔ Watcher Loop and CLI (562.077348ms)
ℹ tests 1167
ℹ suites 258
ℹ pass 1166
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 13038.139067

✖ failing tests:

test at tests/harness-process.test.ts:7:917
✖ spawnWithTimeout forces SIGKILL after 5000ms grace period if SIGTERM fails to terminate (49.106108ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
  + 'SIGTERM'
  - 'SIGKILL'
        ^
  
      at TestContext.<anonymous> (/home/mathias/projects/osq/tests/harness-process.test.ts:115:14)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'SIGTERM',
    expected: 'SIGKILL',
    operator: 'strictEqual',
    diff: 'simple'
  }
 ELIFECYCLE  Test failed. See above for more details.
 ELIFECYCLE  Command failed with exit code 1.
