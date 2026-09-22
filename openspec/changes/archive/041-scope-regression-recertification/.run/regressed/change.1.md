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
  ✔ records the accepted decision for the pinned validator (6.089252ms)
  ✔ defines the exact dependency pin, binary path, and peer range (1.150057ms)
  ✔ documents validation execution semantics (0.954669ms)
  ✔ defines doctor diagnostic verification and drift reporting semantics (4.173784ms)
  ✔ is indexed from the decisions README (0.703882ms)
✔ ADR 004: Pinned OpenSpec Validator (14.44987ms)
▶ Agy stream-json event translation
  ✔ buildAgyArgs adds --output-format stream-json to the arguments (53.899299ms)
  ✔ extracts token usage from step_update usage fields (23.390731ms)
  ✔ defaults missing usage fields and derives total from input plus output (16.646733ms)
  ✔ appends a tokens event for a step_update with usage (20.313063ms)
  ✔ extracts tool name and command/path summaries from step_update tool steps (9.491475ms)
  ✔ appends a tool event and logs it at verbose level from the shared handler (13.516295ms)
  ✔ persists the tool event while suppressing the verbose log at normal level (23.339194ms)
  ✔ parses fixture/agy-events.jsonl lines and emits a single tokens event (11.598842ms)
  ✔ falls back gracefully when stdout is plain text without valid JSON (59.811064ms)
[agy] Unknown event type: init
  ✔ translates stream events through the adapter spawn path with the shared logger (102.542508ms)
✔ Agy stream-json event translation (337.335022ms)
▶ osq approve
  ✔ findSpecFolder resolves spec folder by ID, padded number, or prefix (38.017036ms)
  ✖ approveSpec lints, hashes, and writes .run/approved for valid spec (175.716863ms)
  ✔ approveSpec rejects spec failing lint and does not write approved marker (103.918189ms)
  ✖ re-approves an existing spec after modifications (123.439516ms)
✖ osq approve (443.95062ms)
▶ archive-time verification
  ✔ extracts a proposal verify command into SpecData (70.023799ms)
  ✔ archives a clean change after re-running every task and change verify (496.064914ms)
  ✔ refuses task 2 before spawning when an earlier done scope was modified (366.208346ms)
  ✔ blocks archiving when the change-level verify fails (401.645371ms)
  ✔ halts archival and records final-task drift before the archive verifier runs (430.168483ms)
  ✔ records every stale done task in one archive audit without stopping at the first (556.828723ms)
  ✔ repeatedly halts without adding verification, marker, or event duplicates (449.156903ms)
✔ archive-time verification (2772.324663ms)
▶ Archiver and Delta Application
  ✔ applyOpenSpecDeltas creates and then updates capability specs from delta specs (61.368617ms)
  ✔ archiveSpecFolder moves spec folder whole to archive preserving .run markers (27.628481ms)
  ✔ archiveSpecFolder preserves full .run history including results and event logs (18.137574ms)
  ✔ archiveSpecFolder preserves history by disambiguating if destination already exists (11.496105ms)
  ✔ archiveSpecFolder resolves the destination through a custom openspecRoot (33.044813ms)
  ✔ archiveSpecFolder applies delta specs inside openspec/specs and moves to the OpenSpec archive path (32.458889ms)
  ✔ archiveSpecFolder ensures every archived tasks.md is fully ticked (21.857981ms)
  ✔ archiveSpecFolder ticks tasks.md under the canonical archive layout (35.159698ms)
  ✔ archiveSpecFolder appends exactly one archived event to the archived change stream after relocation (17.909866ms)
  ✔ archiveSpecFolder emits no archived event when relocation fails (11.58155ms)
  ✔ checkAndArchiveSpec emits no archived event when change-level verification fails (108.378113ms)
  ✔ checkAndArchiveSpec records change-level verify_ran before the archived event (94.266604ms)
  ✔ checkAndArchiveSpec applies deltas once then archives only when all tasks are marked done (84.806651ms)
✔ Archiver and Delta Application (561.007986ms)
▶ built bin execution
  ✔ preserves the executable shebang after compilation (13.629109ms)
  ✔ generates valid programmatic type declarations (3.804022ms)
  ✔ resolves the package version from package.json at runtime (6.386509ms)
  ✔ prints the package.json version when invoked directly from an isolated directory (149.732543ms)
  ✔ prints help with command listings from an isolated directory (178.966891ms)
✔ built bin execution (4491.1243ms)
▶ changelog and release documentation
  ✔ ships a changelog with a 0.1.0 release entry (10.198556ms)
  ✔ summarises the changes from specs 001 through 012 (2.573602ms)
  ✔ documents the release procedure in the README (0.88278ms)
  ✔ lists the exact release commands (0.146249ms)
✔ changelog and release documentation (15.25ms)
error: option '--reason <text>' argument '   ' is invalid. a non-empty rejection reason is required
error: option '--reason <text>' argument '' is invalid. a non-empty rejection reason is required
error: required option '--reason <text>' not specified
▶ osq CLI
  ✔ configures program metadata and registered commands (5.199562ms)
  ✔ configures new command with required argument <name> (0.414795ms)
  ✔ configures approve command with variadic argument <ids...> (0.355016ms)
  ✔ configures watch command with once option (0.443915ms)
  ✔ configures reject command with required id argument and required reason option (0.555734ms)
  ✔ rejects an empty or whitespace-only reason at the CLI boundary (2.127276ms)
  ✔ requires the reject reason option to be supplied (0.631043ms)
  ✔ gives the root command an action and a --json inbox option (0.500304ms)
  ✔ keeps report --json scoped to the report subcommand (1.975573ms)
✔ osq CLI (14.170808ms)
▶ codex consumer guidance: scaffolded .env.example
  ✔ scaffolds commented Codex selection/binary/model guidance under the agy default (43.627229ms)
  ✔ contains no credentials or secret values (14.545914ms)
  ✔ mirrors the repository .env.example exactly (13.429627ms)
  ✔ preserves a consumer-edited example across repeated scaffolding (9.16359ms)
✔ codex consumer guidance: scaffolded .env.example (83.087607ms)
▶ codex consumer guidance: README
  ✔ lists codex and documents executor and independent planner examples with precedence (2.68228ms)
  ✔ covers installation, authentication, setup, diagnostics, permissions, and scope limits (2.230292ms)
  ✔ covers live smoke, fresh sessions, watcher verification, results, and observed costs (1.255196ms)
✔ codex consumer guidance: README (6.901303ms)
▶ Codex adapter registration, setup, and diagnostics
  ✔ registers the codex harness with a no-op setup that creates no files (53.180415ms)
Harness 'codex' setup completed successfully.
Harness 'codex' setup completed successfully.
  ✔ setupCommand preserves consumer Codex files, foreign blocks, and mixed-harness setup (299.387978ms)
  ✔ doctor probes the same configured Codex binary and reports failures (119.214019ms)
  ✔ buildManifest records the Codex model or default sentinel and configured effort (43.247558ms)
codex-cli 0.0.0-fake
  ✔ preflightCodex resolves CODEX_PATH and returns the version (117.663322ms)
✔ Codex adapter registration, setup, and diagnostics (634.776469ms)
▶ Codex noninteractive execution
  ✔ builds literal argv with sandboxing, approval, model, and effort controls (20.207961ms)
  ✔ names full task context including delta, living specs, prior result, and one-attempt rules (21.032647ms)
  ✔ spawns a fresh fake Codex with correct cwd, env, literal prompt, and translated events (125.638532ms)
  ✔ preserves failure, timeout, and terminal turn.failed diagnostics (1167.141419ms)
✔ Codex noninteractive execution (1335.350904ms)
▶ Codex configuration
  ✔ exports CodexConfig and resolution helpers from the public entry point (43.669751ms)
  ✔ centrally defaults preflight and kill-grace timeouts while preserving old timeout literals (2.474773ms)
  ✔ validateCodex settings via defineConfig and preserve native defaults (3.703418ms)
  ✔ resolves the Codex binary as codex.bin, then CODEX_PATH, then codex (1.389144ms)
  ✔ resolves the Codex model as codex.model, then OSQ_MODEL only for a Codex executor (3.153894ms)
  ✔ resolves effort and harness attribution with a default sentinel (1.096483ms)
  ✔ accepts a Codex planner with a model and rejects planner.agent (1.668687ms)
  ✔ loadConfig merges codex settings and applies OSQ_MODEL only to a Codex executor (287.644546ms)
✔ Codex configuration (346.544225ms)
▶ Codex planner selection
  ✔ uses the explicit planner model and never inherits the executor model (2.130636ms)
  ✔ falls back to the Codex executor and uses the default sentinel with no flag (0.312607ms)
✔ Codex planner selection (4.699647ms)
▶ Codex interactive adapter
  ✔ builds interactive argv with on-request approvals and no exec/JSON/effort flags (0.548674ms)
  ✔ rejects an unsupported agent and propagates spawn failures (285.854789ms)
✔ Codex interactive adapter (287.254713ms)
▶ planCommand with the Codex harness
  ✔ launches the fake interactive executable with inherited stdio and native model defaults (795.654894ms)
  ✔ uses the explicit planner model consistently in brief metadata and argv (692.562835ms)
  ✔ uses an explicit Codex planner without leaking the executor harness model (721.228144ms)
  ✔ propagates nonzero and signal exits from the interactive process (1184.474808ms)
  ✔ reuses an existing change and emits the print prompt without launching Codex (1253.302203ms)
✔ planCommand with the Codex harness (4648.710538ms)
▶ Codex stream observations
  ✔ translates completed observations in order without duplicating lifecycle stages (26.257078ms)
  ✔ omits absent optional usage counters and never writes cost (3.742279ms)
  ✔ tolerates malformed and unknown records and flushes an unterminated final record (2.828768ms)
  ✔ relativizes absolute file-change paths to the project root (1.729216ms)
  ✔ treats turn.failed as terminal but a recoverable error followed by success as not terminal (4.01554ms)
✔ Codex stream observations (42.270249ms)
▶ Codex watcher preflight
  ✖ fails before task spawn on a missing, nonzero, or timed-out probe (168.542229ms)
  ✖ probes the configured binary and dispatches an approved task after a successful probe (142.354103ms)
✖ Codex watcher preflight (312.808246ms)
▶ Codex runner outcomes
  ✖ preserves a supplied result and reaches done only after watcher verification (95.612986ms)
  ✖ synthesizes a missing result from the last completed assistant text (144.38322ms)
  ✖ fails with no_result when neither a result file nor final text exists (161.151595ms)
  ✖ fails with verify_red when independent verification fails (128.124131ms)
  ✖ records crashed for a terminal turn.failed even when the process exits zero (116.945518ms)
  ✖ reportCommand JSON consumes normalized usage and file events without double counting (93.095858ms)
✖ Codex runner outcomes (740.444047ms)
▶ catalog-driven planner validation
  ✔ accepts every catalogued harness with any supported casing and normalizes the name (1.628051ms)
  ✔ retains the required non-empty planner model (0.406925ms)
  ✔ rejects uncatalogued harnesses naming the catalog entries (0.231327ms)
  ✔ rejects optional settings unsupported by the selected harness, naming harness and setting (0.367756ms)
  ✔ rejects malformed optional settings before harness-specific checks (0.136898ms)
✔ catalog-driven planner validation (3.919876ms)
▶ catalog-driven planner selection
  ✔ uses explicit planner values and the supported default agent (1.114127ms)
  ✔ never leaks executor effort or cross-harness defaults into an explicit planner (0.310976ms)
  ✔ falls back to the selected executor catalog entry with native attribution (0.558823ms)
  ✔ uses planner values for a mixed harness selection without executor leakage (0.367786ms)
✔ catalog-driven planner selection (2.824408ms)
▶ planner configuration integration and exports
  ✔ keeps defineConfig planner validation wired to the catalog (1.161347ms)
  ✔ exposes catalog planner helpers through the public entry point (0.126499ms)
✔ planner configuration integration and exports (1.892538ms)
▶ planner configuration and manifest attribution
  ✔ defineConfig accepts valid planner configurations (12.267528ms)
  ✔ defineConfig rejects invalid planner configurations (2.231375ms)
  ✔ loadConfig loads planner block from config file (253.678344ms)
  ✔ buildManifest populates manifest.planner from config (60.636705ms)
✔ planner configuration and manifest attribution (330.262687ms)
▶ queue configuration
  ✔ accepts a complete finite non-negative queue block (11.175874ms)
  ✔ leaves queue absent and invents no default ceilings (6.752294ms)
  ✔ rejects a partial queue block because both ceilings are required together (3.142076ms)
  ✔ rejects string, negative, NaN, and infinite values clearly (3.284074ms)
  ✔ rejects a non-object queue block (3.018876ms)
  ✔ loads a queue block from osq.config.ts (233.410671ms)
  ✔ exposes QueueConfig through the public package surface (3.508871ms)
✔ queue configuration (266.186324ms)
▶ OsqConfig
  ✔ provides specification-compliant default limits, paths, and timeouts (9.515099ms)
  ✔ allows overriding specific limits while retaining default paths and timeouts (1.842349ms)
  ✔ loadConfig returns DEFAULT_CONFIG if no config file exists (4.677348ms)
  ✔ loadConfig reads .env and loads osq.config.ts (242.061747ms)
✔ OsqConfig (259.618278ms)
▶ Layout cut-over
  ✔ switches DEFAULT_CONFIG paths to the openspec layout (63.771508ms)
  ✖ monitors openspec/changes for approved change folders (112.292195ms)
  ✔ does not pick up change folders left in the legacy specs/ directory (54.218221ms)
  ✖ prints the Human steps outcome after the change completes (149.331135ms)
  ✖ never moves the legacy layout itself while cutting the runtime over (138.43876ms)
  ✔ removes obsolete legacy path identifiers from the runtime units (20.909856ms)
  ✔ extracts a Human steps section from a change document (19.251097ms)
✖ Layout cut-over (560.490342ms)
▶ Failure marker retention across approval and retry
  ✖ leaves active dead and regressed markers untouched when approval re-seals (144.025655ms)
  ✖ retains dead/1.1.md alongside done/1 after an explicit retry and successful rerun (142.010427ms)
  ✖ preserves an active dead marker when a task succeeds without re-approval (133.89381ms)
✖ Failure marker retention across approval and retry (421.442004ms)
▶ Delta merge engine
  ✔ parseDelta extracts ADDED, MODIFIED, REMOVED, and RENAMED blocks (3.101081ms)
  ✔ parseDelta returns empty operations for a delta with no requirement sections (0.398666ms)
  ✔ requirement parser extracts requirement names and scenario WHEN/THEN bullets (0.386716ms)
  ✔ merges operations in strict RENAMED -> REMOVED -> MODIFIED -> ADDED sequence (0.717572ms)
  ✔ applies RENAMED before REMOVED and MODIFIED (0.379306ms)
  ✔ throws a deterministic error when a MODIFIED target is missing (0.896579ms)
  ✔ throws a deterministic error when a REMOVED target is missing (0.574844ms)
  ✔ creates a new capability spec from the delta Purpose when no base exists (0.588774ms)
  ✔ golden-file test asserts byte-for-byte exact rebuilding across all four operations (0.435235ms)
✔ Delta merge engine (9.279102ms)
▶ Archiver OpenSpec delta application
  ✔ applyOpenSpecDeltas creates and then updates capability specs from delta specs (26.941585ms)
  ✔ applyOpenSpecDeltas ignores change folders without OpenSpec delta specs (2.989496ms)
✔ Archiver OpenSpec delta application (30.335527ms)
▶ Baseline living capability code ownership
  ✔ parses all five capability delta specs without syntax errors (17.590701ms)
  ✔ cleanly appends the Code ownership requirement to a base spec with existing requirements (0.345456ms)
  ✔ deterministically merges each delta into a valid spec containing the ownership globs (14.898687ms)
  ✔ applies all five deltas into a living OpenSpec root declaring Code ownership (24.568321ms)
✔ Baseline living capability code ownership (57.894069ms)
▶ runDoctorChecks
  ✔ passes all checks for a healthy repository (1680.183424ms)
  ✔ passes the validator check with the pinned version (12.911825ms)
  ✔ fails the validator check on version drift (11.516418ms)
  ✔ fails the validator check when the binary is unavailable (10.39055ms)
  ✔ fails the config check when config properties are invalid (1269.693136ms)
  ✔ fails the config check when the loader throws (756.73623ms)
  ✔ fails the config check when openspecRoot is not a string (961.523273ms)
  ✔ fails the harness check when the configured binary is unavailable (585.149137ms)
  ✔ fails the managed-blocks check when PLANNER.md lacks a managed block (596.025354ms)
  ✔ fails the managed-blocks check on a partial marker pair (607.849806ms)
  ✔ fails the locks check when an orphaned lock exists (424.455085ms)
  ✔ passes the locks check when the recorded pid is alive (561.676668ms)
  ✔ fails the archives check when an archived change is corrupt (485.670972ms)
  ✔ passes the archives check when archived changes are complete (433.73895ms)
  ✔ ignores legacy specs/archive contents when checking canonical archives (372.585309ms)
  ✔ fails the done-markers check when a marker lacks valid frontmatter (14.800753ms)
  ✔ passes the done-markers check for automated and manual markers (20.960678ms)
  ✔ fails the done-markers check when a manual marker has no reason (15.224249ms)
  ✔ ignores archived done markers when checking active changes (15.945913ms)
✔ runDoctorChecks (8841.406575ms)
▶ doctorCommand
  ✔ prints one line per check and exits non-zero only on failure (68.507858ms)
✔ doctorCommand (68.842494ms)
▶ active repository checkout
  ✔ passes all checks on the osq repository itself (848.597343ms)
✔ active repository checkout (848.86213ms)
▶ osq done command registration
  ✔ registers done <id> <task> with a required --manual option (2.862649ms)
✔ osq done command registration (3.737279ms)
Marked task 3 of 001-manual-done done (manual)
  Reason: flaky network in CI
▶ manual task completion
  ✔ writes manual frontmatter, appends a done_manual event, and ticks the checkbox (96.926587ms)
  ✔ refuses to mark a task that does not exist (25.926771ms)
  ✔ requires a non-empty manual reason (19.407082ms)
✔ manual task completion (142.912192ms)
▶ report manual vs verified accounting
  ▶ active specs
    ✔ counts verified and manual completions separately (105.263717ms)
  ✔ active specs (111.936838ms)
  ▶ archived specs
    ✔ counts manual done markers as manual (30.717052ms)
  ✔ archived specs (31.112028ms)
✔ report manual vs verified accounting (143.434872ms)
▶ Golden event streams
  ✔ normalizes timestamps, pids, versions, and project paths to stable tokens (56.168238ms)
  ✔ masks verify_ran duration to zero while preserving exit code and command (35.788741ms)
  ✔ masks measures scope hashes to stable tokens (22.781078ms)
  ✖ matches the checked-in golden events for a verified task (163.809536ms)
  ✖ matches the checked-in golden events for a dead task (121.380126ms)
✖ Golden event streams (401.814568ms)
▶ generic harness consumer architecture
  ✔ detects synthetic harness branches and ignores comments and prose (2.593668ms)
  ✔ covers every generic consumer and derives forbidden names from the catalog (15.176272ms)
  ✔ contains no harness-name comparisons or cross-harness fallbacks (7.334112ms)
✔ generic harness consumer architecture (26.900252ms)
▶ harness capability catalog
  ✔ contains every supported harness exactly once in ordered available names (1.481124ms)
  ✔ normalizes lookup across supported casing and reports catalog names when unknown (0.585663ms)
  ✔ resolves each harness executable through catalog metadata (0.395935ms)
  ✔ derives executor identity only from the selected harness, with a default sentinel (0.577103ms)
  ✔ declares planner-agent capability and native attribution per catalog entry (0.128518ms)
  ✔ keeps adapter factories at runtime parity with catalog names (0.404165ms)
  ✔ exposes the catalog through the public configuration entry point (4.412581ms)
✔ harness capability catalog (9.761435ms)
▶ doctor harness diagnostics resolve through the catalog
  ✔ probes each external executable and passes a no-binary harness without a process (179.625885ms)
  ✔ reports missing, nonzero, and timeout probes as failing harness checks (1087.211695ms)
  ✔ prints the harness result through the doctorCommand output contract (327.039106ms)
✔ doctor harness diagnostics resolve through the catalog (1595.425148ms)
▶ approval manifest uses the shared executor identity
  ✔ records the selected harness model or default and applicable effort (89.707581ms)
  ✔ keeps planner.model-or-null independent of the executor identity (51.007622ms)
  ✖ approveSpec writes the same identity through the real approval path (122.486894ms)
✖ approval manifest uses the shared executor identity (265.951567ms)
▶ watcher preflight uses the adapter port
  ✔ invokes a supplied preflight and continues when the port is absent (29.838559ms)
  ✔ does not probe a catalogued no-binary harness even when a preflight is supplied (15.283465ms)
  ✔ probes the resolved opencode and codex executables before the first cycle (96.87383ms)
✔ watcher preflight uses the adapter port (158.931411ms)
▶ task started events use the shared executor identity
  ✖ records the selected harness and its model for agy, opencode, mock, and codex (105.731524ms)
✖ task started events use the shared executor identity (107.642447ms)
Created spec 001: 001-explicit-plan
  Path: /tmp/osq-generic-plan-XvZ1mw/openspec/changes/001-explicit-plan
▶ planCommand uses the shared planner selection
  ✔ uses explicit planner values in brief metadata and interactive arguments (35.374056ms)
Created spec 001: 001-implicit-agy
  Path: /tmp/osq-generic-plan-OGJYr9/openspec/changes/001-implicit-agy
Created spec 002: 002-implicit-opencode
  Path: /tmp/osq-generic-plan-OGJYr9/openspec/changes/002-implicit-opencode
Created spec 003: 003-implicit-mock
  Path: /tmp/osq-generic-plan-OGJYr9/openspec/changes/003-implicit-mock
  ✔ falls back to the selected executor entry when no planner block exists (115.683056ms)
Created spec 001: 001-implicit-codex
  Path: /tmp/osq-generic-plan-5PE7rW/openspec/changes/001-implicit-codex
Created spec 002: 002-mixed-codex-plan
  Path: /tmp/osq-generic-plan-5PE7rW/openspec/changes/002-mixed-codex-plan
  ✔ records default and passes no invented model for native Codex planning (68.289609ms)
✔ planCommand uses the shared planner selection (219.773036ms)
▶ HarnessAdapter spawnInteractive
  ✔ OpencodeAdapter spawns fake binary with expected argv and returns exit code (85.974532ms)
  ✔ AgyAdapter spawns fake binary with expected -i argv and returns exit code (40.36651ms)
  ✔ OpencodeAdapter inherits child stdout and stderr without capturing them (372.543311ms)
  ✔ AgyAdapter inherits child stdout and stderr without capturing them (282.666085ms)
  ✔ MockAdapter records interactive spawns and returns configured exit code (1.984608ms)
✔ HarnessAdapter spawnInteractive (785.561575ms)
▶ Shared Process Execution and Timeout Helper
  ✔ spawnWithTimeout executes child process with given command, args, cwd, and environment (78.096787ms)
  ✔ spawnWithTimeout terminates process with SIGTERM when execution exceeds timeoutSeconds (1013.346227ms)
  ✔ spawnWithTimeout forces SIGKILL after 5000ms grace period if SIGTERM fails to terminate (41.842234ms)
  ✔ spawnWithTimeout marks timedOut true and returns non-zero exit code on timeout (1012.505661ms)
  ✔ AgyAdapter uses spawnWithTimeout helper preserving existing timeout behavior (1024.87126ms)
✔ Shared Process Execution and Timeout Helper (3174.482972ms)
▶ Harness capability rule prompt injection
  ✔ extractCapabilityRules reads delta specs under specs/<capability>/spec.md (56.051396ms)
  ✔ extractCapabilityRules returns an empty array when no delta specs exist (3.450867ms)
  ✔ buildAgyPrompt injects capabilityRules under a dedicated section in Rules (5.047914ms)
  ✔ buildOpencodePrompt injects capabilityRules under the same dedicated section in Rules (2.469628ms)
  ✔ builds standard default rules without empty headers when capability rules are absent (2.176346ms)
  ✔ treats an explicit empty capabilityRules array as no capability rules (1.180757ms)
  ✔ derives capability rules from the change folder when capabilityRules is absent (6.018843ms)
  ✔ renders one prior-context section naming attempt, failure reason, and prior result (6.14002ms)
  ✔ omits the prior-context section on a fresh first attempt without a prior result (1.927999ms)
  ✔ treats an explicit prior result as prior context even before a retry (2.304695ms)
  ✔ renders a failed verification output block inside the prior context (1.854003ms)
  ✔ bounds an oversized prior failure output deterministically (1.619299ms)
  ✔ renders the same failed-output block in every textual prompt (10.291156ms)
✔ Harness capability rule prompt injection (104.796398ms)
▶ shared harness stream helpers
  ▶ asRecord
    ✔ returns a plain object unchanged (0.621653ms)
    ✔ returns undefined for arrays, null, undefined, and primitives (0.151009ms)
  ✔ asRecord (2.74607ms)
  ▶ firstNonEmptyString
    ✔ returns the first non-empty string and skips empty or non-string values (0.217448ms)
    ✔ returns undefined when no candidate is a non-empty string (0.158089ms)
  ✔ firstNonEmptyString (0.656723ms)
  ▶ resolveEventTimestamp
    ✔ normalizes string timestamps to ISO form (0.625063ms)
    ✔ normalizes numeric epoch timestamps to ISO form (0.202598ms)
    ✔ falls back to a nested step_update timestamp (0.296587ms)
    ✔ returns the current time for missing or invalid timestamps (0.233908ms)
  ✔ resolveEventTimestamp (1.702281ms)
  ▶ EventStreamParser
    ✔ reassembles lines split across chunks and flushes the trailing partial line (1.174567ms)
    ✔ skips empty and whitespace-only lines (0.44916ms)
    ✔ awaits handlers serially in arrival order (19.772325ms)
    ✔ continues after a handler rejects and still resolves flush (2.064472ms)
    ✔ flushes an unterminated final line exactly once across repeated feeds (0.183528ms)
  ✔ EventStreamParser (24.78262ms)
✔ shared harness stream helpers (31.109614ms)
▶ Harness Adapter and Event Logging
  ✔ appendHarnessEvent appends valid JSONL events to .run/events/<n>.jsonl (43.594534ms)
  ✔ MockAdapter setup and spawn simulates task execution and emits events (23.88861ms)
  ✔ AgyAdapter initializes with correct name and can perform setup (17.095186ms)
  ✔ getHarnessAdapter resolves registered adapters and rejects unknown names (30.442978ms)
  ✔ AgyAdapter includes --print-timeout <n>s in args based on config timeouts (15.104822ms)
✔ Harness Adapter and Event Logging (132.337027ms)
▶ Folder Hasher
  ✔ produces deterministic SHA-256 hash for identical folder contents (47.246686ms)
  ✔ ignores .run directory and its marker files completely (19.481684ms)
  ✔ normalizeTasksMd normalizes checked boxes to unchecked boxes (17.342842ms)
  ✔ ticking a task checkbox in tasks.md produces identical hash (32.44601ms)
  ✔ deleting or modifying a task line in tasks.md changes the hash (17.955734ms)
  ✔ changes hash when any task or spec file is modified (15.719796ms)
  ✔ normalizes CRLF and LF to yield identical hashes across platforms (19.910135ms)
  ✔ verifyFolderHash returns true if and only if folder hash matches approved hash (16.405019ms)
✔ Folder Hasher (189.021545ms)
▶ import graph boundaries
  ✔ WatchCommandOptions is declared in src/watcher/dev.ts (8.619555ms)
  ✔ src/cli/watch.ts imports WatchCommandOptions from src/watcher/dev.ts (3.844136ms)
  ✔ src/core imports only from src/core (53.058662ms)
  ✔ src/harness imports from neither src/watcher nor src/cli (17.497808ms)
  ✔ src/watcher imports from no module in src/cli (25.206333ms)
  ✔ has zero import violations overall (38.214364ms)
✔ import graph boundaries (148.038821ms)
▶ runner lifecycle module line budget
  ✔ keeps every runner lifecycle module strictly under 200 lines (2.292721ms)
✔ runner lifecycle module line budget (2.861415ms)
▶ inbox needs-you projection
  ✔ projects every attention kind once in change/task order with exact commands (90.134917ms)
  ✔ ignores a change without proposal.md (6.878547ms)
✔ inbox needs-you projection (98.172401ms)
▶ inbox running projection
  ✔ includes only derived running tasks whose parsed lock PID is live and leaves markers (6.335686ms)
  ✔ omits malformed or non-finite locks without creating a running item (7.579869ms)
✔ inbox running projection (14.37515ms)
▶ inbox landed projection and cursor
  ✔ selects strictly later archives with a valid cursor and newest ten otherwise (56.095037ms)
  ✔ keys the cursor by sha256(realpath) and tolerates missing, malformed, or invalid content (4.242197ms)
✔ inbox landed projection and cursor (60.863428ms)
▶ inbox text and JSON contract
  ✔ collapses a completely empty inbox to exactly Inbox empty. (1.660971ms)
  ✔ renders all groups with one (none) line per empty group and command-terminated rows (10.271105ms)
  ✔ exposes exactly the documented JSON keys and value types (8.618179ms)
✔ inbox text and JSON contract (21.314136ms)
▶ bare osq CLI inbox integration
  ✔ renders text, advances and deletes the cursor, caps fallback at ten, and preserves change folders (1620.790651ms)
  ✔ emits exactly the documented JSON object for --json (683.201711ms)
  ✔ materializes the missing runtime lock directory from clean tracked fixture state (842.617783ms)
  ✔ prints exactly Inbox empty. for an empty project (454.838127ms)
  ✔ keeps explicit status complete and report --json scoped without advancing the cursor (1460.349346ms)
✔ bare osq CLI inbox integration (5062.667178ms)
▶ osq init PLANNER.md
  ✔ creates PLANNER.md with the managed block when missing (17.33524ms)
  ✔ replaces the managed block while preserving content outside the markers (22.859312ms)
  ✔ appends the managed block when markers are absent (3.114931ms)
  ✔ managed block instructs planners to write files with the file tool (0.901799ms)
  ✔ managed block encodes the slicing rule (0.685963ms)
  ✔ managed block encodes the detail rule (0.756891ms)
  ✔ managed block encodes the change-level verify rule (0.691923ms)
  ✔ managed block requires final-tree verification inside the Tasks guidance (2.236395ms)
  ✔ managed block requires ordered shared-file ownership inside the Tasks guidance (0.89317ms)
  ✔ repository PLANNER.md carries the file-tool instruction (0.774941ms)
  ✔ scaffoldProject initializes PLANNER.md and reports it on InitResult (9.105404ms)
  ✔ PLANNER.md, MANAGED_PLANNER_BLOCK, and templates/PLANNER.md are byte-for-byte equal (2.151077ms)
✔ osq init PLANNER.md (65.110164ms)
▶ osq init
  ✔ scaffolds only the OpenSpec layout and default files in a fresh repo (34.678433ms)
  ✔ does not create legacy specs/ or specs/_template/ during initialization (27.7482ms)
  ✔ does not overwrite existing osq.config.ts (17.192813ms)
  ✔ creates AGENTS.md with the managed block if missing (3.165045ms)
  ✔ managed block is clean, self-contained, and contains no self-referential repo text (1.678926ms)
  ✔ injects or updates the managed block in an existing AGENTS.md idempotently (2.278185ms)
  ✔ scaffolds openspec/config.yaml declaring the osq schema and per-artifact rules (24.137793ms)
  ✔ scaffolds openspec/schemas/osq/schema.yaml forked from spec-driven without design (41.56523ms)
  ✔ schema README documents tasks/<n>.md as an osq-specific execution unit (9.072474ms)
  ✔ refreshes the managed AGENTS.md block with OpenSpec layout instructions (2.57523ms)
  ✔ is strictly idempotent and preserves existing OpenSpec configuration (20.298606ms)
✔ osq init (187.414247ms)
▶ instruction-shaped delta linting
  ✔ rejects a requirement named with "Update" (159.302465ms)
  ✔ rejects a requirement named with "Document" (88.131737ms)
  ✔ rejects instruction-shaped names case-insensitively (113.811122ms)
  ✔ names the capability and requirement title in the error (124.061049ms)
  ✔ inspects MODIFIED and REMOVED requirement sections (108.533651ms)
  ✖ accepts declarative delta requirements with zero errors (93.950203ms)
  ✔ prevents approval of a change folder with an instruction-shaped delta (95.744763ms)
✖ instruction-shaped delta linting (785.502269ms)
▶ layout path derivation
  ✔ derives the changes directory from a relative openspecRoot (1.151207ms)
  ✔ derives the changes directory from an absolute openspecRoot (0.144249ms)
  ✔ prepends an optional project root (0.183758ms)
  ✔ derives the archive directory from openspecRoot (0.200167ms)
  ✔ derives the specs directory from openspecRoot (0.121668ms)
  ✔ derives change-local directories from the change folder (0.141859ms)
  ✔ derives done, dead, and event artifact paths (0.258847ms)
  ✔ anchors absolute change folders without rebasing them (0.270507ms)
  ✔ derives deterministically and tracks the configured root (0.385196ms)
  ✔ keeps the layout module under 200 lines (26.708782ms)
✔ layout path derivation (33.67425ms)
▶ source line budget
  ✔ keeps every non-allow-listed source file at or under 250 lines (50.646916ms)
✔ source line budget (51.871693ms)
▶ Spec Linter
  ✔ passes a clean, compliant spec (169.180206ms)
  ✔ rejects a proposal declaring features.writes in frontmatter (91.55533ms)
  ✔ rejects more than one table under Contract (115.253347ms)
  ✔ rejects verify command that chains commands (113.06871ms)
  ✔ rejects depends_on naming a missing change (109.79605ms)
  ✔ accepts depends_on naming a change that lives in the archive (114.724039ms)
  ✔ accepts depends_on naming a change that lives in the rejected directory (140.218816ms)
  ✔ rejects acceptance checklist longer than maxAcceptanceLines (110.601058ms)
  ✔ permits task title containing " and " without warning (104.185855ms)
  ✔ resolves proposal.md as the change document when spec.md is absent (111.714721ms)
  ✔ rejects a change folder missing both proposal.md and spec.md (16.380806ms)
  ✔ rejects a proposal.md lacking a verify command (102.071494ms)
  ✔ accepts a proposal.md declaring a verify command (92.011906ms)
  ✔ rejects a non-boolean nested tests.modify declaration (160.688319ms)
  ✔ rejects a non-boolean flat tests.modify declaration (109.924776ms)
  ✔ accepts a boolean nested tests.modify declaration (170.902576ms)
  ✔ rejects scope touching an existing test file without tests.modify (121.585306ms)
  ✔ rejects a tests/** scope matching an existing test file without tests.modify (189.970174ms)
  ✔ passes a scope touching existing test files when tests.modify is true (133.299985ms)
  ✔ permits scope naming a new test file that does not exist yet (139.336799ms)
  ✔ executes local openspec validate for changes and specs under OPENSPEC_TELEMETRY=0 (214.855582ms)
  ✔ fails closed when no local openspec binary is installed (111.891004ms)
  ✔ parses JSON validation failures and prefixes them with openspec: (146.502487ms)
  ✔ logs the resolved OpenSpec version and does not warn when it matches the pin (128.473545ms)
  ✔ fails when the resolved OpenSpec version differs from the pin (169.679705ms)
  ✔ verifies delta target existence against base specs (115.433734ms)
  ✔ accepts a delta whose modified requirement exists in the base spec (110.074216ms)
  ✔ accepts an added-only delta for a capability with no base spec (175.654433ms)
  ✔ rejects an added delta requirement named with "Update" (129.378169ms)
  ✔ rejects an added delta requirement named with "Document" (196.68311ms)
  ✔ accepts a declarative added delta requirement with zero errors (169.042503ms)
  ✔ rejects the template placeholder in a proposal verify (149.079398ms)
  ✔ rejects the template placeholder in a task verify with one message (174.336541ms)
  ✔ rejects normalized placeholder equivalents (585.175961ms)
  ✔ rejects package-script invocations whose script is absent (725.097759ms)
  ✔ accepts a present package script without a path warning (123.470925ms)
  ✔ warns when a task verify names no path or package script (137.936029ms)
  ✔ warns when a proposal verify names no path or package script (154.849716ms)
  ✔ does not warn when a verify names an existing repository path (204.940362ms)
  ✔ accepts a path-shaped binary that exists (169.283642ms)
  ✔ handles a missing or malformed root package manifest deterministically (227.162602ms)
  ✔ retains the chaining diagnostic without reinterpreting it (177.749641ms)
  ✔ keeps checked-in fixture verification local and free of the placeholder (132.99678ms)
  ✔ registers the lint command in the CLI (69.559734ms)
  ✔ lint command exits non-zero when a change folder fails lint (147.214572ms)
  ✔ lint command exits zero when all change folders are valid (107.68199ms)
✔ Spec Linter (7377.372291ms)
▶ Living spec delta equivalence
  ✔ re-seeds every living spec as the cumulative deterministic merge of 016..027 (124.951849ms)
  ✔ preserves requirements introduced by 017 and 020 through 027 (3.677668ms)
  ✔ contains zero legacy "Delta from" references and no loose spec markdown files (4.670787ms)
  ✔ git grep "Delta from" openspec/specs returns zero matches (8.714296ms)
  ✔ deletes the legacy prose appender applyDelta and calls applyOpenSpecDeltas directly (95.675765ms)
✔ Living spec delta equivalence (240.064146ms)
▶ Lock and Reaper
  ✔ acquireLock writes running marker exclusively (23.968787ms)
  ✔ releaseLock removes running marker cleanly (7.272499ms)
  ✔ isPidRunning accurately reports current process and non-existent process (1.936502ms)
  ✔ reapStaleLocks detects a dead pid and unlinks the lock without writing a dead marker (6.170903ms)
  ✔ reapStaleLocks detects an expired lock without writing a dead marker (5.898639ms)
✔ Lock and Reaper (47.392122ms)
▶ logger status interface
  ✔ exposes status(text) and clearStatus() (1.099732ms)
✔ logger status interface (2.14236ms)
▶ logger status on an interactive TTY sink
  ✔ clears the status row, writes the log line, and redraws status below (1.516012ms)
  ✔ prefixes every line of a multi-line log and redraws once below (0.791191ms)
  ✔ starts an unref'd 80ms interval that advances spinner frames (1.306736ms)
  ✔ does not disturb the status row when a message is suppressed by level (0.823041ms)
  ✔ clearStatus() clears the active row and stops the animation timer (0.360786ms)
  ✔ honours the isTTY option override for a non-TTY stream (0.239438ms)
  ✔ truncates an overflowing status to columns minus the spinner prefix, with no prefix (1.041533ms)
  ✔ keeps redrawn rows within the terminal width and clear of ghost characters (1.050968ms)
✔ logger status on an interactive TTY sink (8.156378ms)
▶ logger status in non-interactive sinks
  ✔ is a no-op when isTTY is false and renders no escape sequences (0.367786ms)
  ✔ is a no-op when process.env.CI is set, even on a TTY (0.358616ms)
  ✔ is a no-op at quiet level, even on a TTY (0.160079ms)
✔ logger status in non-interactive sinks (1.086918ms)
▶ createLogger
  ✔ exports createLogger and accepts a LogLevel (0.95734ms)
  ✔ writes exclusively to process.stderr with a bracketed prefix (0.264437ms)
  ✔ writes without a prefix when none is supplied (0.157029ms)
  ✔ prefixes every line of a multi-line message (0.208338ms)
  ✔ quiet level suppresses info and verbose messages but writes warn and error (0.216178ms)
  ✔ normal level outputs info, warn, and error while suppressing verbose (0.130549ms)
  ✔ verbose level outputs info, verbose, warn, and error (0.190557ms)
✔ createLogger (3.172635ms)
▶ watch command verbosity options
  ✔ registers --verbose and -q/--quiet options on watch (2.028827ms)
  ✔ parses --verbose and --quiet into the watch command options (6.998362ms)
✔ watch command verbosity options (9.614643ms)
▶ managed instructions block retired paths
  ▶ MANAGED_AGENTS_MD_BODY
    ✔ does not reference retired features/ paths (1.144361ms)
    ✔ does not reference "drift against features" (0.202348ms)
    ✔ does not reference a legacy root-level specs/ path (0.715702ms)
  ✔ MANAGED_AGENTS_MD_BODY (3.197724ms)
  ▶ AGENTS.md
    ✔ does not reference retired features/ paths (0.211727ms)
    ✔ does not reference "drift against features" (0.142768ms)
    ✔ does not reference a legacy root-level specs/ path (0.209278ms)
  ✔ AGENTS.md (0.862301ms)
✔ managed instructions block retired paths (4.608639ms)
▶ managed instructions block OpenSpec protocol
  ✔ documents the OpenSpec layout, markers, gates, and permissions (0.373166ms)
  ✔ is mirrored by the repository AGENTS.md guidance (0.171028ms)
✔ managed instructions block OpenSpec protocol (0.773711ms)
▶ planner managed block coexistence
  ✔ preserves foreign text and blocks across repeated initialization (19.462368ms)
  ✔ updates only the osq-managed block beside a foreign block (5.499055ms)
✔ planner managed block coexistence (25.348228ms)
▶ mangled change folder linting
  ✖ accepts clean files containing newlines and tabs (133.914977ms)
  ✔ rejects a nested file containing a bell character (82.57918ms)
  ✔ rejects a backspace character in a task file (82.013436ms)
  ✔ rejects a carriage return in a task file (110.347161ms)
  ✔ rejects a DEL control character in a change file (87.09169ms)
  ✖ ignores prohibited control characters under .run/ (131.726851ms)
  ✔ rejects fused acceptance lines in a task file (105.733194ms)
  ✖ allows a single acceptance item per line (83.523419ms)
  ✔ approveSpec refuses to seal a change folder with a control character (98.184915ms)
✖ mangled change folder linting (917.262761ms)
▶ run manifest
  ✖ writes .run/manifest.json with hashes and metadata on approval (151.19988ms)
  ✖ records null for a hashed file that does not exist (128.643526ms)
  ✖ counts valid plan_started records, including resumed sessions without exits (96.863907ms)
  ✖ tolerates a missing, empty, or partially malformed planning log (146.232435ms)
  ✖ changes planningSessions when only the plan log changes, keeping the approved hash (111.724446ms)
✖ run manifest (637.114452ms)
▶ measures
  ▶ countWords
    ✔ returns 0 for empty and whitespace-only input (23.892165ms)
    ✔ counts single and multiple whitespace-delimited words (2.260485ms)
  ✔ countWords (27.318538ms)
  ▶ gatherScopeCounts
    ✔ counts existing scoped files and their lines, ignoring missing ones (9.937342ms)
    ✔ returns zeros when no scoped file exists (1.406579ms)
  ✔ gatherScopeCounts (11.798676ms)
  ▶ gatherRepoCounts
    ✔ totals text files while skipping ignored directories (21.570921ms)
    ✔ skips binary files containing null bytes (3.927827ms)
  ✔ gatherRepoCounts (26.25861ms)
  ▶ countImportFanIn
    ✔ counts non-scoped files that import a scoped file (9.28836ms)
    ✔ returns 0 when only scoped files import each other (4.37647ms)
  ✔ countImportFanIn (13.977646ms)
  ▶ countDeltaRequirementsAndScenarios
    ✔ counts requirement and scenario headers across delta specs (12.204472ms)
    ✔ returns zeros when no delta specs exist (2.013997ms)
  ✔ countDeltaRequirementsAndScenarios (14.592155ms)
  ▶ snapshotScopeHashes and hashFileForMeasures
    ✔ hashes known content and returns null for missing files (4.725588ms)
    ✔ hashFileForMeasures returns null for an absent file (1.545113ms)
  ✔ snapshotScopeHashes and hashFileForMeasures (6.765334ms)
  ▶ gatherEndMeasures
    ✔ counts changed files and absolute line deltas for modified, added, and deleted files (5.833164ms)
    ✔ reports zero changes and equal before/after hashes when scope is untouched (1.647582ms)
    ✔ carries every start-phase field into the end event (0.852231ms)
  ✔ gatherEndMeasures (8.625683ms)
  ▶ emitMeasures
    ✔ appends a measures start event to .run/events/<n>.jsonl (6.707984ms)
    ✔ uses one emission path for both start and end phases (6.872714ms)
  ✔ emitMeasures (13.875785ms)
  ▶ gatherStartMeasures
    ✔ collects scope, repo, word, and delta baselines for a task (16.074696ms)
  ✔ gatherStartMeasures (16.348538ms)
  ▶ runner integration
    ✖ emits start then end measures for a verified task (90.083536ms)
    ✖ reports changed files and lines for a scoped edit (104.679246ms)
    ✖ emits an end measures event for a crashed dead outcome (112.399708ms)
    ✖ emits end measures before the dead event on verify_red (76.495397ms)
  ✖ runner integration (384.486348ms)
✖ measures (525.532896ms)
▶ osq migrate openspec
  ✔ moves features/ to openspec/specs/ and specs/ to openspec/changes/ (78.027951ms)
  ✔ resolves every migration target through the canonical layout helpers (29.635469ms)
  ✔ migrates archived changes to openspec/changes/archive/ preserving .run/ markers (20.71564ms)
  ✔ converts spec.md to proposal.md with frontmatter and preserves prose under ## Delta (legacy) (35.97492ms)
  ✔ ticks every archived tasks.md (including already-checked and real copies) (157.05425ms)
  ✔ migrates fixture and real archived copies passing both validators (151.388983ms)
  ✔ creates the 017 stub change folder under openspec/changes/017-sample/ (25.834116ms)
  ✔ convertSpecToProposal drops features.writes and preserves delta prose (1.632997ms)
  ✔ tickAllCheckboxes ticks only unchecked boxes and preserves structure (1.003128ms)
  ✔ registers the migrate command with a required target argument (2.424544ms)
  ✔ migrate command rejects unsupported targets with a non-zero exit (0.89026ms)
  ✔ migrate command runs the openspec migration and reports a summary (25.91021ms)
✔ osq migrate openspec (532.795589ms)
▶ osq new
  ✔ slugify converts titles to valid kebab-case folder names (35.817625ms)
  ✔ getNextSpecNumber correctly increments existing spec numbers including archive (21.619168ms)
  ✔ createNewSpec generates numbered change folder from template with updated title (16.910597ms)
  ✔ createNewSpec respects options.specsDirName override (21.766682ms)
  ✔ createNewSpec rejects empty or invalid spec names (9.46195ms)
✔ osq new (107.808575ms)
▶ no skipped output in src
  ✔ contains zero case-insensitive occurrences of "skipped" under src/ (49.769395ms)
✔ no skipped output in src (51.02134ms)
▶ OpenCode Configuration and Adapter Registration
  ✔ OsqConfig interface defines opencode config with bin, model, agent, optional variant (7.954951ms)
  ✔ DEFAULT_CONFIG provides opencode defaults bin "opencode", model "deepseek/deepseek-flash", agent "osq-coder" (2.621975ms)
  ✔ OsqUserConfig accepts partial opencode fields and defineConfig merges them over DEFAULT_CONFIG (2.315384ms)
  ✔ DEFAULT_CONFIG defaults log.heartbeatSeconds to 60 and defineConfig preserves it (1.518073ms)
  ✔ loadConfig and defineConfig permit harness setting "opencode" (197.923616ms)
  ✔ getHarnessAdapter resolves "opencode" returning OpencodeAdapter instance (1.481218ms)
  ✔ README documents opencode in harness list with sample configuration block (1.40689ms)
✔ OpenCode Configuration and Adapter Registration (216.846794ms)
▶ OpenCode Event Stream and Token Metrics Translation
  ✔ Stdout JSON lines stream matching fixture/opencode-events.jsonl is parsed line by line (44.249177ms)
  ✔ step_finish event extracts input, output, total, and cache tokens with cost (33.882947ms)
  ✔ tokens event is appended to .run/events/<n>.jsonl with promptTokens, candidateTokens, totalTokens, cachedTokens, cost (92.54844ms)
  ✔ Unknown event types such as step_start and text are logged at verbose level without throwing (52.971748ms)
  ✔ Malformed or unparseable non-JSON stdout lines do not crash the adapter process (10.085798ms)
✔ OpenCode Event Stream and Token Metrics Translation (235.536372ms)
▶ OpencodeAdapter planner agent setup
  ✔ OpencodeAdapter setup writes .opencode/agent/osq-planner.md with expected permissions and body (24.869153ms)
  ✔ Running setup twice leaves .opencode/agent/osq-planner.md byte-identical (4.694078ms)
  ✔ OpencodeAdapter setup respects custom planner agent name in config (3.269644ms)
✔ OpencodeAdapter planner agent setup (34.648919ms)
▶ OpenCode Adapter Setup
  ✔ OpencodeAdapter setup creates directory .opencode/agent/ if absent (13.611136ms)
  ✔ OpencodeAdapter setup writes .opencode/agent/osq-coder.md with description and mode all frontmatter (18.220658ms)
  ✔ Frontmatter permissions allow read, edit, bash, glob, grep, denying webfetch, websearch (7.22499ms)
  ✔ Agent file body contains AGENTS.md task execution procedure enclosed in managed block markers (6.865148ms)
  ✔ Setup is idempotent and preserves user edits outside managed block markers (9.782473ms)
  ✔ README notes --auto flag approves any action the agent file does not deny (1.286513ms)
  ✔ OpencodeAdapter setup respects custom agent name configured in OsqConfig (2.401784ms)
✔ OpenCode Adapter Setup (61.257276ms)
▶ OpenCode Adapter Task Spawning
  ✔ spawnTask constructs arguments: run --agent <agent> --auto --format json --dir <projectRoot> --model <model> (63.166775ms)
  ✔ Optional variant flag --variant <variant> is included when configured (38.350787ms)
  ✔ Attached files include --file <task.md>, --file <spec.md>, --file <featureDoc> for each feature named in task (23.604439ms)
  ✔ Positional prompt argument defines task guidelines matching AGENTS.md protocol (17.278339ms)
  ✔ Fake opencode binary validates passed flags, handles non-zero exit, and respects timeout termination (1127.160355ms)
✔ OpenCode Adapter Task Spawning (1272.454649ms)
▶ OpenCode tool event translation
  ✔ adds 'tool' to HarnessEventType and exposes ToolEventData (59.602224ms)
  ✔ extracts file paths and patterns for read, edit, write, and glob tools (27.894191ms)
  ✔ extracts the first 60 characters of the command for the bash tool (13.672238ms)
  ✔ falls back to 60 characters of JSON for any other tool (45.605747ms)
  ✔ recognizes tool_use top-level and part.type tool-use events (8.415992ms)
  ✔ appends a tool event and logs it at verbose level from the shared handler (16.933185ms)
  ✔ persists the event while suppressing the verbose log at normal level (15.254236ms)
  ✔ recognizes tool_use lines in the stream parser and forwards the logger (19.400874ms)
  ✔ emits tool events through the adapter spawn path with the shared logger (74.737183ms)
✔ OpenCode tool event translation (283.913633ms)
▶ package hygiene
  ✔ packs only distribution assets (1142.604232ms)
  ✔ excludes source, tests, configs, workflows, and specs (1247.88382ms)
  ✔ declares required package metadata (13.402095ms)
✔ package hygiene (2405.295122ms)
▶ package manager independence
  ✔ never spawns pnpm from any test under tests/ (71.450794ms)
✔ package manager independence (71.977988ms)
▶ packed tarball consumer smoke test
  ✔ packs and installs the local tarball into an isolated temporary project (8544.934481ms)
  ✔ npx osq init scaffolds configuration, template directories, and AGENTS.md (265.721342ms)
  ✔ npx osq new smoke creates a valid change specification (264.409736ms)
✔ packed tarball consumer smoke test (9193.536481ms)
▶ Spec and Task Parser
  ✔ parseFrontmatter extracts YAML metadata and markdown content (5.840214ms)
  ✔ parseSpecMd extracts title, depends_on, reads, and markdown sections (5.367445ms)
  ✔ parseSpecMd extracts proposal frontmatter without requiring features.writes (2.778794ms)
  ✔ parseTaskMd extracts task metadata and acceptance criteria list (1.930324ms)
  ✔ parseTaskMd extracts entry and skills when populated (1.618152ms)
  ✔ parseTaskMd defaults testsModify to false when omitted (0.780012ms)
  ✔ parseTaskMd reads nested tests.modify booleans (0.943819ms)
  ✔ parseTaskMd accepts a flat tests.modify boolean key (0.89951ms)
  ✔ parseTaskMd ignores non-boolean tests.modify values (1.769321ms)
  ✔ parseTaskList parses OpenSpec grouped checklists with section headers and item numbers (1.243416ms)
  ✔ parseTaskList parses flat numbered checklists and unnumbered bullets (0.205388ms)
  ✔ handles empty sections or missing frontmatter safely (0.138158ms)
✔ Spec and Task Parser (27.226152ms)
▶ Code ownership parsing
  ✔ parseCodeOwnership extracts globs from a capability delta spec (1.072043ms)
  ✔ parseCodeOwnership extracts ownership from living markdown content (0.359856ms)
  ✔ parseCodeOwnership returns an empty array when the header is absent (0.169903ms)
✔ Code ownership parsing (2.26524ms)
▶ Change folder proposal resolution
  ✔ parseSpecMdFromFolder parses proposal.md when present with fallback to spec.md (41.668141ms)
  ✔ resolveChangeDoc prefers proposal.md and reports its kind (3.495481ms)
✔ Change folder proposal resolution (45.483309ms)
▶ Rewritten OpenSpec templates
  ✔ proposal template carries proposal frontmatter and delta spec guidance (1.270456ms)
  ✔ tasks template uses the OpenSpec numbered checklist format (0.519974ms)
✔ Rewritten OpenSpec templates (1.997067ms)
▶ planning telemetry
  ▶ core planning helpers
    ✔ hashes the exact brief bytes and resolves the package version (32.412319ms)
    ✔ skips malformed lines and correlates sessions defensively (10.474424ms)
    ✔ reads a missing planning log as empty (3.466405ms)
  ✔ core planning helpers (47.402257ms)
Created spec 001: 001-telemetry-oc
  Path: /tmp/osq-plan-telemetry-24Hj4r/openspec/changes/001-telemetry-oc
  ▶ planCommand lifecycle
    ✔ appends a correlated pair with exact OpenCode usage before and after spawn (485.142305ms)
Created spec 001: 001-telemetry-exit
  Path: /tmp/osq-plan-telemetry-noXgId/openspec/changes/001-telemetry-exit
    ✔ records a non-zero exit and preserves propagation (221.076976ms)
Created spec 001: 001-telemetry-nospawn
  Path: /tmp/osq-plan-telemetry-mANXjl/openspec/changes/001-telemetry-nospawn
    ✔ records plan_exited when the planner binary cannot spawn (65.171394ms)
Created spec 001: 001-telemetry-resume
  Path: /tmp/osq-plan-telemetry-pw39lk/openspec/changes/001-telemetry-resume
    ✔ resumes without rewriting the brief and keeps the approved hash independent (428.744345ms)
    ✔ print mode appends no planning event (31.113444ms)
  ✔ planCommand lifecycle (1232.830074ms)
Created spec 001: 001-telemetry-agy
  Path: /tmp/osq-plan-telemetry-hYfajb/openspec/changes/001-telemetry-agy
  ▶ all harness identities through planCommand
    ✔ records AGY timing with all-null usage (188.585349ms)
Created spec 001: 001-telemetry-codex
  Path: /tmp/osq-plan-telemetry-2kqoi7/openspec/changes/001-telemetry-codex
    ✔ records Codex identity with rollout usage and null cost (234.273961ms)
  ✔ all harness identities through planCommand (423.324694ms)
  ▶ harness usage readers
    ✔ OpenCode selects the one row by cwd and interval and sums cache counters (66.404452ms)
    ✔ OpenCode returns all null for ambiguity, malformed data, and read failure (157.289237ms)
    ✔ Codex selects the one new rollout by session_meta cwd (15.004654ms)
    ✔ Codex returns all null for ambiguity, cwd mismatch, and missing usage (20.62705ms)
    ✔ AGY returns explicit all-null usage (0.378196ms)
  ✔ harness usage readers (260.268153ms)
✔ planning telemetry (1964.591818ms)
Created spec 001: 001-smoke
  Path: /tmp/osq-plan-test-Yuv3dF/openspec/changes/001-smoke
▶ osq plan command
  ✔ creates change folder and brief.md before spawning the interactive session (323.165277ms)
  ✔ -print writes the opening prompt to stdout only and does not spawn a session (71.232617ms)
Created spec 001: 001-resume-probe
  Path: /tmp/osq-plan-test-9Zdem4/openspec/changes/001-resume-probe
  ✔ resumes an existing change with brief.md without creating a new change folder (77.171713ms)
  ✔ accepts the -print alias through the CLI without launching a harness (40.459076ms)
  ✔ builds five ordered sections with the sufficient repository record after the brief (87.978971ms)
  ✔ emits only the too-small record sentence below five measured tasks (22.424851ms)
Created spec 104: 104-record-probe
  Path: /tmp/osq-plan-test-NfMxxX/openspec/changes/104-record-probe
  ✔ uses one five-section prompt for interactive, resumed, and print planning (179.161573ms)
  ✔ emits the five-section prompt through the -print CLI alias (42.402904ms)
Created spec 104: 104-alpha
  Path: /tmp/osq-plan-test-TyGTY1/openspec/changes/104-alpha
  ✔ puts the repository record in a queue-selected planning prompt (130.164235ms)
✔ osq plan command (976.358942ms)
▶ osq plan command registration
  ✔ registers plan <name> with --brief and --print options (2.014522ms)
✔ osq plan command registration (2.16214ms)
Created spec 001: 001-integration-plan
  Path: /tmp/osq-planning-integration-WCwGVf/openspec/changes/001-integration-plan
▶ planning to report integration
  ✔ records a real planning session that the report surfaces even with null usage (525.073509ms)
✔ planning to report integration (526.675273ms)
▶ proposal writes schema
  ✔ osq lint rejects a proposal declaring features.writes (230.680191ms)
  ✖ osq lint passes when features.writes is absent and deltas exist in specs/ (114.649158ms)
  ✔ derives written capabilities from delta specs for show and the manifest (19.864716ms)
  ✔ osq migrate openspec strips features.writes and removes redundant spec.md idempotently (16.154604ms)
✖ proposal writes schema (383.492703ms)
▶ queue planning usage aggregate
  ✔ counts valid starts across active, archived, and rejected attempts, including retired slugs (83.039335ms)
  ✔ reports complete coverage when every start has one finite-cost exit, zero included (8.164288ms)
  ✔ treats missing, null-cost, duplicate, and orphan exits as incomplete (19.200477ms)
  ✔ derives complete zero coverage when there are no prior sessions (10.719081ms)
✔ queue planning usage aggregate (122.714174ms)
▶ queue budget evaluation
  ✔ requires both ceilings for the spend gates (1.557563ms)
  ✔ refuses only when one more session would exceed the maximum (1.079498ms)
  ✔ refuses every launch under a zero session limit (1.137946ms)
  ✔ enforces the cost ceiling only with complete coverage and at or above the maximum (1.895879ms)
  ✔ ignores only the cost ceiling with incomplete coverage and notes it (1.038704ms)
  ✔ keeps enforcing the session ceiling with incomplete coverage (0.869374ms)
✔ queue budget evaluation (8.417629ms)
▶ prepareQueuePlan budget gate
  ✔ refuses before returning a selection when the budget is required but absent (6.913182ms)
  ✔ returns a notice and a selection when cost coverage is incomplete (20.049428ms)
✔ prepareQueuePlan budget gate (27.505644ms)
▶ queue modes without a queue config block
  ✔ keeps osq queue working without queue ceilings (192.91631ms)
✔ queue modes without a queue config block (193.686942ms)
▶ planCommand budget refusals
  ✔ refuses a non-print next plan without queue ceilings before any mutation (18.320035ms)
  ✔ lets print mode bypass the spend gates without a queue block (37.536356ms)
  ✔ allows a launch exactly at the session boundary (55.907067ms)
  ✔ refuses before folder creation when one more session would exceed the maximum (34.403263ms)
  ✔ refuses under a zero session limit and with a reached cost ceiling (57.611079ms)
Created spec 091: 091-alpha
  Path: /tmp/osq-queue-budget-XrfBrH/openspec/changes/091-alpha
  ✔ prints one note and proceeds when coverage is incomplete, still enforcing sessions (16.961573ms)
✔ planCommand budget refusals (221.528545ms)
▶ queue brief and prompt seeding
  ✔ writes only the item body plus planner, date, and queue metadata (15.635451ms)
  ✔ identifies landed dependency archive paths in the change context only when supplied (23.713717ms)
✔ queue brief and prompt seeding (41.564282ms)
▶ createNewSpec queue seeding
  ✔ uses an explicit slug, title, and numeric dependency ids while keeping the body (11.847131ms)
  ✔ numbers across active, archived, and rejected folders (4.911802ms)
✔ createNewSpec queue seeding (17.300707ms)
▶ queue next-item preparation
  ✔ selects the first unplanned item with landed dependencies and records archive paths (15.254622ms)
  ✔ skips active items and waits until a dependency lands (28.612943ms)
  ✔ refuses when every item is landed or active (16.74643ms)
✔ queue next-item preparation (61.316368ms)
▶ queue active failure gate
  ✔ halts before mutation on every dead, regressed, and change-level target (35.112099ms)
  ✔ treats attempt-suffixed history as inactive (15.463526ms)
✔ queue active failure gate (50.927832ms)
▶ queue rejection gate
  ✔ refuses a rejected first eligible item without replan and preserves history (35.960989ms)
  ✔ replans through the real command into one active attempt without touching rejected history (38.452182ms)
✔ queue rejection gate (74.811866ms)
▶ plan command modes
  ✔ registers the plan command with --next and --replan (9.894885ms)
  ✔ rejects missing and conflicting modes before any file is written (1.467234ms)
  ✔ plan --next --print creates the change and prints its prompt without spawning (17.83411ms)
✔ plan command modes (30.264462ms)
▶ brief queue planning through the real CLI and mock harness
  ✖ plans one item per invocation, halts on a dead task, retries, and lands all three (1734.672863ms)
✖ brief queue planning through the real CLI and mock harness (1738.021212ms)
▶ queue parser
  ✔ parses ordered items with earlier dependencies, bodies, and raw-section hashes (32.616567ms)
  ✔ accepts nothing and comma-separated earlier slugs with surrounding whitespace (3.310718ms)
  ✔ permits ordinary deeper headings inside a brief body (2.417188ms)
  ✔ rejects malformed headings, invalid slugs, empty titles, and duplicate slugs (2.33865ms)
  ✔ rejects missing, malformed, empty, and duplicate dependency lines (1.690728ms)
  ✔ rejects empty bodies (3.151459ms)
  ✔ rejects self, forward, and unknown dependencies with item context (6.663209ms)
  ✔ fails for a missing queue file with the queue path (1.311575ms)
✔ queue parser (65.337031ms)
▶ queue projection
  ✔ derives state precedence, selected change ids, and rejection counts (54.352776ms)
  ✔ retains rejected counts on a replanned active item and never lands done-but-unarchived (16.355286ms)
  ✔ derives unmet queue dependencies from landed associations only (37.398294ms)
  ✔ does not let a rejected dependency land an item (15.495449ms)
  ✔ annotates changed since planned from the selected association hash (29.884226ms)
  ✔ associates only through brief queue_item metadata, not folder names (5.942229ms)
  ✔ ignores malformed unrelated folders without hiding valid queue items (6.554127ms)
  ✔ reports ambiguous multiple active associations instead of choosing silently (9.285372ms)
  ✔ reports ambiguous multiple archived associations (6.371129ms)
  ✔ prefers an archived association over active and rejected ones (6.864975ms)
  ✔ derives state afresh on every call with no cache between projections (8.440393ms)
  ✔ formats every projected row deterministically (0.756061ms)
✔ queue projection (198.967465ms)
▶ osq queue CLI
  ✔ registers the queue command in the commander program (3.452912ms)
  ✔ prints the projection through createProgram without changing queue bytes or metadata (13.051616ms)
  ✔ prints identical output on repeated invocations (9.29036ms)
✔ osq queue CLI (26.141944ms)
▶ regressed status formatting
  ✔ formats a regressed task with the regressed indicator and label (0.745282ms)
  ✔ formats an active spec overview with a regressed indicator (0.279487ms)
  ✔ formats a regressed task outcome line with the fallback word (0.273227ms)
  ✔ formats a regressed task outcome line with the unicode failure symbol (0.132398ms)
✔ regressed status formatting (2.627251ms)
▶ regressed marker and event writers
  ✔ writes a regressed marker under .run/regressed (33.991961ms)
  ✔ writes a change-level regressed marker for the change target (23.733447ms)
  ✔ appends a typed regressed event to the task event stream (9.546122ms)
  ✔ lets event data override the default task and appends without clobbering (6.233291ms)
✔ regressed marker and event writers (74.598378ms)
▶ explicit rejection transition
  ✔ refuses an empty or whitespace-only reason without moving the folder (61.358176ms)
  ✔ rejects an unapproved active change into the canonical rejected directory (73.728462ms)
  ✖ rejects an approved change with an active dead marker (103.372527ms)
  ✖ rejects an approved change with an active regressed task marker (119.810276ms)
  ✖ rejects an approved change with a change-level regression (101.177812ms)
  ✖ refuses a healthy approved change and leaves it in place (134.005998ms)
  ✖ refuses an approved completed change (136.392172ms)
  ✖ refuses a running task even when a dead marker would win state precedence (200.983221ms)
  ✖ refuses a historical suffixed failure marker as not active (138.499408ms)
  ✔ refuses an archived change (21.460331ms)
  ✔ refuses an already rejected change (31.454949ms)
  ✔ refuses a missing change (22.780155ms)
  ✔ refuses a destination collision without moving or overwriting (16.431793ms)
  ✖ moves the complete record intact and appends one matching rejection event (159.742397ms)
✖ explicit rejection transition (1325.48768ms)
▶ release workflow
  ✔ triggers on v* tag push events (1.142641ms)
  ✔ installs with a frozen lockfile and runs the verification gate (0.210928ms)
  ✔ runs the consumer pack smoke test suite through pnpm test (0.376076ms)
  ✔ verifies tag version parity with package.json before publishing (0.463965ms)
  ✔ publishes with provenance and public access using OIDC permissions (0.317257ms)
  ✔ contains no static npm token secrets or npmrc authentication (0.217327ms)
  ✔ sets up the runner with checkout, pnpm, and Node 22 (0.466515ms)
✔ release workflow (5.24831ms)
▶ pnpm setup version delegation
  ✔ pins an exact pnpm version through packageManager in package.json (0.424105ms)
  ✔ uses pnpm/action-setup@v4 without with.version in release.yml (0.393146ms)
  ✔ uses pnpm/action-setup@v4 without with.version in ci.yml (0.386475ms)
✔ pnpm setup version delegation (1.78267ms)
▶ report cost metrics
  ▶ fixture/report
    ✔ sums cost reported in event data per spec and in total under history (144.421137ms)
    ✔ identifies harness-reported provenance and attempt coverage (147.846559ms)
    ✔ formats the total as a currency string (78.750013ms)
    ✔ exposes total, perSpec, formattedTotal, provenance, and coverage on CostHistory (53.950709ms)
    ✔ prints the harness-reported cost line with attempt coverage (41.39881ms)
  ✔ fixture/report (468.038439ms)
  ▶ cost formatting
    ✔ uses four decimals for amounts below one cent (16.791263ms)
    ✔ counts an attempt at most once even when several events report cost (6.337198ms)
  ✔ cost formatting (23.557597ms)
  ▶ cost-free project
    ✔ reports zero cost and zero coverage without estimating (47.419413ms)
  ✔ cost-free project (47.877222ms)
  ▶ README
    ✔ notes that reported cost reflects the harness price table rather than the invoice (10.727836ms)
  ✔ README (10.982614ms)
✔ report cost metrics (551.403151ms)
▶ report event coverage
  ▶ fixture/report
    ✔ lists tasks with and without event files grouped by change (131.137144ms)
  ✔ fixture/report (132.222092ms)
  ▶ mixed coverage
    ✔ accounts for every task and sorts task numbers per change (23.574584ms)
    ✔ treats an existing empty event file as covered (23.474896ms)
    ✔ treats a missing event file as uncovered (31.217928ms)
  ✔ mixed coverage (78.855582ms)
✔ report event coverage (211.597949ms)
▶ report cycle metrics
  ▶ fixture/report
    ✔ emits one sorted row per archived change with nullable phases (126.390286ms)
    ✔ aggregates each phase over only its covered changes (72.131026ms)
    ✔ prints only aggregate phase lines with the coverage phrase (61.425558ms)
  ✔ fixture/report (261.268841ms)
  ▶ phase derivation
    ✔ derives a complete lifecycle and its total in seconds (16.647547ms)
    ✔ keeps missing, invalid, and reversed endpoints null (54.614789ms)
    ✔ excludes active changes from cycle rows (12.57273ms)
    ✔ uses only numeric task streams for first start and excludes change.jsonl spans (6.952026ms)
  ✔ phase derivation (92.148094ms)
  ▶ JSON contract
    ✔ exposes cycle phases and rows on the MetricsReport object (122.417491ms)
  ✔ JSON contract (122.805098ms)
✔ report cycle metrics (477.588928ms)
▶ report failure breakdown
  ▶ fixture/report
    ✔ retains the historical crashed failure of a retried task while reporting zero current dead tasks (125.230011ms)
    ✔ formats the historical dead reasons per reason (57.634352ms)
  ✔ fixture/report (184.560344ms)
  ▶ event history
    ✔ counts every dead event in history grouped by reason (40.42247ms)
    ✔ retains dead events for tasks that are later retried and completed (22.087005ms)
    ✔ defaults a dead event without a reason to unknown (16.502566ms)
  ✔ event history (79.540215ms)
  ▶ marker independence
    ✔ counts dead markers in current state without inventing history (34.709784ms)
    ✔ ignores dead markers even when some tasks have dead events (38.544341ms)
  ✔ marker independence (73.75226ms)
  ▶ formatting
    ✔ prints (none) when there are no dead events (31.31952ms)
  ✔ formatting (31.827385ms)
✔ report failure breakdown (370.884051ms)
▶ report file change metrics
  ▶ fixture/report
    ✔ counts edit and write tool events and deduplicates their paths (160.920922ms)
    ✔ stores edit and write tool events with duplicate paths in the 009 event stream (1.566767ms)
  ✔ fixture/report (163.659376ms)
  ▶ path extraction and normalization
    ✔ extracts paths from summary, path, filePath, and file and normalizes them (12.578775ms)
    ✔ is case-insensitive on the tool name and ignores non edit/write tools (10.390783ms)
    ✔ counts edit and write events without a usable path in the change total only (12.902704ms)
    ✔ deduplicates the same normalized path across all specs (12.673159ms)
    ✔ retains legacy file_changed events and normalizes their paths (11.896559ms)
  ✔ path extraction and normalization (61.389238ms)
✔ report file change metrics (225.752987ms)
▶ report execution history
  ✔ counts every started event as an attempt and lists tasks with multiple attempts (102.469389ms)
  ✔ identifies started events with no intervening dead or regressed event (22.869155ms)
  ✔ groups dead events by reason and treats an absent reason as unknown (20.294896ms)
  ✔ records ordered verify exit codes and counts missing exit codes (13.245871ms)
  ✔ attributes cost to attempts and counts an attempt at most once (18.325527ms)
  ✔ does not associate cost with an attempt when no started event precedes it (22.836164ms)
  ✔ ignores change.jsonl for task attempts and coverage (14.024455ms)
  ✔ parses malformed lines defensively (42.16763ms)
✔ report execution history (258.742119ms)
▶ serializeSortedJson
  ✔ recursively sorts object keys and preserves array order (1.269356ms)
  ✔ is deterministic across repeated calls (0.216108ms)
  ✔ passes through primitives and null unchanged (0.237938ms)
✔ serializeSortedJson (3.321324ms)
▶ report --json
  ✔ emits a single valid JSON document with the stable MetricsReport keys (156.970083ms)
  ✔ orders the emitted top-level keys alphabetically in the raw text (64.213423ms)
  ✔ matches the checked-in fixture byte for byte through the real report command (93.477955ms)
  ✔ matches the structured MetricsReport shape without compatibility aliases (70.977905ms)
  ✔ keeps the non-JSON path rendering the formatted report (37.561931ms)
✔ report --json (424.466193ms)
▶ formatMetricsReport
  ✔ renders exclusively from the values held by the MetricsReport object (0.572839ms)
  ✔ always renders the historical cost line, including at zero (0.43861ms)
✔ formatMetricsReport (1.392765ms)
▶ osq report CLI flag
  ✔ registers --json so commander parses it to options.json (2.561822ms)
✔ osq report CLI flag (2.65574ms)
▶ report current state
  ✔ derives all eight task counts from markers and separates manual from verified (109.966054ms)
  ✔ always includes zero-valued verified and manual counts in JSON and text (18.611403ms)
  ✔ keeps a historical dead event out of current dead when the marker is done (53.85656ms)
  ✔ does not treat a done event as a current completion (52.09848ms)
✔ report current state (238.366589ms)
▶ report planning metrics
  ▶ fixture/report
    ✔ aggregates correlated sessions across active and archived changes (224.834716ms)
    ✔ renders the planning totals and the exact coverage phrase in text (68.113723ms)
  ✔ fixture/report (294.054047ms)
  ▶ aggregation rules
    ✔ counts every valid start once, sums matched exits, and never estimates nulls (17.577454ms)
    ✔ treats missing, empty, and malformed logs as zero without throwing (11.114917ms)
  ✔ aggregation rules (33.080711ms)
  ▶ reportCommand JSON
    ✔ exposes the planning block deterministically through the report command (39.377396ms)
  ✔ reportCommand JSON (40.114602ms)
✔ report planning metrics (367.915214ms)
▶ queue report view
  ✔ returns an unconfigured empty queue view and leaves existing aggregates unchanged (115.743429ms)
  ✔ fails a malformed configured queue with its actionable parse error (17.398291ms)
  ✔ projects ordered item rows with state, drift, rejections, and elapsed time (52.454936ms)
  ✔ uses the earliest plan start across attempts and nulls missing or reversed endpoints (54.422511ms)
  ✔ reads active dead, regressed, and change-level failure reasons, defaulting to unavailable (52.248099ms)
  ✔ counts queue planning sessions and finite cost across rejected attempts only for the queue block (47.707828ms)
  ✔ reports complete queue cost coverage when every counted session records finite cost (40.881625ms)
  ✔ renders a concise Queue section and deterministic stable JSON (82.542851ms)
  ✔ renders an unconfigured Queue section for a repository without a queue (27.538912ms)
  ✔ keeps the checked-in report fixture unconfigured without a queue file (89.358565ms)
✔ queue report view (583.125806ms)
▶ osq report rejection history
  ✔ counts each rejected folder once only when a valid rejected event exists (111.297269ms)
  ✔ groups a missing or empty planner value as unknown (39.641048ms)
  ✔ excludes rejected artifacts from every non-rejection aggregate (21.218083ms)
  ✔ renders rejection totals and planner-model counts in the History text section (28.709387ms)
  ✔ exposes history.rejections through the JSON report command (24.224115ms)
✔ osq report rejection history (232.112945ms)
▶ report scope-regression history
  ✔ always exposes the five counters as integers even when no scope events exist (68.30048ms)
  ✔ counts detection only for typed scope regressions and classifies finite exit codes (29.786107ms)
  ✔ classifies only exact recertification outcomes without guessing malformed ones (17.894951ms)
  ✔ aggregates active and archived numbered streams only, never markers, results, or rejected folders (23.682376ms)
  ✔ does not add attempts, unexplained reruns, dead reasons, or cost coverage (15.558616ms)
  ✔ leaves current-state regression counts to markers alone (14.871006ms)
  ✔ renders the history block in text and the counters in stable JSON (12.468283ms)
✔ report scope-regression history (187.594652ms)
▶ report sizes over the checked-in fixture
  ✔ exposes ordered bucket rows for scope files and acceptance lines (85.600272ms)
  ✔ selects the largest first-attempt pass with deterministic tie-breaks (36.085373ms)
  ✔ emits size tables and exactly one near-limit hint line in text (44.706113ms)
  ✔ omits the hint when the largest pass is not near a limit (22.540688ms)
  ✔ renders stable JSON with ordered history.sizes (22.293312ms)
  ✔ is deterministic across repeated derivations (94.708146ms)
✔ report sizes over the checked-in fixture (309.404237ms)
▶ measured task projection
  ✔ ignores tasks without a valid start measure and results files (11.342733ms)
  ✔ uses the first valid start measure and counts started attempts (11.57787ms)
  ✔ treats only a typed done before the next outcome as a first-attempt pass (14.385481ms)
  ✔ discards reversed and incomplete measure pairs for duration (5.911324ms)
  ✔ preserves pre-existing report fields and the queue view (17.724776ms)
✔ measured task projection (62.047383ms)
▶ repository record derivation
  ✔ derives aggregates and dead outcomes from the checked-in fixture (19.667928ms)
  ✔ inspects only the 20 highest numeric archived changes (100.561093ms)
  ✔ truncates dead outcomes to ten in change, task, event order (158.19565ms)
  ✔ never reads results files when deriving the record (18.884568ms)
✔ repository record derivation (298.169845ms)
▶ formatRepositoryRecordBody
  ✔ prints the four labeled groups for a sufficient record (0.355566ms)
  ✔ prints only the too-small sentence below five measured tasks (0.100909ms)
✔ formatRepositoryRecordBody (0.689072ms)
▶ report task states
  ▶ fixture/report
    ✔ contains archived specs 008, 009, and 010 with the expected event shapes (15.681266ms)
    ✔ reports 17 total tasks with current state derived from markers (111.900032ms)
  ✔ fixture/report (128.891033ms)
  ▶ active specs
    ✔ tallies task states from deriveSpecState (53.748339ms)
  ✔ active specs (54.280683ms)
  ▶ archived specs
    ✔ derives current state from markers, not terminal events (37.317224ms)
    ✔ derives archived task status from done and dead markers (28.358525ms)
    ✔ reports archived tasks with no markers as pending (37.328394ms)
    ✔ does not count a done event as a current completion (25.608435ms)
  ✔ archived specs (129.604207ms)
✔ report task states (313.485786ms)
▶ report token metrics
  ▶ fixture/report
    ✔ sums neutral token categories and cache share across all specs (163.946439ms)
    ✔ exposes only the canonical neutral TokenMetrics fields (69.756607ms)
    ✔ formats the neutral token labels with the cache share percentage (41.614222ms)
  ✔ fixture/report (276.700144ms)
  ▶ event mapping
    ✔ maps opencode cache.read to cached_input and reasoning to reasoning (11.810184ms)
    ✔ maps Antigravity usage fields to neutral categories (21.51102ms)
    ✔ derives the total from the neutral categories when no total is reported (8.326848ms)
    ✔ derives the remaining cached input only when no cache field is reported (8.856392ms)
    ✔ prefers reported cached tokens over the remainder when a cache field exists (6.420989ms)
    ✔ uses real-world opencode counts where reasoning is not counted as cache (22.376639ms)
    ✔ defaults cache share percent to zero when there is no input at all (21.046236ms)
  ✔ event mapping (101.410946ms)
  ▶ adapter token extraction
    ✔ extracts opencode reasoning tokens from reasoning or reasoningTokens (0.371966ms)
    ✔ extracts agy reasoning tokens from thinking_tokens or reasoning_tokens (0.186978ms)
    ✔ emits reasoningTokens on opencode tokens events (3.060026ms)
    ✔ emits reasoningTokens on agy tokens events (4.43622ms)
  ✔ adapter token extraction (8.331587ms)
✔ report token metrics (387.046119ms)
▶ osq report
  ✔ getMetricsReport aggregates spec and task counts across active and archived directories (97.86901ms)
  ✔ getMetricsReport calculates completion rate and current dead tasks from markers (44.074088ms)
  ✔ getMetricsReport aggregates event durations, token usage, and file changes (44.141939ms)
  ✔ reportCommand prints formatted terminal report and supports raw JSON output (50.989673ms)
  ✔ aggregates undeclared_test_change in the historical failure breakdown for text and JSON output (20.450554ms)
  ✔ CLI registers report command in commander program (10.457003ms)
✔ osq report (270.429648ms)
▶ retry attempt numbering
  ✔ records attempt 1 on an initial execution (259.722462ms)
  ✔ matches the preceding retry attempt and carries the failure reason (288.201572ms)
✔ retry attempt numbering (549.504506ms)
▶ scope regression recertification
  ✔ passing recertification refreshes canonical done and records outcome passed (279.569809ms)
  ✔ never replaces original_scope_hash across repeated passing recertifications (166.636084ms)
  ✔ requeues on failing recertification with the failed output and next attempt (208.934194ms)
  ✔ requeues with the timeout result when recertification exceeds the configured timeout (1273.953559ms)
  ✔ preserves the established retry transition for a dead task without verification (129.544379ms)
  ✔ preserves the established retry transition for a non-scope regression (115.238994ms)
  ✔ falls back to the preserving transition when no automated done marker exists (235.439663ms)
  ✔ refuses a malformed done marker as a recertification target (229.064256ms)
  ✔ uses the shared target-wide ordinal when a recertification requeues (238.7608ms)
  ✔ renders the failed recertification output in every textual prompt after restart (203.339277ms)
  ✔ passes the requeued failure context into the next agent spawn (204.777811ms)
  ✔ reports recertification and requeue distinctly through the CLI (160.700361ms)
✔ scope regression recertification (3448.873687ms)
▶ retry through the real watcher CLI with the mock harness
  ✔ dies once, retries without deleting diagnostics, then lands and archives (1898.032812ms)
✔ retry through the real watcher CLI with the mock harness (1899.69149ms)
▶ explicit retry transition
  ✔ registers the retry command with id and target arguments (215.330582ms)
  ✔ renames an active dead marker to the next ordinal and records the retry (152.343753ms)
  ✔ counts retained dead and regressed history in one shared ordinal (136.49797ms)
  ✔ retains a task regression done marker so the task derives pending (145.203154ms)
  ✔ retries a change-level regression into history and makes archiving eligible (189.757993ms)
  ✔ preserves both active failure kinds under one ordinal with regression reason (152.626157ms)
  ✔ refuses a running target without mutating markers or events (105.511709ms)
  ✔ refuses a missing approval and names osq approve without mutation (104.850604ms)
  ✔ refuses a mismatched approval hash and names osq approve without mutation (126.629486ms)
  ✔ refuses a target with no active failure (170.285819ms)
  ✔ refuses a change target without a change-level regression (175.911523ms)
  ✔ refuses any non-numeric non-change target (174.513832ms)
✔ explicit retry transition (1852.876124ms)
▶ Runner already_running lock collision
  ✖ aborts with already_running without a dead marker or dead event (165.556777ms)
  ✖ logs the already_running outcome summary to stderr (118.934615ms)
  ✖ does not report the lock collision as a task failure in osq report (140.272928ms)
  ✖ only writes a dead event when an explicit dead marker is written (96.973901ms)
✖ Runner already_running lock collision (523.995416ms)
▶ tickTaskCheckboxContent format handling
  ✔ ticks a matching item in a flat numbered checklist without touching neighbours (3.872357ms)
  ✔ ticks a matching item in a grouped numbered checklist under its section header (0.567374ms)
  ✔ ticks a grouped unnumbered item whose number lives on the section header (0.250597ms)
  ✔ is idempotent and leaves already ticked checkboxes untouched (0.315592ms)
  ✔ prefers an explicit item number over the enclosing section number (0.733297ms)
✔ tickTaskCheckboxContent format handling (8.022676ms)
▶ Runner checkbox projection
  ✔ writes the ticked checkbox through tickTaskCheckbox (81.835885ms)
  ✔ is a no-op when tasks.md is absent (23.63446ms)
  ✖ does not invalidate the approved hash or modify .run/ markers (132.285427ms)
  ✖ derives task and spec state from .run/ markers, never tasks.md checkboxes (124.465994ms)
  ✖ writes .run/done/<n> and ticks tasks.md after an independent verify pass (124.974604ms)
✖ Runner checkbox projection (491.090128ms)
▶ Archived task checkboxes
  ✔ all fifteen (or more) archived tasks.md files are fully ticked (25.130025ms)
✔ Archived task checkboxes (25.52498ms)
▶ Runner done and dead events
  ✖ defines the done and dead event payloads (167.614963ms)
  ✖ parameterizes every dead RunTaskFailureReason and isolates already_running (130.763945ms)
  ✖ appends a done event alongside the done marker on success (108.714559ms)
  ✖ appends a dead event alongside the dead marker for no_result (121.072002ms)
  ✖ appends a dead event alongside the dead marker for crashed (212.436399ms)
  ✖ appends a dead event alongside the dead marker for timeout (101.157303ms)
  ✖ appends a dead event alongside the dead marker for verify_red (109.124645ms)
  ✖ appends a dead event alongside the dead marker for spec_conflict (tampered task) (98.327675ms)
  ✖ appends a dead event alongside the dead marker for spec_conflict (missing approval) (109.577541ms)
  ✖ appends a dead event alongside the dead marker for undeclared_test_change (98.311519ms)
  ✖ writes neither a dead marker nor a dead event for already_running (105.135166ms)
✖ Runner done and dead events (1366.966758ms)
▶ Runner lifecycle logging
  ✖ spawnWithTimeout captures the child pid and elapsed duration in milliseconds (149.812053ms)
  ✖ SpawnProcessResult and SpawnResult expose optional pid and elapsedMs fields (121.747459ms)
  ✖ logs a started summary and records a started event with pid and timeout (146.598032ms)
  ✖ logs an exited summary at verbose level and records an exited event with exit code and elapsed time (162.234218ms)
  ✖ demotes the exited summary to verbose while the started summary stays at info (84.904725ms)
  ✖ emits each lifecycle log line from the same code path as its events.jsonl entry (94.826227ms)
  ✖ does not log lifecycle lines when no logger is supplied (118.755744ms)
  ✖ exposes relativizeToolSummary from core and re-exports it from heartbeat (105.45959ms)
  ✖ models every event as a typed member of the OsqEvent union (91.915607ms)
  ✖ relativizes opencode tool summaries to the project root at write time (107.563493ms)
  ✖ relativizes agy tool summaries to the project root at write time (116.741061ms)
  ✖ records harness, model, and osqVersion on the started event (119.553379ms)
  ✖ emits exactly one started and one exited event through MockAdapter (117.888887ms)
✖ Runner lifecycle logging (1541.369151ms)
▶ Runner lifecycle PID ownership
  ✖ AgyAdapter forwards onSpawn, returns pid/elapsedMs, and emits no lifecycle events (209.291075ms)
  ✖ runTask through AgyAdapter records exactly one started and one exited with matching pid (131.899702ms)
  ✖ OpencodeAdapter forwards onSpawn, returns pid/elapsedMs, and emits no lifecycle events (219.71754ms)
  ✖ runTask through OpencodeAdapter records exactly one started and one exited with matching pid (114.390389ms)
✖ Runner lifecycle PID ownership (677.16465ms)
▶ Runner outcome logging
  ✖ does not export the legacy formatTaskOutcomeSummary helper (200.690224ms)
  ▶ formatTaskOutcomeLine
    ✖ renders a verified line with elapsed time and no (passed) suffix (175.85931ms)
    ✖ renders unicode symbols when enabled (110.53594ms)
    ✖ renders a dead line for every failure reason (111.712555ms)
    ✖ appends the detail string before the elapsed time (97.260628ms)
    ✖ produces a single line for every outcome (90.572537ms)
  ✖ formatTaskOutcomeLine (587.34604ms)
  ✖ logs exactly one verified line upon successful verification (104.318943ms)
  ✖ logs exactly one dead line and writes the marker upon verification failure (110.84758ms)
  ✖ logs timed_out detail when verification times out (105.452902ms)
  ✖ logs a timeout dead line when the agent exceeds its timeout (93.043588ms)
  ✖ logs a crashed dead line with the exit code when the agent crashes (105.022776ms)
  ✖ logs a no_result dead line when the agent writes no result (142.107143ms)
  ✖ logs a spec_conflict dead line when the folder changes after approval (120.476026ms)
  ✖ logs an already_running dead line when the task lock is held (91.470061ms)
  ✖ does not log an outcome line when no logger is supplied (155.938405ms)
✖ Runner outcome logging (1819.408127ms)
▶ Outcome module shape
  ✔ exposes the outcome failure types and formatter (0.223038ms)
  ✔ exposes the lifecycle, dead, done, and checkbox writers (0.141088ms)
  ✔ keeps outcome.ts under 200 lines (1.892989ms)
✔ Outcome module shape (2.60338ms)
▶ Done marker scope hash frontmatter
  ✔ writes YAML frontmatter and an ISO timestamp when metadata is provided (58.63854ms)
  ✔ keeps timestamp-only content when no metadata is provided (6.082362ms)
✔ Done marker scope hash frontmatter (66.113243ms)
▶ computeTaskScopeHash
  ✔ is deterministic regardless of scope ordering (11.833233ms)
  ✔ changes when a scoped file content changes (9.294916ms)
  ✔ records null for a missing scoped file (15.608556ms)
✔ computeTaskScopeHash (38.496661ms)
▶ Pre-spawn scope comparison
  ✔ records the completed scope hash in the done marker (287.075486ms)
  ✔ proceeds to spawn when every earlier done scope is unchanged (240.234346ms)
  ✔ detects a changed earlier scope and refuses to spawn (212.277917ms)
  ✔ reports a deleted earlier scope file as differing (241.442721ms)
✔ Pre-spawn scope comparison (981.903361ms)
▶ Runner synthesized result
  ✖ HarnessEventType includes text and TextEventData carries a text string (244.492367ms)
  ✖ extractFinalTextFromStream returns null when no text event exists (121.135432ms)
  ✖ extractFinalTextFromStream returns null when the event stream is missing (91.62191ms)
  ✖ extractFinalTextFromStream returns the last emitted text message (106.81434ms)
  ✖ extractFinalTextFromStream ignores raw harness payload shapes (fallback candidate list dropped) (107.869368ms)
  ✖ synthesizeResultFile writes synthesized: true frontmatter and an attribution header (120.52482ms)
  ✖ verify.ts exports the synthesis and gating helpers (138.935782ms)
  ✖ verify.ts stays under the 200 line lifecycle module budget (129.491011ms)
  ✖ snapshotTestFiles and findUndeclaredTestChanges report edits and deletions but allow new files (142.284083ms)
  ✖ runVerificationGate passes a zero exit and reports a non-zero diagnostic (106.753604ms)
  ✖ runVerificationGate enforces the timeout and reports timedOut (148.234148ms)
  ✖ AgyAdapter emits a text event carrying the completed assistant message (164.186502ms)
  ✖ AgyAdapter exit 0 with no result file synthesizes from the last text event (207.305013ms)
  ✖ OpencodeAdapter emits a text event carrying the completed assistant message (130.647085ms)
  ✖ OpencodeAdapter exit 0 with no result file synthesizes from the last text event (125.881558ms)
  ✖ case B: real adapter exit 0 with neither result file nor text is dead with reason no_result (149.893436ms)
  ✖ README documents the synthesized result behavior for the no_result reason (104.995692ms)
✖ Runner synthesized result (2349.087674ms)
▶ Runner terminal status
  ▶ formatTaskStatusRow
    ✖ renders task number, elapsed, tool count, tokens, cost, and summary (156.898023ms)
    ✖ omits cost and summary when they are not reported (92.71092ms)
    ✖ renders the token count abbreviated in the status row (151.240603ms)
    ✖ assembles the full row without truncating, leaving fitting to the logger sink (99.151847ms)
  ✖ formatTaskStatusRow (502.757573ms)
  ▶ formatTokens
    ✖ abbreviates counts at the 1k and 1M boundaries (101.176382ms)
    ✖ is applied identically to the heartbeat line (123.556566ms)
  ✖ formatTokens (226.207687ms)
  ▶ relativizeToolSummary
    ✖ strips the project root and its trailing separator from absolute paths (132.844615ms)
    ✖ normalizes a trailing separator on the supplied root (110.168165ms)
    ✖ falls back to process.cwd() when no root is supplied (150.532497ms)
    ✖ leaves absolute paths outside the project root untouched (107.974836ms)
    ✖ relativizes an exact root match to a dot (132.689313ms)
  ✖ relativizeToolSummary (635.233785ms)
  ▶ computeTaskHeartbeatStats
    ✖ counts tool events, sums tokens and cost, and keeps the last tool summary (142.512252ms)
    ✖ accumulates new events in memory instead of re-reading already-counted lines (155.779417ms)
    ✖ tolerates a missing event file with zeroed counters (138.828893ms)
    ✖ relativizes tool summaries against the project root but keeps the raw event intact (138.250646ms)
    ✖ falls back to process.cwd() for tool summaries when projectRoot is omitted (128.181308ms)
    ✖ renders the relativized tool path in the status row without a leading slash (104.038593ms)
  ✖ computeTaskHeartbeatStats (808.464758ms)
  ▶ task start and outcome lines
    ✖ logs a single started line with the title truncated to the terminal width (84.644538ms)
    ✖ logs a verified outcome line with elapsed seconds (80.537413ms)
    ✖ logs a dead outcome line with the reason and elapsed seconds (91.364408ms)
  ✖ task start and outcome lines (257.167511ms)
  ▶ end-to-end status via the real opencode stream parser
    ✖ redraws a TTY status row with the live tool count, tokens, cost, and summary (78.006801ms)
    ✖ redraws the status row with a repo-relative tool path from an absolute summary (73.874397ms)
    ✖ derives the non-TTY heartbeat log from the same counters (66.580625ms)
    ✖ demotes the periodic heartbeat log to verbose on a TTY (73.960961ms)
    ✖ still emits the periodic heartbeat at verbose on a TTY (63.253521ms)
  ✖ end-to-end status via the real opencode stream parser (356.523115ms)
✖ Runner terminal status (2787.631686ms)
▶ Runner test modification gating
  ✔ RunTaskFailureReason includes undeclared_test_change (50.36112ms)
  ✖ records preexisting tests before spawn: a deletion is detected (120.74165ms)
  ✖ a modified preexisting test writes the dead marker and dead event, and skips verify (143.827294ms)
  ✖ creating a brand new test file without tests.modify proceeds to verify (85.115702ms)
  ✖ tests.modify: true permits editing a preexisting test file (116.231257ms)
✖ Runner test modification gating (518.611636ms)
▶ Task Runner and Verification Gate
  ✖ fails with reason: spec_conflict if folder is modified after approval (147.559069ms)
  ✖ fails with reason: no_result if agent exits without writing .run/results/<n>.md (112.897952ms)
  ✖ fails with reason: timeout if agent times out (101.057765ms)
  ✖ fails with reason: verify_red if task verify fails (100.107304ms)
  ✖ fails with reason: verify_red and timed_out: true if task verify hangs (103.265061ms)
  ✖ succeeds, creates .run/done/<n>, and ticks checkbox on valid task and passing verify (91.226565ms)
✖ Task Runner and Verification Gate (658.44623ms)
▶ OpenSpec schema execution authority instructions
  ✔ tasks artifact restricts execution to osq watch (19.997552ms)
  ✔ tasks artifact states archiving is osq-owned and never openspec archive (6.482258ms)
  ✔ tasks artifact states checkboxes are a runner-written write-only projection (4.629069ms)
  ✔ apply instruction hands task execution off to osq watch (4.561294ms)
  ✔ config context states execution and archive authority belongs strictly to osq (1.698411ms)
  ✔ config tasks rules forbid direct execution and archive (1.653891ms)
  ✔ schema README documents runtime and archive authority boundaries (1.022509ms)
✔ OpenSpec schema execution authority instructions (42.180195ms)
▶ Pre-dispatch scope recertification audit
  ✔ verifies every stale task in one audit and blocks without touching the upcoming task (358.675887ms)
  ✔ does not re-verify or rewrite an already-active regression on a later cycle (257.530383ms)
  ✔ retains the timeout result when detection verification exceeds the configured timeout (1228.889928ms)
  ✔ records differing paths in deterministic sorted order (205.460274ms)
  ✔ leaves manual and malformed done markers outside the audit (211.394666ms)
✔ Pre-dispatch scope recertification audit (2263.657009ms)
▶ Scope recertification attribution
  ✔ attributes a path to a sole later editor with no recorded completion hash (119.731836ms)
  ✔ attributes a path when the current hash agrees with the later completion hash (108.326025ms)
  ✔ records ambiguous when more than one later task named the path (107.269364ms)
  ✔ records unknown when no later task named the path (98.745732ms)
  ✔ records unknown when a sole candidate completion hash contradicts the tree (120.467589ms)
✔ Scope recertification attribution (555.478216ms)
▶ AGENTS.md managed block coexistence
  ✔ adds the osq block while preserving an existing OpenSpec block and user notes (11.441483ms)
  ✔ is idempotent across repeated updates and preserves both blocks intact (8.609765ms)
Harness 'mock' setup completed successfully.
Harness 'mock' setup completed successfully.
  ✔ osq setup refreshes AGENTS.md and both blocks survive repeated setup executions (234.225748ms)
✔ AGENTS.md managed block coexistence (256.694608ms)
▶ osq show
  ✔ getSpecDetails resolves change folder across active and archived directories (105.438311ms)
  ✔ getSpecDetails extracts spec metadata, tasks, results, and dead markers (26.129285ms)
  ✔ getSpecDetails parses event timeline from .run/events/<n>.jsonl (20.371467ms)
  ✔ showCommand prints formatted spec inspection with results and events (132.350187ms)
  ✔ formats undeclared_test_change status line and show diagnostic details (143.388904ms)
  ✔ getSpecDetails correlates planning sessions in start order for active and archived changes (48.814472ms)
  ✔ renders Planning Sessions before the event timeline without exposing usage (48.072798ms)
  ✔ missing and malformed planning logs leave task details and timeline intact (24.016138ms)
  ✔ CLI registers show <id> command in commander program (16.20841ms)
  ✔ derives ordered recertification rows with attribution from typed events (18.374794ms)
  ✔ derives recertification rows for archived changes (16.933663ms)
  ✔ orders recertification rows by valid timestamp then numeric task and event order (13.255536ms)
  ✔ renders malformed recertification data as unavailable without hiding other output (32.49806ms)
  ✔ renders and labels the Recertifications section only when rows exist (62.584187ms)
  ✔ does not infer recertification history from done marker metadata (54.658778ms)
✔ osq show (766.500603ms)
▶ smoke test error reporting
  ✔ reports a failed test naming the command and zero cancelledByParent when setup fails (1059.94845ms)
✔ smoke test error reporting (1063.304763ms)
▶ rejected dependency resolution
  ✔ treats a rejected dependency as unmet even when the rejected folder is all-done (94.592732ms)
  ✔ lets an archived dependency satisfy resolution (21.733803ms)
✔ rejected dependency resolution (119.603882ms)
▶ deriveSpecState from in-memory snapshots
  ✔ derives an unapproved spec when no approval hash is present (10.525678ms)
  ✔ derives a ready (pending) spec with a next task from pure data (2.893228ms)
  ✔ is synchronous and never returns a promise (1.958723ms)
  ✔ derives a running spec from the running pid map (1.28695ms)
  ✔ derives a done spec from the done marker set (1.644806ms)
  ✔ derives a dead spec and surfaces the dead reason (0.91104ms)
  ✔ resolves a conflicted task in favor of completion (0.692333ms)
  ✔ reports dead when a conflicted spec mixes done and dead tasks (1.256166ms)
  ✔ derives a blocked spec from unmet dependencies without touching disk (1.179967ms)
  ✔ derives a regressed task and spec from a regressed marker (1.028808ms)
  ✔ prefers a regressed marker over a stale done marker (0.630313ms)
  ✔ derives a regressed spec from a change-level regressed marker (1.601152ms)
  ✔ ignores regressed markers that match no task or the change (0.844301ms)
✔ deriveSpecState from in-memory snapshots (28.465412ms)
▶ State Derivation
  ✔ deriveTaskState correctly determines pending, running, done, and dead states (97.703563ms)
  ✔ deriveSpecState detects unapproved, pending, running, dead, and done states (71.505198ms)
  ✔ deriveSpecState from an in-memory snapshot is synchronous and preserves folderPath (15.544023ms)
✔ State Derivation (194.685684ms)
▶ osq status rejected group
  ✔ discovers rejected folders separately with folder, title, reason, and timestamp (82.538781ms)
  ✔ renders a deterministic Rejected specs group with reason and timestamp (60.658861ms)
  ✔ keeps malformed or missing rejection metadata visible as unavailable (51.570136ms)
  ✔ orders rejected folders deterministically by numeric prefix (17.243552ms)
✔ osq status rejected group (213.484943ms)
▶ osq status
  ✖ getStatusOverview returns all active specs with derived spec and task states (199.130182ms)
  ✔ getStatusOverview returns count of archived change folders (42.061873ms)
  ✖ statusCommand prints formatted status overview with state indicators (125.648682ms)
  ✔ CLI registers status command in commander program (16.339617ms)
  ✖ status output clearly distinguishes pending, running, done, and dead tasks (149.626316ms)
✖ osq status (534.887616ms)
▶ Unrecognised harness stream events
  ✔ opencode routes unrecognised event types to logger.verbose without touching stdout (30.002095ms)
  ✔ opencode stays silent at normal level for unrecognised event types (3.052861ms)
  ✔ opencode does not use console.debug for unrecognised event types (2.357889ms)
  ✔ agy routes unrecognised event types to logger.verbose without touching stdout (2.2118ms)
  ✔ agy routes malformed non-JSON lines to logger.verbose without touching stdout (9.282702ms)
  ✔ agy stays silent at normal level for unrecognised events and malformed lines (2.299045ms)
  ✔ unrecognised events write nothing to the append-only events.jsonl stream (3.19877ms)
✔ Unrecognised harness stream events (54.710476ms)
▶ pinned OpenSpec validator failure gating
  ✔ fails validateWithOpenSpec when the validator binary is missing (37.230247ms)
  ✔ fails validateWithOpenSpec when the validator version drifts (93.893948ms)
  ✔ passes validateWithOpenSpec when the pinned version is installed (110.441797ms)
  ✔ fails osq lint when the validator binary is missing (38.14398ms)
  ✔ fails osq approve when the validator binary is missing (34.07619ms)
  ✔ fails osq lint when the validator version drifts (86.313485ms)
  ✔ fails osq approve when the validator version drifts (96.883146ms)
✔ pinned OpenSpec validator failure gating (499.450025ms)
▶ Build identity resolution
  ✔ returns the package version and a git commit or dist hash (18.641924ms)
  ✔ falls back to the dist hash when git is unavailable (39.364572ms)
  ✔ falls back to unknown when neither git nor dist is present (5.786356ms)
✔ Build identity resolution (65.299424ms)
▶ Runner build identity events
  ✖ records version and commit in the started lifecycle event data (108.755047ms)
✖ Runner build identity events (111.617046ms)
▶ Watcher dev mode
  ✔ builds a worker invocation that runs tsx from src/cli/bin.ts (27.354358ms)
  ✔ delegates to the supervisor only in dev mode outside the worker process (5.629707ms)
  ✔ spawns a tsx worker and watches src/ for changes (15.772012ms)
  ✔ waits for the running task to finish before restarting on a source change (4.189223ms)
  ✔ coalesces repeated source changes into a single pending restart (4.441132ms)
  ✔ terminates the worker on SIGINT and never restarts (4.233774ms)
  ✔ exits non-zero when there is no src/ checkout to run (3.802453ms)
✔ Watcher dev mode (69.780789ms)
▶ Runner heartbeat
  ✖ defaults config.log.heartbeatSeconds to 60 seconds (163.173891ms)
  ✖ computeTaskHeartbeatStats reports elapsed seconds, event count, and total tokens (106.356802ms)
  ✖ computeTaskHeartbeatStats tolerates a missing event file (92.967995ms)
  ✖ logs multiple periodic heartbeat updates with elapsed, events, and tokens (79.864541ms)
  ✖ starts the heartbeat timer unreferenced via unref() (89.465179ms)
  ✖ clears the heartbeat timer in the finally block so it stops on completion (88.185252ms)
✖ Runner heartbeat (623.062902ms)
▶ Watcher lifecycle modules
  ✔ acquires and releases a task lock through the watcher wrapper (5.37208ms)
  ✔ keeps lock.ts and heartbeat.ts under the 200 line module budget (1.496183ms)
✔ Watcher lifecycle modules (7.729924ms)
▶ Watcher loop permanent logging
  ✔ logs a single pick-up line when an approved spec is detected (287.161822ms)
  ✔ logs a single archive line when a completed spec is archived (217.852584ms)
  ✔ logs a single halt line when a task dies (117.450569ms)
  ✔ logs watcher errors at error level on permanent lines (23.474793ms)
✔ Watcher loop permanent logging (647.842627ms)
▶ Watcher loop symbol formatting
  ✔ resolveSymbol returns unicode when enabled and plain words otherwise (15.25645ms)
  ✔ uses unicode symbols on an interactive TTY (180.42136ms)
  ✔ uses plain words when stderr is not a TTY (158.048912ms)
  ✔ uses plain words when CI is set (147.109721ms)
  ✔ uses plain words when NO_COLOR is present (160.291835ms)
✔ Watcher loop symbol formatting (661.972779ms)
▶ Watcher idle status
  ✔ formats the build prefix, watching path, approved waiting count, and last archived spec (19.543283ms)
  ✔ sets an idle status with the waiting count and last archived spec (214.299818ms)
✔ Watcher idle status (234.107598ms)
▶ Watcher SIGINT handling
  ✔ clears status, restores the cursor, logs waiting, then exits on second SIGINT (155.731572ms)
✔ Watcher SIGINT handling (155.92106ms)
▶ Watcher Preflight Verification
  ✔ Watcher start runs preflight check when harness is opencode (80.741267ms)
  ✖ Preflight executes <bin> --version before any task is picked or spawned (99.647934ms)
  ✖ Missing binary prints single clear line naming bin path and exits non-zero without dispatching tasks (93.051924ms)
  ✔ Failing binary prints single clear line naming bin path and exits non-zero without dispatching tasks (47.556511ms)
  ✔ Missing binary in standalone child process exits non-zero and prints single line to stderr (198.59808ms)
  ✖ Successful execution logs resolved version string and proceeds to task cycle (73.724969ms)
  ✔ preflightOpencode helper resolves binary from config or environment and returns version info (60.120469ms)
✖ Watcher Preflight Verification (655.459247ms)
▶ Watcher stale build preflight
  ✔ exits with code 1 and exactly one stderr line when src/ is newer than dist/ (129.35264ms)
  ✔ exits with code 1 when a checkout has src/ but no dist/ (99.173442ms)
  ✔ continues when allowStale is true even with a stale layout (95.10843ms)
  ✔ continues for an installed package with no src/ directory (96.190915ms)
  ✔ continues when dist/ is newer than src/ (88.47524ms)
✔ Watcher stale build preflight (510.147915ms)
▶ Watcher Loop and CLI
  ✖ runWatcherOnce processes approved specs, executes tasks, and archives on completion (116.554052ms)
  ✖ runWatcherOnce executes multiple tasks sequentially in a multi-task spec without hash conflict and archives (96.375466ms)
  ✔ CLI registers watch and setup commands with expected options (21.058155ms)
✖ Watcher Loop and CLI (235.454258ms)
ℹ tests 1045
ℹ suites 237
ℹ pass 885
ℹ fail 160
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 12299.424013

✖ failing tests:

test at tests/approve.test.ts:1:2026
✖ approveSpec lints, hashes, and writes .run/approved for valid spec (175.716863ms)
  Error: Lint failed for spec "001-order-flow":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/approve.test.ts:63:20)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/approve.test.ts:9:266
✖ re-approves an existing spec after modifications (123.439516ms)
  Error: Lint failed for spec "001-order-flow":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/approve.test.ts:104:25)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/codex/watcher.test.ts:1:1944
✖ fails before task spawn on a missing, nonzero, or timed-out probe (168.542229ms)
  Error: Lint failed for spec "001-codex-fixture-feature":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async approveTask (/home/mathias/projects/osq/tests/codex/watcher.test.ts:53:3)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/codex/watcher.test.ts:84:7)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1905:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)

test at tests/codex/watcher.test.ts:1:3416
✖ probes the configured binary and dispatches an approved task after a successful probe (142.354103ms)
  Error: Lint failed for spec "001-codex-fixture-feature":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async approveTask (/home/mathias/projects/osq/tests/codex/watcher.test.ts:53:3)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/codex/watcher.test.ts:135:7)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/codex/watcher.test.ts:1:4372
✖ preserves a supplied result and reaches done only after watcher verification (95.612986ms)
  Error: Lint failed for spec "001-codex-fixture-feature":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async approveTask (/home/mathias/projects/osq/tests/codex/watcher.test.ts:53:3)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/codex/watcher.test.ts:170:7)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1905:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/codex/watcher.test.ts:1:5331
✖ synthesizes a missing result from the last completed assistant text (144.38322ms)
  Error: Lint failed for spec "001-codex-fixture-feature":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async approveTask (/home/mathias/projects/osq/tests/codex/watcher.test.ts:53:3)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/codex/watcher.test.ts:194:7)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/codex/watcher.test.ts:1:6219
✖ fails with no_result when neither a result file nor final text exists (161.151595ms)
  Error: Lint failed for spec "001-codex-fixture-feature":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async approveTask (/home/mathias/projects/osq/tests/codex/watcher.test.ts:53:3)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/codex/watcher.test.ts:224:7)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/codex/watcher.test.ts:1:6747
✖ fails with verify_red when independent verification fails (128.124131ms)
  Error: Lint failed for spec "001-codex-fixture-feature":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async approveTask (/home/mathias/projects/osq/tests/codex/watcher.test.ts:53:3)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/codex/watcher.test.ts:242:7)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/codex/watcher.test.ts:1:7347
✖ records crashed for a terminal turn.failed even when the process exits zero (116.945518ms)
  Error: Lint failed for spec "001-codex-fixture-feature":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at async approveTask (/home/mathias/projects/osq/tests/codex/watcher.test.ts:53:3)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/codex/watcher.test.ts:261:7)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/codex/watcher.test.ts:1:7985
✖ reportCommand JSON consumes normalized usage and file events without double counting (93.095858ms)
  Error: Lint failed for spec "001-codex-fixture-feature":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async approveTask (/home/mathias/projects/osq/tests/codex/watcher.test.ts:53:3)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/codex/watcher.test.ts:279:7)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/cut-over.test.ts:1:3851
✖ monitors openspec/changes for approved change folders (112.292195ms)
  Error: Lint failed for spec "001-cut-over":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/cut-over.test.ts:179:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/cut-over.test.ts:1:4972
✖ prints the Human steps outcome after the change completes (149.331135ms)
  Error: Lint failed for spec "001-cut-over":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/cut-over.test.ts:215:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/cut-over.test.ts:1:5624
✖ never moves the legacy layout itself while cutting the runtime over (138.43876ms)
  Error: Lint failed for spec "003-active":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/cut-over.test.ts:233:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/dead-marker-retention.test.ts:2:590
✖ leaves active dead and regressed markers untouched when approval re-seals (144.025655ms)
  Error: Lint failed for spec "001-dead-retention":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/dead-marker-retention.test.ts:61:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1905:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)

test at tests/dead-marker-retention.test.ts:2:1515
✖ retains dead/1.1.md alongside done/1 after an explicit retry and successful rerun (142.010427ms)
  Error: Lint failed for spec "001-dead-retention":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/dead-marker-retention.test.ts:86:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/dead-marker-retention.test.ts:2:2464
✖ preserves an active dead marker when a task succeeds without re-approval (133.89381ms)
  Error: Lint failed for spec "001-dead-retention":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/dead-marker-retention.test.ts:109:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/golden-events.test.ts:9:6
✖ matches the checked-in golden events for a verified task (163.809536ms)
  Error: Lint failed for spec "001-golden-events":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/golden-events.test.ts:231:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/golden-events.test.ts:9:442
✖ matches the checked-in golden events for a dead task (121.380126ms)
  Error: Lint failed for spec "001-golden-events":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/golden-events.test.ts:245:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/harness-generic-workflows.test.ts:2:2255
✖ approveSpec writes the same identity through the real approval path (122.486894ms)
  Error: Lint failed for spec "001-approved-identity":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/harness-generic-workflows.test.ts:328:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/harness-generic-workflows.test.ts:2:4774
✖ records the selected harness and its model for agy, opencode, mock, and codex (105.731524ms)
  Error: Lint failed for spec "001-started-agy":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async createApprovedChange (/home/mathias/projects/osq/tests/harness-generic-workflows.test.ts:111:3)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/harness-generic-workflows.test.ts:458:26)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1905:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/instruction-delta-lint.test.ts:49:2599
✖ accepts declarative delta requirements with zero errors (93.950203ms)
  AssertionError [ERR_ASSERTION]: proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
  Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
  
  false !== true
  
      at TestContext.<anonymous> (/home/mathias/projects/osq/tests/instruction-delta-lint.test.ts:170:12)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at tests/mangled-lint.test.ts:37:581
✖ accepts clean files containing newlines and tabs (133.914977ms)
  AssertionError [ERR_ASSERTION]: proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
  Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
  
  false !== true
  
      at TestContext.<anonymous> (/home/mathias/projects/osq/tests/mangled-lint.test.ts:98:12)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1905:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at tests/mangled-lint.test.ts:37:2563
✖ ignores prohibited control characters under .run/ (131.726851ms)
  AssertionError [ERR_ASSERTION]: proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
  Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
  
  false !== true
  
      at TestContext.<anonymous> (/home/mathias/projects/osq/tests/mangled-lint.test.ts:161:12)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at tests/mangled-lint.test.ts:37:3377
✖ allows a single acceptance item per line (83.523419ms)
  AssertionError [ERR_ASSERTION]: proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
  Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
  
  false !== true
  
      at TestContext.<anonymous> (/home/mathias/projects/osq/tests/mangled-lint.test.ts:188:12)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at tests/manifest.test.ts:25:1714
✖ writes .run/manifest.json with hashes and metadata on approval (151.19988ms)
  Error: Lint failed for spec "001-manifest-probe":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/manifest.test.ts:122:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1905:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)

test at tests/manifest.test.ts:25:2730
✖ records null for a hashed file that does not exist (128.643526ms)
  Error: Lint failed for spec "001-manifest-probe":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/manifest.test.ts:153:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/manifest.test.ts:25:3146
✖ counts valid plan_started records, including resumed sessions without exits (96.863907ms)
  Error: Lint failed for spec "001-manifest-probe":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/manifest.test.ts:167:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/manifest.test.ts:25:3674
✖ tolerates a missing, empty, or partially malformed planning log (146.232435ms)
  Error: Lint failed for spec "001-manifest-probe":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/manifest.test.ts:175:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/manifest.test.ts:26:116
✖ changes planningSessions when only the plan log changes, keeping the approved hash (111.724446ms)
  Error: Lint failed for spec "001-manifest-probe":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/manifest.test.ts:200:19)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/measures.test.ts:2:408
✖ emits start then end measures for a verified task (90.083536ms)
  Error: Lint failed for spec "001-measures-probe":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async setupProject (/home/mathias/projects/osq/tests/measures.test.ts:426:7)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/measures.test.ts:439:47)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1905:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/measures.test.ts:2:1152
✖ reports changed files and lines for a scoped edit (104.679246ms)
  Error: Lint failed for spec "001-measures-scope":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async setupProject (/home/mathias/projects/osq/tests/measures.test.ts:426:7)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/measures.test.ts:470:47)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/measures.test.ts:2:2064
✖ emits an end measures event for a crashed dead outcome (112.399708ms)
  Error: Lint failed for spec "001-measures-dead":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async setupProject (/home/mathias/projects/osq/tests/measures.test.ts:426:7)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/measures.test.ts:498:47)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/measures.test.ts:2:2630
✖ emits end measures before the dead event on verify_red (76.495397ms)
  Error: Lint failed for spec "001-measures-red":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async setupProject (/home/mathias/projects/osq/tests/measures.test.ts:426:7)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/measures.test.ts:517:47)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/proposal-writes-schema.test.ts:60:1752
✖ osq lint passes when features.writes is absent and deltas exist in specs/ (114.649158ms)
  AssertionError [ERR_ASSERTION]: proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
  Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
  
  false !== true
  
      at TestContext.<anonymous> (/home/mathias/projects/osq/tests/proposal-writes-schema.test.ts:176:12)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at tests/queue-watch.test.ts:1:3579
✖ plans one item per invocation, halts on a dead task, retries, and lands all three (1734.672863ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  1 !== 0
  
      at TestContext.<anonymous> (/home/mathias/projects/osq/tests/queue-watch.test.ts:181:12)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1905:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 1,
    expected: 0,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at tests/reject.test.ts:6:2257
✖ rejects an approved change with an active dead marker (103.372527ms)
  Error: Lint failed for spec "001-reject-target":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/reject.test.ts:119:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/reject.test.ts:6:2805
✖ rejects an approved change with an active regressed task marker (119.810276ms)
  Error: Lint failed for spec "001-reject-target":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/reject.test.ts:131:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/reject.test.ts:6:3289
✖ rejects an approved change with a change-level regression (101.177812ms)
  Error: Lint failed for spec "001-reject-target":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/reject.test.ts:142:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/reject.test.ts:6:3786
✖ refuses a healthy approved change and leaves it in place (134.005998ms)
  Error: Lint failed for spec "001-reject-target":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/reject.test.ts:158:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/reject.test.ts:6:4129
✖ refuses an approved completed change (136.392172ms)
  Error: Lint failed for spec "001-reject-target":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/reject.test.ts:167:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/reject.test.ts:6:4403
✖ refuses a running task even when a dead marker would win state precedence (200.983221ms)
  Error: Lint failed for spec "001-reject-target":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/reject.test.ts:176:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/reject.test.ts:6:4893
✖ refuses a historical suffixed failure marker as not active (138.499408ms)
  Error: Lint failed for spec "001-reject-target":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/reject.test.ts:190:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/reject.test.ts:6:6371
✖ moves the complete record intact and appends one matching rejection event (159.742397ms)
  Error: Lint failed for spec "001-reject-target":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/reject.test.ts:237:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-already-running.test.ts:8:944
✖ aborts with already_running without a dead marker or dead event (165.556777ms)
  Error: Lint failed for spec "001-already-running":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-already-running.test.ts:111:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1905:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)

test at tests/runner-already-running.test.ts:8:1617
✖ logs the already_running outcome summary to stderr (118.934615ms)
  Error: Lint failed for spec "001-already-running":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-already-running.test.ts:111:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-already-running.test.ts:8:2066
✖ does not report the lock collision as a task failure in osq report (140.272928ms)
  Error: Lint failed for spec "001-already-running":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-already-running.test.ts:111:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-already-running.test.ts:8:2515
✖ only writes a dead event when an explicit dead marker is written (96.973901ms)
  Error: Lint failed for spec "001-already-running":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-already-running.test.ts:111:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-checkbox-projection.test.ts:2:3833
✖ does not invalidate the approved hash or modify .run/ markers (132.285427ms)
  Error: Lint failed for spec "001-checkbox-projection":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-checkbox-projection.test.ts:179:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-checkbox-projection.test.ts:2:4553
✖ derives task and spec state from .run/ markers, never tasks.md checkboxes (124.465994ms)
  Error: Lint failed for spec "001-checkbox-projection":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-checkbox-projection.test.ts:210:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-checkbox-projection.test.ts:2:5149
✖ writes .run/done/<n> and ticks tasks.md after an independent verify pass (124.974604ms)
  Error: Lint failed for spec "001-checkbox-projection":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-checkbox-projection.test.ts:220:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-done-dead-events.test.ts:2:1191
✖ defines the done and dead event payloads (167.614963ms)
  Error: Lint failed for spec "001-done-dead-events":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-done-dead-events.test.ts:206:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1905:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)

test at tests/runner-done-dead-events.test.ts:2:1415
✖ parameterizes every dead RunTaskFailureReason and isolates already_running (130.763945ms)
  Error: Lint failed for spec "001-done-dead-events":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-done-dead-events.test.ts:206:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-done-dead-events.test.ts:2:1742
✖ appends a done event alongside the done marker on success (108.714559ms)
  Error: Lint failed for spec "001-done-dead-events":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-done-dead-events.test.ts:206:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-done-dead-events.test.ts:2:2317
✖ appends a dead event alongside the dead marker for no_result (121.072002ms)
  Error: Lint failed for spec "001-done-dead-events":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-done-dead-events.test.ts:206:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-done-dead-events.test.ts:2:2317
✖ appends a dead event alongside the dead marker for crashed (212.436399ms)
  Error: Lint failed for spec "001-done-dead-events":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-done-dead-events.test.ts:206:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-done-dead-events.test.ts:2:2317
✖ appends a dead event alongside the dead marker for timeout (101.157303ms)
  Error: Lint failed for spec "001-done-dead-events":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-done-dead-events.test.ts:206:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-done-dead-events.test.ts:2:2317
✖ appends a dead event alongside the dead marker for verify_red (109.124645ms)
  Error: Lint failed for spec "001-done-dead-events":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-done-dead-events.test.ts:206:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-done-dead-events.test.ts:2:2317
✖ appends a dead event alongside the dead marker for spec_conflict (tampered task) (98.327675ms)
  Error: Lint failed for spec "001-done-dead-events":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-done-dead-events.test.ts:206:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-done-dead-events.test.ts:2:2317
✖ appends a dead event alongside the dead marker for spec_conflict (missing approval) (109.577541ms)
  Error: Lint failed for spec "001-done-dead-events":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-done-dead-events.test.ts:206:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-done-dead-events.test.ts:2:2317
✖ appends a dead event alongside the dead marker for undeclared_test_change (98.311519ms)
  Error: Lint failed for spec "001-done-dead-events":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-done-dead-events.test.ts:206:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-done-dead-events.test.ts:2:2856
✖ writes neither a dead marker nor a dead event for already_running (105.135166ms)
  Error: Lint failed for spec "001-done-dead-events":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-done-dead-events.test.ts:206:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-lifecycle-logging.test.ts:2:130
✖ spawnWithTimeout captures the child pid and elapsed duration in milliseconds (149.812053ms)
  Error: Lint failed for spec "001-lifecycle-logging":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-lifecycle-logging.test.ts:118:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1905:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)

test at tests/runner-lifecycle-logging.test.ts:2:577
✖ SpawnProcessResult and SpawnResult expose optional pid and elapsedMs fields (121.747459ms)
  Error: Lint failed for spec "001-lifecycle-logging":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-lifecycle-logging.test.ts:118:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-lifecycle-logging.test.ts:2:956
✖ logs a started summary and records a started event with pid and timeout (146.598032ms)
  Error: Lint failed for spec "001-lifecycle-logging":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-lifecycle-logging.test.ts:118:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-lifecycle-logging.test.ts:2:1611
✖ logs an exited summary at verbose level and records an exited event with exit code and elapsed time (162.234218ms)
  Error: Lint failed for spec "001-lifecycle-logging":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-lifecycle-logging.test.ts:118:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-lifecycle-logging.test.ts:2:2286
✖ demotes the exited summary to verbose while the started summary stays at info (84.904725ms)
  Error: Lint failed for spec "001-lifecycle-logging":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-lifecycle-logging.test.ts:118:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-lifecycle-logging.test.ts:2:2869
✖ emits each lifecycle log line from the same code path as its events.jsonl entry (94.826227ms)
  Error: Lint failed for spec "001-lifecycle-logging":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-lifecycle-logging.test.ts:118:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-lifecycle-logging.test.ts:2:3567
✖ does not log lifecycle lines when no logger is supplied (118.755744ms)
  Error: Lint failed for spec "001-lifecycle-logging":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-lifecycle-logging.test.ts:118:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-lifecycle-logging.test.ts:2:4058
✖ exposes relativizeToolSummary from core and re-exports it from heartbeat (105.45959ms)
  Error: Lint failed for spec "001-lifecycle-logging":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-lifecycle-logging.test.ts:118:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-lifecycle-logging.test.ts:2:4273
✖ models every event as a typed member of the OsqEvent union (91.915607ms)
  Error: Lint failed for spec "001-lifecycle-logging":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-lifecycle-logging.test.ts:118:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-lifecycle-logging.test.ts:2:4442
✖ relativizes opencode tool summaries to the project root at write time (107.563493ms)
  Error: Lint failed for spec "001-lifecycle-logging":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-lifecycle-logging.test.ts:118:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-lifecycle-logging.test.ts:2:4846
✖ relativizes agy tool summaries to the project root at write time (116.741061ms)
  Error: Lint failed for spec "001-lifecycle-logging":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-lifecycle-logging.test.ts:118:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-lifecycle-logging.test.ts:2:5332
✖ records harness, model, and osqVersion on the started event (119.553379ms)
  Error: Lint failed for spec "001-lifecycle-logging":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-lifecycle-logging.test.ts:118:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-lifecycle-logging.test.ts:2:5893
✖ emits exactly one started and one exited event through MockAdapter (117.888887ms)
  Error: Lint failed for spec "001-lifecycle-logging":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-lifecycle-logging.test.ts:118:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-lifecycle-pid.test.ts:18:2019
✖ AgyAdapter forwards onSpawn, returns pid/elapsedMs, and emits no lifecycle events (209.291075ms)
  Error: Lint failed for spec "001-lifecycle-pid":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-lifecycle-pid.test.ts:108:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1905:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)

test at tests/runner-lifecycle-pid.test.ts:18:2870
✖ runTask through AgyAdapter records exactly one started and one exited with matching pid (131.899702ms)
  Error: Lint failed for spec "001-lifecycle-pid":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-lifecycle-pid.test.ts:108:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-lifecycle-pid.test.ts:18:2019
✖ OpencodeAdapter forwards onSpawn, returns pid/elapsedMs, and emits no lifecycle events (219.71754ms)
  Error: Lint failed for spec "001-lifecycle-pid":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-lifecycle-pid.test.ts:108:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-lifecycle-pid.test.ts:18:2870
✖ runTask through OpencodeAdapter records exactly one started and one exited with matching pid (114.390389ms)
  Error: Lint failed for spec "001-lifecycle-pid":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-lifecycle-pid.test.ts:108:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-outcome-logging.test.ts:2:583
✖ does not export the legacy formatTaskOutcomeSummary helper (200.690224ms)
  Error: Lint failed for spec "001-outcome-logging":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-outcome-logging.test.ts:87:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1905:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)

test at tests/runner-outcome-logging.test.ts:2:748
✖ renders a verified line with elapsed time and no (passed) suffix (175.85931ms)
  Error: Lint failed for spec "001-outcome-logging":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-outcome-logging.test.ts:87:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1905:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-outcome-logging.test.ts:2:981
✖ renders unicode symbols when enabled (110.53594ms)
  Error: Lint failed for spec "001-outcome-logging":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-outcome-logging.test.ts:87:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-outcome-logging.test.ts:2:1253
✖ renders a dead line for every failure reason (111.712555ms)
  Error: Lint failed for spec "001-outcome-logging":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-outcome-logging.test.ts:87:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-outcome-logging.test.ts:2:1551
✖ appends the detail string before the elapsed time (97.260628ms)
  Error: Lint failed for spec "001-outcome-logging":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-outcome-logging.test.ts:87:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-outcome-logging.test.ts:2:1907
✖ produces a single line for every outcome (90.572537ms)
  Error: Lint failed for spec "001-outcome-logging":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-outcome-logging.test.ts:87:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-outcome-logging.test.ts:2:2486
✖ logs exactly one verified line upon successful verification (104.318943ms)
  Error: Lint failed for spec "001-outcome-logging":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-outcome-logging.test.ts:87:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-outcome-logging.test.ts:2:2960
✖ logs exactly one dead line and writes the marker upon verification failure (110.84758ms)
  Error: Lint failed for spec "001-outcome-logging":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-outcome-logging.test.ts:87:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-outcome-logging.test.ts:2:3714
✖ logs timed_out detail when verification times out (105.452902ms)
  Error: Lint failed for spec "001-outcome-logging":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-outcome-logging.test.ts:87:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-outcome-logging.test.ts:2:4437
✖ logs a timeout dead line when the agent exceeds its timeout (93.043588ms)
  Error: Lint failed for spec "001-outcome-logging":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-outcome-logging.test.ts:87:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-outcome-logging.test.ts:2:5061
✖ logs a crashed dead line with the exit code when the agent crashes (105.022776ms)
  Error: Lint failed for spec "001-outcome-logging":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-outcome-logging.test.ts:87:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-outcome-logging.test.ts:2:5711
✖ logs a no_result dead line when the agent writes no result (142.107143ms)
  Error: Lint failed for spec "001-outcome-logging":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-outcome-logging.test.ts:87:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-outcome-logging.test.ts:2:6344
✖ logs a spec_conflict dead line when the folder changes after approval (120.476026ms)
  Error: Lint failed for spec "001-outcome-logging":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-outcome-logging.test.ts:87:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-outcome-logging.test.ts:2:7048
✖ logs an already_running dead line when the task lock is held (91.470061ms)
  Error: Lint failed for spec "001-outcome-logging":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-outcome-logging.test.ts:87:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-outcome-logging.test.ts:2:7566
✖ does not log an outcome line when no logger is supplied (155.938405ms)
  Error: Lint failed for spec "001-outcome-logging":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-outcome-logging.test.ts:87:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-synthesized-result.test.ts:24:1402
✖ HarnessEventType includes text and TextEventData carries a text string (244.492367ms)
  Error: Lint failed for spec "001-synthesized-result":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-synthesized-result.test.ts:148:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1905:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)

test at tests/runner-synthesized-result.test.ts:24:1641
✖ extractFinalTextFromStream returns null when no text event exists (121.135432ms)
  Error: Lint failed for spec "001-synthesized-result":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-synthesized-result.test.ts:148:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-synthesized-result.test.ts:24:1920
✖ extractFinalTextFromStream returns null when the event stream is missing (91.62191ms)
  Error: Lint failed for spec "001-synthesized-result":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-synthesized-result.test.ts:148:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-synthesized-result.test.ts:24:2080
✖ extractFinalTextFromStream returns the last emitted text message (106.81434ms)
  Error: Lint failed for spec "001-synthesized-result":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-synthesized-result.test.ts:148:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-synthesized-result.test.ts:24:2469
✖ extractFinalTextFromStream ignores raw harness payload shapes (fallback candidate list dropped) (107.869368ms)
  Error: Lint failed for spec "001-synthesized-result":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-synthesized-result.test.ts:148:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-synthesized-result.test.ts:24:2999
✖ synthesizeResultFile writes synthesized: true frontmatter and an attribution header (120.52482ms)
  Error: Lint failed for spec "001-synthesized-result":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-synthesized-result.test.ts:148:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-synthesized-result.test.ts:24:3512
✖ verify.ts exports the synthesis and gating helpers (138.935782ms)
  Error: Lint failed for spec "001-synthesized-result":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-synthesized-result.test.ts:148:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-synthesized-result.test.ts:24:3847
✖ verify.ts stays under the 200 line lifecycle module budget (129.491011ms)
  Error: Lint failed for spec "001-synthesized-result":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-synthesized-result.test.ts:148:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-synthesized-result.test.ts:24:4088
✖ snapshotTestFiles and findUndeclaredTestChanges report edits and deletions but allow new files (142.284083ms)
  Error: Lint failed for spec "001-synthesized-result":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-synthesized-result.test.ts:148:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-synthesized-result.test.ts:24:4985
✖ runVerificationGate passes a zero exit and reports a non-zero diagnostic (106.753604ms)
  Error: Lint failed for spec "001-synthesized-result":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-synthesized-result.test.ts:148:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-synthesized-result.test.ts:24:5411
✖ runVerificationGate enforces the timeout and reports timedOut (148.234148ms)
  Error: Lint failed for spec "001-synthesized-result":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-synthesized-result.test.ts:148:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-synthesized-result.test.ts:24:6165
✖ AgyAdapter emits a text event carrying the completed assistant message (164.186502ms)
  Error: Lint failed for spec "001-synthesized-result":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-synthesized-result.test.ts:148:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-synthesized-result.test.ts:24:6847
✖ AgyAdapter exit 0 with no result file synthesizes from the last text event (207.305013ms)
  Error: Lint failed for spec "001-synthesized-result":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-synthesized-result.test.ts:148:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-synthesized-result.test.ts:24:6165
✖ OpencodeAdapter emits a text event carrying the completed assistant message (130.647085ms)
  Error: Lint failed for spec "001-synthesized-result":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-synthesized-result.test.ts:148:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-synthesized-result.test.ts:24:6847
✖ OpencodeAdapter exit 0 with no result file synthesizes from the last text event (125.881558ms)
  Error: Lint failed for spec "001-synthesized-result":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-synthesized-result.test.ts:148:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-synthesized-result.test.ts:24:8056
✖ case B: real adapter exit 0 with neither result file nor text is dead with reason no_result (149.893436ms)
  Error: Lint failed for spec "001-synthesized-result":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-synthesized-result.test.ts:148:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-synthesized-result.test.ts:24:8773
✖ README documents the synthesized result behavior for the no_result reason (104.995692ms)
  Error: Lint failed for spec "001-synthesized-result":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-synthesized-result.test.ts:148:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-terminal-status.test.ts:2:2285
✖ renders task number, elapsed, tool count, tokens, cost, and summary (156.898023ms)
  Error: Lint failed for spec "001-terminal-status":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-terminal-status.test.ts:155:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1905:7)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1905:7)

test at tests/runner-terminal-status.test.ts:2:2591
✖ omits cost and summary when they are not reported (92.71092ms)
  Error: Lint failed for spec "001-terminal-status":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-terminal-status.test.ts:155:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-terminal-status.test.ts:2:2803
✖ renders the token count abbreviated in the status row (151.240603ms)
  Error: Lint failed for spec "001-terminal-status":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-terminal-status.test.ts:155:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-terminal-status.test.ts:2:3111
✖ assembles the full row without truncating, leaving fitting to the logger sink (99.151847ms)
  Error: Lint failed for spec "001-terminal-status":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-terminal-status.test.ts:155:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-terminal-status.test.ts:2:3394
✖ abbreviates counts at the 1k and 1M boundaries (101.176382ms)
  Error: Lint failed for spec "001-terminal-status":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-terminal-status.test.ts:155:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1905:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-terminal-status.test.ts:2:3646
✖ is applied identically to the heartbeat line (123.556566ms)
  Error: Lint failed for spec "001-terminal-status":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-terminal-status.test.ts:155:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-terminal-status.test.ts:2:3970
✖ strips the project root and its trailing separator from absolute paths (132.844615ms)
  Error: Lint failed for spec "001-terminal-status":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-terminal-status.test.ts:155:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1905:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-terminal-status.test.ts:2:4373
✖ normalizes a trailing separator on the supplied root (110.168165ms)
  Error: Lint failed for spec "001-terminal-status":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-terminal-status.test.ts:155:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-terminal-status.test.ts:2:4589
✖ falls back to process.cwd() when no root is supplied (150.532497ms)
  Error: Lint failed for spec "001-terminal-status":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-terminal-status.test.ts:155:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-terminal-status.test.ts:2:4797
✖ leaves absolute paths outside the project root untouched (107.974836ms)
  Error: Lint failed for spec "001-terminal-status":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-terminal-status.test.ts:155:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-terminal-status.test.ts:2:4992
✖ relativizes an exact root match to a dot (132.689313ms)
  Error: Lint failed for spec "001-terminal-status":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-terminal-status.test.ts:155:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-terminal-status.test.ts:3:43
✖ counts tool events, sums tokens and cost, and keeps the last tool summary (142.512252ms)
  Error: Lint failed for spec "001-terminal-status":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-terminal-status.test.ts:155:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1905:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-terminal-status.test.ts:3:812
✖ accumulates new events in memory instead of re-reading already-counted lines (155.779417ms)
  Error: Lint failed for spec "001-terminal-status":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-terminal-status.test.ts:155:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-terminal-status.test.ts:4:402
✖ tolerates a missing event file with zeroed counters (138.828893ms)
  Error: Lint failed for spec "001-terminal-status":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-terminal-status.test.ts:155:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-terminal-status.test.ts:4:716
✖ relativizes tool summaries against the project root but keeps the raw event intact (138.250646ms)
  Error: Lint failed for spec "001-terminal-status":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-terminal-status.test.ts:155:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-terminal-status.test.ts:4:1307
✖ falls back to process.cwd() for tool summaries when projectRoot is omitted (128.181308ms)
  Error: Lint failed for spec "001-terminal-status":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-terminal-status.test.ts:155:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-terminal-status.test.ts:4:1700
✖ renders the relativized tool path in the status row without a leading slash (104.038593ms)
  Error: Lint failed for spec "001-terminal-status":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-terminal-status.test.ts:155:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-terminal-status.test.ts:4:2330
✖ logs a single started line with the title truncated to the terminal width (84.644538ms)
  Error: Lint failed for spec "001-terminal-status":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-terminal-status.test.ts:155:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1905:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-terminal-status.test.ts:4:3091
✖ logs a verified outcome line with elapsed seconds (80.537413ms)
  Error: Lint failed for spec "001-terminal-status":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-terminal-status.test.ts:155:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-terminal-status.test.ts:4:3359
✖ logs a dead outcome line with the reason and elapsed seconds (91.364408ms)
  Error: Lint failed for spec "001-terminal-status":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-terminal-status.test.ts:155:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-terminal-status.test.ts:4:3885
✖ redraws a TTY status row with the live tool count, tokens, cost, and summary (78.006801ms)
  Error: Lint failed for spec "001-terminal-status":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-terminal-status.test.ts:155:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1905:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-terminal-status.test.ts:4:4463
✖ redraws the status row with a repo-relative tool path from an absolute summary (73.874397ms)
  Error: Lint failed for spec "001-terminal-status":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-terminal-status.test.ts:155:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-terminal-status.test.ts:4:5947
✖ derives the non-TTY heartbeat log from the same counters (66.580625ms)
  Error: Lint failed for spec "001-terminal-status":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-terminal-status.test.ts:155:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-terminal-status.test.ts:4:6293
✖ demotes the periodic heartbeat log to verbose on a TTY (73.960961ms)
  Error: Lint failed for spec "001-terminal-status":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-terminal-status.test.ts:155:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-terminal-status.test.ts:4:6678
✖ still emits the periodic heartbeat at verbose on a TTY (63.253521ms)
  Error: Lint failed for spec "001-terminal-status":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-terminal-status.test.ts:155:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-test-gating.test.ts:15:1506
✖ records preexisting tests before spawn: a deletion is detected (120.74165ms)
  Error: Lint failed for spec "001-test-gating":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-test-gating.test.ts:145:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-test-gating.test.ts:15:2138
✖ a modified preexisting test writes the dead marker and dead event, and skips verify (143.827294ms)
  Error: Lint failed for spec "001-test-gating":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-test-gating.test.ts:162:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-test-gating.test.ts:15:3258
✖ creating a brand new test file without tests.modify proceeds to verify (85.115702ms)
  Error: Lint failed for spec "001-test-gating":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-test-gating.test.ts:192:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner-test-gating.test.ts:15:4012
✖ tests.modify: true permits editing a preexisting test file (116.231257ms)
  Error: Lint failed for spec "001-test-gating":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner-test-gating.test.ts:217:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner.test.ts:1:987
✖ fails with reason: spec_conflict if folder is modified after approval (147.559069ms)
  Error: Lint failed for spec "001-runner-spec":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner.test.ts:26:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1905:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)

test at tests/runner.test.ts:1:1511
✖ fails with reason: no_result if agent exits without writing .run/results/<n>.md (112.897952ms)
  Error: Lint failed for spec "001-runner-spec":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner.test.ts:26:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner.test.ts:1:2016
✖ fails with reason: timeout if agent times out (101.057765ms)
  Error: Lint failed for spec "001-runner-spec":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner.test.ts:26:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner.test.ts:1:2479
✖ fails with reason: verify_red if task verify fails (100.107304ms)
  Error: Lint failed for spec "001-runner-spec":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner.test.ts:26:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner.test.ts:2:406
✖ fails with reason: verify_red and timed_out: true if task verify hangs (103.265061ms)
  Error: Lint failed for spec "001-runner-spec":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner.test.ts:26:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/runner.test.ts:3:567
✖ succeeds, creates .run/done/<n>, and ticks checkbox on valid task and passing verify (91.226565ms)
  Error: Lint failed for spec "001-runner-spec":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/runner.test.ts:26:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/status.test.ts:1:1024
✖ getStatusOverview returns all active specs with derived spec and task states (199.130182ms)
  Error: Lint failed for spec "001-first-spec":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 2.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/status.test.ts:50:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1905:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)

test at tests/status.test.ts:10:1477
✖ statusCommand prints formatted status overview with state indicators (125.648682ms)
  Error: Lint failed for spec "001-payment-gateway":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/status.test.ts:99:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/status.test.ts:10:2491
✖ status output clearly distinguishes pending, running, done, and dead tasks (149.626316ms)
  Error: Lint failed for spec "001-task-lifecycle-spec":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 2.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 3.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 4.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/status.test.ts:149:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/watcher-build-identity.test.ts:2:2143
✖ records version and commit in the started lifecycle event data (108.755047ms)
  Error: Lint failed for spec "001-build-identity":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/watcher-build-identity.test.ts:116:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1905:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/watcher-heartbeat.test.ts:2:130
✖ defaults config.log.heartbeatSeconds to 60 seconds (163.173891ms)
  Error: Lint failed for spec "001-heartbeat-logging":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/watcher-heartbeat.test.ts:90:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1905:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)

test at tests/watcher-heartbeat.test.ts:2:414
✖ computeTaskHeartbeatStats reports elapsed seconds, event count, and total tokens (106.356802ms)
  Error: Lint failed for spec "001-heartbeat-logging":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/watcher-heartbeat.test.ts:90:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/watcher-heartbeat.test.ts:2:1115
✖ computeTaskHeartbeatStats tolerates a missing event file (92.967995ms)
  Error: Lint failed for spec "001-heartbeat-logging":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/watcher-heartbeat.test.ts:90:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/watcher-heartbeat.test.ts:2:1327
✖ logs multiple periodic heartbeat updates with elapsed, events, and tokens (79.864541ms)
  Error: Lint failed for spec "001-heartbeat-logging":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/watcher-heartbeat.test.ts:90:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/watcher-heartbeat.test.ts:2:2287
✖ starts the heartbeat timer unreferenced via unref() (89.465179ms)
  Error: Lint failed for spec "001-heartbeat-logging":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/watcher-heartbeat.test.ts:90:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/watcher-heartbeat.test.ts:2:3057
✖ clears the heartbeat timer in the finally block so it stops on completion (88.185252ms)
  Error: Lint failed for spec "001-heartbeat-logging":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/watcher-heartbeat.test.ts:90:5)
      at async TestHook.run (node:internal/test_runner/test:1409:7)
      at async Suite.runHook (node:internal/test_runner/test:1289:9)
      at async Test.run (node:internal/test_runner/test:1362:9)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/watcher-preflight.test.ts:7:701
✖ Preflight executes <bin> --version before any task is picked or spawned (99.647934ms)
  Error: Lint failed for spec "001-sequenced-spec":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/watcher-preflight.test.ts:145:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/watcher-preflight.test.ts:20:995
✖ Missing binary prints single clear line naming bin path and exits non-zero without dispatching tasks (93.051924ms)
  Error: Lint failed for spec "001-undispatched-spec":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/watcher-preflight.test.ts:203:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/watcher-preflight.test.ts:35:487
✖ Successful execution logs resolved version string and proceeds to task cycle (73.724969ms)
  Error: Lint failed for spec "001-success-spec":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/watcher-preflight.test.ts:370:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)

test at tests/watcher.test.ts:1:934
✖ runWatcherOnce processes approved specs, executes tasks, and archives on completion (116.554052ms)
  Error: Lint failed for spec "001-automated-spec":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/watcher.test.ts:52:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1905:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)

test at tests/watcher.test.ts:1:1831
✖ runWatcherOnce executes multiple tasks sequentially in a multi-task spec without hash conflict and archives (96.375466ms)
  Error: Lint failed for spec "001-two-task-spec":
    - proposal.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 1.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
    - Task in 2.md verify is the template placeholder node -e "process.exit(0)"; replace it with a real command that verifies the completed change's final tree
      at approveSpec (/home/mathias/projects/osq/src/core/approve.ts:59:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (/home/mathias/projects/osq/tests/watcher.test.ts:122:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7)
 ELIFECYCLE  Test failed. See above for more details.
 ELIFECYCLE  Command failed with exit code 1.
