---
reason: verify_red
command: "pnpm verify"
exit_code: 1
---
Archive-time change-level verification failed.
> @matteeh/osq@0.2.3 verify .
> pnpm typecheck:cli && pnpm typecheck:ui && pnpm build && pnpm test && pnpm lint


> @matteeh/osq@0.2.3 typecheck:cli .
> tsc --noEmit -p packages/ui/tsconfig.cli.json


> @matteeh/osq@0.2.3 typecheck:ui .
> pnpm --filter @osq/ui typecheck


> @osq/ui@0.0.0 typecheck packages/ui
> tsc --noEmit -p tsconfig.json


> @matteeh/osq@0.2.3 build .
> pnpm build:ui && pnpm stage:ui && pnpm build:cli


> @matteeh/osq@0.2.3 build:ui .
> pnpm --filter @osq/ui build


> @osq/ui@0.0.0 build packages/ui
> vite build

vite v8.3.0 building client environment for production...
transforming...
✓ 67 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.45 kB │ gzip:  0.28 kB
dist/assets/index-D6zVSjO7.css    2.44 kB │ gzip:  0.99 kB
dist/assets/index-Bw0OfoIZ.js   276.22 kB │ gzip: 83.84 kB

✓ built in 170ms

> @matteeh/osq@0.2.3 stage:ui .
> node scripts/stage-ui.mjs

Staged UI build into ui/dist

> @matteeh/osq@0.2.3 build:cli .
> tsc -p tsconfig.build.json


> @matteeh/osq@0.2.3 test .
> node --import tsx --test 'tests/**/*.test.ts' && TSX_TSCONFIG_PATH=packages/ui/tsconfig.runtime.json node --import tsx --test 'tests/**/*.test.tsx'

▶ ADR 003 land decisions
  ✔ decision 7 builds the land commit from the tip and moves it without a squash (8.683809ms)
  ✔ decision 8 states the land commit runs no hooks and signs when git is set to (1.389774ms)
✔ ADR 003 land decisions (11.436399ms)
▶ ADR 004: Pinned OpenSpec Validator
  ✔ records the accepted decision for the pinned validator (12.32781ms)
  ✔ defines the exact dependency pin, binary path, and peer range (1.381563ms)
  ✔ documents validation execution semantics (2.02988ms)
  ✔ defines doctor diagnostic verification and drift reporting semantics (0.857812ms)
  ✔ is indexed from the decisions README (0.683065ms)
✔ ADR 004: Pinned OpenSpec Validator (18.751481ms)
▶ the decisions index
  ✔ links every ADR file exactly once and links only files that exist (44.378555ms)
✔ the decisions index (45.376061ms)
▶ ADR 006: osq is the deterministic core
  ✔ is accepted, applies to all, and reaches the project rules block (35.078114ms)
✔ ADR 006: osq is the deterministic core (36.127758ms)
▶ ADR check modification flag
  ✔ flags a task authorized to edit an accepted ADR check and counts it in the report (314.548714ms)
  ✔ raises no flag without tests.modify and kills an edit to the check file (337.956992ms)
✔ ADR check modification flag (654.075187ms)
▶ decision checks and denied packages
  ✔ reads checks and denies from an accepted ADR (53.28259ms)
  ✔ normalizes check paths to forward slashes without a leading ./ (3.367389ms)
  ✔ reads missing fields as empty lists (2.723321ms)
  ✔ marks a non-list denies and reports an error naming the ADR and field (5.639841ms)
  ✔ marks a checks entry that is not a non-empty string (3.364347ms)
  ✔ reports one error per malformed field (2.461667ms)
✔ decision checks and denied packages (73.706125ms)
▶ decision check files in doctor
  ✔ fails on a missing check file of an accepted ADR (478.729035ms)
  ✔ passes when the accepted ADR check file exists (9.212803ms)
  ✔ names both the ADR path and the file in the failure message (485.879398ms)
  ✔ does not fail a superseded ADR with a missing check file (34.178672ms)
  ✔ does not fail a proposed ADR with a missing check file (9.091629ms)
✔ decision check files in doctor (1018.103934ms)
▶ Agy stream-json event translation
  ✔ buildAgyArgs adds --output-format stream-json to the arguments (146.134263ms)
  ✔ extracts token usage from step_update usage fields (18.625869ms)
  ✔ defaults missing usage fields and derives total from input plus output (29.740378ms)
  ✔ appends a tokens event for a step_update with usage (39.209344ms)
  ✔ extracts tool name and command/path summaries from step_update tool steps (31.553573ms)
  ✔ appends a tool event and logs it at verbose level from the shared handler (33.703545ms)
  ✔ persists the tool event while suppressing the verbose log at normal level (28.294533ms)
  ✔ parses fixture/agy-events.jsonl lines and emits a single tokens event (28.40423ms)
  ✔ falls back gracefully when stdout is plain text without valid JSON (31.638454ms)
[agy] Unknown event type: init
  ✔ translates stream events through the adapter spawn path with the shared logger (90.434731ms)
✔ Agy stream-json event translation (480.24519ms)
▶ approval digest capability creation
  ✔ resembles names by separators, word subset, and edit distance (36.595003ms)
  ✔ returns null for short dissimilar names (10.554564ms)
  ✔ returns the first resembling living name in name order (3.695185ms)
  ✔ marks a delta with Purpose for a new dissimilar name as created and flags nothing (49.291741ms)
  ✔ flags a delta without Purpose for a missing capability (20.359385ms)
  ✔ flags a delta with Purpose whose name resembles a living capability (9.609707ms)
  ✔ raises no flag for cli beside a living api (7.45952ms)
✔ approval digest capability creation (141.798756ms)
▶ approval digest creates
  ✔ counts a listed capability as created though its name resembles a living one (70.292869ms)
  ✔ counts a listed capability as created without a Purpose section (11.720415ms)
  ✔ leaves the Purpose-and-resemblance rule in place when creates is absent (8.914116ms)
  ✔ does not count a listed name that already has a living spec as created (9.038398ms)
✔ approval digest creates (101.543609ms)
▶ approval digest decisions
  ✔ lists each governing ADR in number order and prints them after capabilities (118.974295ms)
  ✔ lists only accepted ADRs (56.065545ms)
  ✔ leaves the formatted digest unchanged when no ADR governs the change (22.678608ms)
  ✔ raises one adr_departure flag per departure line, after every other flag (15.440177ms)
  ✔ accepts a departure line without a list marker and raises one flag per line (33.78807ms)
  ✔ records adr_departure through approveSpec and counts it in the report (245.998624ms)
✔ approval digest decisions (494.968284ms)
▶ approval digest documentation
  ✔ README adds an Approval digest bullet after the approval gate (9.083188ms)
  ✔ README names the five flags in plain words and that they never block (4.099364ms)
  ✔ README lists the confirm and show JSON commands and their behavior (3.013549ms)
  ✔ README describes the Approval flags report section and its cutoff (2.72068ms)
✔ approval digest documentation (20.260801ms)
▶ approval digest verify start conflict
  ✔ flags a green or any task whose verify names a test it creates (110.154212ms)
  ✔ emits the conflict last, after unknown_capability (22.083175ms)
  ✔ does not flag a red task that creates its own test (6.762094ms)
  ✔ does not flag a path an earlier task scope covers, whatever it declares (21.354917ms)
  ✔ records the new id in the manifest approvalFlags through approveSpec (175.304192ms)
✔ approval digest verify start conflict (337.376419ms)
▶ approval digest
  ✔ summarizes a clean change and raises no flags (106.925812ms)
  ✔ collapses whitespace and takes the first two sentences of a goal (3.764582ms)
  ✔ reports tests.modify tasks with existing tests as information, never a flag (17.398559ms)
  ✔ flags a resolved scope path shared by two tasks, including missing declarations (9.475085ms)
  ✔ flags every sensitive kind once and excludes env templates (18.667244ms)
  ✔ flags only verifies that name neither a test file nor a runner (14.944013ms)
  ✔ does not flag a verify that names a bare tests path segment (8.11426ms)
  ✔ flags removed requirements and unknown capabilities by name (13.003343ms)
  ✔ keeps flag order stable by id, then task number or name, and formats lines (20.296508ms)
  ✔ summarizes a single flag with the singular noun (5.711198ms)
✔ approval digest (221.050172ms)
▶ osq approve confirmation
  ✔ registers --confirm on osq approve (4.42213ms)
  ✔ approves a flagged change by default and records mode shown (203.92344ms)
  ✔ records mode confirmed when the prompt is answered y (158.953604ms)
  ✔ declines an empty answer and writes nothing (144.16413ms)
  ✔ refuses without a terminal and writes nothing (148.417843ms)
  ✔ never asks when --confirm fires no flags (149.888138ms)
✔ osq approve confirmation (811.473238ms)
▶ Stack dependency state
  ✔ reads approved from the dependency worktree (576.714083ms)
  ✔ reads archived from the branch tip with the archive hash and base (436.695389ms)
  ✔ reads landed from the default branch whatever the branch holds (150.986198ms)
  ✔ reads unapproved when the branch only holds the rejected folder (411.076778ms)
  ✔ reads unapproved for a checkout draft (134.443407ms)
  ✔ formats and parses stacked-on lines (1.518966ms)
✔ Stack dependency state (1715.628108ms)
▶ Stacked approval
  ✔ records a stacked approval for a dependent of a running change (683.033028ms)
  ✔ approves into a worktree when the dependency already landed (552.667966ms)
  ✔ replaces the stacked copy when approved again (1046.05693ms)
  ✔ approves into a worktree and clears the stacked copy after a rejection (1124.641933ms)
✔ Stacked approval (3407.277021ms)
▶ osq approve into a worktree
  ✔ commits the draft onto osq/<folder> and writes nothing to the checkout (503.538523ms)
  ✔ runs vcs.prepare in the worktree and not in the checkout (381.661207ms)
  ✔ stops on a failing prepare and keeps the branch and worktree (339.176325ms)
  ✔ refuses a non-default branch and approves with baseOk (542.739181ms)
  ✔ refuses dirty task scope and approves with ignoreDirty (525.445341ms)
  ✔ refuses an existing branch and creates no worktree (214.126601ms)
  ✔ stacks on an approved dependency that has not landed (735.196267ms)
  ✔ approves in the checkout when vcs is off (246.091977ms)
  ✔ registers --confirm, --base-ok, and --ignore-dirty on osq approve (6.482517ms)
✔ osq approve into a worktree (3498.163138ms)
▶ osq approve
  ✔ findSpecFolder resolves spec folder by ID, padded number, or prefix (125.16862ms)
  ✔ approveSpec lints, hashes, and writes .run/approved for valid spec (194.792674ms)
  ✔ approveSpec rejects spec failing lint and does not write approved marker (105.058246ms)
  ✔ re-approves an existing spec after modifications (267.576422ms)
✔ osq approve (694.504154ms)
▶ archive sidecars
  ✔ writes a sidecar for a created capability that declares a group (99.981493ms)
  ✔ writes no sidecar for a bare created capability (35.767485ms)
  ✔ copies a replacement sidecar byte for byte, replacing the living one (41.821067ms)
  ✔ leaves a capability without a group or replacement sidecar untouched (29.751477ms)
  ✔ records the sidecar hash, and null when there is none, for every hashed capability (48.392655ms)
✔ archive sidecars (257.752039ms)
▶ archive specs verification
  ✔ runs the change verify against the merged living specs (610.045158ms)
  ✔ records every living spec and sidecar relative to the project root (51.008262ms)
  ✔ puts the living specs back when the change verify is red (508.240709ms)
  ✔ recovers an interrupted archive before applying the deltas again (542.884371ms)
  ✔ archives with a prompt file and leaves no record behind (472.233116ms)
  ✔ restoreArchiveSpecs changes nothing without a record (37.084501ms)
✔ archive specs verification (2223.491062ms)
▶ interrupted archive in a worktree
  ✔ archives instead of halting with worktree_dirty (1556.411409ms)
✔ interrupted archive in a worktree (1556.787631ms)
▶ archive-time verification
  ✔ extracts a proposal verify command into SpecData (91.605723ms)
  ✔ archives a clean change after re-running every task and change verify (708.2627ms)
  ✔ refuses task 2 before spawning when an earlier done scope was modified (418.46865ms)
  ✔ blocks archiving when the change-level verify fails (644.152497ms)
  ✔ halts archival and records final-task drift before the archive verifier runs (940.642171ms)
  ✔ records every stale done task in one archive audit without stopping at the first (1015.943644ms)
  ✔ repeatedly halts without adding verification, marker, or event duplicates (722.70767ms)
  ✔ removes the transient plan-prompt.md from a successful archive (584.753466ms)
  ✔ leaves the transient plan-prompt.md in place when archive verification fails (413.217808ms)
✔ archive-time verification (5542.230949ms)
▶ archive-time verify named-path check
  ✔ regresses without running when a named path was deleted (471.981043ms)
  ✔ archives as before when every named path is present (559.380632ms)
✔ archive-time verify named-path check (1033.452637ms)
▶ Archiver and Delta Application
  ✔ applyOpenSpecDeltas creates and then updates capability specs from delta specs (71.356586ms)
  ✔ archiveSpecFolder moves spec folder whole to archive preserving .run markers (34.298096ms)
  ✔ archiveSpecFolder preserves full .run history including results and event logs (42.500965ms)
  ✔ archiveSpecFolder preserves history by disambiguating if destination already exists (24.497648ms)
  ✔ archiveSpecFolder resolves the destination through a custom openspecRoot (20.009055ms)
  ✔ archiveSpecFolder applies delta specs inside openspec/specs and moves to the OpenSpec archive path (39.554427ms)
  ✔ archiveSpecFolder ensures every archived tasks.md is fully ticked (38.477888ms)
  ✔ archiveSpecFolder ticks tasks.md under the canonical archive layout (58.920156ms)
  ✔ archiveSpecFolder appends exactly one archived event to the archived change stream after relocation (29.468254ms)
  ✔ archiveSpecFolder emits no archived event when relocation fails (32.143571ms)
  ✔ checkAndArchiveSpec emits no archived event when change-level verification fails (144.70069ms)
  ✔ checkAndArchiveSpec records change-level verify_ran before the archived event (130.069682ms)
  ✔ checkAndArchiveSpec applies deltas once then archives only when all tasks are marked done (140.863962ms)
✔ Archiver and Delta Application (811.642445ms)
▶ Automatic scope recertification
  ✔ recertifies a task automatically when a later in-scope task extended its file (978.903282ms)
  ✔ reports the recertified task and no stale task from the audit (653.017781ms)
  ✔ halts with a regression when the chain is intact but the verify fails (592.614914ms)
  ✔ halts when a human edit leaves a gap before the later task recorded the file (318.092387ms)
  ✔ halts when the changed file is outside every later task scope (229.55569ms)
  ✔ records a resolver-only difference as a regression exactly as before (256.360305ms)
  ✔ leaves automatic out of a passing human retry recertification (218.98629ms)
✔ Automatic scope recertification (3250.351804ms)
▶ automatic retry configuration
  ✔ defaults the automatic retry count to one (21.81672ms)
  ✔ retains a declared count while preserving the other gate defaults (2.177729ms)
  ✔ retains zero to disable automatic retries (2.515312ms)
  ✔ rejects negative, fractional, and non-numeric counts naming the key (2.960874ms)
  ✔ loads the count from osq.config.ts (227.758902ms)
✔ automatic retry configuration (258.8113ms)
▶ automatic retry documentation
  ✔ README names gates.autoRetries, stuck, fingerprint, and Automatic retries (9.116231ms)
  ✔ Gates and permissions gains an Automatic retry bullet with its reasons, count, and prompt (5.020232ms)
  ✔ explains the fingerprint and the stuck stop with the inbox and retry escape hatch (3.577083ms)
  ✔ dead reasons note the fingerprint and stuck frontmatter (1.949357ms)
  ✔ inbox section documents the optional stuck field on task-dead items (4.339032ms)
  ✔ Metrics & Reporting mentions the Automatic retries section (2.371183ms)
✔ automatic retry documentation (31.332213ms)
▶ automatic retry through the watcher loop
  ✔ retries a verify_red death once and reaches done (580.543268ms)
  ✔ marks a task stuck after two identical deaths with no third attempt (364.087993ms)
  ✔ never retries a spec_conflict death (191.553028ms)
  ✔ never retries a verify_precondition death (210.069339ms)
  ✔ does nothing when the configured count is zero (282.057401ms)
  ✔ allows one more automatic retry after a manual retry resets the budget (758.376107ms)
  ✔ retries exactly once a death recorded before a restart (656.504751ms)
✔ automatic retry through the watcher loop (3045.698997ms)
▶ baseline verify configuration
  ✔ leaves baselineVerify out of the validated gates when unset (9.875564ms)
  ✔ loads a trimmed baseline command from osq.config.ts (287.758802ms)
  ✔ fails loading an empty baseline command (13.758682ms)
  ✔ keeps baselineVerify absent when the project declares no config (3.224679ms)
✔ baseline verify configuration (316.551684ms)
▶ baseline key
  ✔ returns no key outside a git repository (16.144628ms)
  ✔ returns no key when HEAD has no commit (30.472085ms)
  ✔ reads an equal key when only a .run/ file is written between reads (71.865164ms)
  ✔ changes the digest but not the commit when a tracked file is edited (89.558857ms)
  ✔ changes the digest but not the commit when an untracked file changes (76.955318ms)
✔ baseline key (285.917521ms)
▶ baseline verify before a change's first task
  ✔ kills the first task with baseline_red before any agent spawns (271.086377ms)
  ✔ records a passed baseline before the task start and runs the task (347.690301ms)
  ✔ runs the baseline again after osq retry (432.265037ms)
  ✔ runs no baseline for a later task once a task has started (420.254917ms)
  ✔ runs nothing when gates.baselineVerify is unset (246.684417ms)
  ✔ names baseline_red in the failure reason union (0.36611ms)
✔ baseline verify before a change's first task (1720.282445ms)
▶ baseline reuse
  ✔ reuses the first change's green baseline on an unchanged tree (716.026345ms)
  ✔ runs again when a tracked file changed after the first green baseline (868.516296ms)
  ✔ runs again when a untracked file changed after the first green baseline (926.033553ms)
✔ baseline reuse (2511.254744ms)
▶ built bin execution
  ✔ preserves the executable shebang after compilation (5.221142ms)
  ✔ generates valid programmatic type declarations (2.922551ms)
  ✔ resolves the package version from package.json at runtime (6.103136ms)
  ✔ prints the package.json version when invoked directly from an isolated directory (325.148337ms)
  ✔ prints help with command listings from an isolated directory (306.742891ms)
✔ built bin execution (652.046144ms)
▶ blocked exit through the watcher loop
  ✔ dies blocked with the stated need and runs no verify (260.3327ms)
  ✔ never retries a blocked death in a cycle with autoRetries 1 (189.508597ms)
  ✔ lets a Blocked section saying None fall through to the verify (465.750254ms)
✔ blocked exit through the watcher loop (917.204742ms)
▶ parseResultSections blocked section
  ✔ reads ## blocked: and treats None as absent without a disclosure (0.279236ms)
✔ parseResultSections blocked section (0.509879ms)
▶ capability relation guidance
  ✔ keeps the relation bullet under ### Parent spec and before the replacing bullet (3.944244ms)
  ✔ carries the relation bullet in both PLANNER.md copies between their OSQ markers (7.454536ms)
  ✔ states the relation rule and shows creates in the README Change folder section (3.001718ms)
✔ capability relation guidance (17.167483ms)
▶ readCreates
  ✔ returns an empty list when creates is absent (2.044312ms)
  ✔ returns the trimmed names (0.551853ms)
  ✔ marks a non-list value malformed (1.04652ms)
✔ readCreates (6.110842ms)
▶ nearestCapability
  ✔ returns the name with the smallest edit distance (0.547183ms)
  ✔ breaks a tie by name order (0.319181ms)
  ✔ returns null without living names (0.175087ms)
✔ nearestCapability (1.436172ms)
▶ capability creation declaration
  ✔ accepts a declared creation with an adding delta (277.297629ms)
  ✔ rejects a create that already has a living spec (127.528497ms)
  ✔ rejects a create with no delta adding a requirement (155.639407ms)
  ✔ rejects a malformed creates value (143.868164ms)
  ✔ lets the pinned validator accept a proposal carrying creates (1641.450405ms)
✔ capability creation declaration (2348.125506ms)
▶ capability relations
  ✔ rejects a change that relates to no capability (162.794367ms)
  ✔ accepts a change that only reads a living capability (133.369589ms)
  ✔ rejects a read of an unknown capability with the nearest name (125.649748ms)
  ✔ accepts a read of a capability the change creates (193.55166ms)
  ✔ rejects a silent creation with the nearest name (247.513959ms)
  ✔ reports none of the relation findings without a living spec (318.725836ms)
✔ capability relations (1182.428127ms)
▶ parseSidecar
  ✔ reads a group and tags (8.787707ms)
  ✔ reports a missing group (1.528076ms)
  ✔ reports malformed tags (1.329188ms)
  ✔ reports an unknown key (0.875284ms)
  ✔ reports content that is not a mapping (0.811188ms)
✔ parseSidecar (14.920736ms)
▶ formatSidecar
  ✔ writes a group (0.456224ms)
  ✔ writes tags one per line (0.20456ms)
✔ formatSidecar (0.952341ms)
▶ readLivingSidecar
  ✔ returns null when no sidecar exists (81.46771ms)
  ✔ returns the parsed sidecar (22.377293ms)
  ✔ returns null when the sidecar has a problem (27.638139ms)
✔ readLivingSidecar (132.119124ms)
▶ readCreates groups
  ✔ returns names and groups for mixed entries (0.431031ms)
  ✔ marks an entry without a group malformed (0.141863ms)
  ✔ marks a mapping with a non-string group malformed (0.099729ms)
✔ readCreates groups (0.807277ms)
▶ capability sidecar lint
  ✔ reports an unknown key in a replacement sidecar (166.161549ms)
  ✔ reports a replacement sidecar with no group (115.770194ms)
  ✔ reports a replacement for a capability that does not exist (136.195651ms)
  ✔ reports a broken living sidecar as a repository finding (144.302862ms)
  ✔ reports nothing when sidecars are missing (217.864534ms)
✔ capability sidecar lint (780.941616ms)
▶ grouped creation lint
  ✔ fails a bare creates name when groups are required (184.118281ms)
  ✔ fails an ungrouped creates entry when groups are required (199.022138ms)
  ✔ accepts a grouped creates entry when groups are required (175.500344ms)
  ✔ fails a written living capability with no sidecar group (164.657878ms)
  ✔ accepts a replacement sidecar that supplies the written capability group (211.834309ms)
  ✔ stays silent when groups are not required (220.484968ms)
✔ grouped creation lint (1157.001854ms)
▶ Change locations and worktrees that do not hold their change
  ✔ worktree without its change keeps the stacked tree (166.372092ms)
  ✔ worktree with an unapproved copy keeps the checkout copy (123.027221ms)
  ✔ archived or rejected in its worktree (134.933786ms)
✔ Change locations and worktrees that do not hold their change (425.973167ms)
▶ Change locations with a landed copy
  ✔ lists an archive once, from the checkout, while keeping the worktree tree (125.607754ms)
  ✔ lists a rejected folder once, from the checkout, when it is rejected in both (101.772604ms)
✔ Change locations with a landed copy (228.704689ms)
▶ A landed change counts once
  ✔ lists the archive once and reads the same from every command (1918.035004ms)
  ✔ messages the worktree copy after the checkout already holds the archive (1284.452239ms)
✔ A landed change counts once (3203.187852ms)
▶ change location readers
  ✔ lists changes through the change locations module, not the layout helpers (129.969353ms)
✔ change location readers (131.797919ms)
▶ Change locations across stacked approvals
  ✔ lists a stacked approval as its own tree and drops it from the checkout (183.467562ms)
  ✔ prefers a worktree over a stacked directory for the same folder (137.369461ms)
  ✔ returns exactly one tree when vcs is off even if a stacked directory exists (6.794901ms)
✔ Change locations across stacked approvals (331.371254ms)
▶ Change locations across osq worktrees
  ✔ reports a running change in a worktree and drops it from the checkout (201.448989ms)
  ✔ returns no tree for a worktree on a branch that is not an osq branch (131.910003ms)
  ✔ returns exactly one tree when vcs is off (4.563688ms)
✔ Change locations across osq worktrees (340.538795ms)
▶ change locations
  ✔ lists directories only, active then archived then rejected, each by numeric prefix (35.349044ms)
  ✔ filters to the requested locations when one is named (14.563412ms)
  ✔ returns exactly one tree rooted at the project root (3.393846ms)
  ✔ resolves a relative project root against the current directory (19.630476ms)
  ✔ finds an active change by number, padded number, and prefix (3.760482ms)
  ✔ fails the lookup with findSpecFolder message when nothing matches (3.025632ms)
  ✔ locates an archived folder by its absolute path (5.483741ms)
  ✔ returns null for a folder outside every tree (17.636847ms)
  ✔ labels the changes directory relative to the project root (1.368777ms)
✔ change locations (106.670905ms)
▶ changelog and release documentation
  ✔ ships a changelog with a 0.1.0 release entry (3.819243ms)
  ✔ summarises the changes from specs 001 through 012 (6.583272ms)
  ✔ documents the release procedure in the README (0.507859ms)
  ✔ lists the exact release commands (0.171446ms)
✔ changelog and release documentation (12.156143ms)
▶ Claude adapter arguments
  ✔ spawns the exact stripped argv with a closed stdin in the project root (211.923014ms)
  ✔ adds the sandbox settings and --bare with an API key (98.025979ms)
  ✔ passes --model only when configured and never borrows another harness model (97.937879ms)
  ✔ streams parser output into harness events (121.309888ms)
  ✔ carries the failing result subtype in the adapter error (205.638194ms)
✔ Claude adapter arguments (736.716589ms)
▶ Claude configuration and resolution
  ✔ exports ClaudeConfig and the Claude helpers from the public entry point (12.386559ms)
  ✔ validates claude settings and rejects invalid values naming the key (5.787906ms)
  ✔ resolves the binary from claude.bin, then claude (8.420733ms)
  ✔ resolves the model from claude.model, then OSQ_MODEL only for a Claude executor (19.219199ms)
  ✔ reports effort null and a default sentinel for native model selection (1.955563ms)
  ✔ registers claude with a config key, no unselected env model, and no planner agent (1.228733ms)
  ✔ reports the containment text for the configured sandbox setting (1.000756ms)
  ✔ loadConfig accepts harness claude and merges its section (233.518267ms)
✔ Claude configuration and resolution (287.012102ms)
▶ Claude doctor diagnostics and preflight
  ✔ fails harness-version below the minimum, naming the version and the minimum (193.933266ms)
  ✔ passes harness-version at the minimum and reports containment (92.908933ms)
  ✔ reports unconfined Bash without the sandbox (116.115848ms)
  ✔ fails preflight before any task spawns on the same version condition (168.411348ms)
✔ Claude doctor diagnostics and preflight (573.733246ms)
▶ Claude runner outcomes through the watcher
  ✔ synthesizes the result and reaches done only after its own verify (462.148659ms)
  ✔ writes a crashed dead letter with Claude stderr when the sandbox is unavailable (331.895221ms)
  ✔ names the failing result subtype in the crashed dead letter (330.99754ms)
✔ Claude runner outcomes through the watcher (1126.579485ms)
▶ claude consumer guidance: README
  ✔ lists the claude adapter with fresh headless claude -p tasks (24.090009ms)
  ✔ documents harness selection, config keys, model fallback, and minimum version (2.81612ms)
  ✔ explains login versus ANTHROPIC_API_KEY and harnessAuth (5.727929ms)
  ✔ lists the stripping flags, the token measurement, and that nothing re-enables them (1.421921ms)
  ✔ describes containment honestly, with the sandbox and its Linux requirement (2.262632ms)
  ✔ points planning at the tool-native command and says setup writes no files (1.636637ms)
✔ claude consumer guidance: README (41.932036ms)
▶ Claude stream translation
  ✔ replays the captured fixture into tool, text, file_changed, and tokens events (41.869256ms)
  ✔ writes one tokens event per modelUsage entry summing to the reported cost (12.057533ms)
  ✔ skips blank, malformed, and unknown records and tolerates a trailing carriage return (19.392269ms)
  ✔ writes no file_changed for a tool_result whose is_error is true (7.415903ms)
  ✔ records the result subtype, is_error, and result text on the state (1.76181ms)
✔ Claude stream translation (84.759103ms)
▶ cli config errors
  ✔ prints the ConfigLoadError and exits 1 for status (669.773152ms)
  ✔ prints the ConfigLoadError, exits 1, and scaffolds nothing for init (297.150803ms)
  ✔ propagates a non-ConfigLoadError thrown by a command action (3.851494ms)
✔ cli config errors (972.759432ms)
▶ no command ends the process
  ✔ finds no process.exit in any file under src/cli (63.876824ms)
✔ no command ends the process (65.022218ms)
error: option '--reason <text>' argument '   ' is invalid. a non-empty rejection reason is required
error: option '--reason <text>' argument '' is invalid. a non-empty rejection reason is required
error: required option '--reason <text>' not specified
▶ osq CLI
  ✔ configures program metadata and registered commands (4.478952ms)
  ✔ configures new command with required argument <name> (1.043032ms)
  ✔ configures approve command with variadic argument <ids...> (0.727285ms)
  ✔ configures watch command with once option (1.264087ms)
  ✔ configures reject command with required id argument and required reason option (0.707185ms)
  ✔ rejects an empty or whitespace-only reason at the CLI boundary (2.968169ms)
  ✔ requires the reject reason option to be supplied (0.978481ms)
  ✔ gives the root command an action and a --json inbox option (1.347219ms)
  ✔ keeps report --json scoped to the report subcommand (1.168321ms)
✔ osq CLI (16.634615ms)
▶ codex consumer guidance: scaffolded .env.example
  ✔ scaffolds commented Codex selection/binary/model guidance under the agy default (81.431846ms)
  ✔ contains no credentials or secret values (45.260981ms)
  ✔ mirrors the repository .env.example exactly (33.92349ms)
  ✔ preserves a consumer-edited example across repeated scaffolding (36.360438ms)
✔ codex consumer guidance: scaffolded .env.example (198.709081ms)
▶ codex consumer guidance: README
  ✔ lists codex and documents executor and independent planner examples with precedence (1.509472ms)
  ✔ covers installation, authentication, setup, diagnostics, permissions, and scope limits (1.346994ms)
  ✔ covers live smoke, fresh sessions, watcher verification, results, and observed costs (1.125835ms)
✔ codex consumer guidance: README (4.478742ms)
▶ Codex adapter registration, setup, and diagnostics
  ✔ registers the codex harness with a no-op setup that creates no files (94.157277ms)
Harness 'codex' setup completed successfully.
Harness 'codex' setup completed successfully.
  ✔ setupCommand preserves consumer Codex files, foreign blocks, and mixed-harness setup (310.591219ms)
  ✔ doctor probes the same configured Codex binary and reports failures (143.007519ms)
  ✔ buildManifest records the Codex model or default sentinel and configured effort (32.898455ms)
codex-cli 0.0.0-fake
  ✔ preflightCodex resolves CODEX_PATH and returns the version (400.12643ms)
✔ Codex adapter registration, setup, and diagnostics (982.938695ms)
▶ Codex noninteractive execution
  ✔ builds literal argv with sandboxing, approval, model, and effort controls (30.840935ms)
  ✔ names full task context including delta, living specs, prior result, and one-attempt rules (42.24277ms)
  ✔ spawns a fresh fake Codex with correct cwd, env, literal prompt, and translated events (65.450124ms)
  ✔ preserves failure, timeout, and terminal turn.failed diagnostics (1186.623792ms)
✔ Codex noninteractive execution (1326.590727ms)
▶ Codex configuration
  ✔ exports CodexConfig and resolution helpers from the public entry point (6.787742ms)
  ✔ centrally defaults preflight and kill-grace timeouts while preserving old timeout literals (11.458642ms)
  ✔ validateCodex settings via defineConfig and preserve native defaults (6.754371ms)
  ✔ resolves the Codex binary as codex.bin, then CODEX_PATH, then codex (6.353288ms)
  ✔ resolves the Codex model as codex.model, then OSQ_MODEL only for a Codex executor (2.139087ms)
  ✔ resolves effort and harness attribution with a default sentinel (1.918651ms)
  ✔ accepts a Codex planner with a model and rejects planner.agent (3.571698ms)
  ✔ loadConfig merges codex settings and applies OSQ_MODEL only to a Codex executor (308.016756ms)
✔ Codex configuration (349.101545ms)
▶ Codex planner selection
  ✔ uses the explicit planner model and never inherits the executor model (2.434273ms)
  ✔ falls back to the Codex executor and uses the default sentinel with no flag (0.294637ms)
✔ Codex planner selection (4.355475ms)
▶ Codex interactive adapter
  ✔ builds interactive argv with on-request approvals and no exec/JSON/effort flags (0.44561ms)
  ✔ rejects an unsupported agent and propagates spawn failures (627.881246ms)
✔ Codex interactive adapter (628.917018ms)
▶ planCommand with the Codex harness
  ✔ launches the fake interactive executable with inherited stdio and native model defaults (1017.056193ms)
  ✔ uses the explicit planner model consistently in brief metadata and argv (1149.166661ms)
  ✔ uses an explicit Codex planner without leaking the executor harness model (1363.575711ms)
  ✔ propagates nonzero and signal exits from the interactive process (2281.958283ms)
  ✔ reuses an existing change and emits the print prompt without launching Codex (2261.475494ms)
✔ planCommand with the Codex harness (8074.195628ms)
▶ Codex stream observations
  ✔ translates completed observations in order without duplicating lifecycle stages (64.532392ms)
  ✔ omits absent optional usage counters and never writes cost (10.400636ms)
  ✔ tolerates malformed and unknown records and flushes an unterminated final record (16.490583ms)
  ✔ relativizes absolute file-change paths to the project root (2.474264ms)
  ✔ treats turn.failed as terminal but a recoverable error followed by success as not terminal (2.475694ms)
✔ Codex stream observations (98.183257ms)
▶ Codex watcher preflight
  ✔ fails before task spawn on a missing, nonzero, or timed-out probe (361.733911ms)
  ✔ probes the configured binary and dispatches an approved task after a successful probe (503.405713ms)
✔ Codex watcher preflight (866.412382ms)
▶ Codex runner outcomes
  ✔ preserves a supplied result and reaches done only after watcher verification (309.060675ms)
  ✔ synthesizes a missing result from the last completed assistant text (309.861977ms)
  ✔ fails with no_result when neither a result file nor final text exists (221.183533ms)
  ✔ fails with verify_red when independent verification fails (338.660653ms)
  ✔ records crashed for a terminal turn.failed even when the process exits zero (354.774675ms)
{
  "approvalFlags": {
    "byFlag": {
      "adr_check_modified": {
        "confirmed": {
          "fired": 0,
          "troubled": 0
        },
        "shown": {
          "fired": 0,
          "troubled": 0
        }
      },
      "adr_departure": {
        "confirmed": {
          "fired": 0,
          "troubled": 0
        },
        "shown": {
          "fired": 0,
          "troubled": 0
        }
      },
      "none": {
        "confirmed": {
          "fired": 0,
          "troubled": 0
        },
        "shown": {
          "fired": 0,
          "troubled": 0
        }
      },
      "removed_requirement": {
        "confirmed": {
          "fired": 0,
          "troubled": 0
        },
        "shown": {
          "fired": 0,
          "troubled": 0
        }
      },
      "sensitive_path": {
        "confirmed": {
          "fired": 0,
          "troubled": 0
        },
        "shown": {
          "fired": 0,
          "troubled": 0
        }
      },
      "shared_file": {
        "confirmed": {
          "fired": 0,
          "troubled": 0
        },
        "shown": {
          "fired": 0,
          "troubled": 0
        }
      },
      "unknown_capability": {
        "confirmed": {
          "fired": 0,
          "troubled": 0
        },
        "shown": {
          "fired": 0,
          "troubled": 0
        }
      },
      "verify_starts_conflict": {
        "confirmed": {
          "fired": 0,
          "troubled": 0
        },
        "shown": {
          "fired": 0,
          "troubled": 0
        }
      },
      "verify_without_test": {
        "confirmed": {
          "fired": 0,
          "troubled": 0
        },
        "shown": {
          "fired": 1,
          "troubled": 0
        }
      }
    },
    "changes": 1,
    "troubledChanges": []
  },
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
    "avgMs": 35,
    "avgSeconds": 0,
    "formattedAvg": "0s",
    "formattedTotal": "0s",
    "totalMs": 35,
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
      "formattedTotal": "not reported",
      "perSpec": {},
      "provenance": "harness-reported",
      "total": 0
    },
    "deadByReason": {},
    "preSpawnVerify": {
      "byStart": {
        "any": {
          "passed": 0,
          "runs": 0
        },
        "green": {
          "passed": 0,
          "runs": 0
        },
        "red": {
          "passed": 1,
          "runs": 1
        }
      },
      "mismatchedTasks": [
        "001-codex-fixture-feature/1"
      ],
      "mismatches": 1,
      "missingPathRuns": 0,
      "runs": 1
    },
    "rejections": {
      "byPlannerModel": {},
      "total": 0
    },
    "retries": {
      "automatic": {
        "cost": 0,
        "costReportedAttempts": 0,
        "count": 0,
        "reachedDone": 0
      },
      "manual": {
        "cost": 0,
        "costReportedAttempts": 0,
        "count": 0,
        "reachedDone": 0
      },
      "stuck": 0
    },
    "scopeRegressions": {
      "detected": 0,
      "recertifiedAutomatically": 0,
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
          "medianDurationSeconds": 0.18,
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
              "medianDurationSeconds": 0.18,
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
    "unmarked": 0,
    "verified": 1
  },
  "planning": {
    "byChange": {},
    "changesWithPlanningRecords": 0,
    "comparison": {
      "execution": {
        "cached": 40,
        "cost": null,
        "input": 100,
        "output": 25,
        "reasoning": 7
      },
      "planning": {
        "cached": null,
        "cost": null,
        "input": null,
        "output": null,
        "reasoning": null
      }
    },
    "cost": {
      "bySource": {
        "approvalPrice": {
          "sessions": 0,
          "total": 0
        },
        "harness": {
          "sessions": 0,
          "total": 0
        },
        "reportEstimate": {
          "sessions": 0,
          "total": 0
        },
        "totalWithEstimates": 0
      },
      "formattedTotal": "not reported",
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
  ✔ reportCommand JSON consumes normalized usage and file events without double counting (534.614859ms)
✔ Codex runner outcomes (2069.180217ms)
▶ approve throws a CommandError carrying the next step
  ✔ approving a template fails and prints the template next step (1159.461383ms)
  ✔ prints the error before the next step (732.362983ms)
  ✔ prints one stderr line and no next step for a missing change (365.062202ms)
  ✔ several ids stop at the first failure (864.3241ms)
  ✔ a terminal refusal is not wrapped in an approval error (456.862544ms)
✔ approve throws a CommandError carrying the next step (3582.171623ms)
▶ converted commands throw CommandError
  ✔ new throws when the spec name slugifies to nothing (61.511405ms)
  ✔ done throws when --manual is blank (47.810986ms)
  ✔ done throws when the spec is missing (591.976965ms)
  ✔ reject throws when the spec is missing (321.291173ms)
  ✔ retry throws when the spec is missing (304.953783ms)
  ✔ queue throws when the queue file is missing (344.390507ms)
  ✔ inbox rejects with a CommandError when the cursor folder cannot be created (47.420347ms)
✔ converted commands throw CommandError (1721.350946ms)
▶ command errors for check and verified
  ✔ keeps the failed check on stdout and leaves stderr empty (94.678911ms)
  ✔ prints one stderr line for a missing check target (5.50393ms)
  ✔ prints one stderr line when verified has no outcome flag (4.259842ms)
  ✔ prints one stderr line for a missing verification target (4.372025ms)
✔ command errors for check and verified (113.858444ms)
▶ command errors
  ✔ prints the show refusal on stderr and sets exit code 1 (597.908858ms)
  ✔ rejects an empty show id with one stderr line (355.073857ms)
  ✔ prints a report error for a bad --since date (294.700212ms)
  ✔ prints a status error when a proposal is a directory (327.193295ms)
  ✔ lets a caller catch the CommandError and carry on (16.676385ms)
✔ command errors (1593.686468ms)
▶ osq commit message
  ✔ Trailers parse (38.932724ms)
  ✔ No started event leaves only the change and task trailers (6.253261ms)
  ✔ Malformed lines are skipped (11.489457ms)
  ✔ A started event without the string fields counts as absent (4.560259ms)
✔ osq commit message (62.840916ms)
▶ capability groups configuration
  ✔ defaults requireGroups to false (10.502593ms)
  ✔ opts in through loadConfig on a temporary project (223.885963ms)
  ✔ rejects a non-object capabilities block (2.661607ms)
  ✔ rejects a non-boolean requireGroups (3.634388ms)
✔ capability groups configuration (242.547627ms)
▶ inbox configuration
  ✔ defaults every key through defineConfig and DEFAULT_CONFIG (2.056195ms)
  ✔ keeps each default for a partial block (0.300457ms)
  ✔ keeps null quiet hours when the block omits or nulls them (0.136773ms)
  ✔ rejects malformed quiet hours naming the key (0.47297ms)
  ✔ rejects a non-string quiet hours naming the key (0.150784ms)
  ✔ rejects non-positive and non-finite poll intervals naming the key (0.327887ms)
  ✔ rejects an empty or non-string sound naming the key (0.221245ms)
  ✔ accepts a non-empty custom sound path (0.245376ms)
  ✔ rejects negative and non-finite windows and debounces naming the key (0.339217ms)
  ✔ accepts a zero window and a zero debounce (0.342437ms)
  ✔ rejects a non-object inbox block (0.721425ms)
  ✔ validates a bare block through validateInboxConfig (0.194954ms)
✔ inbox configuration (7.105054ms)
▶ parseQuietHours
  ✔ returns start and end as minutes after midnight (0.652909ms)
  ✔ rejects malformed windows naming the key (0.195414ms)
✔ parseQuietHours (1.022997ms)
▶ inbox configuration from the config file
  ✔ loads an inbox block through osq.config.ts (230.263234ms)
✔ inbox configuration from the config file (230.643442ms)
▶ config load errors
  ✔ rejects with a ConfigLoadError naming the file when validation fails (633.130644ms)
  ✔ rejects with a ConfigLoadError naming the file when the import fails (18.108748ms)
  ✔ loads the scaffolded config in a project with no node_modules (338.959758ms)
  ✔ fails the doctor config check with the ConfigLoadError message (781.897818ms)
  ✔ loads the defaults in a project with no config file (2.325761ms)
✔ config load errors (1777.933745ms)
▶ catalog-driven planner validation
  ✔ accepts every catalogued harness with any supported casing and normalizes the name (2.026599ms)
  ✔ retains the required non-empty planner model (0.46229ms)
  ✔ rejects uncatalogued harnesses naming the catalog entries (0.184064ms)
  ✔ rejects optional settings unsupported by the selected harness, naming harness and setting (1.815504ms)
  ✔ rejects malformed optional settings before harness-specific checks (0.475315ms)
✔ catalog-driven planner validation (6.324118ms)
▶ catalog-driven planner selection
  ✔ uses explicit planner values and the supported default agent (0.988192ms)
  ✔ never leaks executor effort or cross-harness defaults into an explicit planner (3.119458ms)
  ✔ falls back to the selected executor catalog entry with native attribution (0.519561ms)
  ✔ uses planner values for a mixed harness selection without executor leakage (0.186404ms)
✔ catalog-driven planner selection (5.342656ms)
▶ planner configuration integration and exports
  ✔ keeps defineConfig planner validation wired to the catalog (0.385798ms)
  ✔ exposes catalog planner helpers through the public entry point (0.133643ms)
✔ planner configuration integration and exports (0.661174ms)
▶ planner configuration and manifest attribution
  ✔ defineConfig accepts valid planner configurations (10.142125ms)
  ✔ defineConfig rejects invalid planner configurations (4.85282ms)
  ✔ loadConfig loads planner block from config file (245.539096ms)
  ✔ never populates manifest.planner from configuration alone (49.545003ms)
✔ planner configuration and manifest attribution (311.482513ms)
▶ planning configuration
  ✔ defaults the idle gap to ten minutes and ships no price table (20.53234ms)
  ✔ keeps a price entry and the default idle gap from a partial block (3.317222ms)
  ✔ merges an idle gap override over the defaults (8.672118ms)
  ✔ rejects a non-object planning block (3.279621ms)
  ✔ rejects a non-positive or non-numeric idle gap naming the key (1.653136ms)
  ✔ rejects a non-object prices map naming the key (2.611156ms)
  ✔ rejects a price entry missing a kind naming the exact key (2.050624ms)
  ✔ rejects negative and non-numeric price values naming the exact key (10.055941ms)
  ✔ loads a planning block from osq.config.ts (230.425265ms)
  ✔ exposes PlanningConfig and PlanningPrice through the public surface (2.166037ms)
✔ planning configuration (288.213277ms)
▶ queue configuration
  ✔ accepts a complete finite non-negative queue block (17.240528ms)
  ✔ leaves queue absent and invents no default ceilings (4.000367ms)
  ✔ rejects a partial queue block because both ceilings are required together (6.250949ms)
  ✔ rejects string, negative, NaN, and infinite values clearly (1.265867ms)
  ✔ rejects a non-object queue block (1.127075ms)
  ✔ loads a queue block from osq.config.ts (243.950552ms)
  ✔ exposes QueueConfig through the public package surface (6.444444ms)
✔ queue configuration (283.296558ms)
▶ OsqConfig
  ✔ provides specification-compliant default limits, paths, and timeouts (12.864242ms)
  ✔ allows overriding specific limits while retaining default paths and timeouts (4.965842ms)
  ✔ loadConfig returns DEFAULT_CONFIG if no config file exists (4.001497ms)
  ✔ loadConfig reads .env and loads osq.config.ts (275.31496ms)
  ✔ loadConfig reads a serve block from osq.config.ts (10.683451ms)
✔ OsqConfig (309.905089ms)
▶ serve configuration
  ✔ defaults the dashboard port and debounce interval (0.317867ms)
  ✔ merges a partial serve block over the defaults (0.120783ms)
  ✔ rejects non-finite, fractional, negative, and out-of-range ports (0.791127ms)
  ✔ rejects non-finite and negative debounce values (0.307937ms)
✔ serve configuration (1.950762ms)
▶ gates configuration
  ✔ defaults changeVerifyAfterTask to true (5.466738ms)
  ✔ preserves the incremental verification opt-out while keeping unrelated defaults (2.882299ms)
  ✔ rejects a non-boolean changeVerifyAfterTask (1.951627ms)
  ✔ rejects a non-object gates block (1.493017ms)
  ✔ loadConfig reads a gates block from osq.config.ts (12.129403ms)
✔ gates configuration (24.618949ms)
▶ Layout cut-over
  ✔ switches DEFAULT_CONFIG paths to the openspec layout (58.450873ms)
  ✔ monitors openspec/changes for approved change folders (488.622791ms)
  ✔ does not pick up change folders left in the legacy specs/ directory (41.041625ms)
  ✔ prints the Human steps outcome after the change completes (375.94217ms)
  ✔ never moves the legacy layout itself while cutting the runtime over (388.555377ms)
  ✔ removes obsolete legacy path identifiers from the runtime units (28.997153ms)
  ✔ extracts a Human steps section from a change document (25.872939ms)
✔ Layout cut-over (1410.090802ms)
▶ osq dead task record
  ✔ Agent edits put back (191.106301ms)
  ✔ Patch before discard (144.473809ms)
  ✔ Spec conflict (186.248218ms)
  ✔ Missing vcs.author fails before writing anything (81.296517ms)
✔ osq dead task record (605.775518ms)
▶ node:test failure fingerprints
  ✔ gives two runs of the same failure the same fingerprint (286.584286ms)
  ✔ gives a different assertion message a different fingerprint (281.166689ms)
✔ node:test failure fingerprints (571.185026ms)
▶ failure body normalization
  ✔ strips ANSI escape sequences (1.884751ms)
  ✔ replaces timestamps, durations, and pids with placeholders (0.289687ms)
  ✔ replaces absolute paths under the project root (0.282856ms)
  ✔ replaces numbers after duration keys (0.720925ms)
  ✔ replaces paths under the temp directory keeping the rest (0.803192ms)
✔ failure body normalization (5.378747ms)
▶ dead marker fingerprint
  ✔ ignores timestamps, durations, pids, ANSI codes, and the project root (5.037768ms)
  ✔ separates different reasons (0.569852ms)
  ✔ separates different failing test names (0.533672ms)
✔ dead marker fingerprint (6.394497ms)
▶ dead marker frontmatter
  ✔ inserts the fingerprint line and preserves every other byte (14.379287ms)
  ✔ adds a frontmatter block when there is none (0.325237ms)
  ✔ writes the field to disk through writeDeadMarker (18.01646ms)
✔ dead marker frontmatter (33.224486ms)
▶ dead markers from real runs carry a fingerprint
  ✔ records the field on a verify_red failure written by runTask (301.813724ms)
  ✔ normalizes the project root when the agent itself fails (182.669134ms)
✔ dead markers from real runs carry a fingerprint (484.98737ms)
▶ Failure marker retention across approval and retry
  ✔ leaves active dead and regressed markers untouched when approval re-seals (475.282879ms)
  ✔ retains dead/1.1.md alongside done/1 after an explicit retry and successful rerun (526.488817ms)
  ✔ preserves an active dead marker when a task succeeds without re-approval (342.466199ms)
✔ Failure marker retention across approval and retry (1345.794571ms)
▶ decisions lint
  ▶ Decisions section lint
    ✔ rejects a governing ADR the section leaves unnamed (270.751728ms)
    ✔ accepts a section that names the governing ADR (161.934628ms)
    ✔ counts a departure line as naming its ADR (160.25202ms)
    ✔ rejects a missing Decisions section (193.396391ms)
    ✔ rejects a comment-only Decisions section (158.748534ms)
    ✔ leaves a project without ADRs exempt (158.450404ms)
    ✔ leaves a legacy spec.md change document exempt (166.565041ms)
    ✔ warns when the section names an unknown ADR and stays valid (227.31791ms)
    ✔ warns when the section names an ADR that is not accepted (390.635433ms)
    ✔ requires no naming for a system-wide ADR (303.234592ms)
  ✔ Decisions section lint (2193.557809ms)
  ▶ Project rules lint
    ✔ fails a stale block naming osq init and passes after init (482.423858ms)
    ✔ fails when there are more system-wide rules than the limit (224.126717ms)
  ✔ Project rules lint (706.980428ms)
  ▶ approveSpec
    ✔ refuses a proposal whose governing ADR is unnamed (229.02533ms)
    ✔ refuses a proposal while the project rules block is stale (225.51356ms)
    ✔ approves a proposal whose governing ADR is named (353.715731ms)
  ✔ approveSpec (808.725515ms)
✔ decisions lint (3709.908598ms)
▶ osq's own decision records
  ✔ reads and validates the ADRs without error or warning (72.153452ms)
  ✔ documents the frontmatter format in decisions/README.md (3.419959ms)
  ✔ passes the same checks with one more accepted ADR and a refreshed rules block (68.24649ms)
✔ osq's own decision records (147.88277ms)
▶ architecture decision records
  ✔ reads a frontmatter ADR with its number, title, scope, rule, and hash (35.698231ms)
  ✔ reads capability-scoped applies_to as a list (18.105821ms)
  ✔ ignores markdown files without osq frontmatter and never lists README.md (6.605649ms)
  ✔ lists a frontmatter file without leading digits as ignored (2.348476ms)
  ✔ reads a missing decisions folder as no ADRs (1.155035ms)
  ✔ orders ADRs by numeric value and keeps ignored paths sorted (14.148332ms)
  ✔ compares ADR numbers by numeric value (2.906973ms)
  ✔ strips the leading number from the title (5.184002ms)
  ✔ takes effect only for accepted ADRs (5.119275ms)
  ✔ governs a change through all or a written capability (5.675312ms)
✔ architecture decision records (99.964641ms)
▶ architecture decision validation
  ✔ reports an error for a status outside the three values (5.126031ms)
  ✔ reports an error for an accepted ADR without a valid applies_to (5.389372ms)
  ✔ reports an error for an accepted ADR with a missing or multi-line rule (4.901026ms)
  ✔ reports an error naming the limit for a rule one character too long (6.035356ms)
  ✔ reports an error for a superseded ADR without superseded_by (1.967822ms)
  ✔ reports an error when superseded_by names no existing ADR (1.991689ms)
  ✔ accepts superseded_by that names an existing ADR by numeric value (3.549332ms)
  ✔ warns for each ignored file (2.412033ms)
  ✔ warns, not errors, for a capability with no living spec (2.722504ms)
  ✔ reports no error or warning for a valid accepted ADR (4.553404ms)
✔ architecture decision validation (39.350154ms)
▶ decision limits
  ✔ defaults maxRuleLength to 160 and maxProjectRules to 10 (1.475477ms)
  ✔ merges a configured rule length and names it (2.839501ms)
  ✔ passes a rule exactly at the configured limit (1.694776ms)
✔ decision limits (7.37409ms)
▶ Decisions proposal template
  ✔ the schema template and the fallback hold the canonical proposal bytes (21.078979ms)
  ✔ osq new seeds ## Decisions after ## Surface and before ## Contract (21.902995ms)
  ✔ the unreadable-template fallback seeds the decisions section (1.705427ms)
  ✔ the repository config and schema tree match the templates byte for byte (11.581227ms)
✔ Decisions proposal template (58.016357ms)
▶ Decisions instruction and rules
  ✔ the proposal instruction names Decisions between Surface and Contract (14.728811ms)
  ✔ the proposal rules name Decisions between Surface and Contract (5.182294ms)
✔ Decisions instruction and rules (20.275783ms)
▶ Planner decisions guidance
  ✔ names ## Decisions, the departure form, and None (0.184384ms)
  ✔ places the decisions bullet directly after the Surface bullet (0.117492ms)
  ✔ the repository PLANNER.md and its template carry the same bullet (4.271078ms)
✔ Planner decisions guidance (5.196713ms)
▶ Delta merge engine
  ✔ parseDelta extracts ADDED, MODIFIED, REMOVED, and RENAMED blocks (3.866434ms)
  ✔ parseDelta returns empty operations for a delta with no requirement sections (0.302467ms)
  ✔ requirement parser extracts requirement names and scenario WHEN/THEN bullets (0.607123ms)
  ✔ merges operations in strict RENAMED -> REMOVED -> MODIFIED -> ADDED sequence (2.287166ms)
  ✔ applies RENAMED before REMOVED and MODIFIED (0.971346ms)
  ✔ throws a deterministic error when a MODIFIED target is missing (0.959756ms)
  ✔ throws a deterministic error when a REMOVED target is missing (1.196482ms)
  ✔ refuses a MODIFIED block that leaves out an existing scenario (0.692075ms)
  ✔ refuses an ADDED requirement whose name already exists (0.673134ms)
  ✔ refuses a RENAMED entry that is not in the ### Requirement: form (1.226797ms)
  ✔ creates a new capability spec from the delta Purpose when no base exists (0.47663ms)
  ✔ golden-file test asserts byte-for-byte exact rebuilding across all four operations (0.367008ms)
✔ Delta merge engine (15.904341ms)
▶ Archiver OpenSpec delta application
  ✔ applyOpenSpecDeltas creates and then updates capability specs from delta specs (44.041384ms)
  ✔ applyOpenSpecDeltas ignores change folders without OpenSpec delta specs (6.617014ms)
✔ Archiver OpenSpec delta application (50.993105ms)
▶ Baseline living capability code ownership
  ✔ parses all five capability delta specs without syntax errors (6.028681ms)
  ✔ cleanly appends the Code ownership requirement to a base spec with existing requirements (0.411093ms)
  ✔ deterministically merges each delta into a valid spec containing the ownership globs (101.190459ms)
  ✔ applies all five deltas into a living OpenSpec root declaring Code ownership (74.226222ms)
✔ Baseline living capability code ownership (182.463448ms)
▶ dependency baseline and addition in runTask
  ✔ records the scoped manifest baseline in the start measures event (424.803546ms)
  ✔ omits the baseline and reads nothing when no manifest is in scope (487.274399ms)
  ✔ records an allowed addition and goes on to verify (329.894511ms)
  ✔ kills the task with denied_dependency naming the package, file, ADR, and rule (259.383843ms)
  ✔ does not enforce a package denied only by a superseded ADR (424.47628ms)
✔ dependency baseline and addition in runTask (1928.002379ms)
▶ denied_dependency through the watcher loop
  ✔ retries the death automatically and the next prompt names the package (645.211703ms)
✔ denied_dependency through the watcher loop (645.509771ms)
▶ report dependencies added per change
  ✔ lists only changes whose streams added packages, in change order (105.780691ms)
  ✔ omits the field and section when nothing was added (21.255906ms)
  ✔ dedupes every event of every attempt and sorts by file then name (13.194455ms)
  ✔ never counts a rejected folder (4.92341ms)
✔ report dependencies added per change (146.980653ms)
▶ show dependencies added
  ✔ prints the line under the task after instructions changed (30.277068ms)
  ✔ prints no line for a task whose stream holds no dependencies_added event (15.581312ms)
✔ show dependencies added (46.33529ms)
▶ digest steps before approval
  ✔ carries steps before approval and prints them right after the goal (43.944101ms)
  ✔ formats exactly as before when human steps read None (10.935048ms)
✔ digest steps before approval (56.147862ms)
▶ landed disclosures in the inbox and osq show
  ✔ marks the disclosed landed item and leaves a change without disclosures unchanged (892.480284ms)
  ✔ appends the disclosed counts to that landed text row and no other (909.452819ms)
  ✔ prints the Disclosures line for a task with a real section and none otherwise (1496.368032ms)
✔ landed disclosures in the inbox and osq show (3301.371265ms)
▶ dispatch age
  ✔ First seen breaks ties (213.17256ms)
  ✔ Logged before unlogged (46.560334ms)
  ✔ Idle and first seen (44.074061ms)
✔ dispatch age (305.908932ms)
▶ dispatch cards
  ✔ approval card holds the digest goal, capabilities, decisions, and tasks (72.835233ms)
  ✔ halt card holds the reason, attempt count, trailing output, and no absolute path (30.192998ms)
  ✔ halt card with a patch names it by its project-relative path (30.349686ms)
  ✔ halt card for a change-level regression holds the reason and trailing output (37.290755ms)
  ✔ verify card holds the check command, after-landing steps, and outcome (31.180187ms)
  ✔ land card without vcs holds the goal and outcomes and no squash message (124.420188ms)
✔ dispatch cards (328.568867ms)
▶ worktree land card
  ✔ holds the goal, each outcome line, and the squash message (1873.903381ms)
✔ worktree land card (1874.23305ms)
▶ dispatch items
  ✔ derives an approval, a halt, and a verify item each with its commands (75.412504ms)
  ✔ derives no item for an unplanned draft with the planning sentinel (16.345615ms)
  ✔ follows state when the dead marker goes and the approval is written (49.297618ms)
  ✔ derives one task-less halt for a change-level regression (52.934919ms)
  ✔ derives a land item for an untracked archive with the flag off and none once committed (149.579787ms)
  ✔ derives no land item when the project is not a git repository (33.18053ms)
  ✔ tracks watcherIdle across a change gaining a pending task (51.896333ms)
✔ dispatch items (433.402624ms)
▶ dispatch land items from an osq worktree
  ✔ derives one land item until the archive reaches the default branch (1471.319795ms)
✔ dispatch land items from an osq worktree (1471.771938ms)
▶ card keys
  ✔ maps an approval item to a, s, and no manual commands (89.540744ms)
  ✔ maps a change-level halt to r, x asking for a reason, and s (55.324083ms)
  ✔ maps a verify item to p, f, and s (33.122003ms)
  ✔ lists a land worktree command as manual and s as the only key (1368.578406ms)
✔ card keys (1549.630186ms)
▶ card screen
  ✔ prints the header, the card body, the keys, and no actions block (31.794895ms)
✔ card screen (32.127005ms)
▶ dispatch order
  ✔ orders by weight, counting dependants transitively (137.248152ms)
  ✔ puts idle-work items first when the watcher is idle (84.254611ms)
  ✔ orders equal items by change id with the in-change-order reason (85.752753ms)
  ✔ gives each change in a dependency cycle weight two (68.436974ms)
  ✔ counts a dependant in another tree and repeats the same order (464.115475ms)
✔ dispatch order (843.690637ms)
▶ runCardSession
  ✔ approves the first item, prints separators, and shows the next card (231.752743ms)
  ✔ prints the exit code and shows the same card again when the item stays (94.126882ms)
  ✔ asks for the reject reason and passes it as one argument (56.52951ms)
  ✔ shows the same card without launching when the reason is empty (60.886166ms)
  ✔ moves a skipped item behind the rest and cycles back to it (106.666381ms)
  ✔ drops a skipped item that goes away (146.539302ms)
  ✔ waits on an empty inbox, notifies once, and opens the first card (99.79466ms)
  ✔ never sounds while a card is open and picks up a new item after the key (72.028044ms)
  ✔ ignores an unknown key and shows the same card (54.489796ms)
  ✔ quits on q on a card without launching anything (35.836427ms)
  ✔ quits on q while waiting and closes the watch (38.1651ms)
  ✔ ends when the signal aborts while a card is open (47.636094ms)
  ✔ ends when the signal aborts while waiting (28.62077ms)
✔ runCardSession (1078.229608ms)
▶ watchDispatch
  ✔ derives once as soon as it starts, with the clock time it started (172.449959ms)
  ✔ derives on a watcher batch and sees the new halt item (143.358855ms)
  ✔ derives on the poll timer without a watcher event (30.035719ms)
  ✔ close closes the watcher, cancels the poll, and stops deriving (17.76312ms)
  ✔ reports a derivation error and keeps watching (101.988231ms)
  ✔ reopens the hub and derives once more when the watched trees change (38.46018ms)
  ✔ queues one more derivation when a batch arrives during one (111.222618ms)
✔ watchDispatch (617.396947ms)
▶ followDispatch on watchDispatch
  ✔ prints the preview, follows a new item, and stops on abort (121.078206ms)
✔ followDispatch on watchDispatch (121.356384ms)
▶ doctor opencode executor agent file
  ✔ fails when the opencode executor agent file is missing (236.636331ms)
  ✔ fails when the opencode executor agent file holds a stale block (190.443833ms)
  ✔ passes when OpencodeAdapter.setup writes the current block (158.128627ms)
  ✔ honours a custom opencode.agent name (367.155053ms)
  ✔ requires the agent file for an opencode planner with a mock executor (40.04798ms)
  ✔ does not require an agent file for a codex executor (135.695219ms)
  ✔ joins the init group and then the setup group when both drift (180.749058ms)
✔ doctor opencode executor agent file (1310.780147ms)
▶ runDoctorChecks
  ✔ passes all checks for a healthy repository (1466.365672ms)
  ✔ passes the validator check with the pinned version (30.745959ms)
  ✔ fails the validator check on version drift (42.856792ms)
  ✔ fails the validator check when the binary is unavailable (26.585048ms)
  ✔ fails the config check when config properties are invalid (905.207265ms)
  ✔ fails the config check when the loader throws (804.984489ms)
  ✔ fails the config check when openspecRoot is not a string (857.215913ms)
  ✔ fails the config check when the resolved gates value is missing or non-boolean (1670.128263ms)
  ✔ fails the harness check when the configured binary is unavailable (554.979269ms)
  ✔ fails the managed-blocks check when PLANNER.md lacks a managed block (522.9665ms)
  ✔ fails the managed-blocks check on a partial marker pair (438.918165ms)
  ✔ fails the managed-blocks check when AGENTS.md has no managed block (488.248582ms)
  ✔ fails the managed-blocks check when the Claude command is missing (455.990083ms)
  ✔ fails the managed-blocks check when the Claude command is stale (472.935162ms)
  ✔ fails the managed-blocks check on duplicate managed blocks (546.224102ms)
  ✔ fails the managed-blocks check on reversed markers (559.632165ms)
  ✔ scaffoldProject repairs drifted managed blocks without disturbing foreign content (51.025032ms)
  ✔ fails the locks check when an orphaned lock exists (502.121663ms)
  ✔ passes the locks check when the recorded pid is alive (492.661207ms)
  ✔ fails the archives check when an archived change is corrupt (572.260978ms)
  ✔ passes the archives check when archived changes are complete (538.367789ms)
  ✔ ignores legacy specs/archive contents when checking canonical archives (472.886136ms)
  ✔ fails the done-markers check when a marker lacks valid frontmatter (31.100169ms)
  ✔ passes the done-markers check for automated and manual markers (31.593054ms)
  ✔ fails the done-markers check when a manual marker has no reason (39.995127ms)
  ✔ ignores archived done markers when checking active changes (86.114736ms)
✔ runDoctorChecks (12676.611637ms)
▶ doctorCommand
  ✔ prints one line per check and exits non-zero only on failure (128.946077ms)
✔ doctorCommand (129.767797ms)
▶ active repository checkout
  ✔ passes all checks on the osq repository itself (1876.161366ms)
✔ active repository checkout (1876.667337ms)
▶ osq done command registration
  ✔ registers done <id> <task> with a required --manual option (3.336332ms)
✔ osq done command registration (4.435483ms)
Marked task 3 of 001-manual-done done (manual)
  Reason: flaky network in CI
▶ manual task completion
  ✔ writes manual frontmatter, appends a done_manual event, and ticks the checkbox (61.561826ms)
  ✔ refuses to mark a task that does not exist (15.213568ms)
  ✔ requires a non-empty manual reason (29.539229ms)
✔ manual task completion (107.018728ms)
▶ report manual vs verified accounting
  ▶ active specs
    ✔ counts verified and manual completions separately (116.866629ms)
  ✔ active specs (117.214089ms)
  ▶ archived specs
    ✔ counts manual done markers as manual (17.07774ms)
  ✔ archived specs (17.59697ms)
✔ report manual vs verified accounting (135.065686ms)
▶ Executor prompt forbids running git
  ✔ ends the prompt built by buildExecutorPrompt with the no-git sentence (1.786862ms)
  ✔ ends every textual harness prompt with the same no-git sentence (0.541035ms)
✔ Executor prompt forbids running git (3.319076ms)
▶ executor and planner wording
  ✔ executor step 2 tells a blocked executor what to write and to exit without code (2.07605ms)
  ✔ result headings place ## Blocked between ## Outside scope and ## Next (1.883655ms)
  ✔ the managed planner block carries the new ownership bullet and drops the retry line (0.32774ms)
  ✔ both PLANNER.md copies carry the new ownership bullet (9.750037ms)
  ✔ AGENTS.md carries the ## Blocked heading (4.47242ms)
✔ executor and planner wording (20.373402ms)
▶ proposal fixes parsing
  ✔ reads fixes normalized like depends_on (18.138626ms)
  ✔ reads an absent or malformed fixes value as an empty list (32.639902ms)
✔ proposal fixes parsing (54.216837ms)
▶ lint fixes declaration
  ✔ reports fixes naming a missing change (52.697827ms)
  ✔ accepts fixes naming an active, archived, or rejected change (15.960643ms)
✔ lint fixes declaration (69.151504ms)
▶ queue fixes parsing
  ✔ parses an optional fixes line out of the body with an unchanged hash (2.909865ms)
  ✔ accepts a fixes line beside dependencies (3.372014ms)
  ✔ rejects an empty fixes line and an invalid slug (1.457453ms)
  ✔ rejects repeated, self, forward, and unknown fixes (0.932077ms)
  ✔ rejects a second fixes line (1.04231ms)
✔ queue fixes parsing (10.492061ms)
▶ queue fixes waiting and seeding
  ✔ keeps unlanded fixes after dependencies in unmet dependencies (3.984481ms)
  ✔ waits on an unlanded fixed item rather than planning it (12.70938ms)
  ✔ seeds a landed fix as the new proposal fixes id (21.309028ms)
  ✔ seeds fixes through createNewSpec only when non-empty (5.947253ms)
✔ queue fixes waiting and seeding (44.484648ms)
▶ focused test command configuration
  ✔ leaves focusedTests out when unset (11.939092ms)
  ✔ keeps a valid command verbatim (2.021569ms)
  ✔ rejects a command without the placeholder (3.010322ms)
  ✔ rejects a non-string value (1.597556ms)
  ✔ loads focusedTests from osq.config.ts (219.092842ms)
✔ focused test command configuration (239.225796ms)
▶ show focused runs
  ✔ lists failed then passed runs after the scenarios line (88.020179ms)
  ✔ renders a problem entry without the failed annotation and no line without events (26.44803ms)
✔ show focused runs (116.475917ms)
▶ focused file collection
  ✔ collects scoped scenarios and every file naming them (48.892836ms)
  ✔ collects nothing when the scoped scenario capability is not opted in (8.606639ms)
  ✔ collects nothing when the focused command is unset (4.693011ms)
  ✔ quotes a collected path holding a space and a quote (115.283419ms)
✔ focused file collection (179.01992ms)
▶ focused run classification
  ✔ passes when no scenario test fails (51.685908ms)
  ✔ fails a collected scenario even when the command exits zero (41.198694ms)
  ✔ fails an indented nested not ok line (36.714152ms)
  ✔ fails a title with an escaped hash (51.892871ms)
  ✔ fails a title with a trailing TODO directive (55.841234ms)
  ✔ calls a non-scenario failure a problem even on a nonzero exit (48.191371ms)
  ✔ calls a timed-out run a problem (508.171077ms)
  ✔ runs with the change folder as OSQ_CHANGE (63.755539ms)
✔ focused run classification (858.737774ms)
▶ focused failure ends the attempt through runTask
  ✔ runs the focused files and goes on to the verify when the run passes (416.557003ms)
  ✔ kills the task with verify_red and skips the verify when a scenario fails (233.397274ms)
  ✔ records a broken focused command as a problem and lets the verify decide (357.29025ms)
  ✔ appends no focused event when the command is unset (259.655201ms)
✔ focused failure ends the attempt through runTask (1268.7012ms)
▶ focused failure through the watcher loop
  ✔ retries automatically and the next prompt carries the focused output (591.123915ms)
✔ focused failure through the watcher loop (591.528507ms)
▶ real TAP focused run of the pricing fixture
  ✔ ends on the focused run when the tier boundary moved (1895.618792ms)
  ✔ passes the intact fixture on its focused run (1982.296022ms)
✔ real TAP focused run of the pricing fixture (3878.606439ms)
▶ source function budget
  ✔ keeps every non-grandfathered function at or under 80 lines (936.528305ms)
  ✔ removes every grandfather key that no longer names an over-budget function (630.148245ms)
✔ source function budget (1568.304247ms)
▶ Golden event streams
  ✔ normalizes timestamps, pids, versions, and project paths to stable tokens (53.501856ms)
  ✔ masks verify_ran duration to zero while preserving exit code and command (12.004963ms)
  ✔ masks measures scope hashes to stable tokens (13.66503ms)
  ✔ masks measures repository counts to a stable placeholder (12.787586ms)
  ✔ matches the checked-in golden events for a verified task (196.891451ms)
  ✔ still matches the verified golden events when the scaffolded project grows (189.139776ms)
  ✔ matches the checked-in golden events for a dead task (218.576396ms)
✔ Golden event streams (698.599016ms)
▶ generic harness consumer architecture
  ✔ detects synthetic harness branches and ignores comments and prose (1.875254ms)
  ✔ covers every generic consumer and derives forbidden names from the catalog (4.513971ms)
  ✔ contains no harness-name comparisons or cross-harness fallbacks (32.408542ms)
✔ generic harness consumer architecture (40.106605ms)
▶ harness capability catalog
  ✔ contains every supported harness exactly once in ordered available names (1.485374ms)
  ✔ normalizes lookup across supported casing and reports catalog names when unknown (0.554706ms)
  ✔ resolves each harness executable through catalog metadata (0.764112ms)
  ✔ derives executor identity only from the selected harness, with a default sentinel (0.733992ms)
  ✔ declares planner-agent capability and native attribution per catalog entry (0.137524ms)
  ✔ keeps adapter factories at runtime parity with catalog names (0.35296ms)
  ✔ exposes the catalog through the public configuration entry point (0.163995ms)
✔ harness capability catalog (5.615723ms)
▶ doctor harness diagnostics resolve through the catalog
  ✔ probes each external executable and passes a no-binary harness without a process (245.377881ms)
  ✔ reports missing, nonzero, and timeout probes as failing harness checks (1120.830303ms)
  ✔ prints the harness result through the doctorCommand output contract (364.450369ms)
✔ doctor harness diagnostics resolve through the catalog (1731.997942ms)
▶ approval manifest uses the shared executor identity
  ✔ records the selected harness model or default and applicable effort (78.918889ms)
  ✔ never borrows manifest.planner from configuration or the executor identity (59.137381ms)
  ✔ attributes manifest.planner only from a recorded planning session (19.998457ms)
  ✔ approveSpec writes the same identity through the real approval path (166.651192ms)
✔ approval manifest uses the shared executor identity (325.576585ms)
▶ watcher preflight uses the adapter port
  ✔ invokes a supplied preflight and continues when the port is absent (35.609195ms)
  ✔ does not probe a catalogued no-binary harness even when a preflight is supplied (48.434554ms)
  ✔ probes the resolved opencode and codex executables before the first cycle (136.127319ms)
✔ watcher preflight uses the adapter port (220.819766ms)
▶ task started events use the shared executor identity
  ✔ records the selected harness and its model for agy, opencode, mock, and codex (1346.470375ms)
✔ task started events use the shared executor identity (1347.013571ms)
Created spec 001: 001-explicit-plan
  Path: /tmp/osq-generic-plan-wkeIuD/openspec/changes/001-explicit-plan
▶ planCommand uses the shared planner selection
  ✔ uses explicit planner values in brief metadata and interactive arguments (135.10954ms)
Created spec 001: 001-implicit-agy
  Path: /tmp/osq-generic-plan-6BggTR/openspec/changes/001-implicit-agy
Created spec 002: 002-implicit-opencode
  Path: /tmp/osq-generic-plan-6BggTR/openspec/changes/002-implicit-opencode
Created spec 003: 003-implicit-mock
  Path: /tmp/osq-generic-plan-6BggTR/openspec/changes/003-implicit-mock
  ✔ falls back to the selected executor entry when no planner block exists (210.650021ms)
Created spec 001: 001-implicit-codex
  Path: /tmp/osq-generic-plan-9VsJcH/openspec/changes/001-implicit-codex
Created spec 002: 002-mixed-codex-plan
  Path: /tmp/osq-generic-plan-9VsJcH/openspec/changes/002-mixed-codex-plan
  ✔ records default and passes no invented model for native Codex planning (172.892511ms)
✔ planCommand uses the shared planner selection (519.204749ms)
▶ HarnessAdapter spawnInteractive
  ✔ OpencodeAdapter spawns fake binary with expected argv and returns exit code (77.640033ms)
  ✔ AgyAdapter spawns fake binary with expected -i argv and returns exit code (43.588417ms)
  ✔ OpencodeAdapter inherits child stdout and stderr without capturing them (470.266516ms)
  ✔ AgyAdapter inherits child stdout and stderr without capturing them (474.32947ms)
  ✔ MockAdapter records interactive spawns and returns configured exit code (2.200774ms)
✔ HarnessAdapter spawnInteractive (1070.299142ms)
▶ Shared Process Execution and Timeout Helper
  ✔ spawnWithTimeout executes child process with given command, args, cwd, and environment (54.944047ms)
  ✔ spawnWithTimeout terminates process with SIGTERM when execution exceeds timeoutSeconds (1008.853943ms)
  ✔ DEFAULT_KILL_GRACE_PERIOD_MS remains 5000 (2.115761ms)
  ✔ spawnWithTimeout forces SIGKILL when SIGTERM fails to terminate (1115.574611ms)
  ✔ spawnWithTimeout marks timedOut true and returns non-zero exit code on timeout (1007.074446ms)
  ✔ AgyAdapter uses spawnWithTimeout helper preserving existing timeout behavior (1047.847477ms)
✔ Shared Process Execution and Timeout Helper (4238.946672ms)
▶ Harness capability rule prompt injection
  ✔ extractCapabilityRules reads delta specs under specs/<capability>/spec.md (52.707715ms)
  ✔ extractCapabilityRules returns an empty array when no delta specs exist (3.160971ms)
  ✔ delivers one golden prompt through agy, opencode, and codex argv (28.791667ms)
  ✔ carries every managed step and exit line through every harness (17.328534ms)
  ✔ omits delta and living sections when the change has neither (4.922618ms)
  ✔ names proposal.md as Parent Spec even when the change folder has no proposal.md (2.640236ms)
  ✔ buildAgyPrompt injects capabilityRules under a dedicated section in Rules (2.602781ms)
  ✔ buildOpencodePrompt injects capabilityRules under the same dedicated section in Rules (3.051239ms)
  ✔ builds standard default rules without empty headers when capability rules are absent (2.04763ms)
  ✔ points every adapter at the concrete result path and no retired features/ docs (6.597967ms)
  ✔ treats an explicit empty capabilityRules array as no capability rules (5.223291ms)
  ✔ derives capability rules from the change folder when capabilityRules is absent (6.879543ms)
  ✔ renders one prior-context section naming attempt, failure reason, and prior result (11.362211ms)
  ✔ omits the prior-context section on a fresh first attempt without a prior result (3.95653ms)
  ✔ treats an explicit prior result as prior context even before a retry (7.305647ms)
  ✔ renders a failed verification output block inside the prior context (6.920487ms)
  ✔ bounds an oversized prior failure output deterministically (3.9302ms)
  ✔ renders the same failed-output block in every textual prompt (1.868535ms)
✔ Harness capability rule prompt injection (174.769058ms)
▶ shared harness stream helpers
  ▶ asRecord
    ✔ returns a plain object unchanged (3.45777ms)
    ✔ returns undefined for arrays, null, undefined, and primitives (0.145325ms)
  ✔ asRecord (4.442259ms)
  ▶ firstNonEmptyString
    ✔ returns the first non-empty string and skips empty or non-string values (0.427773ms)
    ✔ returns undefined when no candidate is a non-empty string (0.133564ms)
  ✔ firstNonEmptyString (0.946112ms)
  ▶ resolveEventTimestamp
    ✔ normalizes string timestamps to ISO form (0.818674ms)
    ✔ normalizes numeric epoch timestamps to ISO form (0.204726ms)
    ✔ falls back to a nested step_update timestamp (0.185256ms)
    ✔ returns the current time for missing or invalid timestamps (0.271198ms)
  ✔ resolveEventTimestamp (1.831344ms)
  ▶ EventStreamParser
    ✔ reassembles lines split across chunks and flushes the trailing partial line (1.163744ms)
    ✔ skips empty and whitespace-only lines (0.406401ms)
    ✔ awaits handlers serially in arrival order (25.116537ms)
    ✔ continues after a handler rejects and still resolves flush (0.665289ms)
    ✔ flushes an unterminated final line exactly once across repeated feeds (0.189836ms)
  ✔ EventStreamParser (27.95446ms)
✔ shared harness stream helpers (36.508698ms)
▶ Harness Adapter and Event Logging
  ✔ appendHarnessEvent appends valid JSONL events to .run/events/<n>.jsonl (100.971305ms)
  ✔ MockAdapter setup and spawn simulates task execution and emits events (32.550326ms)
  ✔ AgyAdapter initializes with correct name and can perform setup (12.853621ms)
  ✔ getHarnessAdapter resolves registered adapters and rejects unknown names (46.9399ms)
  ✔ AgyAdapter includes --print-timeout <n>s in args based on config timeouts (37.72105ms)
✔ Harness Adapter and Event Logging (233.060061ms)
▶ Folder Hasher
  ✔ produces deterministic SHA-256 hash for identical folder contents (111.885918ms)
  ✔ ignores .run directory and its marker files completely (50.531559ms)
  ✔ normalizeTasksMd normalizes checked boxes to unchecked boxes (19.154502ms)
  ✔ ticking a task checkbox in tasks.md produces identical hash (22.71219ms)
  ✔ deleting or modifying a task line in tasks.md changes the hash (22.281199ms)
  ✔ changes hash when any task or spec file is modified (12.825998ms)
  ✔ normalizes CRLF and LF to yield identical hashes across platforms (43.349134ms)
  ✔ verifyFolderHash returns true if and only if folder hash matches approved hash (31.242686ms)
  ✔ ignores additions, edits, and removals of the root plan-prompt.md (21.880644ms)
  ✔ covers a nested plan-prompt.md as authored content (31.972155ms)
✔ Folder Hasher (370.653105ms)
▶ planner human steps guidance
  ✔ names the subsections, the check key, and osq verified (1.184239ms)
  ✔ adds the subsection bullet right after the Human steps bullet (0.205106ms)
  ✔ does not tell planners to list an expected retry for a shared file (0.242477ms)
  ✔ repository PLANNER.md and its template carry the new block (9.406215ms)
✔ planner human steps guidance (14.003758ms)
▶ osq schema human steps guidance
  ✔ states the subsections, the check key, and osq verified in both copies (2.486618ms)
  ✔ keeps both schema copies byte-identical (9.615054ms)
✔ osq schema human steps guidance (12.521303ms)
▶ impact lint
  ✔ warns on a task whose scope a test reaches two levels away (253.609845ms)
  ✔ leaves out a test a task declares for modification (197.329114ms)
  ✔ names a directly imported test and leaves out the more suffix (173.356735ms)
  ✔ caps the listed importers with maxListedImporters and counts the rest (182.012184ms)
  ✔ follows a deeper reach when importGraphDepth is raised (425.743656ms)
  ✔ warns about a capability a scoped file imports without declaring it (431.042411ms)
  ✔ warns about a resolved scope path whose owners have no delta (204.253444ms)
  ✔ warns when a verify names only tests that reach nothing in scope (192.243626ms)
  ✔ does not warn when the verify test reaches the task scope (259.660745ms)
  ✔ stays silent and valid in a Python-only repository (140.648806ms)
  ✔ lints every change with one graph built for the run (411.056074ms)
✔ impact lint (2873.648333ms)
▶ buildImportGraph
  ✔ resolves a .js specifier to the existing .ts file (26.590135ms)
  ✔ follows export ... from, import type, dynamic import(), and require() (35.387739ms)
  ✔ resolves a directory import to its index file (6.074776ms)
  ✔ never resolves bare or aliased specifiers (2.115432ms)
  ✔ leaves out ignored folders and options.skip (5.457439ms)
  ✔ excludes declaration files from the graph (2.621171ms)
  ✔ returns an empty graph for a repository without script files (1.888244ms)
  ✔ shares the ignored folder names with gatherRepoCounts (5.763962ms)
✔ buildImportGraph (89.532979ms)
▶ reachImports
  ✔ returns every file the start imports at any depth, sorted (4.057883ms)
  ✔ does not include a start file unless a cycle reaches it (2.682937ms)
✔ reachImports (7.08407ms)
▶ reachImporters
  ✔ reports each importing file with its depth, nearest first (5.113779ms)
  ✔ keeps one entry per file at its nearest depth (18.659763ms)
✔ reachImporters (24.056181ms)
▶ countImportFanIn
  ✔ counts non-scoped src TypeScript files that import a scoped file (3.513023ms)
  ✔ does not count an importer of a prefix-named sibling (2.856614ms)
  ✔ returns 0 when the scope holds no existing src file (1.697599ms)
  ✔ resolves a glob into its real import targets (2.386569ms)
✔ countImportFanIn (10.749383ms)
▶ countImportFanIn on osq's own repository
  ✔ equals a search for whole quoted import specifiers (5152.288438ms)
✔ countImportFanIn on osq's own repository (5152.555086ms)
▶ import graph boundaries
  ✔ WatchCommandOptions is declared in src/watcher/dev.ts (10.630043ms)
  ✔ src/cli/watch.ts imports WatchCommandOptions from src/watcher/dev.ts (4.959329ms)
  ✔ src/core imports only from src/core (244.532233ms)
  ✔ src/harness imports from neither src/watcher nor src/cli (313.416209ms)
  ✔ src/watcher imports from no module in src/cli (368.458805ms)
  ✔ keeps UI runtime imports out of core and core imports out of UI (479.280108ms)
  ✔ rejects a runtime UI import from src (0.524216ms)
  ✔ allows erased type-only UI imports from src (0.256148ms)
  ✔ rejects any src import from packages/ui (0.34822ms)
  ✔ keeps fetch and EventSource inside the data module (64.218193ms)
✔ import graph boundaries (1490.055758ms)
▶ runner lifecycle module line budget
  ✔ keeps every runner lifecycle module strictly under 200 lines (5.255818ms)
✔ runner lifecycle module line budget (5.518486ms)
▶ blocked task inbox projection
  ✔ marks the blocked JSON item, leaves other dead items unchanged, and uses the reject command (736.436177ms)
  ✔ renders the collapsed need and reject-and-replan path, leaving the plain row unchanged (722.515846ms)
✔ blocked task inbox projection (1460.922459ms)
▶ osq inbox on a terminal
  ✔ runs the card session and shows the approval card with its keys (241.19748ms)
  ✔ prints the text view when there is no terminal (53.51345ms)
  ✔ prints JSON instead of the session when json is set (25.177517ms)
✔ osq inbox on a terminal (324.193202ms)
▶ createTerminalInput
  ✔ turns raw mode on before a key read and off after it (3.037489ms)
  ✔ reads a key from a stream without setRawMode (2.166193ms)
Reason:   ✔ writes the question and reads a line with raw mode off (5.282729ms)
✔ createTerminalInput (11.953239ms)
0.2.3
▶ createChildLauncher
  ✔ runs osq --version as a real child and resolves with 0 (644.887983ms)
error: too many arguments. Expected 0 arguments but got 1.
  ✔ resolves with 1 when the child fails (682.971856ms)
✔ createChildLauncher (1328.412527ms)
▶ osq inbox ordered list and first card
  ✔ lists approval first, then halt, and prints the first card (151.195273ms)
  ✔ lists a halt task with its attempts, output, and commands (27.262857ms)
✔ osq inbox ordered list and first card (180.281857ms)
▶ osq inbox JSON output
  ✔ carries watcherIdle and every item with a card (154.893491ms)
✔ osq inbox JSON output (155.584501ms)
▶ osq inbox empty output
  ✔ prints Nothing needs you. when nothing needs a human (29.630156ms)
✔ osq inbox empty output (30.129286ms)
▶ osq inbox registration
  ✔ registers inbox with --json and leaves bare osq unchanged (6.521945ms)
✔ osq inbox registration (6.883565ms)
▶ formatDispatchItemSummary
  ✔ is exactly the text after the position on each osq inbox list line (136.718905ms)
✔ formatDispatchItemSummary (138.181433ms)
▶ followDispatch
  ✔ prints a new halt and sounds once (92.266048ms)
  ✔ makes no sound for items present at start (77.026771ms)
  ✔ prints a departed item without a sound (91.209152ms)
  ✔ finds an item on the poll timer without a watcher event (77.007475ms)
  ✔ prints two new items in dispatch order and sounds once (99.37014ms)
  ✔ treats an item that came back as new and sounds again (136.207262ms)
  ✔ waits on an empty inbox until the signal aborts (14.571529ms)
  ✔ opens a new hub when the watched trees change and derives once more (45.765965ms)
✔ followDispatch (635.467519ms)
▶ inboxDispatchCommand follow
  ✔ passes follow seams through and resolves on abort (130.30628ms)
  ✔ refuses --follow with --json and sets exit code 1 (3.557643ms)
✔ inboxDispatchCommand follow (134.42794ms)
▶ planning inbox items
  ✔ lists a fresh template as planning with osq lint and no approve command (59.923957ms)
  ✔ names the plan command for an unplanned change carrying a brief (11.653229ms)
  ✔ keeps the approval item when a change is missing from nextSteps (7.708568ms)
✔ planning inbox items (82.742715ms)
▶ steps before approval
  ✔ flags an approval item whose change has before-approval steps (19.361509ms)
  ✔ omits the field on an approval item without before-approval steps (11.721827ms)
✔ steps before approval (31.878424ms)
▶ verification inbox items
  ✔ lists pending and failed archived changes after the active items (48.117178ms)
  ✔ adds no verification item for a passed or unrequired archive (19.979891ms)
✔ verification inbox items (68.687268ms)
▶ planning label
  ✔ labels the new needs-you kinds (4.678107ms)
✔ planning label (4.932478ms)
▶ inbox sound file
  ✔ regenerated file matches the shipped sounds/inbox.wav (64.062282ms)
  ✔ writes the same bytes every time (73.96242ms)
  ✔ writes a small mono 16-bit PCM WAV (6.676675ms)
  ✔ computes audible samples rather than silence (3.643677ms)
  ✔ writes to sounds/inbox.wav when no argument is given (71.953723ms)
  ✔ ships sounds/ in the published package (1.482793ms)
✔ inbox sound file (223.660834ms)
▶ inbox sound
  ✔ spawns paplay with the package sound when pw-play is absent (30.836092ms)
  ✔ prefers pw-play, then paplay, then aplay on linux (6.617352ms)
  ✔ ignores a non-executable file when picking a player (6.379134ms)
  ✔ spawns afplay with the sound file on darwin (9.179074ms)
  ✔ rings the bell and spawns nothing when no player is in PATH (1.595946ms)
  ✔ rings the bell when the spawned player emits an error (21.112302ms)
  ✔ never throws when the seam throws, ringing the bell instead (13.501724ms)
  ✔ rings the bell for sound bell and does nothing for sound off (1.334754ms)
  ✔ spawns the player with a custom sound file under the project root (16.652359ms)
  ✔ warns once and rings the bell when the configured sound file is missing (2.289833ms)
  ✔ stays silent in quiet hours across midnight, start inclusive and end exclusive (1.935566ms)
  ✔ plays at most once per sound window (1.118817ms)
  ✔ never lets the watcher or harness import the inbox sound modules (22.326425ms)
✔ inbox sound (137.981937ms)
▶ stuck task inbox projection
  ✔ derives stuck only for the marker carrying stuck and a fingerprint (66.131448ms)
  ✔ marks the stuck JSON item and leaves the plain item byte-identical (728.659426ms)
  ✔ renders the stuck row before its retry command and leaves the plain row unchanged (695.3595ms)
✔ stuck task inbox projection (1491.906975ms)
▶ inboxDispatchCommand wait log wiring
  ✔ Session writes the log (232.727859ms)
  ✔ Follow writes the log (53.356517ms)
  ✔ Printing writes nothing (77.834783ms)
  ✔ Printed order uses first seen (47.964676ms)
✔ inboxDispatchCommand wait log wiring (414.130495ms)
▶ inbox needs-you projection
  ✔ projects every attention kind once in change/task order with exact commands (104.118908ms)
  ✔ ignores a change without proposal.md (8.728698ms)
✔ inbox needs-you projection (114.322319ms)
▶ inbox running projection
  ✔ includes only derived running tasks whose parsed lock PID is live and leaves markers (20.486056ms)
  ✔ omits malformed or non-finite locks without creating a running item (37.41144ms)
✔ inbox running projection (58.773652ms)
▶ inbox landed projection and cursor
  ✔ selects strictly later archives with a valid cursor and newest ten otherwise (89.308711ms)
  ✔ keys the cursor by sha256(realpath) and tolerates missing, malformed, or invalid content (4.362117ms)
✔ inbox landed projection and cursor (94.139772ms)
▶ inbox text and JSON contract
  ✔ collapses a completely empty inbox to exactly Inbox empty. (2.7319ms)
  ✔ renders all groups with one (none) line per empty group and command-terminated rows (17.253594ms)
  ✔ exposes exactly the documented JSON keys and value types (30.796358ms)
✔ inbox text and JSON contract (51.644857ms)
▶ bare osq CLI inbox integration
  ✔ renders text, advances and deletes the cursor, caps fallback at ten, and preserves change folders (2850.753956ms)
  ✔ emits exactly the documented JSON object for --json (1390.683776ms)
  ✔ materializes the missing runtime lock directory from clean tracked fixture state (1264.966114ms)
  ✔ prints exactly Inbox empty. for an empty project (689.29638ms)
  ✔ keeps explicit status complete and report --json scoped without advancing the cursor (2130.850414ms)
  ✔ reads the inbox through a core helper without advancing the cursor (1334.129712ms)
✔ bare osq CLI inbox integration (9661.666924ms)
▶ osq init PLANNER.md
  ✔ creates PLANNER.md with the managed block when missing (27.144119ms)
  ✔ replaces the managed block while preserving content outside the markers (13.346424ms)
  ✔ appends the managed block when markers are absent (3.487571ms)
  ✔ managed block instructs planners to write files with the file tool (1.002704ms)
  ✔ managed block states the handoff read, write-boundary, lint, and no-approval rules (0.949923ms)
  ✔ managed block encodes the slicing rule (1.188434ms)
  ✔ managed block encodes the detail rule (0.814824ms)
  ✔ managed block encodes the change-level verify rule (1.120533ms)
  ✔ managed block states the between-task watcher rules inside the Tasks guidance (2.033115ms)
  ✔ managed block separates interactive planning from the osq plan handoff (0.969073ms)
  ✔ managed block requires final-tree verification inside the Tasks guidance (1.034985ms)
  ✔ managed block requires ordered shared-file ownership inside the Tasks guidance (0.978144ms)
  ✔ repository PLANNER.md carries the file-tool instruction (1.313818ms)
  ✔ scaffoldProject initializes PLANNER.md and reports it on InitResult (18.953658ms)
  ✔ PLANNER.md, MANAGED_PLANNER_BLOCK, and templates/PLANNER.md are byte-for-byte equal (1.612973ms)
✔ osq init PLANNER.md (78.427695ms)
▶ planning consumer guidance
  ✔ describes prompt handoff, explicit session, print mode, and entry points (37.862865ms)
  ✔ describes approval observation and planning-tool-owned model choice (11.161831ms)
  ✔ generates a config with no required planner model (38.991898ms)
✔ planning consumer guidance (89.492617ms)
▶ osq init --refresh-schema
  ✔ refreshes a stale schema file and reports it (72.7151ms)
  ✔ leaves a fully current schema untouched and reports it as current (43.029141ms)
  ✔ creates a deleted schema file and reports it as created (49.55078ms)
  ✔ reports schema files as existing on a plain rerun without rewriting them (19.655341ms)
  ✔ prints refreshed and current lines after the created and exists lines (613.241812ms)
  ✔ prints only exists lines without the flag (347.847116ms)
✔ osq init --refresh-schema (1147.855075ms)
▶ osq init
  ✔ scaffolds only the OpenSpec layout and default files in a fresh repo (81.922103ms)
  ✔ does not create legacy specs/ or specs/_template/ during initialization (11.220501ms)
  ✔ does not overwrite existing osq.config.ts (39.926006ms)
  ✔ creates AGENTS.md with the managed block if missing (2.309767ms)
  ✔ managed AGENTS block carries the planning entry point without weakening the executor protocol (1.096992ms)
  ✔ managed block is clean, self-contained, and contains no self-referential repo text (1.675048ms)
  ✔ injects or updates the managed block in an existing AGENTS.md idempotently (3.61627ms)
  ✔ scaffolds openspec/config.yaml declaring the osq schema and per-artifact rules (23.896746ms)
  ✔ scaffolds openspec/schemas/osq/schema.yaml forked from spec-driven without design (13.990157ms)
  ✔ schema README documents tasks/<n>.md as an osq-specific execution unit (7.717595ms)
  ✔ refreshes the managed AGENTS.md block with OpenSpec layout instructions (5.683901ms)
  ✔ is strictly idempotent and preserves existing OpenSpec configuration (33.208933ms)
  ✔ creates the Claude plan command and classifies it in InitResult (36.880803ms)
  ✔ refreshes a stale Claude command while preserving surrounding content (12.802068ms)
  ✔ does not rewrite existing config, environment, schema, or unrelated files (14.971996ms)
✔ osq init (293.685186ms)
▶ instruction-shaped delta linting
  ✔ rejects a requirement named with "Update" (221.391943ms)
  ✔ rejects a requirement named with "Document" (158.244142ms)
  ✔ rejects instruction-shaped names case-insensitively (219.294412ms)
  ✔ names the capability and requirement title in the error (180.418742ms)
  ✔ inspects MODIFIED and REMOVED requirement sections (205.257202ms)
  ✔ accepts declarative delta requirements with zero errors (188.41333ms)
  ✔ prevents approval of a change folder with an instruction-shaped delta (228.994003ms)
✔ instruction-shaped delta linting (1404.342263ms)
▶ instructions drift
  ▶ governing decisions in the manifest
    ✔ records each governing ADR hash on approval and omits decisions at plan time (264.861928ms)
    ✔ records an empty decisions object for an approval with no governing ADR (134.027062ms)
  ✔ governing decisions in the manifest (400.296105ms)
  ▶ instructions changed after approval
    ✔ appends one event, warns, and still runs when AGENTS.md changed (330.239604ms)
    ✔ reports a new governing ADR accepted after approval (343.146854ms)
    ✔ reports a changed governing ADR (369.916377ms)
    ✔ reports a removed governing ADR (371.407776ms)
    ✔ adds no event and prints no warning when nothing changed (346.444059ms)
    ✔ adds no event on a second attempt after osq retry (527.887417ms)
    ✔ compares only AGENTS.md when the manifest has no decisions field (344.149815ms)
  ✔ instructions changed after approval (2634.562383ms)
  ▶ instructions changed in show
    ✔ prints the drift line under the task after its latest event (522.889519ms)
  ✔ instructions changed in show (523.176337ms)
✔ instructions drift (3558.928091ms)
▶ layout path derivation
  ✔ derives the changes directory from a relative openspecRoot (2.430341ms)
  ✔ derives the changes directory from an absolute openspecRoot (0.162185ms)
  ✔ prepends an optional project root (0.212326ms)
  ✔ derives the archive directory from openspecRoot (0.233307ms)
  ✔ derives the specs directory from openspecRoot (0.160295ms)
  ✔ derives change-local directories from the change folder (0.157614ms)
  ✔ derives done, dead, and event artifact paths (0.181875ms)
  ✔ anchors absolute change folders without rebasing them (0.327254ms)
  ✔ derives deterministically and tracks the configured root (0.226677ms)
  ✔ keeps the layout module under 200 lines (15.911308ms)
✔ layout path derivation (22.833815ms)
▶ source line budget
  ✔ keeps every non-allow-listed source file at or under 250 lines (199.358794ms)
✔ source line budget (201.003736ms)
▶ UI source line budget
  ✔ keeps every authored UI source file at or under 250 lines (26.032461ms)
✔ UI source line budget (26.367081ms)
▶ lint findings
  ✔ reports a chained verify as an error finding with a file and null requirement (1619.773729ms)
  ✔ reports a delta issue on the delta file with its requirement name (1627.817028ms)
  ✔ reports a long living requirement as a repository finding that leaves the change valid (1647.377977ms)
  ✔ exits zero when a clean change faces a long living requirement (1725.409908ms)
  ✔ keeps another change's error out of the linted change (1616.930373ms)
  ✔ marks OpenSpec's skip_specs advice as unsupported (992.340274ms)
  ✔ warns about a capability whose merged Purpose is too brief (1668.108111ms)
  ✔ leaves out an issue the living spec already carries (1756.546655ms)
  ✔ reports merge errors and runs no merged validation when no delta merges (1175.437142ms)
✔ lint findings (13833.206979ms)
▶ lint output
  ✔ prints an error and a warning with severity, file, and requirement (1676.838088ms)
  ✔ carries the same fields in --json and prints no text lines (1553.834011ms)
  ✔ prints one repository finding once after two changes and never exits (3096.590665ms)
  ✔ prints no repository header when there are no repository findings (1691.619178ms)
✔ lint output (8021.078849ms)
▶ lint skips the rejected folder
  ✔ lints only the active change when rejected sits beside it (230.638338ms)
✔ lint skips the rejected folder (236.251778ms)
▶ lint verify start warnings
  ✔ warns when a 066-shaped task declares any (195.802009ms)
  ✔ warns when a 066-shaped task declares green (158.154188ms)
  ✔ emits no contradiction warning when the same task declares red (113.717253ms)
  ✔ emits neither warning when an earlier task scope covers the path (142.659744ms)
  ✔ warns when no task scope can create a named path (133.346853ms)
  ✔ emits no unresolved-target warning for a task naming only its own new test (185.806024ms)
✔ lint verify start warnings (931.476748ms)
▶ Spec Linter
  ✔ passes a clean, compliant spec (192.645521ms)
  ✔ rejects a proposal declaring features.writes in frontmatter (192.121243ms)
  ✔ rejects more than one table under Contract (160.210736ms)
  ✔ rejects verify command that chains commands (160.159046ms)
  ✔ rejects depends_on naming a missing change (113.549368ms)
  ✔ accepts depends_on naming a change that lives in the archive (163.507986ms)
  ✔ accepts depends_on naming a change that lives in the rejected directory (158.407736ms)
  ✔ rejects acceptance checklist longer than maxAcceptanceLines (141.510291ms)
  ✔ permits task title containing " and " without warning (161.249028ms)
  ✔ resolves proposal.md as the change document when spec.md is absent (88.503194ms)
  ✔ rejects a change folder missing both proposal.md and spec.md (30.25923ms)
  ✔ rejects a proposal.md lacking a verify command (125.954629ms)
  ✔ accepts a proposal.md declaring a verify command (122.911646ms)
  ✔ rejects a non-boolean nested tests.modify declaration (115.7127ms)
  ✔ rejects a non-boolean flat tests.modify declaration (226.539878ms)
  ✔ accepts a boolean nested tests.modify declaration (191.121385ms)
  ✔ rejects scope touching an existing test file without tests.modify (112.931498ms)
  ✔ rejects a tests/** scope matching an existing test file without tests.modify (117.806274ms)
  ✔ passes a scope touching existing test files when tests.modify is true (130.140565ms)
  ✔ permits scope naming a new test file that does not exist yet (127.983787ms)
  ✔ warns without failing when harness scope omits the event fixture folder (169.122977ms)
  ✔ does not warn when an exact fixture file covers the event fixtures (151.885614ms)
  ✔ does not warn when a fixture directory declaration covers the event fixtures (172.756481ms)
  ✔ does not warn when a fixture glob declaration covers the event fixtures (147.822666ms)
  ✔ emits one harness fixture warning per affected task in task order (131.559289ms)
  ✔ executes local openspec validate for changes and specs under OPENSPEC_TELEMETRY=0 (238.042832ms)
  ✔ fails closed when no local openspec binary is installed (49.557617ms)
  ✔ parses JSON validation failures and prefixes them with openspec: (170.614503ms)
  ✔ logs the resolved OpenSpec version and does not warn when it matches the pin (136.577127ms)
  ✔ fails when the resolved OpenSpec version differs from the pin (198.593636ms)
  ✔ verifies delta target existence against base specs (176.70121ms)
  ✔ accepts a delta whose modified requirement exists in the base spec (238.974598ms)
  ✔ accepts an added-only delta for a capability with no base spec (202.771211ms)
  ✔ rejects an added delta requirement named with "Update" (142.135472ms)
  ✔ rejects an added delta requirement named with "Document" (291.174752ms)
  ✔ accepts a declarative added delta requirement with zero errors (315.515553ms)
  ✔ rejects the template placeholder in a proposal verify (132.54062ms)
  ✔ rejects the template placeholder in a task verify with one message (191.885459ms)
  ✔ rejects normalized placeholder equivalents (549.986353ms)
  ✔ rejects package-script invocations whose script is absent (656.428824ms)
  ✔ accepts a present package script without a path warning (185.699194ms)
  ✔ warns when a task verify names no path or package script (117.68455ms)
  ✔ warns when a proposal verify names no path or package script (162.042622ms)
  ✔ does not warn when a verify names an existing repository path (151.797678ms)
  ✔ accepts a path-shaped binary that exists (159.254585ms)
  ✔ handles a missing or malformed root package manifest deterministically (225.904842ms)
  ✔ retains the chaining diagnostic without reinterpreting it (190.682065ms)
  ✔ keeps checked-in fixture verification local and free of the placeholder (346.704454ms)
  ✔ registers the lint command in the CLI (94.481707ms)
  ✔ lint command exits non-zero when a change folder fails lint (206.106891ms)
  ✔ lint command exits zero when all change folders are valid (165.819897ms)
  ✔ excludes a root plan-prompt.md from artifact scanning without changing findings (278.943336ms)
  ✔ still scans and rejects a nested plan-prompt.md as authored content (148.632388ms)
✔ Spec Linter (9739.223376ms)
▶ Living spec delta equivalence
  ✖ re-seeds every living spec as the cumulative deterministic merge of 016..027 (931.583426ms)
  ✔ preserves requirements introduced by 017 and 020 through 027 (11.576421ms)
  ✔ contains zero legacy "Delta from" references and no loose spec markdown files (2.621516ms)
  ✔ git grep "Delta from" openspec/specs returns zero matches (32.062744ms)
  ✔ deletes the legacy prose appender applyDelta and calls applyOpenSpecDeltas directly (175.821391ms)
  ✔ orders archives by landing time and puts eventless folders first (11.616308ms)
✖ Living spec delta equivalence (1167.946151ms)
▶ Lock and Reaper
  ✔ acquireLock writes running marker exclusively (14.497276ms)
  ✔ releaseLock removes running marker cleanly (4.372334ms)
  ✔ isPidRunning accurately reports current process and non-existent process (1.520354ms)
  ✔ reapStaleLocks detects a dead pid and unlinks the lock without writing a dead marker (7.72058ms)
  ✔ reapStaleLocks detects an expired lock without writing a dead marker (4.566828ms)
✔ Lock and Reaper (35.238832ms)
▶ logger status interface
  ✔ exposes status(text) and clearStatus() (1.187025ms)
✔ logger status interface (2.316697ms)
▶ logger status on an interactive TTY sink
  ✔ clears the status row, writes the log line, and redraws status below (2.762384ms)
  ✔ prefixes every line of a multi-line log and redraws once below (0.917067ms)
  ✔ starts an unref'd 80ms interval that advances spinner frames (1.111772ms)
  ✔ does not disturb the status row when a message is suppressed by level (0.67377ms)
  ✔ clearStatus() clears the active row and stops the animation timer (0.355491ms)
  ✔ honours the isTTY option override for a non-TTY stream (0.33122ms)
  ✔ truncates an overflowing status to columns minus the spinner prefix, with no prefix (0.415362ms)
  ✔ keeps redrawn rows within the terminal width and clear of ghost characters (0.35563ms)
✔ logger status on an interactive TTY sink (7.628206ms)
▶ logger status in non-interactive sinks
  ✔ is a no-op when isTTY is false and renders no escape sequences (0.463383ms)
  ✔ is a no-op when process.env.CI is set, even on a TTY (0.420642ms)
  ✔ is a no-op at quiet level, even on a TTY (0.231537ms)
✔ logger status in non-interactive sinks (1.295548ms)
▶ createLogger
  ✔ exports createLogger and accepts a LogLevel (1.099362ms)
  ✔ writes exclusively to process.stderr with a bracketed prefix (0.324669ms)
  ✔ writes without a prefix when none is supplied (0.153665ms)
  ✔ prefixes every line of a multi-line message (0.143864ms)
  ✔ quiet level suppresses info and verbose messages but writes warn and error (0.166495ms)
  ✔ normal level outputs info, warn, and error while suppressing verbose (0.125744ms)
  ✔ verbose level outputs info, verbose, warn, and error (0.217236ms)
✔ createLogger (3.41367ms)
▶ watch command verbosity options
  ✔ registers --verbose and -q/--quiet options on watch (2.479723ms)
  ✔ parses --verbose and --quiet into the watch command options (1.325379ms)
✔ watch command verbosity options (4.763659ms)
▶ managed instructions block retired paths
  ▶ MANAGED_AGENTS_MD_BODY
    ✔ does not reference retired features/ paths (1.183285ms)
    ✔ does not reference "drift against features" (0.162795ms)
    ✔ does not reference a legacy root-level specs/ path (0.609908ms)
  ✔ MANAGED_AGENTS_MD_BODY (3.503382ms)
  ▶ AGENTS.md
    ✔ does not reference retired features/ paths (0.282368ms)
    ✔ does not reference "drift against features" (0.088843ms)
    ✔ does not reference a legacy root-level specs/ path (0.116684ms)
  ✔ AGENTS.md (0.801024ms)
✔ managed instructions block retired paths (5.532941ms)
▶ managed instructions block executor protocol
  ✔ documents the executor protocol and the gates that kill a task (0.412692ms)
  ✔ is mirrored by the repository AGENTS.md guidance (0.124314ms)
✔ managed instructions block executor protocol (0.762382ms)
▶ managed instructions block executor constants
  ✔ assembles the managed body from the joined step and exit lines (0.648019ms)
  ✔ carries every executor step line and every non-empty exit line (0.236607ms)
  ✔ numbers seven executor steps 1. through 7. (0.150915ms)
  ✔ names the result headings and touched prefix in order (0.327769ms)
✔ managed instructions block executor constants (1.817556ms)
▶ repository managed instructions
  ✔ AGENTS.md managed block matches the installed constant (23.862199ms)
  ✔ opencode executor agent managed block matches the installed constant (3.828541ms)
  ✔ PLANNER.md managed block matches the installed constant (6.899052ms)
  ✔ Claude command managed block matches the installed constant (1.53808ms)
✔ repository managed instructions (37.5986ms)
▶ planner managed block coexistence
  ✔ preserves foreign text and blocks across repeated initialization (12.605407ms)
  ✔ updates only the osq-managed block beside a foreign block (8.876588ms)
  ✔ refreshes only the osq block in the Claude command across repeated init (7.971685ms)
✔ planner managed block coexistence (29.850132ms)
▶ managed wording constants
  ✔ executor step 3 explains the expected red start (2.724855ms)
  ✔ managed AGENTS.md ownership line is addressed to executors and names planners (0.252933ms)
  ✔ planner block writes the folder unless the human asks to review first (0.280768ms)
  ✔ planner block finishes by naming the exact approve command (0.233337ms)
  ✔ parent spec guidance covers human steps, cross-capability deltas, and replacement (0.245637ms)
✔ managed wording constants (5.741158ms)
▶ plan prompt spec list label
  ✔ labels the list and still lists every living spec (70.20137ms)
✔ plan prompt spec list label (70.732146ms)
▶ osq init refreshes older managed blocks
  ✔ replaces both stale managed blocks with the current constants (19.515082ms)
✔ osq init refreshes older managed blocks (20.027837ms)
▶ mangled change folder linting
  ✔ accepts clean files containing newlines and tabs (163.579212ms)
  ✔ rejects a nested file containing a bell character (126.494948ms)
  ✔ rejects a backspace character in a task file (106.592935ms)
  ✔ rejects a carriage return in a task file (122.161817ms)
  ✔ rejects a DEL control character in a change file (141.298045ms)
  ✔ ignores prohibited control characters under .run/ (131.981547ms)
  ✔ rejects fused acceptance lines in a task file (124.021759ms)
  ✔ allows a single acceptance item per line (98.587667ms)
  ✔ approveSpec refuses to seal a change folder with a control character (117.218489ms)
✔ mangled change folder linting (1134.902825ms)
▶ readManifestApprovedAt
  ✔ counts the manifest time only once .run/approved exists (51.844182ms)
  ✔ returns null for a missing, malformed, or invalid manifest (15.067307ms)
✔ readManifestApprovedAt (68.367656ms)
▶ dashboard graph approval gate
  ✔ reports a plan-time manifest time as no approval until the marker exists (30.777562ms)
✔ dashboard graph approval gate (31.265936ms)
▶ planning turn attribution approval gate
  ✔ ignores a manifest time without the marker and uses it once marked (8.136651ms)
  ✔ still reads the rejection timestamp when no slice was recorded (10.425016ms)
✔ planning turn attribution approval gate (18.949869ms)
▶ manifest creation time
  ✔ writes a marked creation time and no approval time from osq plan (94.37611ms)
  ✔ keeps the plan-time creation time across approval and reapproval (315.782584ms)
  ✔ keeps an existing unmarked creation time without adding the marker (141.570931ms)
  ✔ records the folder's marked birth time when approving without a manifest (156.719464ms)
✔ manifest creation time (709.802108ms)
▶ run manifest
  ✔ writes .run/manifest.json with hashes and metadata on approval (291.141422ms)
  ✔ records null for a hashed file that does not exist (215.794121ms)
  ✔ counts valid plan_started records, including resumed sessions without exits (207.538869ms)
  ✔ tolerates a missing, empty, or partially malformed planning log (510.488848ms)
  ✔ changes planningSessions when only the plan log changes, keeping the approved hash (600.375922ms)
✔ run manifest (1827.249649ms)
▶ measures
  ▶ countWords
    ✔ returns 0 for empty and whitespace-only input (25.751044ms)
    ✔ counts single and multiple whitespace-delimited words (2.097371ms)
  ✔ countWords (29.766281ms)
  ▶ gatherScopeCounts
    ✔ counts existing scoped files and their lines, ignoring missing ones (14.499353ms)
    ✔ returns zeros when no scoped file exists (3.502511ms)
    ✔ counts each file a glob resolves and zero for an unmatched glob (21.572368ms)
  ✔ gatherScopeCounts (40.316734ms)
  ▶ gatherRepoCounts
    ✔ totals text files while skipping ignored directories (12.566519ms)
    ✔ skips binary files containing null bytes (2.057502ms)
  ✔ gatherRepoCounts (15.62525ms)
  ▶ countImportFanIn
    ✔ counts non-scoped files that import a scoped file (5.086928ms)
    ✔ returns 0 when only scoped files import each other (3.309546ms)
    ✔ resolves a glob into its real import targets instead of the literal glob text (8.218654ms)
  ✔ countImportFanIn (17.055361ms)
  ▶ countDeltaRequirementsAndScenarios
    ✔ counts requirement and scenario headers across delta specs (5.293765ms)
    ✔ returns zeros when no delta specs exist (1.150223ms)
  ✔ countDeltaRequirementsAndScenarios (6.805279ms)
  ▶ snapshotScopeHashes and hashFileForMeasures
    ✔ hashes known content and returns null for missing files (2.626306ms)
    ✔ hashFileForMeasures returns null for an absent file (1.04657ms)
    ✔ keeps an exact missing path as null and omits unmatched globs (3.212938ms)
  ✔ snapshotScopeHashes and hashFileForMeasures (7.150142ms)
  ▶ gatherEndMeasures
    ✔ counts changed files and absolute line deltas for modified, added, and deleted files (10.50839ms)
    ✔ re-resolves a glob at end so added, modified, and deleted matches are visible (3.842122ms)
    ✔ reports zero changes and equal before/after hashes when scope is untouched (1.684449ms)
    ✔ carries every start-phase field into the end event (0.801954ms)
  ✔ gatherEndMeasures (17.570386ms)
  ▶ emitMeasures
    ✔ appends a measures start event to .run/events/<n>.jsonl (2.365479ms)
    ✔ uses one emission path for both start and end phases (2.489003ms)
  ✔ emitMeasures (5.069368ms)
  ▶ gatherStartMeasures
    ✔ collects scope, repo, word, and delta baselines for a task (22.622582ms)
  ✔ gatherStartMeasures (22.834138ms)
  ▶ runner integration
    ✔ emits start then end measures for a verified task (349.230541ms)
    ✔ reports changed files and lines for a scoped edit (327.384867ms)
    ✔ emits an end measures event for a crashed dead outcome (207.538896ms)
    ✔ emits end measures before the dead event on verify_red (334.097429ms)
  ✔ runner integration (1219.363086ms)
✔ measures (1383.203841ms)
▶ osq migrate sidecars
  ✔ scaffolds only the living capabilities that have no sidecar (28.705219ms)
  ✔ writes nothing and reports zero on a second run (14.875954ms)
✔ osq migrate sidecars (45.008859ms)
▶ osq migrate openspec
  ✔ moves features/ to openspec/specs/ and specs/ to openspec/changes/ (61.338984ms)
  ✔ resolves every migration target through the canonical layout helpers (69.237014ms)
  ✔ migrates archived changes to openspec/changes/archive/ preserving .run/ markers (23.199855ms)
  ✔ converts spec.md to proposal.md with frontmatter and preserves prose under ## Delta (legacy) (42.033894ms)
  ✔ ticks every archived tasks.md (including already-checked and real copies) (140.387421ms)
  ✔ migrates fixture and real archived copies passing both validators (154.39761ms)
  ✔ creates the 017 stub change folder under openspec/changes/017-sample/ (30.094919ms)
  ✔ convertSpecToProposal drops features.writes and preserves delta prose (1.741395ms)
  ✔ tickAllCheckboxes ticks only unchecked boxes and preserves structure (1.896735ms)
  ✔ registers the migrate command with a required target argument (9.952668ms)
  ✔ migrate command rejects unsupported targets with a non-zero exit (1.231649ms)
  ✔ migrate command runs the openspec migration and reports a summary (16.738562ms)
✔ osq migrate openspec (554.712544ms)
▶ mutation check after a passing task
  ✔ runs once for a changed covered function with its ranges and tests (525.061515ms)
  ✔ mutates the unchanged function a newly added scenario test covers (420.350245ms)
  ✔ records a pick whose ranges are unknown without running the command (422.276573ms)
  ✔ records an unreadable report as report_invalid (496.435911ms)
  ✔ records a broken command and still archives the change (578.743786ms)
  ✔ records the picks left once the budget runs out (1620.723719ms)
  ✔ does nothing when mutation is unset (561.857669ms)
✔ mutation check after a passing task (4627.947088ms)
▶ mutation configuration
  ✔ leaves mutation out when unset (11.039401ms)
  ✔ defaults the budget to 300 (4.396133ms)
  ✔ keeps a custom budget (1.396281ms)
  ✔ rejects an empty or missing command (2.377579ms)
  ✔ rejects a non-positive budget (1.463082ms)
  ✔ loads mutation from osq.config.ts (222.058418ms)
  ✔ loads a custom budget from osq.config.ts (13.740566ms)
✔ mutation configuration (259.377224ms)
▶ mutation picks
  ✔ picks a changed function with both test files of its two scenarios (37.209432ms)
  ✔ picks an unchanged function a newly changed covering test names (9.990164ms)
  ✔ leaves an unchanged function alone when no covering test changed (19.098819ms)
  ✔ does not pick a changed function whose capability is not opted in (6.801044ms)
  ✔ does not pick a tagged function no scenario test names (4.884407ms)
  ✔ orders picks by file and then start line (8.662362ms)
✔ mutation picks (91.295721ms)
▶ report mutation scores
  ✔ takes the latest measurement per function and lists only its survivors (179.775942ms)
  ✔ groups a shared measurement by each named capability in name order (28.833466ms)
  ✔ mentions only the opted-in capability a measurement names (17.453505ms)
  ✔ leaves the text and JSON unchanged when no stream holds a measured event (79.787246ms)
  ✔ leaves the report unchanged when no capability is opted in (11.196512ms)
✔ report mutation scores (319.510258ms)
▶ show mutation
  ✔ prints the mutation entry and each survivor after the focused runs (10.404782ms)
  ✔ prints a not-measured entry with its reason (26.528334ms)
  ✔ shows only mutation events after the last measures start (15.373254ms)
  ✔ prints no mutation line for a task with no mutation events (10.388852ms)
✔ show mutation (63.506448ms)
▶ mutation command
  ✔ passes the ranges, tests, and report path to the placeholders and environment (78.084972ms)
  ✔ records killed and surviving mutants with the replaced value (59.358372ms)
  ✔ maps every status and counts an unknown one invalid (37.851574ms)
  ✔ counts a mutant with a missing or mistyped field invalid (50.711008ms)
  ✔ leaves a well-formed mutant outside the ranges uncounted (33.659576ms)
  ✔ cuts a survivor replacement to 200 characters (40.893753ms)
  ✔ records a missing report as report_invalid (75.248507ms)
  ✔ records a non-JSON report as report_invalid (37.734207ms)
  ✔ records a report without a files object as report_invalid (84.110323ms)
  ✔ records a nonzero exit as command_failed and keeps the tail of the output (43.603585ms)
  ✔ records a slow command as timed_out (530.07926ms)
  ✔ does not run a pick whose ranges are unknown (2.33542ms)
  ✔ removes the temporary report folder after reading it (32.275636ms)
✔ mutation command (1110.154648ms)
▶ osq new
  ✔ slugify converts titles to valid kebab-case folder names (47.981409ms)
  ✔ getNextSpecNumber correctly increments existing spec numbers including archive (18.485666ms)
  ✔ createNewSpec generates numbered change folder from template with updated title (14.070703ms)
  ✔ createNewSpec seeds the planner sections in order without a table or features.writes (13.274437ms)
  ✔ createNewSpec respects options.specsDirName override (27.170751ms)
  ✔ createNewSpec rejects empty or invalid spec names (20.849447ms)
✔ osq new (145.434027ms)
▶ parseHumanSteps
  ✔ splits the before approval and after landing subsections (27.330015ms)
  ✔ treats a section without subsections as after landing (3.714972ms)
  ✔ treats a None section as empty (1.312552ms)
  ✔ treats text before the first subsection as after landing (1.392489ms)
  ✔ matches subsection headings in any case (4.584379ms)
✔ parseHumanSteps (40.113523ms)
▶ readCheckCommand
  ✔ returns the trimmed frontmatter check command (2.098401ms)
  ✔ returns null when the check is absent, empty, or not a string (0.897318ms)
✔ readCheckCommand (3.468734ms)
▶ readNextStep for active changes
  ✔ names a fresh template unplanned with the planning command (15.612631ms)
  ✔ uses the lint command for an unplanned change without a brief (6.66804ms)
  ✔ treats a missing verify as unplanned (5.709079ms)
  ✔ names a real-verify unapproved change ready for approval (8.125621ms)
  ✔ flags steps before approval on a ready change (4.277794ms)
  ✔ names an approved healthy change running (28.600329ms)
  ✔ points a dead task at its retry command (30.068877ms)
  ✔ points a change regression at the reject command (11.933936ms)
  ✔ points a blocked change at its first unmet dependency (9.004629ms)
✔ readNextStep for active changes (121.331993ms)
▶ readNextStep for archived changes
  ✔ names an archived change without verification landed (8.554209ms)
  ✔ asks for the check before an outcome is recorded (21.130355ms)
  ✔ asks for the outcome once the check has run since archive (24.868893ms)
  ✔ asks for the outcome when there is no check command (7.894487ms)
  ✔ reports a failed outcome in the detail and format (7.171921ms)
  ✔ treats a passed outcome as landed (8.633268ms)
✔ readNextStep for archived changes (78.866093ms)
▶ readVerification
  ✔ reads the requirement, latest outcome, and check since archive (8.735543ms)
  ✔ skips malformed lines without dropping valid events (3.99505ms)
  ✔ only counts a check that follows the archive event (14.831957ms)
  ✔ returns defaults when the stream is missing (2.40119ms)
  ✔ lists pending archived changes in numeric order (26.934477ms)
✔ readVerification (57.351691ms)
▶ explicit status with next steps
  ✔ fills next steps and lists pending verifications before archived specs (15.133003ms)
  ✔ prints nothing new when next steps are absent (1.25975ms)
  ✔ does not read or advance last-look state (14.984915ms)
✔ explicit status with next steps (31.791501ms)
▶ no skipped output in src
  ✔ contains zero case-insensitive occurrences of "skipped" under src/ (149.476303ms)
✔ no skipped output in src (151.623301ms)
▶ OpenCode Configuration and Adapter Registration
  ✔ OsqConfig interface defines opencode config with bin, model, agent, optional variant (24.518622ms)
  ✔ DEFAULT_CONFIG provides opencode defaults bin "opencode", model "deepseek/deepseek-flash", agent "osq-coder" (2.378925ms)
  ✔ OsqUserConfig accepts partial opencode fields and defineConfig merges them over DEFAULT_CONFIG (3.98177ms)
  ✔ DEFAULT_CONFIG defaults log.heartbeatSeconds to 60 and defineConfig preserves it (4.145661ms)
  ✔ loadConfig and defineConfig permit harness setting "opencode" (219.947815ms)
  ✔ getHarnessAdapter resolves "opencode" returning OpencodeAdapter instance (4.712038ms)
  ✔ README documents opencode in harness list with sample configuration block (2.970834ms)
✔ OpenCode Configuration and Adapter Registration (264.730159ms)
▶ OpenCode doctor diagnostics
  ✔ declares the version diagnose hook on the opencode catalog entry (64.445268ms)
  ✔ passes inside the tested range naming the extracted version (78.233351ms)
  ✔ fails below 2.0.0 naming the unsupported version and exits 1 (91.647647ms)
  ✔ warns without failing at 3.0.0 or above (61.22874ms)
  ✔ warns without failing when no version can be read (81.423774ms)
✔ OpenCode doctor diagnostics (378.580889ms)
▶ OpenCode Event Stream and Token Metrics Translation
  ✔ Stdout JSON lines stream matching fixture/opencode-events.jsonl is parsed line by line (94.646595ms)
  ✔ step_finish event extracts input, output, total, and cache tokens with cost (51.615517ms)
  ✔ tokens event is appended to .run/events/<n>.jsonl with promptTokens, candidateTokens, totalTokens, cachedTokens, cost (128.839228ms)
  ✔ Unknown event types such as step_start and text are logged at verbose level without throwing (27.996666ms)
  ✔ Malformed or unparseable non-JSON stdout lines do not crash the adapter process (24.394594ms)
✔ OpenCode Event Stream and Token Metrics Translation (330.455214ms)
▶ OpencodeAdapter planner agent setup
  ✔ OPENCODE_PLANNER_AGENT_TEMPLATE and the checked-in planner agent are byte-identical (23.177014ms)
  ✔ setup writes the planner agent with lint-only bash permissions and body (25.583551ms)
  ✔ bash patterns allow lint only and deny chained or other commands (5.749756ms)
  ✔ Running setup twice leaves .opencode/agent/osq-planner.md byte-identical (9.626772ms)
  ✔ setup leaves a pre-existing planner agent file untouched (3.294819ms)
  ✔ OpencodeAdapter setup respects custom planner agent name in config (4.667512ms)
✔ OpencodeAdapter planner agent setup (73.921178ms)
▶ OpenCode Adapter Setup
  ✔ OpencodeAdapter setup creates directory .opencode/agent/ if absent (50.334895ms)
  ✔ OpencodeAdapter setup writes .opencode/agent/osq-coder.md with description and mode all frontmatter (16.767638ms)
  ✔ Frontmatter permissions allow read, edit, bash, glob, grep, denying webfetch, websearch (10.821081ms)
  ✔ Agent file body contains AGENTS.md task execution procedure enclosed in managed block markers (8.230115ms)
  ✔ Setup is idempotent and preserves user edits outside managed block markers (11.136612ms)
  ✔ README notes --auto flag approves any action the agent file does not deny (1.56422ms)
  ✔ OpencodeAdapter setup respects custom agent name configured in OsqConfig (4.441235ms)
✔ OpenCode Adapter Setup (105.278291ms)
▶ OpenCode Adapter Task Spawning
  ✔ spawnTask constructs arguments: run --standalone --agent <agent> --auto --format json --model <model> (88.147192ms)
  ✔ Variant is folded into the model as <model>#<variant> when configured (38.413949ms)
  ✔ attaches task, proposal, and existing living specs named by the task (51.047718ms)
  ✔ attaches a new capability delta without fabricating a living spec path (26.712363ms)
  ✔ Positional prompt argument defines task guidelines matching AGENTS.md protocol (20.64903ms)
  ✔ Fake opencode binary validates passed flags, handles non-zero exit, and respects timeout termination (1122.449055ms)
✔ OpenCode Adapter Task Spawning (1349.544664ms)
▶ OpenCode tool event translation
  ✔ adds 'tool' to HarnessEventType and exposes ToolEventData (51.827742ms)
  ✔ extracts file paths and patterns for read, edit, write, and glob tools (25.535979ms)
  ✔ extracts the first 60 characters of the command for the bash tool (11.670203ms)
  ✔ falls back to 60 characters of JSON for any other tool (13.333587ms)
  ✔ recognizes tool_use top-level and part.type tool-use events (9.743477ms)
  ✔ appends a tool event and logs it at verbose level from the shared handler (14.118525ms)
  ✔ persists the event while suppressing the verbose log at normal level (16.366925ms)
  ✔ recognizes tool_use lines in the stream parser and forwards the logger (10.694432ms)
  ✔ emits tool events through the adapter spawn path with the shared logger (79.756166ms)
✔ OpenCode tool event translation (235.469021ms)
▶ OpenCode v2 adapter
  ✔ Task argv uses --standalone and folds the variant into the model (64.776162ms)
  ✔ Final step usage appends the session remainder as a second tokens event (127.085109ms)
  ✔ A failed session export appends nothing beyond the streamed tokens event (89.023748ms)
  ✔ Preflight rejects opencode 1 with the diagnostics failure message and exits 1 (54.966089ms)
✔ OpenCode v2 adapter (337.392515ms)
▶ OpenSpec differential archive parity
  ✔ openspec 1.13.1 is reported by the installed validator (0.846797ms)
  ✔ openspec 1.13.1: case added (identical) (1274.479546ms)
  ✔ openspec 1.13.1: case bare-rename (osq-refuses) (668.130029ms)
  ✔ openspec 1.13.1: case dropped-scenario (both-refuse) (598.084889ms)
  ✔ openspec 1.13.1: case duplicate-added (both-refuse) (680.952042ms)
  ✔ openspec 1.13.1: case given-and (identical) (1141.631955ms)
  ✔ openspec 1.13.1: case modified (identical) (1374.579526ms)
  ✔ openspec 1.13.1: case new-capability (identical) (1262.510321ms)
  ✔ openspec 1.13.1: case removed (identical) (1309.193351ms)
  ✔ openspec 1.13.1: case renamed (identical) (1233.761036ms)
  ✔ openspec 1.13.1: case second-change (identical) (2415.291791ms)
✔ OpenSpec differential archive parity (11963.292488ms)
▶ OpenSpec latest workflow
  ✔ is named OpenSpec latest and triggers weekly and on demand (2.961463ms)
  ✔ defines a single job (0.242127ms)
  ✔ repeats the checkout, pnpm, Node 24, and frozen install steps from ci.yml (0.356491ms)
  ✔ installs the latest OpenSpec outside the lockfile (0.272559ms)
  ✔ prints the latest version after installing it (0.189195ms)
  ✔ runs the differential test against that binary as the last step (0.355211ms)
  ✔ never writes package.json or pnpm-lock.yaml (0.3203ms)
✔ OpenSpec latest workflow (6.435753ms)
▶ OpenSpec version classification
  ✔ classifies the pin regardless of the range (0.930449ms)
  ✔ applies every comparator in the range grammar (0.844957ms)
  ✔ treats an unreadable range as out of range (0.267138ms)
  ✔ treats an unparseable or prerelease version as out of range (0.178716ms)
  ✔ assesses against the range declared in osq package.json (27.81431ms)
✔ OpenSpec version classification (31.854548ms)
▶ doctor peer-range warnings
  ✔ passes the validator check with a warning inside the peer range (245.369671ms)
  ✔ prints [warn] through doctorCommand and exits zero (91.927029ms)
  ✔ keeps the failing message outside the peer range (46.669077ms)
✔ doctor peer-range warnings (384.855814ms)
▶ lint peer-range warnings
  ✔ passes lint with a warning naming the version, range, and ADR 005 (101.388392ms)
  ✔ still fails lint outside the peer range (115.132022ms)
✔ lint peer-range warnings (216.966088ms)
▶ OSQ_CHANGE in a task verify through runTask
  ✔ records the change folder as the task verify output (372.112844ms)
✔ OSQ_CHANGE in a task verify through runTask (373.26578ms)
▶ OSQ_CHANGE in the change-level verify through the watcher cycle
  ✔ records the change folder for the proposal verify (416.642871ms)
✔ OSQ_CHANGE in the change-level verify through the watcher cycle (416.996053ms)
▶ OSQ_CHANGE removed from an archived check
  ✔ runs the check with no OSQ_CHANGE while the test process has it set (66.633365ms)
✔ OSQ_CHANGE removed from an archived check (67.226623ms)
▶ osq own capability sidecars
  ✔ gives every capability its group and turns requireGroups on (395.957383ms)
  ✔ documents sidecars under the Change folder section (1.266119ms)
✔ osq own capability sidecars (398.475622ms)
▶ osq own version control configuration
  ✔ enables version control with osq author and install command (350.563232ms)
  ✔ documents the walkthrough under the version control section (1.802646ms)
✔ osq own version control configuration (353.663679ms)
▶ one code ownership reader
  ✔ keeps parseCodeOwnership in its definition and its one reader (158.437176ms)
✔ one code ownership reader (160.89638ms)
▶ package hygiene
  ✔ packs only distribution assets (2659.571897ms)
  ✔ excludes source, tests, configs, workflows, and specs (2566.748015ms)
  ✔ declares required package metadata (4.500141ms)
✔ package hygiene (5233.902371ms)
▶ package manager independence
  ✔ never spawns pnpm from any test under tests/ (350.398664ms)
  ✔ never runs a build command from any test under tests/ (482.919056ms)
✔ package manager independence (834.026473ms)
▶ runtime dependency boundary
  ✔ keeps frontend tooling in the private workspace, out of installed runtime dependencies (2.913562ms)
✔ runtime dependency boundary (3.332965ms)
▶ node baseline
  ✔ aligns package metadata, CI, and guidance on Node 24 LTS (10.64518ms)
✔ node baseline (11.132285ms)
▶ packed tarball consumer smoke test
  ✔ packs and installs the local tarball into an isolated temporary project (11382.621047ms)
  ✔ npx osq init scaffolds configuration, template directories, and AGENTS.md (798.62696ms)
  ✔ npx osq new smoke creates a valid change specification (737.095267ms)
  ✔ serves the packaged dashboard on an ephemeral loopback port and shuts down cleanly (549.298894ms)
✔ packed tarball consumer smoke test (13617.830585ms)
▶ single package-root module
  ✔ resolves PACKAGE_ROOT to the package that contains package.json (4.712234ms)
  ✔ resolves TEMPLATES_ROOT to the templates directory containing PLANNER.md (1.373613ms)
  ✔ keeps the init.ts and new.ts TEMPLATES_ROOT re-exports equal to package-root (0.28862ms)
  ✔ confines new URL( with import.meta.url to package-root.ts under src/core (77.692927ms)
✔ single package-root module (85.494507ms)
▶ staged dashboard asset budget
  ✔ stages the dashboard index below the one-million-byte budget (8.927565ms)
✔ staged dashboard asset budget (10.616075ms)
▶ Spec and Task Parser
  ✔ parseFrontmatter extracts YAML metadata and markdown content (5.89088ms)
  ✔ parseSpecMd extracts title, depends_on, reads, and markdown sections (6.797384ms)
  ✔ parseSpecMd extracts proposal frontmatter without requiring features.writes (1.631122ms)
  ✔ parseTaskMd extracts task metadata and acceptance criteria list (2.440362ms)
  ✔ parseTaskMd extracts entry and skills when populated (2.732421ms)
  ✔ parseTaskMd defaults testsModify to false when omitted (0.989021ms)
  ✔ parseTaskMd reads nested tests.modify booleans (1.058773ms)
  ✔ parseTaskMd accepts a flat tests.modify boolean key (0.979201ms)
  ✔ parseTaskMd ignores non-boolean tests.modify values (1.704234ms)
  ✔ parseTaskList parses OpenSpec grouped checklists with section headers and item numbers (1.085414ms)
  ✔ parseTaskList parses flat numbered checklists and unnumbered bullets (0.250708ms)
  ✔ handles empty sections or missing frontmatter safely (0.219777ms)
✔ Spec and Task Parser (29.53419ms)
▶ Code ownership parsing
  ✔ parseCodeOwnership extracts globs from a capability delta spec (0.550097ms)
  ✔ parseCodeOwnership extracts ownership from living markdown content (0.350361ms)
  ✔ parseCodeOwnership returns an empty array when the header is absent (0.110864ms)
✔ Code ownership parsing (1.430355ms)
▶ Change folder proposal resolution
  ✔ parseSpecMdFromFolder parses proposal.md when present with fallback to spec.md (55.795809ms)
  ✔ resolveChangeDoc prefers proposal.md and reports its kind (15.227825ms)
✔ Change folder proposal resolution (72.338555ms)
▶ Rewritten OpenSpec templates
  ✔ proposal template carries proposal frontmatter and delta spec guidance (4.11483ms)
  ✔ tasks template uses the OpenSpec numbered checklist format (0.811575ms)
✔ Rewritten OpenSpec templates (5.205583ms)
▶ Pi configuration and catalog registration
  ✔ registers pi through the adapter factory with a no-op setup (45.376319ms)
✔ Pi configuration and catalog registration (46.912356ms)
▶ Pi task arguments
  ✔ builds the exact headless argv, omitting unconfigured flags (33.166729ms)
✔ Pi task arguments (33.4806ms)
▶ Pi noninteractive execution
  ✔ spawns a fresh fake Pi in the project root with a closed stdin (140.242243ms)
  ✔ stops a Pi that settles but keeps running, reporting success (273.289479ms)
  ✔ carries Pi stderr and names pi auth check when credentials are missing (92.600571ms)
✔ Pi noninteractive execution (506.933907ms)
▶ Pi preflight and diagnose hook
  ✔ warns outside the tested range and fails before spawn when credentials are not ready (140.556098ms)
  ✔ runs no auth check without a provider (69.886432ms)
  ✔ diagnoses the version and credentials without naming a harness in doctor (111.653256ms)
✔ Pi preflight and diagnose hook (322.778357ms)
▶ Pi execution attribution
  ✔ records the configured model and thinking effort in the manifest (25.324855ms)
✔ Pi execution attribution (25.543992ms)
▶ Pi configuration and resolution
  ✔ exports PiConfig and the Pi resolution helpers from the public entry point (7.898289ms)
  ✔ validates pi settings and rejects blank or non-string values naming the key (19.486569ms)
  ✔ declares pi with planner.agent unsupported (1.949345ms)
  ✔ resolves the binary from pi.bin, then OSQ_PI_PATH, then pi (2.220296ms)
  ✔ resolves the model from pi.model, then OSQ_MODEL only for a Pi executor (9.089336ms)
  ✔ resolves effort and executor identity with a default sentinel (1.698263ms)
  ✔ loadConfig merges pi and applies OSQ_MODEL only to a Pi executor (235.525777ms)
✔ Pi configuration and resolution (279.8949ms)
▶ Pi doctor diagnostics
  ✔ appends catalog diagnoses after a passing harness check (225.13283ms)
  ✔ adds no extra checks for a catalog entry without a diagnose hook (55.232685ms)
  ✔ passes the version check silently inside the tested range (119.745072ms)
  ✔ warns without failing on an untested version (86.172641ms)
  ✔ fails the auth check naming the provider and reason when credentials are not ready (108.355301ms)
  ✔ passes the auth check when the provider reports ready (167.378488ms)
  ✔ runs no auth check without a provider (93.353076ms)
✔ Pi doctor diagnostics (858.288199ms)
▶ Pi stream translation
  ✔ replays the captured fixture with one tool and one tokens event per record (36.557446ms)
  ✔ writes three tokens events whose sums match for three responses (9.299228ms)
  ✔ translates tools, file changes, and only non-empty assistant text (9.116431ms)
  ✔ tolerates U+2028 inside a string, a trailing carriage return, and malformed records (2.456517ms)
  ✔ translates both retry phases and keeps observing after a retry (3.282593ms)
  ✔ records settlement through the stream state callback (0.665571ms)
✔ Pi stream translation (63.113647ms)
▶ Pi runner outcomes through the watcher
  ✔ writes a crashed dead letter with Pi stderr on a non-zero exit (354.498135ms)
  ✔ names pi auth check when an exit reports a missing API key (381.964463ms)
  ✔ synthesizes a missing result from the last text event and still verifies (396.085038ms)
  ✔ falls to no_result without a result file or final text (415.931003ms)
  ✔ does not reach done when independent verification fails (362.974927ms)
✔ Pi runner outcomes through the watcher (1914.357928ms)
▶ osq plan and approve next step
  ✔ ends the fresh handoff line with the change next step (641.187021ms)
  ✔ prints the template next step after the approval error (516.221832ms)
  ✔ prints no next step when the change folder does not exist (20.424288ms)
✔ osq plan and approve next step (1179.787682ms)
▶ plan prompt architecture decisions
  ✔ lists accepted ADRs in number order with scope, rule, and path (33.706717ms)
  ✔ omits the section when every ADR is still proposed (4.729614ms)
  ✔ omits the section when the decisions folder is missing (3.954464ms)
  ✔ reads the configured decisions folder (9.265022ms)
✔ plan prompt architecture decisions (53.165163ms)
▶ formatRecentDisclosures
  ✔ returns null when no archived change holds a disclosure (20.679171ms)
  ✔ quotes only the configured number of newest archived changes, newest first (20.826436ms)
  ✔ orders tasks numerically and sections as deviated, missing context, outside scope (11.989501ms)
  ✔ cuts the first entry that does not fit and includes nothing after it (14.473301ms)
  ✔ never quotes Changed, Next, Touched, or result headings (2.847889ms)
  ✔ prefixes every quoted disclosure line, including one starting with # (0.866947ms)
✔ formatRecentDisclosures (73.589365ms)
▶ planning disclosure configuration
  ✔ accepts a partial disclosures block over the defaults (0.3171ms)
  ✔ rejects a value that is not a positive integer naming the key (1.401338ms)
✔ planning disclosure configuration (2.001167ms)
▶ plan prompt disclosure section
  ✔ omits the section when no archived change discloses (8.691368ms)
  ✔ appends the claim-labelled section after the repository record (5.133972ms)
  ✔ ends osq plan <name> --print output with the section (376.106786ms)
✔ plan prompt disclosure section (390.537585ms)
▶ osq plan prompt handoff
  ✔ writes a null brief, prompt file, and one-line handoff without a session (369.822398ms)
/tmp/osq-plan-handoff-BDFucK/openspec/changes/001-exact-bytes: ask your planning tool to plan change 001-exact-bytes — next: unplanned — osq plan 001
  ✔ stores the exact buildOpeningPrompt bytes in the prompt file (74.891229ms)
  ✔ print mode creates the change and brief but no prompt file, process, or record (35.628548ms)
/tmp/osq-plan-handoff-xySmaP/openspec/changes/001-shared-bytes: ask your planning tool to plan change 001-shared-bytes — next: unplanned — osq plan 001
  ✔ print mode emits the same bytes as the prompt file for a resumed change (43.950687ms)
  ✔ resumed default reuses the folder, keeps the brief, and refreshes the prompt file (58.085973ms)
  ✔ default and print handoff succeed while an unusable planner is configured (108.184981ms)
  ✔ registers --session and rejects session combined with print before mutation (32.227777ms)
✔ osq plan prompt handoff (725.165798ms)
▶ transient plan-prompt lifecycle
  ✔ lint excludes the root prompt while keeping authored diagnostics (513.142441ms)
  ✔ hashChangeFolder ignores prompt add, edit, and removal but covers authored edits (172.619427ms)
  ✔ re-approval after a prompt refresh keeps the same authored seal (255.561483ms)
  ✔ runner conflict checking proceeds when only the prompt changed (337.580276ms)
  ✔ retry integrity proceeds when only the prompt changed (138.736475ms)
  ✔ failing archive verification leaves the active prompt untouched (367.044561ms)
  ✔ successful archive removes the prompt and retains authored and runtime content (605.749335ms)
  ✔ archiving succeeds and stays idempotent when the prompt is already absent (548.738794ms)
  ✔ a delta failure during archive keeps the folder and prompt recoverable (561.191776ms)
✔ transient plan-prompt lifecycle (3503.571272ms)
▶ planning telemetry
  ▶ core planning helpers
    ✔ hashes the exact brief bytes and resolves the package version (37.593443ms)
    ✔ skips malformed lines and correlates sessions defensively (8.444911ms)
    ✔ reads a missing planning log as empty (2.855245ms)
  ✔ core planning helpers (50.113237ms)
Created spec 001: 001-telemetry-oc
  Path: /tmp/osq-plan-telemetry-VB8QRO/openspec/changes/001-telemetry-oc
  ▶ planCommand lifecycle
    ✔ appends a correlated pair with exact OpenCode usage before and after spawn (567.634001ms)
Created spec 001: 001-telemetry-exit
  Path: /tmp/osq-plan-telemetry-auL8lB/openspec/changes/001-telemetry-exit
    ✔ records a non-zero exit and preserves propagation (313.144263ms)
Created spec 001: 001-telemetry-nospawn
  Path: /tmp/osq-plan-telemetry-9bptpG/openspec/changes/001-telemetry-nospawn
    ✔ records plan_exited when the planner binary cannot spawn (46.090431ms)
Created spec 001: 001-telemetry-resume
  Path: /tmp/osq-plan-telemetry-q2u1mW/openspec/changes/001-telemetry-resume
    ✔ resumes without rewriting the brief and keeps the approved hash independent (418.818031ms)
    ✔ print mode appends no planning event (33.498635ms)
  ✔ planCommand lifecycle (1380.028129ms)
Created spec 001: 001-telemetry-agy
  Path: /tmp/osq-plan-telemetry-Hk3Odx/openspec/changes/001-telemetry-agy
  ▶ all harness identities through planCommand
    ✔ records AGY timing with all-null usage (183.754923ms)
Created spec 001: 001-telemetry-codex
  Path: /tmp/osq-plan-telemetry-qXJNpn/openspec/changes/001-telemetry-codex
    ✔ records Codex identity with rollout usage and null cost (240.749274ms)
  ✔ all harness identities through planCommand (425.782752ms)
  ▶ harness usage readers
    ✔ OpenCode selects the one row by cwd and interval and sums cache counters (85.716253ms)
    ✔ OpenCode returns all null for ambiguity, malformed data, and read failure (117.470341ms)
    ✔ Codex selects the one new rollout by session_meta cwd (78.420862ms)
    ✔ Codex returns all null for ambiguity, cwd mismatch, and missing usage (59.092155ms)
    ✔ AGY returns explicit all-null usage (0.31747ms)
  ✔ harness usage readers (341.58421ms)
✔ planning telemetry (2198.18459ms)
Created spec 001: 001-smoke
  Path: /tmp/osq-plan-test-usz9eQ/openspec/changes/001-smoke
▶ osq plan command
  ✔ creates change folder and brief.md before spawning the interactive session (331.422492ms)
  ✔ -print writes the opening prompt to stdout only and does not spawn a session (52.925452ms)
Created spec 001: 001-resume-probe
  Path: /tmp/osq-plan-test-7cLyT8/openspec/changes/001-resume-probe
  ✔ resumes an existing change with brief.md without creating a new change folder (70.530255ms)
  ✔ accepts the -print alias through the CLI without launching a harness (30.418363ms)
  ✔ builds five ordered sections with the sufficient repository record after the brief (100.166652ms)
  ✔ emits only the too-small record sentence below five measured tasks (44.607919ms)
Created spec 104: 104-record-probe
  Path: /tmp/osq-plan-test-VtXaVy/openspec/changes/104-record-probe
  ✔ uses one five-section prompt for interactive, resumed, and print planning (146.751834ms)
  ✔ emits the five-section prompt through the -print CLI alias (102.859371ms)
Created spec 104: 104-alpha
  Path: /tmp/osq-plan-test-TgNn79/openspec/changes/104-alpha
  ✔ puts the repository record in a queue-selected planning prompt (154.737179ms)
✔ osq plan command (1038.233574ms)
▶ osq plan command registration
  ✔ registers plan <name> with --brief, --print, and --session options (1.146536ms)
✔ osq plan command registration (1.615731ms)
▶ Claude per-message turns
  ✔ counts one turn per message id across a transcript and its subagent file (50.066624ms)
  ✔ gives an assistant record without a message id its own turn (4.240444ms)
  ✔ yields null usage for malformed usage and still approves with that reader (168.479342ms)
✔ Claude per-message turns (224.551575ms)
▶ Codex per-response turns
  ✔ turns each token_count response into one turn with cache-adjusted input (39.445667ms)
✔ Codex per-response turns (40.965605ms)
▶ planning measurement documentation
  ✔ README names the planning config keys, report sections, and unknown cost label (10.731602ms)
  ✔ README explains per-turn slice attribution under approval observation (5.258776ms)
  ✔ README names the per-turn token readers and their limits (6.996405ms)
  ✔ README shows the planning config block and price-table rules (3.159714ms)
  ✔ README describes the planning report sections and measures (3.584067ms)
✔ planning measurement documentation (31.488586ms)
Created spec 001: 001-integration-plan
  Path: /tmp/osq-planning-integration-MACjsp/openspec/changes/001-integration-plan
▶ planning to report integration
  ✔ records a real planning session that the report surfaces even with null usage (495.378513ms)
✔ planning to report integration (497.261913ms)
▶ approval-time observation
  ✔ appends one observed pair, preserves usage/model, and never duplicates (310.883078ms)
  ✔ records no observed pair and leaves planner null when nothing matches (130.675262ms)
  ✔ attributes the newest observed model then the newest owned model, never config (355.104855ms)
  ✔ prefers a persisted creation time and rejects edits before it (37.755547ms)
  ✔ appends deterministically without re-reading a duplicate native session (31.778866ms)
✔ approval-time observation (868.070709ms)
▶ approve command planning notice
  ✔ prints exactly one no-record notice when no observed session matches (160.592584ms)
  ✔ prints no notice when a session matches (181.362017ms)
  ✔ supplies the default readers and still approves with empty local stores (173.220741ms)
  ✔ does not write approval artifacts when lint fails (145.57229ms)
✔ approve command planning notice (661.529487ms)
▶ Claude session observation
  ✔ parses successful edits and the final cost-state without content (2.745063ms)
  ✔ returns null when no edit is present and leaves missing values null (0.211367ms)
✔ Claude session observation (5.655403ms)
▶ Codex rollout observation
  ✔ reads apply_patch headers and ignores shell text and failed calls (1.799716ms)
  ✔ adds no turn for a token_count without last_token_usage (0.256478ms)
  ✔ reads every rollout below the Codex data home and degrades a missing store (24.94199ms)
✔ Codex rollout observation (28.663332ms)
▶ path containment
  ✔ accepts nested targets and rejects sibling prefixes and escapes (0.881018ms)
  ✔ resolves relative targets from the session directory (0.301639ms)
✔ path containment (2.891695ms)
▶ findPlanningSessions
  ✔ matches inclusive window boundaries and the segment-contained folder (28.834377ms)
  ✔ rejects sibling prefixes, escapes, and out-of-folder edits (2.423176ms)
  ✔ deduplicates by harness and native id and orders deterministically (2.299307ms)
  ✔ isolates reader failures and invalid windows (1.163466ms)
✔ findPlanningSessions (35.312857ms)
▶ OpenCode observation
  ✔ builds an edit-only join projected through json_extract (0.984701ms)
  ✔ groups completed edit parts by session and message (53.106999ms)
  ✔ keeps a session model nullable (37.620464ms)
✔ OpenCode observation (94.371403ms)
▶ planning record source compatibility
  ✔ reads a legacy record without a source as owned (0.797665ms)
  ✔ parses observed records with nullable model, exit code, and usage (0.838996ms)
  ✔ writes source owned for new owned lifecycle records (14.499291ms)
✔ planning record source compatibility (17.402274ms)
▶ approval-time planning slices
  ✔ cuts one session across three changes at each approval (498.351252ms)
✔ approval-time planning slices (500.916273ms)
▶ OpenCode per-message turns
  ✔ turns each assistant message into one turn with its tokens, cost, and edits (73.326999ms)
  ✔ joins message to session and part to message (1.582095ms)
  ✔ yields null token usage for a row with malformed token fields (50.417465ms)
✔ OpenCode per-message turns (127.138211ms)
▶ findUnpricedPlanningModels
  ✔ lists sorted distinct recorded-token models with no price key (53.194495ms)
  ✔ treats a missing price map as every model unpriced (4.795332ms)
  ✔ names the exact configuration key (0.921939ms)
✔ findUnpricedPlanningModels (60.52482ms)
▶ planning price diagnostics
  ✔ adds the warning check for an archived unpriced model (19.23237ms)
  ✔ keeps the check list unchanged when every model is priced (15.845299ms)
  ✔ keeps the check list unchanged with no recorded tokens (27.93961ms)
✔ planning price diagnostics (63.785033ms)
▶ approval price gap notice
  ✔ reports the missing model from approveSpec and the CLI (276.969975ms)
  ✔ stays silent once the model is priced (273.064705ms)
✔ approval price gap notice (550.563217ms)
▶ planning reader session shape
  ✔ returns turns and no legacy fields for Claude, Codex, and OpenCode (59.603479ms)
✔ planning reader session shape (60.761505ms)
▶ planning approval lookup after archive and rejection
  ✔ splits the session with the earlier change still active (28.318082ms)
  ✔ keeps the boundary when the earlier change moves to archive (28.301191ms)
  ✔ keeps the boundary when archived under a collision suffix (12.800199ms)
  ✔ closes the earlier segment at its rejection when no slice was recorded (18.469821ms)
✔ planning approval lookup after archive and rejection (90.729222ms)
▶ planning turn attribution
  ✔ cuts three sequential changes into non-overlapping slices (25.758801ms)
  ✔ attributes every parallel turn exactly once (6.961869ms)
  ✔ gives discussion before the first edit to that change (8.615064ms)
  ✔ recognizes change folders under the changes directory or archive (6.266627ms)
  ✔ prefers a recorded slice approval over a later manifest approval (9.717046ms)
✔ planning turn attribution (59.232047ms)
▶ planning slice measures
  ✔ sums token kinds and combines the cache split (4.552754ms)
  ✔ drops gaps longer than the idle gap from active minutes (4.453909ms)
  ✔ takes the per-turn harness sum when every owned turn reported a cost (3.964836ms)
  ✔ takes the whole-session cost only when the slice holds every turn (3.85829ms)
  ✔ prices a slice only when every owned turn is priced with input and output (4.951301ms)
  ✔ reads a valid slice and leaves a malformed one absent (5.494148ms)
✔ planning slice measures (28.599306ms)
▶ pre-spawn verify configuration
  ✔ defaults the pre-spawn verify mode to warn (1.504092ms)
  ✔ retains a declared pre-spawn mode while keeping the task gate (0.155795ms)
  ✔ rejects an invalid pre-spawn mode (0.382132ms)
✔ pre-spawn verify configuration (3.313234ms)
▶ task start state parsing
  ✔ defaults an absent verify_starts to red (7.44142ms)
  ✔ reads green and any declarations (1.551749ms)
  ✔ treats an unrecognized verify_starts as red (0.541717ms)
✔ task start state parsing (9.884757ms)
▶ pre-spawn verify documentation
  ✔ README names the pre-spawn gate and its surface (10.181585ms)
  ✔ managed planner block tells planners to declare verify_starts (0.426203ms)
✔ pre-spawn verify documentation (11.782346ms)
▶ Pre-spawn verify check
  ✔ RunTaskFailureReason includes verify_precondition (92.278326ms)
  ✔ red start as expected: failing verify records mismatch false and runs to done (451.718716ms)
  ✔ a passing verify under warn records mismatch true and warns once naming the task (350.678623ms)
  ✔ declared green start with a passing verify records mismatch false (367.316978ms)
  ✔ declared green start with a failing verify records mismatch true (262.209911ms)
  ✔ an any start never mismatches (394.685334ms)
  ✔ fail mode kills before spawn with verify_precondition evidence (253.492564ms)
  ✔ off mode runs no pre-spawn verify (284.165674ms)
  ✔ a later attempt runs no pre-spawn verify (301.633058ms)
✔ Pre-spawn verify check (2761.605892ms)
▶ formatPreSpawnStart wording
  ✔ words a failing verify as a red start (0.9685ms)
  ✔ words missing named paths as a red start naming them in order (0.167385ms)
  ✔ words a passing verify as a green start (0.136944ms)
  ✔ appends the declaration on a red start declared green (0.153695ms)
  ✔ appends the declaration on a green start declared red (0.141044ms)
  ✔ appends the declaration after a missing-path red start (0.136894ms)
  ✔ never appends a declaration for an any start (0.110104ms)
✔ formatPreSpawnStart wording (3.665475ms)
▶ pre-spawn start log line
  ✔ logs a named missing test file as a red start (387.117764ms)
  ✔ logs a failing verify as a red start at info level (329.638192ms)
  ✔ logs a declared green start that passes as declared (520.621306ms)
  ✔ warns for a passing verify declared red (367.085408ms)
✔ pre-spawn start log line (1605.638305ms)
▶ One proposal format
  ✔ schema proposal template is byte-identical to the template osq new writes (14.304771ms)
  ✔ repository carries the scaffolded config and schema byte-identical (17.314326ms)
  ✔ proposal instruction names the osq sections in order without the retired ones (20.265867ms)
  ✔ managed planner block names the proposal sections (0.259038ms)
  ✔ template Surface section names the seven categories and seeds None (1.130171ms)
  ✔ repository dogfood schema declares the osq artifacts (3.702372ms)
✔ One proposal format (58.908369ms)
▶ Seeded proposal human steps
  ✔ osq new seeds ## Human steps as None without osq approve (19.591232ms)
  ✔ the unreadable-template fallback matches the seeded proposal (2.021789ms)
  ✔ the osq schema instruction says Human steps never include osq approve (33.096215ms)
✔ Seeded proposal human steps (56.572414ms)
▶ proposal surface declaration
  ▶ lintChangeFolder
    ✔ rejects a missing Surface section with the fix-it error (249.343102ms)
    ✔ rejects an empty Surface section (156.062869ms)
    ✔ rejects a comment-only Surface section (185.066231ms)
    ✔ accepts a Surface section holding None (177.337701ms)
    ✔ accepts a Surface section holding a list (149.37648ms)
    ✔ accepts the seeded comment followed by None (140.714692ms)
  ✔ lintChangeFolder (1060.202758ms)
  ▶ approveSpec
    ✔ refuses a proposal with no Surface section (136.492386ms)
    ✔ refuses a proposal with a comment-only Surface section (141.506964ms)
    ✔ approves a proposal whose Surface section says None (117.798331ms)
    ✔ approves a proposal whose Surface section lists names (124.609244ms)
    ✔ lints and approves a fresh createNewSpec proposal (367.76722ms)
  ✔ approveSpec (890.625492ms)
✔ proposal surface declaration (1951.466043ms)
▶ proposal writes schema
  ✔ osq lint rejects a proposal declaring features.writes (401.791082ms)
  ✔ osq lint passes when features.writes is absent and deltas exist in specs/ (184.073402ms)
  ✔ derives written capabilities from delta specs for show and the manifest (26.186135ms)
  ✔ osq migrate openspec strips features.writes and removes redundant spec.md idempotently (31.514068ms)
✔ proposal writes schema (647.934548ms)
▶ queue planning usage aggregate
  ✔ counts valid starts across active, archived, and rejected attempts, including retired slugs (92.744108ms)
  ✔ reports complete coverage when every start has one finite-cost exit, zero included (16.264698ms)
  ✔ treats missing, null-cost, duplicate, and orphan exits as incomplete (18.748534ms)
  ✔ derives complete zero coverage when there are no prior sessions (7.942411ms)
✔ queue planning usage aggregate (139.562896ms)
▶ queue budget evaluation
  ✔ requires both ceilings for the spend gates (4.384658ms)
  ✔ refuses only when one more session would exceed the maximum (1.711673ms)
  ✔ refuses every launch under a zero session limit (0.976241ms)
  ✔ enforces the cost ceiling only with complete coverage and at or above the maximum (1.100444ms)
  ✔ ignores only the cost ceiling with incomplete coverage and notes it (0.935229ms)
  ✔ keeps enforcing the session ceiling with incomplete coverage (1.026422ms)
✔ queue budget evaluation (11.098639ms)
▶ prepareQueuePlan budget gate
  ✔ refuses before returning a selection when the budget is required but absent (9.274828ms)
  ✔ returns a notice and a selection when cost coverage is incomplete (32.673306ms)
✔ prepareQueuePlan budget gate (42.440599ms)
▶ queue modes without a queue config block
  ✔ keeps osq queue working without queue ceilings (281.425393ms)
✔ queue modes without a queue config block (282.197672ms)
▶ planCommand budget refusals
  ✔ refuses a non-print next plan without queue ceilings before any mutation (18.614654ms)
  ✔ lets print mode bypass the spend gates without a queue block (35.955332ms)
  ✔ allows a launch exactly at the session boundary (52.790552ms)
  ✔ refuses before folder creation when one more session would exceed the maximum (34.19402ms)
  ✔ refuses under a zero session limit and with a reached cost ceiling (41.642064ms)
Created spec 091: 091-alpha
  Path: /tmp/osq-queue-budget-jNYPsI/openspec/changes/091-alpha
  ✔ prints one note and proceeds when coverage is incomplete, still enforcing sessions (27.243332ms)
✔ planCommand budget refusals (211.28573ms)
▶ queue brief and prompt seeding
  ✔ writes only the item body plus planner, date, and queue metadata (25.037683ms)
  ✔ identifies landed dependency archive paths in the change context only when supplied (18.469657ms)
✔ queue brief and prompt seeding (47.257038ms)
▶ createNewSpec queue seeding
  ✔ uses an explicit slug, title, and numeric dependency ids while keeping the body (14.629164ms)
  ✔ numbers across active, archived, and rejected folders (13.72567ms)
✔ createNewSpec queue seeding (28.81288ms)
▶ queue next-item preparation
  ✔ selects the first unplanned item with landed dependencies and records archive paths (24.480411ms)
  ✔ skips active items and waits until a dependency lands (92.744239ms)
  ✔ refuses when every item is landed or active (25.310904ms)
✔ queue next-item preparation (154.248633ms)
▶ queue active failure gate
  ✔ halts before mutation on every dead, regressed, and change-level target (39.747938ms)
  ✔ treats attempt-suffixed history as inactive (17.758909ms)
✔ queue active failure gate (58.079665ms)
▶ queue rejection gate
  ✔ refuses a rejected first eligible item without replan and preserves history (44.992971ms)
  ✔ replans through the real command into one active attempt without touching rejected history (53.363462ms)
✔ queue rejection gate (98.782297ms)
▶ plan command modes
  ✔ registers the plan command with --next, --replan, and --session (4.907565ms)
  ✔ rejects missing and conflicting modes before any file is written (1.813377ms)
  ✔ plan --next --print creates the change and prints its prompt without spawning (9.905802ms)
  ✔ default plan --next hands off the prompt file and marks exactly one item planned (265.041596ms)
  ✔ rejects session combined with print before any mutation (9.11099ms)
✔ plan command modes (291.416925ms)
▶ brief queue planning through the real CLI and mock harness
  ✔ plans one item per invocation, halts on a dead task, retries, and lands all three (14651.766024ms)
✔ brief queue planning through the real CLI and mock harness (14653.567613ms)
▶ queue parser
  ✔ parses ordered items with earlier dependencies, bodies, and raw-section hashes (17.913189ms)
  ✔ accepts nothing and comma-separated earlier slugs with surrounding whitespace (8.965672ms)
  ✔ permits ordinary deeper headings inside a brief body (1.730854ms)
  ✔ rejects malformed headings, invalid slugs, empty titles, and duplicate slugs (7.695983ms)
  ✔ rejects missing, malformed, empty, and duplicate dependency lines (1.396414ms)
  ✔ rejects empty bodies (1.711164ms)
  ✔ rejects self, forward, and unknown dependencies with item context (1.412409ms)
  ✔ fails for a missing queue file with the queue path (1.994992ms)
✔ queue parser (44.625784ms)
▶ queue projection
  ✔ derives state precedence, selected change ids, and rejection counts (89.772035ms)
  ✔ retains rejected counts on a replanned active item and never lands done-but-unarchived (53.752482ms)
  ✔ derives unmet queue dependencies from landed associations only (29.908682ms)
  ✔ does not let a rejected dependency land an item (9.466135ms)
  ✔ annotates changed since planned from the selected association hash (24.147681ms)
  ✔ associates only through brief queue_item metadata, not folder names (16.386027ms)
  ✔ ignores malformed unrelated folders without hiding valid queue items (13.472975ms)
  ✔ reports ambiguous multiple active associations instead of choosing silently (7.19693ms)
  ✔ reports ambiguous multiple archived associations (7.094813ms)
  ✔ prefers an archived association over active and rejected ones (19.073094ms)
  ✔ derives state afresh on every call with no cache between projections (17.727583ms)
  ✔ formats every projected row deterministically (0.964472ms)
✔ queue projection (290.141151ms)
▶ osq queue CLI
  ✔ registers the queue command in the commander program (3.793685ms)
  ✔ prints the projection through createProgram without changing queue bytes or metadata (43.221553ms)
  ✔ prints identical output on repeated invocations (10.390251ms)
✔ osq queue CLI (57.885709ms)
▶ README landing walkthrough
  ✔ ends the version control section with a walkthrough that lands only through osq land (14.848188ms)
✔ README landing walkthrough (16.058666ms)
▶ archive-time verify_path_missing regressed event
  ✔ carries missingPaths and no differingPaths on the regressed event (427.593991ms)
✔ archive-time verify_path_missing regressed event (428.871536ms)
▶ regressed status formatting
  ✔ formats a regressed task with the regressed indicator and label (0.811066ms)
  ✔ formats an active spec overview with a regressed indicator (0.790994ms)
  ✔ formats a regressed task outcome line with the fallback word (0.275009ms)
  ✔ formats a regressed task outcome line with the unicode failure symbol (0.168066ms)
✔ regressed status formatting (3.301734ms)
▶ regressed marker and event writers
  ✔ writes a regressed marker under .run/regressed (53.193409ms)
  ✔ writes a change-level regressed marker for the change target (9.581436ms)
  ✔ appends a typed regressed event to the task event stream (6.573427ms)
  ✔ lets event data override the default task and appends without clobbering (5.549845ms)
✔ regressed marker and event writers (75.868714ms)
▶ rejection under version control
  ✔ removes a clean worktree after committing the rejection (514.531866ms)
  ✔ keeps a worktree whose changes lie outside the rejected change (433.049137ms)
  ✔ never recreates the worktree of a rejected change (582.664982ms)
  ✔ withdraws a halted stacked approval without moving the checkout copy (635.098385ms)
  ✔ refuses a healthy stacked approval and leaves it in place (748.083873ms)
✔ rejection under version control (2915.609229ms)
▶ osq reject output with version control
  ✔ prints the removed worktree, the kept branch, and no destination (605.806634ms)
  ✔ prints the kept worktree and why (494.616839ms)
  ✔ prints the withdrawn stacked approval instead of a destination (688.664653ms)
  ✔ prints the destination unchanged when vcs is off (133.368157ms)
✔ osq reject output with version control (1923.67464ms)
▶ explicit rejection transition
  ✔ refuses an empty or whitespace-only reason without moving the folder (72.659264ms)
  ✔ rejects an unapproved active change into the canonical rejected directory (50.320672ms)
  ✔ rejects an approved change with an active dead marker (170.990381ms)
  ✔ rejects an approved change with an active regressed task marker (220.391108ms)
  ✔ rejects an approved change with a change-level regression (185.21915ms)
  ✔ refuses a healthy approved change and leaves it in place (164.138436ms)
  ✔ refuses an approved completed change (178.971032ms)
  ✔ refuses a running task even when a dead marker would win state precedence (210.180569ms)
  ✔ refuses a historical suffixed failure marker as not active (275.133921ms)
  ✔ refuses an archived change (104.638921ms)
  ✔ refuses an already rejected change (41.713391ms)
  ✔ refuses a missing change (49.499982ms)
  ✔ refuses a destination collision without moving or overwriting (40.135528ms)
  ✔ moves the complete record intact and appends one matching rejection event (235.316721ms)
✔ explicit rejection transition (2002.358017ms)
▶ Relative verify output
  ✔ records a failing verify and its dead marker with project-relative paths (392.68067ms)
✔ Relative verify output (400.634934ms)
▶ Relative archive path
  ✔ records the archived event archivePath relative to the project root (421.479657ms)
✔ Relative archive path (422.213394ms)
▶ release workflow
  ✔ triggers on v* tag push events (0.890217ms)
  ✔ installs with a frozen lockfile and runs the verification gate (0.230535ms)
  ✔ runs the consumer pack smoke test suite through pnpm test (0.365453ms)
  ✔ verifies tag version parity with package.json before publishing (0.31707ms)
  ✔ publishes with provenance and public access using OIDC permissions (0.230565ms)
  ✔ contains no static npm token secrets or npmrc authentication (0.144659ms)
  ✔ sets up the runner with checkout, pnpm, and Node 24 (0.261667ms)
✔ release workflow (3.729431ms)
▶ pnpm setup version delegation
  ✔ pins an exact pnpm version through packageManager in package.json (0.343343ms)
  ✔ uses pnpm/action-setup@v4 without with.version in release.yml (0.343343ms)
  ✔ uses pnpm/action-setup@v4 without with.version in ci.yml (0.30962ms)
✔ pnpm setup version delegation (1.479045ms)
▶ report approval flag outcomes
  ✔ counts fired and later-troubled changes per flag and mode, skipping unrecorded folders (201.73109ms)
  ✔ treats only a task dead or a task or change regressed event as trouble (12.337857ms)
  ✔ never recomputes flags: a folder without a recorded field contributes nothing (50.823317ms)
  ✔ renders the section after planning and emits the field in stable JSON (31.856376ms)
✔ report approval flag outcomes (299.766653ms)
▶ report automatic and human recertifications
  ✔ counts a passed automatic recertification apart from a human one in history, text, and JSON (118.069171ms)
  ✔ keeps an automatic recertification out of the human counter and vice versa (23.714127ms)
✔ report automatic and human recertifications (144.038014ms)
▶ report with no scope regression history
  ✔ exposes all six scope regression counters as zero in history, text, and JSON (24.980787ms)
✔ report with no scope regression history (26.138993ms)
▶ report blocked deaths
  ✔ counts a blocked dead event by reason in history, text, and JSON (30.154971ms)
✔ report blocked deaths (30.444419ms)
▶ report cost metrics
  ▶ fixture/report
    ✔ sums cost reported in event data per spec and in total under history (194.355875ms)
    ✔ identifies harness-reported provenance and attempt coverage (82.470644ms)
    ✔ formats the total as a currency string (113.188104ms)
    ✔ exposes total, perSpec, formattedTotal, provenance, and coverage on CostHistory (49.589914ms)
    ✔ prints the harness-reported cost line with attempt coverage (73.088344ms)
  ✔ fixture/report (514.113432ms)
  ▶ cost formatting
    ✔ uses four decimals for amounts below one cent (14.230205ms)
    ✔ counts an attempt at most once even when several events report cost (8.196579ms)
  ✔ cost formatting (22.828901ms)
  ▶ cost-free project
    ✔ reports zero cost and zero coverage without estimating (12.241915ms)
  ✔ cost-free project (12.626065ms)
  ▶ README
    ✔ notes that reported cost reflects the harness price table rather than the invoice (1.123933ms)
  ✔ README (1.276332ms)
✔ report cost metrics (551.624835ms)
▶ report event coverage
  ▶ fixture/report
    ✔ lists tasks with and without event files grouped by change (156.170131ms)
  ✔ fixture/report (157.39056ms)
  ▶ mixed coverage
    ✔ accounts for every task and sorts task numbers per change (34.071522ms)
    ✔ treats an existing empty event file as covered (17.377025ms)
    ✔ treats a missing event file as uncovered (21.616614ms)
  ✔ mixed coverage (74.008147ms)
✔ report event coverage (234.60308ms)
▶ report cycle metrics
  ▶ fixture/report
    ✔ emits one sorted row per archived change with nullable phases (166.790273ms)
    ✔ aggregates each phase over only its covered changes (64.761881ms)
    ✔ prints only aggregate phase lines with the coverage phrase (78.976648ms)
  ✔ fixture/report (311.692577ms)
  ▶ phase derivation
    ✔ derives a complete lifecycle and its total in seconds (15.598076ms)
    ✔ keeps missing, invalid, and reversed endpoints null (26.225857ms)
    ✔ excludes active changes from cycle rows (11.510898ms)
    ✔ uses only numeric task streams for first start and excludes change.jsonl spans (5.857938ms)
  ✔ phase derivation (60.828185ms)
  ▶ JSON contract
    ✔ exposes cycle phases and rows on the MetricsReport object (61.899286ms)
  ✔ JSON contract (62.241148ms)
✔ report cycle metrics (443.959888ms)
▶ report failure breakdown
  ▶ fixture/report
    ✔ retains the historical crashed failure of a retried task while reporting zero current dead tasks (204.630288ms)
    ✔ formats the historical dead reasons per reason (111.471609ms)
  ✔ fixture/report (318.777723ms)
  ▶ event history
    ✔ counts every dead event in history grouped by reason (31.386186ms)
    ✔ retains dead events for tasks that are later retried and completed (19.025075ms)
    ✔ defaults a dead event without a reason to unknown (26.890445ms)
  ✔ event history (77.859932ms)
  ▶ marker independence
    ✔ counts dead markers in current state without inventing history (55.000587ms)
    ✔ ignores dead markers even when some tasks have dead events (27.646168ms)
  ✔ marker independence (83.835902ms)
  ▶ formatting
    ✔ prints (none) when there are no dead events (12.832578ms)
  ✔ formatting (13.257185ms)
✔ report failure breakdown (495.972597ms)
▶ report file change metrics
  ▶ fixture/report
    ✔ counts edit and write tool events and deduplicates their paths (166.965028ms)
    ✔ stores edit and write tool events with duplicate paths in the 009 event stream (1.309108ms)
  ✔ fixture/report (169.327744ms)
  ▶ path extraction and normalization
    ✔ extracts paths from summary, path, filePath, and file and normalizes them (25.79073ms)
    ✔ is case-insensitive on the tool name and ignores non edit/write tools (20.040121ms)
    ✔ counts edit and write events without a usable path in the change total only (7.080267ms)
    ✔ deduplicates the same normalized path across all specs (17.497984ms)
    ✔ retains legacy file_changed events and normalizes their paths (16.314118ms)
  ✔ path extraction and normalization (87.574084ms)
✔ report file change metrics (257.54134ms)
▶ report execution history
  ✔ counts every started event as an attempt and lists tasks with multiple attempts (80.696139ms)
  ✔ identifies started events with no intervening dead or regressed event (46.023737ms)
  ✔ groups dead events by reason and treats an absent reason as unknown (28.618763ms)
  ✔ records ordered verify exit codes and counts missing exit codes (21.254111ms)
  ✔ attributes cost to attempts and counts an attempt at most once (19.512853ms)
  ✔ does not associate cost with an attempt when no started event precedes it (22.109486ms)
  ✔ ignores change.jsonl for task attempts and coverage (23.214393ms)
  ✔ parses malformed lines defensively (31.057038ms)
✔ report execution history (274.576404ms)
▶ osq report Inbox waiting section
  ✔ prints the section and the JSON key when the fixture log exists (262.32137ms)
  ✔ limits the section to the --since period (95.952864ms)
  ✔ leaves the report unchanged without a wait log (152.229812ms)
  ✔ rejects a period bound that Date.parse cannot read (1.521298ms)
  ✔ registers --json, --since, and --until on report (4.095574ms)
✔ osq report Inbox waiting section (517.83587ms)
▶ collectInboxWait
  ✔ returns null when there is no wait log (23.585488ms)
  ✔ folds the fixture log into each kind's waits and unseen markers (37.839259ms)
  ✔ measures the fixture idle union and the card-session counts (4.282196ms)
  ✔ rounds the median of an even count of approval waits (7.205284ms)
  ✔ unions two overlapping idle intervals across sessions (5.285476ms)
  ✔ measures nothing when the period starts after every record (3.948285ms)
✔ collectInboxWait (83.940364ms)
▶ formatInboxWait
  ✔ prints the fixture section lines in order (5.34045ms)
  ✔ says not measured on every line for an empty period (3.227408ms)
  ✔ prints a midnight bound as a date and another as its ISO string (4.199926ms)
✔ formatInboxWait (14.696098ms)
▶ serializeSortedJson
  ✔ recursively sorts object keys and preserves array order (0.979713ms)
  ✔ is deterministic across repeated calls (0.206943ms)
  ✔ passes through primitives and null unchanged (0.245076ms)
✔ serializeSortedJson (2.757447ms)
▶ report --json
  ✔ emits a single valid JSON document with the stable MetricsReport keys (136.681912ms)
  ✔ orders the emitted top-level keys alphabetically in the raw text (74.214271ms)
  ✔ matches the checked-in fixture byte for byte through the real report command (88.043631ms)
  ✔ matches the structured MetricsReport shape without compatibility aliases (52.62139ms)
  ✔ keeps the non-JSON path rendering the formatted report (49.795816ms)
✔ report --json (402.247597ms)
▶ formatMetricsReport
  ✔ renders exclusively from the values held by the MetricsReport object (0.61582ms)
  ✔ always renders the historical cost line, including at zero (0.358524ms)
✔ formatMetricsReport (1.194697ms)
▶ osq report CLI flag
  ✔ registers --json so commander parses it to options.json (2.800821ms)
✔ osq report CLI flag (2.892867ms)
▶ report current state
  ✔ derives all nine task counts from markers and separates manual from verified (170.911646ms)
  ✔ always includes zero-valued verified and manual counts in JSON and text (46.978261ms)
  ✔ keeps a historical dead event out of current dead when the marker is done (31.898986ms)
  ✔ does not treat a done event as a current completion (40.043773ms)
✔ report current state (291.865831ms)
▶ report planning economics
  ▶ sliced and legacy records with measures
    ✔ sums slices, falls back to legacy usage, and derives spec economics (109.886758ms)
  ✔ sliced and legacy records with measures (110.924044ms)
  ▶ comparison totals
    ✔ compares planning and executor tokens and costs (16.807612ms)
    ✔ reads not reported when sessions report tokens but no cost (9.360549ms)
    ✔ keeps a reported zero cost distinct from an unreported one (6.651009ms)
  ✔ comparison totals (33.561262ms)
  ▶ spec word ratio
    ✔ is null when changed lines are zero or unknown (23.971113ms)
    ✔ sums only the last end changed lines of each task (18.331378ms)
  ✔ spec word ratio (42.930742ms)
  ▶ report --json
    ✔ emits byChange and comparison through the stable metrics (13.025641ms)
  ✔ report --json (13.336841ms)
✔ report planning economics (201.507127ms)
▶ report planning unreported tokens
  ✔ reports null and not reported when no session reported any token kind (71.478726ms)
  ✔ reports a number only for the token kind a session did report (10.712292ms)
✔ report planning unreported tokens (84.801209ms)
▶ report planning metrics
  ▶ fixture/report
    ✔ aggregates correlated sessions across active and archived changes (171.239884ms)
    ✔ renders the planning totals and the exact coverage phrase in text (87.440119ms)
  ✔ fixture/report (259.932294ms)
  ▶ aggregation rules
    ✔ counts every valid start once, sums matched exits, and never estimates nulls (7.969774ms)
    ✔ treats missing, empty, and malformed logs as zero without throwing (6.287ms)
  ✔ aggregation rules (14.785088ms)
  ▶ mixed sources
    ✔ treats observed, explicit owned, and source-less legacy starts identically (14.092807ms)
    ✔ counts each covered change once and excludes exit-only and malformed lines (33.182017ms)
  ✔ mixed sources (47.710643ms)
  ▶ reportCommand JSON
    ✔ exposes the planning block deterministically through the report command (69.32997ms)
  ✔ reportCommand JSON (69.662122ms)
✔ report planning metrics (392.831404ms)
▶ report pre-spawn start outcomes
  ✔ counts missing-path runs and runs and passes by declared start across task streams (99.682426ms)
  ✔ reports a recorded verify_starts_conflict change under that approval flag (33.218915ms)
✔ report pre-spawn start outcomes (134.708218ms)
▶ report pre-spawn verify history
  ✔ counts pre-spawn runs and mismatches apart from verification runs (84.525895ms)
✔ report pre-spawn verify history (85.805297ms)
▶ queue report view
  ✔ returns an unconfigured empty queue view and leaves existing aggregates unchanged (77.569751ms)
  ✔ fails a malformed configured queue with its actionable parse error (14.921761ms)
  ✔ projects ordered item rows with state, drift, rejections, and elapsed time (70.231574ms)
  ✔ uses the earliest plan start across attempts and nulls missing or reversed endpoints (57.622659ms)
  ✔ reads active dead, regressed, and change-level failure reasons, defaulting to unavailable (64.311637ms)
  ✔ counts queue planning sessions and finite cost across rejected attempts only for the queue block (23.980622ms)
  ✔ reports complete queue cost coverage when every counted session records finite cost (46.38109ms)
  ✔ renders a concise Queue section and deterministic stable JSON (107.656933ms)
  ✔ renders an unconfigured Queue section for a repository without a queue (16.935186ms)
  ✔ keeps the checked-in report fixture unconfigured without a queue file (205.934513ms)
✔ queue report view (687.890008ms)
▶ brief to approval from manifest creation
  ✔ measures from a marked creation time to a trusted approval (56.130849ms)
  ✔ is null without the creation marker (15.764533ms)
  ✔ is null when the approval is untrusted without .run/approved (13.610108ms)
  ✔ prints not reported for a phase with no covered archived change (8.881662ms)
✔ brief to approval from manifest creation (97.007655ms)
▶ scope size from the last end measure
  ✔ counts the files a task created in buckets, largest pass, and record (14.059956ms)
  ✔ falls back to the start scopeFiles without an end event (12.54589ms)
  ✔ prints first-attempt passes as a count over measured tasks (38.990276ms)
✔ scope size from the last end measure (66.549022ms)
▶ report rework, disclosures, and planning estimates
  ✔ derives rework without rejected fixers and counts it as flag trouble (89.181466ms)
  ✔ counts real disclosures and estimates only priced sliced sessions (35.789449ms)
  ✔ prints empty sections honestly when nothing reworked or disclosed (9.838955ms)
✔ report rework, disclosures, and planning estimates (136.253563ms)
▶ osq report rejection history
  ✔ counts each rejected folder once only when a valid rejected event exists (122.674424ms)
  ✔ groups a missing or empty planner value as unknown (22.817502ms)
  ✔ excludes rejected artifacts from every non-rejection aggregate (14.843673ms)
  ✔ renders rejection totals and planner-model counts in the History text section (23.433505ms)
  ✔ exposes history.rejections through the JSON report command (24.219982ms)
✔ osq report rejection history (210.403803ms)
▶ report retry history
  ✔ splits automatic and manual retries, tracks done and cost, and counts stuck events (132.240808ms)
  ✔ reports zero counts and not reported costs when no stream holds a retry (8.741678ms)
✔ report retry history (142.224947ms)
▶ report scope-regression history
  ✔ always exposes the five counters as integers even when no scope events exist (58.453091ms)
  ✔ counts detection only for typed scope regressions and classifies finite exit codes (14.064999ms)
  ✔ classifies only exact recertification outcomes without guessing malformed ones (9.685927ms)
  ✔ aggregates active and archived numbered streams only, never markers, results, or rejected folders (20.93117ms)
  ✔ does not add attempts, unexplained reruns, dead reasons, or cost coverage (19.07249ms)
  ✔ leaves current-state regression counts to markers alone (9.727178ms)
  ✔ renders the history block in text and the counters in stable JSON (26.384496ms)
✔ report scope-regression history (160.716795ms)
▶ report sidecar coverage
  ✔ counts living capabilities with and without a sidecar in name order (55.474859ms)
  ✔ omits coverage.capabilities when the project has no living capability spec (4.724625ms)
✔ report sidecar coverage (61.701541ms)
▶ report sizes over the checked-in fixture
  ✔ exposes ordered legacy scope buckets and an empty resolver-2 series (102.282075ms)
  ✔ orders the scope series legacy first then resolver-2 (32.447979ms)
  ✔ selects the largest first-attempt pass within the legacy series (33.157443ms)
  ✔ emits labeled size tables, the boundary, and exactly one near-limit hint line (61.725851ms)
  ✔ omits the hint when the largest pass is not near a limit (51.147654ms)
  ✔ renders stable JSON with ordered scope series and acceptance buckets (45.502765ms)
  ✔ is deterministic across repeated derivations (100.313359ms)
✔ report sizes over the checked-in fixture (428.687416ms)
▶ measured task projection
  ✔ ignores tasks without a valid start measure and results files (25.996172ms)
  ✔ uses the first valid start measure and counts started attempts (20.323026ms)
  ✔ treats only a typed done before the next outcome as a first-attempt pass (14.805893ms)
  ✔ discards reversed and incomplete measure pairs for duration (7.364305ms)
  ✔ preserves pre-existing report fields and the queue view (75.783232ms)
✔ measured task projection (145.045109ms)
▶ repository record derivation
  ✔ derives aggregates and dead outcomes from the checked-in fixture (24.71792ms)
  ✔ inspects only the 20 highest numeric archived changes (152.537698ms)
  ✔ uses resolver-2 scope evidence for the record when the window has any (16.561514ms)
  ✔ labels the legacy fallback when no resolver-2 evidence exists (41.40352ms)
  ✔ derives no largest pass when every measured task has a malformed resolver (32.689744ms)
  ✔ truncates dead outcomes to ten in change, task, event order (158.904017ms)
  ✔ never reads results files when deriving the record (42.580856ms)
✔ repository record derivation (470.241692ms)
▶ formatRepositoryRecordBody
  ✔ prints the four labeled groups for a sufficient record (0.223504ms)
  ✔ prints only the too-small sentence below five measured tasks (0.109817ms)
✔ formatRepositoryRecordBody (0.455729ms)
▶ mixed resolver generations
  ✔ keeps legacy and resolver-2 scope buckets and largest passes separate (41.432029ms)
  ✔ aggregates acceptance sizes across generations in one combined series (66.001441ms)
  ✔ labels both series, marks the boundary, and hints from resolver-2 only (111.939467ms)
✔ mixed resolver generations (219.798814ms)
▶ report task states
  ▶ fixture/report
    ✔ contains archived specs 008, 009, and 010 with the expected event shapes (28.110019ms)
    ✔ reports 17 total tasks with current state derived from markers (189.473278ms)
  ✔ fixture/report (219.246654ms)
  ▶ active specs
    ✔ tallies task states from deriveSpecState (38.286421ms)
  ✔ active specs (38.656694ms)
  ▶ archived specs
    ✔ derives current state from markers, not terminal events (50.118667ms)
    ✔ derives archived task status from done and dead markers (39.35584ms)
    ✔ reports archived tasks with no markers as unmarked (21.26531ms)
    ✔ does not count a done event as a current completion (19.311866ms)
  ✔ archived specs (132.82382ms)
✔ report task states (391.475767ms)
▶ report token metrics
  ▶ fixture/report
    ✔ sums neutral token categories and cache share across all specs (157.563362ms)
    ✔ exposes only the canonical neutral TokenMetrics fields (92.86147ms)
    ✔ formats the neutral token labels with the cache share percentage (56.643778ms)
  ✔ fixture/report (309.474818ms)
  ▶ event mapping
    ✔ maps opencode cache.read to cached_input and reasoning to reasoning (15.126801ms)
    ✔ maps Antigravity usage fields to neutral categories (15.564853ms)
    ✔ derives the total from the neutral categories when no total is reported (6.097672ms)
    ✔ derives the remaining cached input only when no cache field is reported (23.119092ms)
    ✔ prefers reported cached tokens over the remainder when a cache field exists (13.587296ms)
    ✔ uses real-world opencode counts where reasoning is not counted as cache (18.013168ms)
    ✔ defaults cache share percent to zero when there is no input at all (9.046829ms)
  ✔ event mapping (101.677593ms)
  ▶ adapter token extraction
    ✔ extracts opencode reasoning tokens from reasoning or reasoningTokens (0.376024ms)
    ✔ extracts agy reasoning tokens from thinking_tokens or reasoning_tokens (0.225164ms)
    ✔ emits reasoningTokens on opencode tokens events (3.814135ms)
    ✔ emits reasoningTokens on agy tokens events (2.63801ms)
  ✔ adapter token extraction (7.447961ms)
✔ report token metrics (419.422ms)
▶ report unmarked tasks and unreported costs
  ✔ counts archived markerless tasks as unmarked beside an active pending task (154.083722ms)
  ✔ labels costs no attempt or session reported as not reported in JSON and text (31.641662ms)
  ✔ keeps the reported sum when one attempt among several reports cost (53.160102ms)
✔ report unmarked tasks and unreported costs (240.215232ms)
▶ report after-landing verification counts
  ✔ counts mixed outcomes and carries the same counts in text and JSON (187.930827ms)
  ✔ prints no line and no JSON key when no archived change requires verification (24.176717ms)
✔ report after-landing verification counts (213.418309ms)
▶ osq report
  ✔ getMetricsReport aggregates spec and task counts across active and archived directories (123.400405ms)
  ✔ getMetricsReport calculates completion rate and current dead tasks from markers (49.774679ms)
  ✔ getMetricsReport aggregates event durations, token usage, and file changes (52.457743ms)
  ✔ reportCommand prints formatted terminal report and supports raw JSON output (52.690459ms)
  ✔ aggregates undeclared_test_change in the historical failure breakdown for text and JSON output (49.647791ms)
  ✔ CLI registers report command in commander program (12.166416ms)
✔ osq report (341.935249ms)
▶ Result file sections: None however written
  ✔ matches headings regardless of case, hashes, spaces, and a trailing colon (1.074133ms)
  ✔ reads Blocked text and treats a None section as absent without a disclosure (0.357704ms)
  ✔ treats None written as a bullet or in bold as absent (0.182261ms)
  ✔ treats None followed straight away by an explanation as absent (0.170421ms)
  ✔ keeps a sentence that starts with None as content (0.187292ms)
✔ Result file sections: None however written (3.216307ms)
▶ readChangeDisclosures keeps multi-line None sections
  ✔ reads a section with more than one non-blank line as a disclosure (20.843405ms)
✔ readChangeDisclosures keeps multi-line None sections (21.85008ms)
▶ Blocked says None as a bullet
  ✔ lets the task verify, finish done, and archive (460.135695ms)
✔ Blocked says None as a bullet (460.515479ms)
▶ parseResultSections
  ✔ matches headings regardless of case, hashes, spaces, and a trailing colon (1.337551ms)
  ✔ treats a None section, in any case with an optional period, as absent (0.262867ms)
  ✔ reads a Touched heading and its body (0.15462ms)
  ✔ ignores unknown headings and stops the preceding section at them (0.991464ms)
  ✔ returns every section null for empty content (0.739988ms)
✔ parseResultSections (4.610097ms)
▶ readChangeDisclosures
  ✔ reads every numbered result file in numeric order (41.813248ms)
  ✔ ignores a task whose only sections are None and a missing results folder (4.142468ms)
✔ readChangeDisclosures (46.509566ms)
▶ retry attempt numbering
  ✔ records attempt 1 on an initial execution (413.596834ms)
  ✔ matches the preceding retry attempt and carries the failure reason (303.947653ms)
✔ retry attempt numbering (719.837684ms)
▶ automatic retry transition
  ✔ records automatic true when the watcher asks for the retry (305.203073ms)
  ✔ omits the automatic key when a human retries (150.236634ms)
  ✔ refuses an automatic retry when the approval hash no longer matches (115.044196ms)
  ✔ refuses an automatic retry while the task holds a running lock (222.785458ms)
  ✔ never marks a recertification event automatic (177.504813ms)
✔ automatic retry transition (972.790444ms)
▶ retry prior output
  ✔ renders the retained marker body, ANSI-stripped, after a manual retry (263.552428ms)
  ✔ renders the retained marker body after an automatic retry (155.379516ms)
  ✔ bounds a large retained body at the existing prior-context limit (114.034452ms)
✔ retry prior output (534.324403ms)
▶ scope regression recertification
  ✔ passing recertification refreshes canonical done and records outcome passed (364.736402ms)
  ✔ never replaces original_scope_hash across repeated passing recertifications (238.821253ms)
  ✔ requeues on failing recertification with the failed output and next attempt (223.771701ms)
  ✔ requeues with the timeout result when recertification exceeds the configured timeout (1174.682632ms)
  ✔ preserves the established retry transition for a dead task without verification (157.449599ms)
  ✔ preserves the established retry transition for a non-scope regression (195.101989ms)
  ✔ falls back to the preserving transition when no automated done marker exists (210.206721ms)
  ✔ refuses a malformed done marker as a recertification target (196.101832ms)
  ✔ uses the shared target-wide ordinal when a recertification requeues (276.87681ms)
  ✔ renders the failed recertification output in every textual prompt after restart (230.345396ms)
  ✔ passes the requeued failure context into the next agent spawn (368.74138ms)
  ✔ reports recertification and requeue distinctly through the CLI (249.088627ms)
✔ scope regression recertification (3888.580223ms)
▶ retry through the real watcher CLI with the mock harness
  ✔ dies once, retries without deleting diagnostics, then lands and archives (2957.037094ms)
✔ retry through the real watcher CLI with the mock harness (2959.176406ms)
▶ explicit retry transition
  ✔ registers the retry command with id and target arguments (203.030296ms)
  ✔ renames an active dead marker to the next ordinal and records the retry (171.060417ms)
  ✔ counts retained dead and regressed history in one shared ordinal (123.943222ms)
  ✔ retains a task regression done marker so the task derives pending (136.84323ms)
  ✔ retries a change-level regression into history and makes archiving eligible (157.564132ms)
  ✔ preserves both active failure kinds under one ordinal with regression reason (124.151148ms)
  ✔ refuses a running target without mutating markers or events (144.83617ms)
  ✔ refuses a missing approval and names osq approve without mutation (165.876318ms)
  ✔ refuses a mismatched approval hash and names osq approve without mutation (127.398161ms)
  ✔ refuses a target with no active failure (118.968842ms)
  ✔ refuses a change target without a change-level regression (122.315208ms)
  ✔ refuses any non-numeric non-change target (141.49306ms)
✔ explicit retry transition (1741.490283ms)
▶ project rules block
  ✔ renders the canonical block for two system-wide ADRs in number order (51.338905ms)
  ✔ renders no block without an accepted system-wide ADR (9.207509ms)
  ✔ writes the block directly before the managed block and stays idempotent (22.720116ms)
  ✔ drops a superseded line and adds its replacement (41.180409ms)
  ✔ removes the block and restores the file byte for byte when the last rule is superseded (13.665292ms)
  ✔ appends the block when AGENTS.md has no managed block (6.938667ms)
  ✔ leaves text before and after both blocks byte-identical (47.53074ms)
  ✔ writes past the limit and reports limits.maxProjectRules (35.903921ms)
✔ project rules block (230.81467ms)
▶ checkProjectRules
  ✔ returns nothing for a project without ADRs or a block (1.905423ms)
  ✔ reports an unexpected block with no system-wide ADR (2.218993ms)
  ✔ reports a stale block and clears once the block matches (5.730895ms)
✔ checkProjectRules (11.072514ms)
▶ decisions doctor check
  ✔ is absent when the project has neither ADR files nor a rules marker (1.761903ms)
  ✔ fails on a stale block and passes after osq init (8.359922ms)
  ✔ warns and passes when one decision file has no frontmatter (6.673821ms)
  ✔ fails on a validation error (2.019931ms)
  ✔ appears right after managed-blocks in the doctor check list (385.670743ms)
  ✔ keeps the check list unchanged without any decision surface (390.421489ms)
✔ decisions doctor check (796.330491ms)
▶ osq init command
  ✔ prints the project rules update line when AGENTS.md changed (28.188639ms)
✔ osq init command (28.473678ms)
▶ Runner already_running lock collision
  ✔ aborts with already_running without a dead marker or dead event (228.324666ms)
  ✔ logs the already_running outcome summary to stderr (117.624039ms)
  ✔ does not report the lock collision as a task failure in osq report (198.654543ms)
  ✔ only writes a dead event when an explicit dead marker is written (267.865274ms)
✔ Runner already_running lock collision (813.943597ms)
▶ tickTaskCheckboxContent format handling
  ✔ ticks a matching item in a flat numbered checklist without touching neighbours (1.205998ms)
  ✔ ticks a matching item in a grouped numbered checklist under its section header (0.295679ms)
  ✔ ticks a grouped unnumbered item whose number lives on the section header (1.381374ms)
  ✔ is idempotent and leaves already ticked checkboxes untouched (0.188752ms)
  ✔ prefers an explicit item number over the enclosing section number (0.160201ms)
✔ tickTaskCheckboxContent format handling (5.407964ms)
▶ Runner checkbox projection
  ✔ writes the ticked checkbox through tickTaskCheckbox (58.088525ms)
  ✔ is a no-op when tasks.md is absent (42.149159ms)
  ✔ does not invalidate the approved hash or modify .run/ markers (306.293312ms)
  ✔ derives task and spec state from .run/ markers, never tasks.md checkboxes (170.701569ms)
  ✔ writes .run/done/<n> and ticks tasks.md after an independent verify pass (384.040412ms)
✔ Runner checkbox projection (962.461786ms)
▶ Archived task checkboxes
  ✔ all fifteen (or more) archived tasks.md files are fully ticked (45.285739ms)
✔ Archived task checkboxes (45.62195ms)
▶ Runner done and dead events
  ✔ defines the done and dead event payloads (256.674789ms)
  ✔ parameterizes every dead RunTaskFailureReason and isolates already_running (147.442574ms)
  ✔ appends a done event alongside the done marker on success (298.10233ms)
  ✔ appends a dead event alongside the dead marker for no_result (196.163161ms)
  ✔ appends a dead event alongside the dead marker for crashed (200.591211ms)
  ✔ appends a dead event alongside the dead marker for timeout (191.93877ms)
  ✔ appends a dead event alongside the dead marker for verify_red (313.655603ms)
  ✔ appends a dead event alongside the dead marker for spec_conflict (tampered task) (212.699881ms)
  ✔ appends a dead event alongside the dead marker for spec_conflict (missing approval) (135.53331ms)
  ✔ appends a dead event alongside the dead marker for undeclared_test_change (317.284402ms)
  ✔ writes neither a dead marker nor a dead event for already_running (151.055782ms)
✔ Runner done and dead events (2423.694902ms)
▶ Runner lifecycle logging
  ✔ spawnWithTimeout captures the child pid and elapsed duration in milliseconds (250.177675ms)
  ✔ SpawnProcessResult and SpawnResult expose optional pid and elapsedMs fields (161.883905ms)
  ✔ logs a started summary and records a started event with pid and timeout (296.799461ms)
  ✔ logs an exited summary at verbose level and records an exited event with exit code and elapsed time (303.587157ms)
  ✔ demotes the exited summary to verbose while the started summary stays at info (303.944938ms)
  ✔ emits each lifecycle log line from the same code path as its events.jsonl entry (385.633104ms)
  ✔ does not log lifecycle lines when no logger is supplied (368.733332ms)
  ✔ exposes relativizeToolSummary from core and re-exports it from heartbeat (176.434037ms)
  ✔ models every event as a typed member of the OsqEvent union (163.382151ms)
  ✔ relativizes opencode tool summaries to the project root at write time (133.40381ms)
  ✔ relativizes agy tool summaries to the project root at write time (133.204661ms)
  ✔ records harness, model, and osqVersion on the started event (263.752169ms)
  ✔ emits exactly one started and one exited event through MockAdapter (324.741549ms)
✔ Runner lifecycle logging (3268.415783ms)
▶ Runner lifecycle PID ownership
  ✔ AgyAdapter forwards onSpawn, returns pid/elapsedMs, and emits no lifecycle events (240.206467ms)
  ✔ runTask through AgyAdapter records exactly one started and one exited with matching pid (344.80537ms)
  ✔ OpencodeAdapter forwards onSpawn, returns pid/elapsedMs, and emits no lifecycle events (170.110931ms)
  ✔ runTask through OpencodeAdapter records exactly one started and one exited with matching pid (363.181121ms)
✔ Runner lifecycle PID ownership (1120.494481ms)
▶ Runner outcome logging
  ✔ does not export the legacy formatTaskOutcomeSummary helper (202.401525ms)
  ▶ formatTaskOutcomeLine
    ✔ renders a verified line with elapsed time and no (passed) suffix (110.062436ms)
    ✔ renders unicode symbols when enabled (127.326243ms)
    ✔ renders a dead line for every failure reason (127.392365ms)
    ✔ appends the detail string before the elapsed time (168.710571ms)
    ✔ produces a single line for every outcome (128.660466ms)
  ✔ formatTaskOutcomeLine (663.118114ms)
  ✔ logs exactly one verified line upon successful verification (289.62828ms)
  ✔ logs exactly one dead line and writes the marker upon verification failure (487.594324ms)
  ✔ logs timed_out detail when verification times out (2415.294345ms)
  ✔ logs a timeout dead line when the agent exceeds its timeout (261.529908ms)
  ✔ logs a crashed dead line with the exit code when the agent crashes (269.27162ms)
  ✔ logs a no_result dead line when the agent writes no result (276.422213ms)
  ✔ logs a spec_conflict dead line when the folder changes after approval (218.563319ms)
  ✔ logs an already_running dead line when the task lock is held (176.83452ms)
  ✔ does not log an outcome line when no logger is supplied (340.316157ms)
✔ Runner outcome logging (5604.526779ms)
▶ Outcome module shape
  ✔ exposes the outcome failure types and formatter (0.195699ms)
  ✔ exposes the lifecycle, dead, done, and checkbox writers (0.392057ms)
  ✔ keeps outcome.ts under 200 lines (2.504528ms)
✔ Outcome module shape (3.515561ms)
▶ Done marker scope hash frontmatter
  ✔ writes YAML frontmatter and an ISO timestamp when metadata is provided (39.559875ms)
  ✔ keeps timestamp-only content when no metadata is provided (7.393397ms)
✔ Done marker scope hash frontmatter (48.49546ms)
▶ computeTaskScopeHash
  ✔ is deterministic regardless of scope ordering (19.520039ms)
  ✔ changes when a scoped file content changes (7.946913ms)
  ✔ records null for a missing scoped file (4.408485ms)
  ✔ classifies added, modified, and deleted glob matches through the resolver (23.970921ms)
✔ computeTaskScopeHash (56.536753ms)
▶ Pre-spawn scope comparison
  ✔ records the completed scope hash in the done marker (323.81786ms)
  ✔ proceeds to spawn when every earlier done scope is unchanged (474.723156ms)
  ✔ detects a changed earlier scope and refuses to spawn (374.13028ms)
  ✔ reports a deleted earlier scope file as differing (402.042411ms)
✔ Pre-spawn scope comparison (1576.013542ms)
▶ Runner synthesized result
  ✔ HarnessEventType includes text and TextEventData carries a text string (195.872983ms)
  ✔ extractFinalTextFromStream returns null when no text event exists (127.868887ms)
  ✔ extractFinalTextFromStream returns null when the event stream is missing (131.932213ms)
  ✔ extractFinalTextFromStream returns the last emitted text message (125.439716ms)
  ✔ extractFinalTextFromStream ignores raw harness payload shapes (fallback candidate list dropped) (134.466032ms)
  ✔ synthesizeResultFile writes synthesized: true frontmatter and an attribution header (141.502245ms)
  ✔ verify.ts exports the synthesis and gating helpers (140.291572ms)
  ✔ verify.ts stays under the 200 line lifecycle module budget (107.140141ms)
  ✔ snapshotTestFiles and findUndeclaredTestChanges report edits and deletions but allow new files (169.307174ms)
  ✔ runVerificationGate passes a zero exit and reports a non-zero diagnostic (252.337642ms)
  ✔ runVerificationGate enforces the timeout and reports timedOut (1160.416049ms)
  ✔ AgyAdapter emits a text event carrying the completed assistant message (177.02111ms)
  ✔ AgyAdapter exit 0 with no result file synthesizes from the last text event (394.605473ms)
  ✔ OpencodeAdapter emits a text event carrying the completed assistant message (175.761196ms)
  ✔ OpencodeAdapter exit 0 with no result file synthesizes from the last text event (399.292255ms)
  ✔ case B: real adapter exit 0 with neither result file nor text is dead with reason no_result (294.815166ms)
  ✔ README documents the synthesized result behavior for the no_result reason (185.809807ms)
✔ Runner synthesized result (4318.27997ms)
▶ Runner terminal status
  ▶ formatTaskStatusRow
    ✔ renders task number, elapsed, tool count, tokens, cost, and summary (243.398172ms)
    ✔ omits cost and summary when they are not reported (147.47352ms)
    ✔ renders the token count abbreviated in the status row (140.100596ms)
    ✔ assembles the full row without truncating, leaving fitting to the logger sink (135.051105ms)
  ✔ formatTaskStatusRow (667.981925ms)
  ▶ formatTokens
    ✔ abbreviates counts at the 1k and 1M boundaries (193.053154ms)
    ✔ is applied identically to the heartbeat line (175.245463ms)
  ✔ formatTokens (368.788008ms)
  ▶ relativizeToolSummary
    ✔ strips the project root and its trailing separator from absolute paths (156.825045ms)
    ✔ normalizes a trailing separator on the supplied root (153.007928ms)
    ✔ falls back to process.cwd() when no root is supplied (136.434434ms)
    ✔ leaves absolute paths outside the project root untouched (148.666712ms)
    ✔ relativizes an exact root match to a dot (152.872994ms)
  ✔ relativizeToolSummary (748.70463ms)
  ▶ computeTaskHeartbeatStats
    ✔ counts tool events, sums tokens and cost, and keeps the last tool summary (157.939926ms)
    ✔ accumulates new events in memory instead of re-reading already-counted lines (124.947089ms)
    ✔ tolerates a missing event file with zeroed counters (126.678736ms)
    ✔ relativizes tool summaries against the project root but keeps the raw event intact (143.983727ms)
    ✔ falls back to process.cwd() for tool summaries when projectRoot is omitted (155.03932ms)
    ✔ renders the relativized tool path in the status row without a leading slash (149.398488ms)
  ✔ computeTaskHeartbeatStats (859.035286ms)
  ▶ task start and outcome lines
    ✔ logs a single started line with the title truncated to the terminal width (555.853948ms)
    ✔ logs a verified outcome line with elapsed seconds (266.887757ms)
    ✔ logs a dead outcome line with the reason and elapsed seconds (461.985466ms)
  ✔ task start and outcome lines (1285.504397ms)
  ▶ end-to-end status via the real opencode stream parser
    ✔ redraws a TTY status row with the live tool count, tokens, cost, and summary (679.456855ms)
    ✔ redraws the status row with a repo-relative tool path from an absolute summary (749.754214ms)
    ✔ derives the non-TTY heartbeat log from the same counters (747.016403ms)
    ✔ demotes the periodic heartbeat log to verbose on a TTY (711.860811ms)
    ✔ still emits the periodic heartbeat at verbose on a TTY (813.018414ms)
  ✔ end-to-end status via the real opencode stream parser (3702.038887ms)
✔ Runner terminal status (7643.771007ms)
▶ Runner test modification gating
  ✔ RunTaskFailureReason includes undeclared_test_change (48.74472ms)
  ✔ records preexisting tests before spawn: a deletion is detected (198.4882ms)
  ✔ a modified preexisting test writes the dead marker and dead event, and skips verify (248.422037ms)
  ✔ creating a brand new test file without tests.modify proceeds to verify (287.133126ms)
  ✔ tests.modify: true permits editing a preexisting test file in resolved scope (348.912484ms)
  ✔ tests.modify: true authorizes an in-scope deletion of a preexisting test (275.071453ms)
  ✔ tests.modify: true still forbids a preexisting test outside the resolved scope (220.474669ms)
  ✔ sorts unauthorized diagnostics by test path and names each required scope entry (214.369337ms)
  ✔ runs the enabled proposal verify after task verification and attributes its event to change (296.841693ms)
  ✔ a failing proposal verify kills the task with change_verify_red and full evidence (292.361992ms)
  ✔ disabling changeVerifyAfterTask skips the proposal verifier and completes (356.917877ms)
  ✔ a failing task verify stays verify_red and never runs the proposal verifier (226.304243ms)
✔ Runner test modification gating (3017.029296ms)
▶ Task Runner and Verification Gate
  ✔ fails with reason: spec_conflict if folder is modified after approval (234.645254ms)
  ✔ fails with reason: no_result if agent exits without writing .run/results/<n>.md (394.654497ms)
  ✔ fails with reason: timeout if agent times out (345.426712ms)
  ✔ fails with reason: verify_red if task verify fails (304.426063ms)
  ✔ fails with reason: verify_red and timed_out: true if task verify hangs (2328.849869ms)
  ✔ succeeds, creates .run/done/<n>, and ticks checkbox on valid task and passing verify (553.424509ms)
✔ Task Runner and Verification Gate (4163.394072ms)
▶ scenario outcomes
  ✔ reads AND lines and a table as outcomes in order (2.504056ms)
  ✔ treats an AND under a WHEN as part of the WHEN, not an outcome (0.451269ms)
  ✔ reads an indented table under a THEN (0.251746ms)
  ✔ allows blank lines between an outcome and its table (0.3103ms)
  ✔ reads a missing cell as the empty string (0.291699ms)
  ✔ reads a table directly under an AND line (0.208463ms)
✔ scenario outcomes (5.847691ms)
▶ scenario table lint acceptance
  ✔ accepts a change delta that adds a requirement with a table (266.357353ms)
✔ scenario table lint acceptance (266.874686ms)
▶ scenario table acceptance by the real validator
  ✔ accepts the sample living spec with its table (452.87949ms)
✔ scenario table acceptance by the real validator (453.363022ms)
▶ OpenSpec schema execution authority instructions
  ✔ tasks artifact restricts execution to osq watch (20.152383ms)
  ✔ tasks artifact states archiving is osq-owned and never openspec archive (5.633499ms)
  ✔ tasks artifact states checkboxes are a runner-written write-only projection (8.426294ms)
  ✔ apply instruction hands task execution off to osq watch (5.407619ms)
  ✔ config context states execution and archive authority belongs strictly to osq (2.610758ms)
  ✔ config tasks rules forbid direct execution and archive (1.734737ms)
  ✔ schema README documents runtime and archive authority boundaries (1.325106ms)
✔ OpenSpec schema execution authority instructions (47.091456ms)
▶ Resolved scope lint integration
  ✔ warns once when two tasks resolve the same exact file (213.009622ms)
  ✔ warns only for the glob-matched file two tasks share (149.556544ms)
  ✔ emits one warning per stable task pair for a file shared by three tasks (129.609694ms)
  ✔ orders warnings by path within a task pair (106.205485ms)
  ✔ does not self-warn for duplicate declarations inside one task (150.793919ms)
  ✔ never warns for missing exact paths or unmatched globs (133.451155ms)
  ✔ keeps overlap warnings non-failing with independent errors present (103.04969ms)
  ✔ keeps maxScopeFiles counting declared patterns despite resolved overlap (112.694659ms)
  ✔ requires tests.modify for an existing exact test path (114.467212ms)
  ✔ requires tests.modify for a glob matching an existing test file (114.327523ms)
  ✔ permits a missing exact new test path and an unmatched test glob (123.232659ms)
  ✔ exits zero through the lint entrypoint when only overlap warnings exist (144.641292ms)
✔ Resolved scope lint integration (1597.65567ms)
▶ Pre-dispatch scope recertification audit
  ✔ verifies every stale task in one audit and blocks without touching the upcoming task (358.442219ms)
  ✔ does not re-verify or rewrite an already-active regression on a later cycle (229.870616ms)
  ✔ retains the timeout result when detection verification exceeds the configured timeout (1226.630809ms)
  ✔ records differing paths in deterministic sorted order (322.779436ms)
  ✔ leaves manual and malformed done markers outside the audit (576.98209ms)
✔ Pre-dispatch scope recertification audit (2716.845105ms)
▶ Scope recertification attribution
  ✔ attributes a path to a sole later editor with no recorded completion hash (279.823192ms)
  ✔ attributes a path when the current hash agrees with the later completion hash (310.003857ms)
  ✔ records ambiguous when more than one later task named the path (335.125044ms)
  ✔ records unknown when no later task named the path (283.780294ms)
  ✔ records unknown when a sole candidate completion hash contradicts the tree (303.202909ms)
✔ Scope recertification attribution (1512.891458ms)
▶ Resolver-versioned completion records
  ✔ writes scope_resolver: 2 on automated completion and leaves timestamp-only markers unchanged (366.797006ms)
  ✔ detects a version-only legacy marker with empty differing paths and resolver-upgrade context (186.980759ms)
  ✔ records differing resolved glob paths alongside the resolver upgrade (171.164904ms)
  ✔ keeps repeated watcher cycles idempotent for an active version regression (177.534686ms)
  ✔ freshly recertifies a version-stale task after explicit retry (630.326625ms)
  ✔ leaves archived markers untouched and does not scan them (199.589926ms)
  ✔ treats wrong and malformed resolver versions as stale while excluding manual markers (289.235956ms)
  ✔ blocks the pre-archive audit for a version-stale completion (237.467241ms)
  ✔ requeues a failed recertification without leaving a canonical done marker (276.567644ms)
✔ Resolver-versioned completion records (2538.041469ms)
▶ Resolver upgrade guidance
  ✔ documents exactly one Upgrading note with the detection and retry contract (2.296529ms)
✔ Resolver upgrade guidance (2.518459ms)
▶ resolveScope
  ✔ resolves an exact path to its readable absolute file path (21.331391ms)
  ✔ retains a missing exact path with a null file path (18.051615ms)
  ✔ expands a segment * within a single directory level (9.928971ms)
  ✔ expands ? to a single non-separator character (13.140734ms)
  ✔ expands ** across nested directories (8.91355ms)
  ✔ expands a trailing-directory form recursively (12.865631ms)
  ✔ deduplicates an exact entry also matched by a glob (10.362354ms)
  ✔ contributes no entry for an unmatched glob (10.326891ms)
  ✔ returns empty for an empty scope (11.980106ms)
  ✔ normalizes ./ prefixes and platform separators (19.786961ms)
  ✔ is independent of declaration order and produces identical bytes (14.72501ms)
  ✔ never resolves outside the project tree (6.88977ms)
  ✔ does not read a file outside the project root when hashing (5.795384ms)
✔ resolveScope (167.006615ms)
▶ computeTaskScopeHash resolver projection
  ✔ keys the aggregate by expanded resolver paths rather than glob text (4.957319ms)
✔ computeTaskScopeHash resolver projection (5.168612ms)
▶ SCOPE_RESOLVER_VERSION
  ✔ exposes resolver version 2 (0.108047ms)
✔ SCOPE_RESOLVER_VERSION (0.197033ms)
▶ linter resolver cut-over
  ✔ removes the legacy glob matcher and its private tree walker (3.411556ms)
✔ linter resolver cut-over (3.62807ms)
▶ osq serve --export
  ✔ writes the snapshot, prints the scrub reminder, and serves nothing (265.113071ms)
  ✔ refuses a non-empty target without printing success or writing (42.316229ms)
  ✔ still serves normally without --export (64.120955ms)
  ✔ registers the --export option on the serve command (44.265629ms)
✔ osq serve --export (417.419486ms)
▶ invalidation across osq worktrees
  ✔ watches each worktree change folder and invalidates its numeric id (3.265826ms)
  ✔ behaves exactly as before when no trees are resolved (0.528375ms)
✔ invalidation across osq worktrees (4.957255ms)
▶ serve server wiring
  ✔ passes the resolved worktree trees to the invalidation hub (103.978747ms)
✔ serve server wiring (104.33671ms)
▶ invalidation hub ownership and batching
  ✔ creates one watcher for the configured root and closes it idempotently (50.894347ms)
  ✔ classifies change paths by location and treats shared paths as global (38.526213ms)
  ✔ accumulates one debounced batch with sorted unique numeric ids (47.030336ms)
  ✔ uses an empty id list for shared documents and when any path is global (51.595811ms)
  ✔ starts a new debounce window and clears pending state on cancel and close (41.119748ms)
✔ invalidation hub ownership and batching (231.01702ms)
▶ events HTTP transport
  ✔ serves a keep-open framed stream with no-store headers and no CORS (84.419146ms)
  ✔ answers HEAD with matching headers and no stream or body (59.259535ms)
  ✔ fans one batch out to every client and cleans up disconnects idempotently (76.522171ms)
  ✔ clears the timer, ends clients, closes the watcher, then the listener (53.281874ms)
  ✔ closes every created resource when watcher initialization fails (53.392002ms)
  ✔ closes the watcher and rejects once when HTTP startup fails (48.527874ms)
✔ events HTTP transport (376.559817ms)
▶ real chokidar invalidation
  ✔ debounces change writes and emits one event for capability refresh (553.810774ms)
✔ real chokidar invalidation (554.085395ms)
▶ serve /api/system
  ✔ serves the system document from getSystemGraph with no-store JSON (310.040506ms)
  ✔ answers HEAD with GET status and headers and no body (176.633358ms)
  ✔ uses an injected getSystem and reports its failure without terminating (44.280749ms)
✔ serve /api/system (534.573705ms)
▶ serve configuration and CLI registration
  ✔ parses only integer ports from 0 through 65535 (46.914545ms)
  ✔ registers serve with port and open options (42.044273ms)
error: option '--port <n>' argument '1.5' is invalid. port must be an integer from 0 through 65535
error: option '--port <n>' argument '70000' is invalid. port must be an integer from 0 through 65535
  ✔ rejects an invalid CLI port before dispatching the command (53.051663ms)
  ✔ uses the configured port and lets the CLI port override it (72.495126ms)
  ✔ opens the printed URL once after listening and exposes platform commands (204.363113ms)
  ✔ closes the listener when browser launch fails (35.769559ms)
  ✔ reports EADDRINUSE without printing a URL or leaking a listener (39.244812ms)
✔ serve configuration and CLI registration (498.678739ms)
▶ loopback read-only API
  ✔ binds loopback and returns the exact report with no-store deterministic JSON (184.924608ms)
  ✔ serves the graph document and the read-only inbox without advancing the cursor (247.888407ms)
  ✔ serves a selected change and maps absent and ambiguous selectors (163.933328ms)
  ✔ rejects unsafe and malformed change selectors (97.104976ms)
  ✔ rejects every other method before route lookup with Allow GET, HEAD (83.390741ms)
  ✔ answers HEAD with matching status and headers and no body (306.765343ms)
  ✔ returns JSON failures without terminating the listener (183.457006ms)
  ✔ never mutates project or cursor state for methods and inbox reads (482.913303ms)
  ✔ recomputes every document from current files on each request (282.136326ms)
  ✔ keeps process termination out of core server, static, and config modules (84.822453ms)
  ✔ closes idempotently (82.000773ms)
✔ loopback read-only API (2207.323526ms)
▶ static dashboard delivery
  ✔ resolves the package-root ui/dist for tsx and compiled layouts (96.866516ms)
  ✔ serves the index at / and /index.html with a self-only CSP and revalidation (95.158878ms)
  ✔ serves correct content types and caches only fingerprinted assets immutably (169.517587ms)
  ✔ rejects traversal, directory listing, and missing paths without an SPA fallback (141.99647ms)
  ✔ answers HEAD for the index without a body (91.903847ms)
✔ static dashboard delivery (596.172758ms)
▶ AGENTS.md managed block coexistence
  ✔ adds the osq block while preserving an existing OpenSpec block and user notes (16.044501ms)
  ✔ is idempotent across repeated updates and preserves both blocks intact (7.559201ms)
Harness 'mock' setup completed successfully.
Harness 'mock' setup completed successfully.
  ✔ osq setup refreshes AGENTS.md and both blocks survive repeated setup executions (192.691967ms)
✔ AGENTS.md managed block coexistence (218.087839ms)
▶ osq show approval digest
  ✔ registers --json on osq show (3.967029ms)
  ✔ appends the digest and flag lines for an unapproved change (91.808951ms)
  ✔ omits the digest and flags for an approved change (164.454679ms)
  ✔ prints the details plus a digest object as JSON for an unapproved change (36.097908ms)
  ✔ prints a null digest as JSON for an approved change (137.844809ms)
✔ osq show approval digest (437.406695ms)
▶ osq show next step and verification
  ✔ prints Next: landed and the outcome for an archived change that passed (76.040258ms)
  ✔ prints a failed outcome as verification pending with the failing detail (15.75823ms)
  ✔ prints each check_ran row and moves the command after a check runs (13.815354ms)
  ✔ prints the next step for an active unplanned change (13.477833ms)
  ✔ omits the next step for a rejected change (32.305951ms)
  ✔ carries next in the --json document for an archived change (29.060866ms)
✔ osq show next step and verification (182.650808ms)
▶ osq show pre-spawn verify missing paths
  ✔ names the recorded missing paths and leaves runs without them unchanged (135.891049ms)
  ✔ keeps the line unchanged for an empty missing-path list (36.627505ms)
✔ osq show pre-spawn verify missing paths (173.929708ms)
▶ osq show pre-spawn verify
  ✔ prints the latest pre-spawn outcome per task and keeps the timeline (86.377503ms)
✔ osq show pre-spawn verify (89.420484ms)
▶ osq show retries and stuck tasks
  ✔ counts automatic retries and marks a task that is still stuck (91.812622ms)
  ✔ drops the stuck line when a retry came after it (22.218023ms)
✔ osq show retries and stuck tasks (115.565582ms)
▶ show test paths
  ✔ has no test-path function of its own and imports isTestPath (19.336634ms)
✔ show test paths (20.487204ms)
▶ osq show
  ✔ getSpecDetails resolves change folder across active and archived directories (133.092709ms)
  ✔ getSpecDetails extracts spec metadata, tasks, results, and dead markers (52.412468ms)
  ✔ getSpecDetails parses event timeline from .run/events/<n>.jsonl (63.531659ms)
  ✔ showCommand prints formatted spec inspection with results and events (171.506163ms)
  ✔ formats undeclared_test_change status line and show diagnostic details (153.312807ms)
  ✔ getSpecDetails correlates planning sessions in start order for active and archived changes (41.230798ms)
  ✔ renders Planning Sessions before the event timeline without exposing usage (31.704755ms)
  ✔ lists observed records through the same fields and ordering as owned records (38.937239ms)
  ✔ missing and malformed planning logs leave task details and timeline intact (38.440995ms)
  ✔ CLI registers show <id> command in commander program (24.298354ms)
  ✔ derives ordered recertification rows with attribution from typed events (56.807674ms)
  ✔ derives recertification rows for archived changes (26.389952ms)
  ✔ orders recertification rows by valid timestamp then numeric task and event order (51.331566ms)
  ✔ renders malformed recertification data as unavailable without hiding other output (68.007902ms)
  ✔ renders and labels the Recertifications section only when rows exist (89.199511ms)
  ✔ does not infer recertification history from done marker metadata (76.414264ms)
✔ osq show (1120.306254ms)
▶ smoke test error reporting
  ✔ reports a failed test naming the command and zero cancelledByParent when setup fails (899.404689ms)
✔ smoke test error reporting (902.409628ms)
▶ Squash commit message
  ✔ builds the message after archive and lands by hand with every trailer (1498.265981ms)
  ✔ lists one Osq-Model trailer per distinct model and version, in task order (1506.754957ms)
  ✔ marks a task completed with osq done --manual as manual (1656.46075ms)
  ✔ refuses a change that has not archived in its worktree (345.333713ms)
  ✔ refuses when no osq worktree holds a matching archived change (400.005245ms)
✔ Squash commit message (5408.88763ms)
▶ Message command
  ✔ prints the message on stdout and the branch on stderr (1532.936099ms)
✔ Message command (1533.310424ms)
▶ Stacked squash message
  ✔ refuses when a dependency has not landed (1393.657939ms)
✔ Stacked squash message (1394.176439ms)
▶ Flag off squash message
  ✔ refuses without vcs.enabled and runs no git (6.198474ms)
✔ Flag off squash message (6.459584ms)
▶ Stacked cut keeps a failed worktree
  ✔ keeps the worktree on failure and reuses it after retry (2689.596038ms)
✔ Stacked cut keeps a failed worktree (2691.461388ms)
▶ Stacked cut
  ✔ cuts the dependent from the dependency archive commit and runs the chain (2251.760053ms)
  ✔ waits while the dependency is still running (804.874044ms)
  ✔ cuts from the default branch when the dependency landed by hand (2617.086722ms)
  ✔ halts when two archived dependencies diverge (2436.163625ms)
  ✔ halts on a failed prepare and resumes after retry (2911.572171ms)
  ✔ does nothing when vcs is off and a stacked directory exists (189.079551ms)
✔ Stacked cut (11212.767166ms)
▶ Stacked halt
  ✔ halts when the dependency was rejected before it landed (676.69711ms)
  ✔ halts when the recorded dependency hash changed (1069.412399ms)
  ✔ approving again clears the halt and cuts at HEAD (713.582771ms)
✔ Stacked halt (2460.411097ms)
▶ rejected dependency resolution
  ✔ treats a rejected dependency as unmet even when the rejected folder is all-done (97.735272ms)
  ✔ lets an archived dependency satisfy resolution (42.732834ms)
✔ rejected dependency resolution (141.913996ms)
▶ deriveSpecState from in-memory snapshots
  ✔ derives an unapproved spec when no approval hash is present (10.422851ms)
  ✔ derives a ready (pending) spec with a next task from pure data (1.839459ms)
  ✔ is synchronous and never returns a promise (0.969032ms)
  ✔ derives a running spec from the running pid map (0.808755ms)
  ✔ derives a done spec from the done marker set (0.899509ms)
  ✔ derives a dead spec and surfaces the dead reason (0.653188ms)
  ✔ resolves a conflicted task in favor of completion (0.556904ms)
  ✔ reports dead when a conflicted spec mixes done and dead tasks (1.355098ms)
  ✔ derives a blocked spec from unmet dependencies without touching disk (0.976992ms)
  ✔ derives a regressed task and spec from a regressed marker (2.791075ms)
  ✔ prefers a regressed marker over a stale done marker (0.544113ms)
  ✔ derives a regressed spec from a change-level regressed marker (1.621649ms)
  ✔ ignores regressed markers that match no task or the change (0.540213ms)
✔ deriveSpecState from in-memory snapshots (26.037106ms)
▶ State Derivation
  ✔ deriveTaskState correctly determines pending, running, done, and dead states (96.536471ms)
  ✔ deriveSpecState detects unapproved, pending, running, dead, and done states (63.99229ms)
  ✔ deriveSpecState from an in-memory snapshot is synchronous and preserves folderPath (27.20073ms)
✔ State Derivation (189.513428ms)
▶ osq status leftover drafts
  ✔ flags an untouched checkout copy after a hand landing (1198.565055ms)
  ✔ keeps flagging after the worktree is removed (1010.47048ms)
  ✔ does not flag an edited checkout copy (1250.78835ms)
  ✔ does not flag a change that has not landed (1165.390175ms)
  ✔ clears the flag once the copy is removed (1176.907452ms)
  ✔ prints no leftovers and no section with vcs.enabled off (1092.874657ms)
  ✔ prints no leftovers when git is unavailable (199.747045ms)
✔ osq status leftover drafts (7097.676909ms)
▶ osq status rejected group
  ✔ discovers rejected folders separately with folder, title, reason, and timestamp (108.674671ms)
  ✔ renders a deterministic Rejected specs group with reason and timestamp (27.96536ms)
  ✔ keeps malformed or missing rejection metadata visible as unavailable (28.325036ms)
  ✔ orders rejected folders deterministically by numeric prefix (45.613311ms)
✔ osq status rejected group (212.238547ms)
▶ osq status last sync
  ✔ shows the last of several syncs directly above the next line (569.346988ms)
  ✔ prints the sync line below the worktree line and warnings (435.712774ms)
  ✔ prints no sync line and carries no fields when never synced (483.9792ms)
  ✔ skips a broken line before a synced event (426.399845ms)
  ✔ shows a stop after the last sync with its first message line (591.796345ms)
  ✔ clears a stop behind a later sync (598.571224ms)
  ✔ carries a stop when no sync exists (509.871054ms)
  ✔ renders the stop line through the status command (587.898568ms)
✔ osq status last sync (4207.343345ms)
▶ osq status with a change in a worktree
  ✔ prints the worktree path directly below the change heading (797.358303ms)
  ✔ warns when the checkout copy changed after approval (507.203175ms)
  ✔ prints no warning when the checkout copy is untouched (452.473648ms)
  ✔ prints no warning when the checkout copy is missing (539.693602ms)
✔ osq status with a change in a worktree (2298.507495ms)
▶ osq status
  ✔ getStatusOverview returns all active specs with derived spec and task states (226.96997ms)
  ✔ getStatusOverview returns count of archived change folders (26.277646ms)
  ✔ statusCommand prints formatted status overview with state indicators (686.690226ms)
  ✔ CLI registers status command in commander program (50.074023ms)
  ✔ status output clearly distinguishes pending, running, done, and dead tasks (158.246427ms)
✔ osq status (1150.440576ms)
▶ Unrecognised harness stream events
  ✔ opencode routes unrecognised event types to logger.verbose without touching stdout (42.168068ms)
  ✔ opencode stays silent at normal level for unrecognised event types (5.364951ms)
  ✔ opencode does not use console.debug for unrecognised event types (4.565457ms)
  ✔ agy routes unrecognised event types to logger.verbose without touching stdout (6.191695ms)
  ✔ agy routes malformed non-JSON lines to logger.verbose without touching stdout (3.606024ms)
  ✔ agy stays silent at normal level for unrecognised events and malformed lines (4.297575ms)
  ✔ unrecognised events write nothing to the append-only events.jsonl stream (8.63569ms)
✔ Unrecognised harness stream events (76.578184ms)
▶ gated and ungated paths
  ✔ gates tests and paths under it, and nothing else (0.70073ms)
✔ gated and ungated paths (1.731464ms)
▶ one gate definition
  ✔ has every consumer call isGatedTestPath and define none of its own (22.48298ms)
✔ one gate definition (23.533274ms)
▶ named test outside tests
  ✔ raises no tests.modify finding for a test outside tests (207.425286ms)
✔ named test outside tests (207.875716ms)
▶ traceability instruction blocks
  ✔ writes both blocks naming an opted-in capability directly after the managed block (54.041539ms)
  ✔ joins a list of two capabilities with a comma (4.687485ms)
  ✔ renders every capability for the all opt-in (2.044547ms)
  ✔ changes nothing on a second osq init (42.24906ms)
  ✔ removes both blocks and restores the files when the config stops opting in (61.964185ms)
  ✔ reports a missing block for each file (35.80601ms)
  ✔ reports an out-of-date block (28.579237ms)
  ✔ reports an unexpected block when nothing is opted in (14.750313ms)
  ✔ adds the block problems to the doctor managed-blocks result (14.718361ms)
✔ traceability instruction blocks (261.459599ms)
▶ function ranges
  ▶ findTopLevelFunctions
    ✔ reads every top-level declaration form with its column and export state (2.455826ms)
    ✔ reads the fixture quote file: two private helpers and one exported function (0.511132ms)
  ✔ findTopLevelFunctions (3.897717ms)
  ▶ mutationRanges
    ✔ includes the private helper the covered function calls (0.843096ms)
    ✔ returns only the own range for a function that calls no private top-level helper (0.332535ms)
    ✔ follows a nested helper chain through private functions only (0.280822ms)
    ✔ includes a helper called by two different exported functions (2.233965ms)
    ✔ returns null for a name that no top-level declaration matches (0.797359ms)
  ✔ mutationRanges (6.203695ms)
  ▶ range boundaries and balance
    ✔ keeps the range open across strings holding a brace and a template with a stray brace (1.377319ms)
    ✔ balances a return type that carries braces (0.448969ms)
    ✔ ignores a comment that holds a closing brace (0.293493ms)
    ✔ reads a range with unbalanced delimiters as unknown (0.237981ms)
  ✔ range boundaries and balance (2.78814ms)
  ▶ hashFunctionRange
    ✔ hashes the text of the function own range (0.70257ms)
    ✔ returns null when the range is unknown or the name is absent (0.269632ms)
  ✔ hashFunctionRange (1.117498ms)
✔ function ranges (14.822365ms)
▶ function baseline
  ✔ hashes each scoped exported function carrying a @scenario tag (31.972041ms)
  ✔ maps a tagged function with an unknown range to null (6.979709ms)
  ✔ leaves functionHashes out of a start event whose scope has no tagged function (35.751038ms)
  ✔ adds functionHashes to a start event whose scope has a tagged function (10.717834ms)
✔ function baseline (85.963268ms)
▶ scenario helper failures
  ✔ fails each scenario with its exact message (1802.155519ms)
✔ scenario helper failures (1803.177432ms)
▶ scenario helper passing checks
  ✔ passes a settled async check and a property check (1812.743634ms)
✔ scenario helper passing checks (1813.150062ms)
▶ OSQ_CHANGE effective spec
  ✔ proves the delta modified THEN and refuses to guess without it (2107.106715ms)
✔ OSQ_CHANGE effective spec (2107.569865ms)
▶ testing entry point
  ✔ reaches only node built-ins from src/testing/index.ts (1164.18581ms)
  ✔ declares the ./testing subpath in package.json (2.287337ms)
  ✔ builds the files the ./testing export names (0.355978ms)
✔ testing entry point (1167.316974ms)
▶ trace impact lint
  ✔ lists the test naming a modified scenario and warns it is not scoped (292.06151ms)
  ✔ raises no modification warning for a test scoped with tests.modify (203.160204ms)
  ✔ lists a scenario removed from a requirement (181.838964ms)
  ✔ still lists for a capability that is not opted in (175.362672ms)
  ✔ turns blast findings into errors under require mode for an opted-in capability (175.074371ms)
  ✔ produces no finding without a scenario test file (192.861193ms)
  ✔ produces nothing with nothing opted in and no scenario test file (315.987135ms)
✔ trace impact lint (1542.736082ms)
▶ trace lint
  ✔ names a scenario the spec does not have (211.997423ms)
  ✔ reports a tag no covering test names (130.276199ms)
  ✔ leaves a tag alone when a scoped test covers the function for the scenario (145.518757ms)
  ✔ reports a missing and an out-of-scope ADR tag (135.72041ms)
  ✔ checks an @adr-only function against its Code ownership (142.807892ms)
  ✔ reports two scenarios with the same name on the delta (157.821715ms)
  ✔ reports a malformed tag in a scoped file (127.018143ms)
  ✔ reports a non-literal scenario name in a scoped test (189.018233ms)
  ✔ treats a planned scenario as tested and as covering its tagged functions (247.578231ms)
  ✔ turns link findings into errors under require mode (245.126868ms)
  ✔ reports none of the link findings for a capability that is not opted in (255.04577ms)
  ✔ copies the pricing fixture and reports a tag no longer covered (383.476462ms)
  ✔ produces nothing with nothing opted in and no scenario test file (281.202872ms)
✔ trace lint (2655.672096ms)
▶ pricing fixture through the scenario helper
  ✔ passes the intact fixture (1778.859258ms)
  ✔ fails when the total then is deleted (1527.658691ms)
  ✔ fails when the table gains a row the code gets wrong (1644.316797ms)
  ✔ fails when a number changes in the spec (1647.990065ms)
  ✔ fails when the function is called directly instead of through run (1718.940281ms)
  ✔ fails when the code boundary moves (1745.869095ms)
  ✔ fails when the table is checked with then (1384.396666ms)
  ✔ fails when two scenarios share a name (1071.411226ms)
✔ pricing fixture through the scenario helper (12546.220881ms)
▶ report traceability gaps
  ✔ lists an untested scenario and an unclaimed function when pricing is opted in (137.287315ms)
  ✔ leaves the report unchanged when no capability is opted in (12.155676ms)
✔ report traceability gaps (150.765187ms)
▶ show scenarios
  ✔ prints both scenario pairs under a task whose scope holds the test (32.543717ms)
  ✔ prints no scenario line for a task without a scenario test in scope (15.818488ms)
✔ show scenarios (48.933419ms)
▶ traceability tags
  ✔ reads every documented declaration form and its tags (4.317255ms)
  ✔ records quote serving its scenario and ADR above an arrow const (0.263682ms)
  ✔ records a tag above an unread form as unreadable (0.380826ms)
  ✔ carries several tags on one function (0.69414ms)
  ✔ records every exported function, tagged or not (0.908444ms)
  ✔ records a tag in a // comment as unreadable (0.328884ms)
  ✔ records a blank line between the comment and the declaration as unreadable (0.391326ms)
  ✔ records an @adr without digits as unreadable (0.256031ms)
  ✔ records a @scenario without a capability and name as unreadable (0.535878ms)
✔ traceability tags (9.562157ms)
▶ scenario calls
  ✔ reads every call to scenario with literal capability, name, and covers (0.703ms)
  ✔ reads a call spanning three lines (0.195288ms)
  ✔ reads double-quoted literals (0.148337ms)
  ✔ records a non-literal name as unreadable (0.305183ms)
  ✔ records a template literal name as unreadable (0.178477ms)
  ✔ records covers bound to a member expression as unreadable (0.196828ms)
  ✔ records a non-literal capability as unreadable (0.290593ms)
  ✔ records an aliased scenario import as unreadable (0.184738ms)
  ✔ does not scan calls when the file imports no testing helper (0.133275ms)
✔ scenario calls (2.731177ms)
▶ scenario index
  ✔ says the test covers the tagged function (40.354975ms)
  ✔ does not cover a function the test file does not import directly (12.487016ms)
  ✔ does not cover a differently named function (7.538292ms)
  ✔ indexes the written pricing sample with the test covering quote and nothing unreadable (13.790322ms)
✔ scenario index (74.724639ms)
▶ scenario lookup
  ✔ returns the delta outcomes for a scenario only the change adds (26.507451ms)
  ✔ uses the delta outcomes for a modified scenario (17.79281ms)
  ✔ fails for a scenario the change removes (18.45038ms)
  ✔ fails when two places define the scenario differently (10.880866ms)
  ✔ returns an active change delta when no OSQ_CHANGE is set (7.227441ms)
  ✔ returns every scenario of the effective spec for lint (12.609377ms)
  ✔ fails for a delta the merge refuses (18.587645ms)
  ✔ fails when the living spec has two scenarios with one name (7.789684ms)
  ✔ fails when only the change delta introduces a duplicate name (15.329963ms)
  ✔ fails for a capability that has no spec (3.391975ms)
  ✔ finds the spec from a working directory nested below the project root (9.25336ms)
  ✔ reads the spec file once for two lookups (5.918311ms)
✔ scenario lookup (156.374163ms)
▶ test paths
  ✔ tells test paths from source paths (2.576716ms)
  ✔ has one definition, imported by lint and the report (13.505463ms)
✔ test paths (17.318762ms)
▶ owned functions
  ✔ keeps a tagged function that unclaimedFunctionsFor leaves out (35.318001ms)
✔ owned functions (35.754649ms)
▶ scenario lookup from a worktree branch
  ✔ returns the worktree branch change outcomes when active changes disagree (29.250179ms)
  ✔ falls back to every active change when the branch change is archived (21.944809ms)
  ✔ resolves as without a worktree when .git is a directory (21.214601ms)
  ✔ resolves as without a worktree on a branch that is not osq/ (23.66879ms)
  ✔ reads the branch once for two lookups in the same worktree (29.652468ms)
✔ scenario lookup from a worktree branch (127.383609ms)
▶ traceability capability names
  ✔ accepts a name with a living spec (257.693339ms)
  ✔ fails a misspelled name with the nearest living name (17.147715ms)
  ✔ accepts a name an active change declares in creates (24.068569ms)
  ✔ ignores creates from an archived change (15.681649ms)
  ✔ passes a project with no living capability spec (10.590228ms)
  ✔ passes 'all' unchecked (11.356518ms)
  ✔ leaves out the suggestion when no living name exists (0.417208ms)
✔ traceability capability names (339.31676ms)
▶ traceability configuration
  ✔ defaults to nothing opted in (11.953151ms)
  ✔ accepts 'all' (2.933707ms)
  ✔ accepts a list of capability names (2.059489ms)
  ✔ keeps each missing default in a partial block (1.481249ms)
  ✔ rejects an invalid capabilities value (1.962444ms)
  ✔ rejects an invalid mode (12.162085ms)
  ✔ loadConfig reads a traceability block from osq.config.ts (208.927418ms)
✔ traceability configuration (243.996196ms)
▶ opt-in answers
  ✔ answers every capabilities value as the table says (0.837196ms)
✔ opt-in answers (1.966938ms)
▶ one opt-in definition
  ✔ has every consumer call the exported functions and define none of its own (16.445386ms)
✔ one opt-in definition (16.808621ms)
▶ pinned OpenSpec validator failure gating
  ✔ fails validateWithOpenSpec when the validator binary is missing (25.697114ms)
  ✔ fails validateWithOpenSpec when the validator version drifts (121.005988ms)
  ✔ passes validateWithOpenSpec when the pinned version is installed (88.272125ms)
  ✔ fails osq lint when the validator binary is missing (40.003212ms)
  ✔ fails osq approve when the validator binary is missing (17.330758ms)
  ✔ fails osq lint when the validator version drifts (116.695089ms)
  ✔ fails osq approve when the validator version drifts (124.232944ms)
✔ pinned OpenSpec validator failure gating (535.646006ms)
▶ vcs configuration
  ✔ defaults to vcs disabled when the block is unset (13.234449ms)
  ✔ fails when vcs is enabled without an author (228.045016ms)
  ✔ fails on a malformed author (13.367009ms)
  ✔ keeps worktreeRoot and prepare trimmed (16.347882ms)
  ✔ fails on a blank prepare (16.32492ms)
  ✔ fails on a non-boolean enabled (11.201516ms)
✔ vcs configuration (301.023893ms)
▶ vcs configuration values
  ✔ exports the commit timeout default and accepts an override (0.22675ms)
  ✔ rejects a blank worktreeRoot through validateVcsConfig (0.205029ms)
  ✔ re-exports the moved agent types and the public vcs type (0.172677ms)
✔ vcs configuration values (0.906919ms)
▶ Vcs discard and commit
  ✔ discard with no paths runs no git command and keeps the untracked file (79.134171ms)
  ✔ discard restores staged changes and removes a staged new file (153.493205ms)
  ✔ commit records only the given path and leaves other staged paths staged (108.115728ms)
  ✔ commit with no paths commits the index as it stands (80.788959ms)
✔ Vcs discard and commit (424.1952ms)
▶ doctor version control warnings
  ✔ warns about a lockfile without a prepare command (417.87016ms)
  ✔ warns naming each active commit hook (216.264717ms)
  ✔ warns when commit.gpgsign is true in the repository config (151.036037ms)
  ✔ adds none of the warnings when vcs is off (73.666434ms)
  ✔ keeps doctor exit code 0 while printing the warnings (200.759087ms)
✔ doctor version control warnings (1061.715571ms)
▶ doctor git check
  ✔ passes with git's version at the top of a repository (73.421903ms)
  ✔ warns that git is not found without failing (45.255078ms)
  ✔ warns that a plain folder is not a git repository (9.936975ms)
  ✔ adds a git-env warning naming each variable set (16.770331ms)
  ✔ keeps doctor exit code 0 with only the git warnings (70.035713ms)
✔ doctor git check (218.502877ms)
▶ Git state recording
  ✔ records a head move for a commit and still lands the task (535.998516ms)
  ✔ records a stash move and leaves HEAD unchanged (437.744067ms)
  ✔ records a branch move for a checkout (437.355985ms)
  ✔ records an index move for a staged file (417.97639ms)
  ✔ records neither violation outside git (523.646131ms)
✔ Git state recording (2354.979624ms)
▶ Scope violation recording
  ✔ records an edit outside scope and still lands the task (544.422023ms)
  ✔ leaves a file dirty before spawn alone and records nothing (580.634924ms)
  ✔ records a file that was dirty before spawn and edited again (512.853767ms)
✔ Scope violation recording (1639.594856ms)
▶ Land from the verified tree
  ✔ Unrelated uncommitted work stays (1727.448276ms)
  ✔ Uncommitted file the change writes (1450.981977ms)
  ✔ Default branch moves during the land (1646.363974ms)
  ✔ No verify without a merge (1956.972055ms)
✔ Land from the verified tree (6784.578185ms)
▶ Default branch sync
  ✔ Sync announces itself (1503.528066ms)
  ✔ Sync records its verify (1116.117013ms)
✔ Default branch sync (2620.089936ms)
▶ Land command
  ✔ Progress on stderr (902.935347ms)
✔ Land command (903.330542ms)
▶ Land message command
  ✔ Message is the land commit's message (795.785091ms)
✔ Land message command (796.056491ms)
▶ Vcs commitTree
  ✔ commits a branch's tree with the parent, author, and message, writing nothing (185.961635ms)
  ✔ runs no hook (75.437521ms)
  ✔ signs when git is set to, because commit-tree ignores the setting (107.321074ms)
✔ Vcs commitTree (370.223815ms)
▶ Vcs fastForward
  ✔ moves HEAD past a modified, a staged, and an untracked file it does not touch (140.23414ms)
  ✔ blocks an uncommitted file the commit changes and runs no write (116.087008ms)
  ✔ blocks an uncommitted rename whose old path the commit changes (106.615659ms)
  ✔ fails with git output when the named commit is not a descendant (96.782992ms)
✔ Vcs fastForward (460.426579ms)
▶ Vcs countCommits
  ✔ counts the commits the target adds and answers zero for missing refs (112.747486ms)
✔ Vcs countCommits (113.05954ms)
▶ NoVcs land operations
  ✔ counts zero and fails the writes naming the reason (0.608726ms)
✔ NoVcs land operations (0.732811ms)
▶ osq land refusals
  ✔ Modified tracked file (1598.540724ms)
  ✔ lands a change when the checkout holds only an untracked draft of another change (1505.105452ms)
  ✔ refuses off the default branch and leaves the checkout and worktree alone (1402.11712ms)
  ✔ refuses an edited worktree and leaves the checkout and worktree alone (1424.879668ms)
  ✔ refuses a later change that shares a capability with an earlier unlanded one (2468.453101ms)
  ✔ lands a later change that shares no capability with an earlier one (1532.249678ms)
  ✔ refuses with vcs.enabled off (604.151898ms)
  ✔ refuses with vcs.enabled on but no git repository (5.677595ms)
✔ osq land refusals (10546.653961ms)
▶ osq land
  ✔ lands an archived change, prints its lines, and cleans up the draft and worktree (1699.795357ms)
  ✔ lands two changes in order, rebuilding the shared living spec (3116.773653ms)
  ✔ stops on a sync conflict and leaves the checkout alone (1837.799529ms)
  ✔ Land commit runs no hook (1261.104779ms)
✔ osq land (7917.878097ms)
▶ osq land cleanup
  ✔ cleans up a change landed by hand with the worktree kept (900.679312ms)
  ✔ reports nothing to clean up the second time (901.434042ms)
  ✔ keeps an edited leftover copy in place (775.207541ms)
✔ osq land cleanup (2577.986396ms)
▶ osq land command
  ✔ prints a refusal on stderr and nothing on stdout (609.453713ms)
  ✔ registers land and doctor on the root program (2.361571ms)
✔ osq land command (612.051375ms)
▶ Vcs merge operations
  ✔ leaves a clean no-commit merge staged with HEAD unchanged (195.512211ms)
  ✔ reports a conflict and abort restores HEAD and an empty status (129.23239ms)
  ✔ squashes a branch that contains HEAD into one parentless commit (145.672818ms)
  ✔ fails when an untracked file is in the way and leaves it and the index alone (76.09266ms)
  ✔ answers ancestry for ancestors, descendants, itself, and missing refs (68.76452ms)
  ✔ stages exactly the given paths, including deletions (66.298933ms)
✔ Vcs merge operations (685.739194ms)
▶ NoVcs merge operations
  ✔ answers ancestry false and fails the writes naming the reason (0.749763ms)
✔ NoVcs merge operations (0.971172ms)
▶ Vcs pathExists
  ✔ answers whether a file or directory exists at a branch (119.764637ms)
  ✔ places a stacked approval under .stacked (0.546833ms)
✔ Vcs pathExists (121.510837ms)
▶ syncWithDefaultBranch on an active change
  ✔ takes the default branch before the first task without running verify (305.26028ms)
  ✔ re-runs the verify of each done non-manual task (265.389494ms)
  ✔ stops when a done task verify fails after the merge (276.168426ms)
  ✔ stops on a code conflict with a sync_conflict SyncStop (231.10856ms)
  ✔ keeps uncommitted events when the sync commit fails (282.490041ms)
✔ syncWithDefaultBranch on an active change (1362.694052ms)
▶ syncWithDefaultBranch on a stacked dependent
  ✔ takes a landed dependency archive from the default branch (293.975649ms)
✔ syncWithDefaultBranch on a stacked dependent (295.96327ms)
▶ syncChange on request
  ✔ syncs an active change and reports the merge (755.807759ms)
  ✔ reports an already current branch without merging (521.474408ms)
  ✔ refuses while a task of the change runs (494.510611ms)
  ✔ refuses when no change matches the id (446.294573ms)
  ✔ refuses while the worktree has uncommitted changes (557.680523ms)
  ✔ refuses when version control is off (542.207186ms)
  ✔ records a stop for an active change without halting it (669.671171ms)
  ✔ leaves an archived change worktree clean after a stop (1681.004137ms)
  ✔ refuses a dependent stacked on an unlanded change (1362.682597ms)
✔ syncChange on request (7033.894674ms)
▶ osq sync command
  ✔ prints the result to stdout and the progress to stderr (475.971527ms)
  ✔ prints a refusal on stderr and sets exit one (301.660843ms)
  ✔ registers sync on the root program (3.55736ms)
✔ osq sync command (781.628086ms)
▶ syncWithDefaultBranch
  ✔ reports no merge when the default branch is already an ancestor (221.908869ms)
  ✔ rebuilds the living spec from the default branch copy and the delta (323.145191ms)
  ✔ stops when the default branch changed a requirement the change rewrites (207.302231ms)
  ✔ stops on a code conflict and leaves HEAD and status unchanged (196.43318ms)
  ✔ stops when the merged tree fails the proposal verify (237.91916ms)
  ✔ stops when vcs.prepare fails and leaves HEAD and status unchanged (242.567625ms)
  ✔ stops when a pre-commit hook rejects the sync commit (303.141577ms)
✔ syncWithDefaultBranch (1734.685942ms)
▶ One merge for archive and sync
  ✔ uses applyOpenSpecDeltas in both archiver and sync-specs, defining neither (3.756477ms)
✔ One merge for archive and sync (4.139063ms)
▶ File at a branch
  ✔ shows a file at a ref and returns null when the ref lacks it (194.087991ms)
✔ File at a branch (195.969917ms)
▶ Prune a deleted worktree
  ✔ drops only the record whose directory is gone (105.331317ms)
✔ Prune a deleted worktree (105.686643ms)
▶ Worktree recreation
  ✔ recreates a deleted worktree directory and runs the change there (1314.05942ms)
[osq] recreated worktree /tmp/osq-wt-recreate-1w1wLh/worktrees/repo/001-order-flow for 001-order-flow
[osq] [spec] 001 picked up (001-order-flow)
[osq] [task] task 1 started (pid: unknown, timeout: 1800s): When initial condition, e…
[osq] [ok] task 1 verified (elapsed: 0.2s)
[osq] [archived] 001 archived (001-order-flow)
[osq] Human steps after completion:
[osq] None
  ✔ recreates a worktree removed with git worktree remove (1116.738633ms)
  ✔ creates no worktree for an osq branch whose change is archived (329.777823ms)
  ✔ does nothing when git is unavailable (20.329703ms)
  ✔ creates no worktree when vcs is disabled (462.342303ms)
✔ Worktree recreation (3244.229202ms)
▶ Vcs config defaults
  ✔ names the default branch and worktree root and keeps vcs off (1.556617ms)
  ✔ trims defaultBranch loaded through loadConfig (231.193187ms)
  ✔ rejects a blank defaultBranch loaded through loadConfig (14.540857ms)
✔ Vcs config defaults (249.941311ms)
▶ Vcs port default branch
  ✔ reads origin’s default branch ahead of vcs.defaultBranch (69.156491ms)
  ✔ falls back to vcs.defaultBranch without a remote, then main (53.128024ms)
✔ Vcs port default branch (123.897534ms)
▶ Worktree location
  ✔ uses the default root under the home directory (1.087032ms)
  ✔ uses the configured root and expands a leading tilde to the home directory (0.417023ms)
✔ Worktree location (1.85806ms)
▶ GitResult and runGit
  ✔ keeps git stderr and merges the extra environment over the cleaned one (58.687421ms)
✔ GitResult and runGit (61.038972ms)
▶ Vcs write operations
  ✔ creates a branch at a base commit and fails when it already exists (91.857222ms)
  ✔ adds a worktree for an existing branch and lists its path, branch, and HEAD (93.964475ms)
  ✔ removes a clean worktree and keeps a dirty one with its file (147.358409ms)
  ✔ commits exactly the given paths with the given author and returns the commit (89.615754ms)
  ✔ fails with the hook output when a pre-commit hook rejects the commit (86.816007ms)
  ✔ fails a commit that exceeds timeouts.gitCommitSeconds (284.157382ms)
  ✔ patches modified and untracked files through a temporary index (134.258418ms)
  ✔ discards nothing in a checkout or a linked worktree off an osq branch (145.588005ms)
  ✔ restores tracked files, removes untracked ones, and keeps ignored ones (179.735955ms)
✔ Vcs write operations (1255.069844ms)
▶ Vcs port reads for writes
  ✔ lists only executable, non-sample hooks (81.522315ms)
  ✔ filters branches by prefix and reads git config values (97.484135ms)
  ✔ reports a worktree on a detached HEAD with a null branch (108.522203ms)
✔ Vcs port reads for writes (288.307483ms)
▶ NoVcs writes
  ✔ rejects every write naming the reason and answers new reads emptily (0.963677ms)
✔ NoVcs writes (1.131113ms)
▶ Operations osq never runs
  ✔ has no forbidden git argument literal under src/core/vcs (123.466289ms)
  ✔ exposes exactly the intended members on the port (2.562837ms)
✔ Operations osq never runs (126.411371ms)
▶ Vcs selection
  ✔ returns NoVcs for a plain folder outside any repository (22.716616ms)
  ✔ returns NoVcs for a folder below the repository root (12.329414ms)
  ✔ returns NoVcs when the git binary cannot be found (50.991227ms)
  ✔ selects GitVcs at the top level of a temporary repository (65.691181ms)
✔ Vcs selection (155.104086ms)
▶ Vcs port
  ✔ NoVcs answers every read with empty values and carries the reason (19.602172ms)
  ✔ reads the repository root (52.296183ms)
  ✔ reports HEAD commit and branch on a branch (45.873534ms)
  ✔ reports a null commit in a repository with no commit (24.088042ms)
  ✔ reports a null branch when HEAD is detached (48.927474ms)
  ✔ lists a stash made with -m and the branch it was made on (72.651853ms)
  ✔ lists an untracked file in a new folder and leaves ignored files out (69.484315ms)
  ✔ reports a renamed file with its old path (44.378734ms)
  ✔ changes the index digest when a file is staged (39.454632ms)
  ✔ ignores GIT_DIR set in the environment (73.787555ms)
✔ Vcs port (492.072828ms)
▶ Vcs git read timeout
  ✔ bounds each read by timeouts.gitSeconds (143.01447ms)
  ✔ uses a ten second default when timeouts.gitSeconds is unset (235.211118ms)
✔ Vcs git read timeout (379.013892ms)
▶ verification pending dependency
  ✔ blocks a dependent of a pending archived change, then frees it on passed (77.733875ms)
  ✔ keeps the dependent blocked while the archived outcome is failed (36.861652ms)
  ✔ treats an archived dependency without a verification requirement as met (17.93699ms)
✔ verification pending dependency (134.003959ms)
▶ verification pending queue dependency
  ✔ derives the archived association as verification-pending and holds its dependent (33.817184ms)
✔ verification pending queue dependency (34.343146ms)
▶ archived verification requirement
  ✔ records after-landing steps on the archived event (39.336755ms)
  ✔ records a check command without after-landing steps (19.771618ms)
  ✔ records only archivePath when there are no human steps or check (17.220646ms)
  ✔ records nothing extra when the section is absent (14.176998ms)
✔ archived verification requirement (93.086233ms)
▶ human verification events
  ✔ appends one verification_recorded event with outcome and note (23.50066ms)
  ✔ records a null note when none is given (37.54184ms)
  ✔ refuses a non-archived change and appends nothing (9.499367ms)
  ✔ refuses an archived change that requires no verification (22.659754ms)
✔ human verification events (93.994133ms)
▶ checked-in check command
  ✔ runs the recorded check and records command, exit code, duration, and output (57.58863ms)
  ✔ refuses an archived change without a check command and appends nothing (16.418191ms)
  ✔ refuses a non-archived change and appends nothing (12.139994ms)
✔ checked-in check command (86.79473ms)
▶ check command
  ✔ prints the exit code, output, and next step and exits zero when passed (79.963598ms)
  ✔ exits one after a failing check and still records the event (69.115485ms)
  ✔ refuses a change without a check command and appends nothing (13.675046ms)
✔ check command (163.30037ms)
▶ verified command
  ✔ appends one event and prints Next: landed for a passed outcome (11.164058ms)
  ✔ records a failed outcome with a note and prints the failed next step (13.60047ms)
  ✔ refuses both flags and appends nothing (8.060985ms)
  ✔ refuses neither flag and appends nothing (9.967598ms)
  ✔ refuses a change that requires no verification and appends nothing (31.825175ms)
✔ verified command (75.221698ms)
▶ command registration
  ✔ registers check and verified with their flags (3.57077ms)
✔ command registration (4.067138ms)
▶ verify path check in runTask
  ✔ kills the task with verify_path_missing before the verify runs (281.26279ms)
  ✔ reaches done when the agent writes the named path (318.587813ms)
  ✔ behaves as today when the verify names no paths (386.195754ms)
  ✔ records missingPaths and mismatch false when only the new path is absent (272.211377ms)
✔ verify path check in runTask (1264.214605ms)
▶ verify_path_missing through the watcher loop
  ✔ retries the death automatically and the next prompt names the missing path (460.985447ms)
✔ verify_path_missing through the watcher loop (462.025716ms)
▶ verify path extraction
  ✔ keeps a quoted operand as one token (20.448977ms)
  ✔ names a quoted path operand (3.094377ms)
  ✔ ignores --import tsx (2.135387ms)
  ✔ ignores KEY=value assignments (2.044488ms)
  ✔ ignores URLs (1.527386ms)
  ✔ ignores a bare first token and a pathless command (4.621943ms)
  ✔ names a path-shaped first token (2.148999ms)
  ✔ reports a glob operand matching no file as missing (10.979901ms)
  ✔ reports a missing exact operand once and keeps command order (7.269252ms)
✔ verify path extraction (57.81206ms)
▶ verify starts documentation
  ✔ managed planner block states the red rule, the shared verify, and the honest any rule (1.097707ms)
  ✔ PLANNER.md and templates/PLANNER.md carry the same planner guidance (20.969766ms)
  ✔ automatic retry bullet names verify_path_missing (6.020852ms)
  ✔ dead reasons list verify_path_missing and explain it (2.163672ms)
  ✔ approval digest bullet adds verify_starts_conflict and stops saying five (2.127126ms)
  ✔ pre-spawn bullet records missing named paths without counting a red mismatch (6.256347ms)
✔ verify starts documentation (41.053273ms)
▶ resolveWaitLogPath
  ✔ keys the log by sha256(realpath) so a symlink and its target agree (22.571693ms)
✔ resolveWaitLogPath (24.035738ms)
▶ waitEpisodes
  ✔ folds duplicates, opened, and gone into one closed episode then a second open one (5.582732ms)
  ✔ ignores an opened or gone without an open episode (1.576815ms)
✔ waitEpisodes (8.087647ms)
▶ firstSeenTimes
  ✔ maps only the identities with an open episode to their seen time (1.408804ms)
✔ firstSeenTimes (1.643023ms)
▶ readWaitLog
  ✔ returns the parseable records in file order and drops unreadable lines (12.087977ms)
  ✔ returns null when the file does not exist (17.893474ms)
✔ readWaitLog (30.605957ms)
▶ dispatchIdentity
  ✔ gives the same string for a dispatch item and its log item (1.249737ms)
  ✔ uses an empty task slot for a change-level item (1.526033ms)
✔ dispatchIdentity (3.129034ms)
▶ createWaitRecorder
  ✔ marks open runs and unseen items on the first observe (33.995116ms)
  ✔ marks appeared and departed items on a later observe and skips a same top (16.428798ms)
  ✔ appends opened and stop after a start (31.300965ms)
  ✔ writes nothing when stop comes before any observe (2.654346ms)
  ✔ resolves both observes and reports once when the home is not writable (3.045361ms)
✔ createWaitRecorder (89.307021ms)
▶ wait recording from the card session
  ✔ records start, seen, top, opened, gone, top, opened, and stop as it approves (175.637977ms)
  ✔ writes nothing when no recorder is given (47.197403ms)
✔ wait recording from the card session (225.493301ms)
▶ wait recording from the follow loop
  ✔ records start, a null top, the new halt, its top, and stop (152.074901ms)
✔ wait recording from the follow loop (152.56051ms)
▶ Build identity from osq package root
  ✔ reports the root version and HEAD when the root tops its own git repository (76.065133ms)
  ✔ never reports the enclosing repository HEAD from below the work-tree top (49.01309ms)
  ✔ reports the current checkout HEAD for the running package root (18.456058ms)
✔ Build identity from osq package root (145.023279ms)
▶ Run identity records
  ✔ records osq identity and the project commit in the started event and done marker (485.40973ms)
  ✔ records null project identity outside a git repository (315.909768ms)
  ✔ prints osq identity, not the project version, in the idle status line (14.143381ms)
✔ Run identity records (816.398429ms)
▶ Build identity resolution
  ✔ returns the package version and a git commit or dist hash (45.595367ms)
  ✔ falls back to the dist hash when git is unavailable (13.690779ms)
  ✔ falls back to unknown when neither git nor dist is present (22.703918ms)
✔ Build identity resolution (83.593233ms)
▶ Runner build identity events
  ✔ records version and commit in the started lifecycle event data (397.115686ms)
✔ Runner build identity events (397.732189ms)
▶ Watcher dev mode
  ✔ builds a worker invocation that runs tsx from src/cli/bin.ts (17.254503ms)
  ✔ delegates to the supervisor only in dev mode outside the worker process (6.786766ms)
  ✔ spawns a tsx worker and watches src/ for changes (7.623028ms)
  ✔ waits for the running task to finish before restarting on a source change (6.742531ms)
  ✔ coalesces repeated source changes into a single pending restart (6.09707ms)
  ✔ terminates the worker on SIGINT and never restarts (9.835128ms)
  ✔ exits non-zero when there is no src/ checkout to run (12.487032ms)
✔ Watcher dev mode (70.582858ms)
▶ Runner heartbeat
  ✔ defaults config.log.heartbeatSeconds to 60 seconds (272.05471ms)
  ✔ computeTaskHeartbeatStats reports elapsed seconds, event count, and total tokens (129.026729ms)
  ✔ computeTaskHeartbeatStats tolerates a missing event file (153.246807ms)
  ✔ logs multiple periodic heartbeat updates with elapsed, events, and tokens (706.077105ms)
task 1 started green, but it declared red
  ✔ starts the heartbeat timer unreferenced via unref() (736.198061ms)
  ✔ clears the heartbeat timer in the finally block so it stops on completion (1200.946133ms)
✔ Runner heartbeat (3199.677026ms)
▶ Watcher lifecycle modules
  ✔ acquires and releases a task lock through the watcher wrapper (11.810002ms)
  ✔ keeps lock.ts and heartbeat.ts under the 200 line module budget (2.65282ms)
✔ Watcher lifecycle modules (16.071563ms)
▶ Watcher loop permanent logging
  ✔ logs a single pick-up line when an approved spec is detected (527.739118ms)
  ✔ logs a single archive line when a completed spec is archived (397.967209ms)
  ✔ logs a single halt line when a task dies (253.853414ms)
  ✔ logs watcher errors at error level on permanent lines (27.555439ms)
✔ Watcher loop permanent logging (1209.429333ms)
▶ Watcher loop symbol formatting
  ✔ resolveSymbol returns unicode when enabled and plain words otherwise (10.634807ms)
  ✔ uses unicode symbols on an interactive TTY (436.210815ms)
  ✔ uses plain words when stderr is not a TTY (917.065143ms)
  ✔ uses plain words when CI is set (479.279486ms)
  ✔ uses plain words when NO_COLOR is present (360.236657ms)
✔ Watcher loop symbol formatting (2204.27091ms)
▶ Watcher idle status
  ✔ formats the build prefix, watching path, approved waiting count, and last archived spec (26.171926ms)
  ✔ sets an idle status with the waiting count and last archived spec (464.166567ms)
✔ Watcher idle status (490.7846ms)
▶ Watcher SIGINT handling
  ✔ clears status, restores the cursor, logs waiting, then exits on second SIGINT (383.993941ms)
✔ Watcher SIGINT handling (384.319193ms)
▶ Watcher Preflight Verification
  ✔ Watcher start runs preflight check when harness is opencode (153.622458ms)
  ✔ Preflight executes <bin> --version before any task is picked or spawned (459.780597ms)
  ✔ Missing binary prints single clear line naming bin path and exits non-zero without dispatching tasks (143.118103ms)
  ✔ Failing binary prints single clear line naming bin path and exits non-zero without dispatching tasks (51.597318ms)
  ✔ Missing binary in standalone child process exits non-zero and prints single line to stderr (436.753116ms)
  ✔ Successful execution logs resolved version string and proceeds to task cycle (537.718074ms)
  ✔ preflightOpencode helper resolves binary from config or environment and returns version info (242.296599ms)
✔ Watcher Preflight Verification (2027.159637ms)
▶ Active change folder classification
  ✔ treats containers, scaffolding, and dotfiles as inactive (0.655145ms)
✔ Active change folder classification (1.684713ms)
▶ Watcher skips archive and rejected folders
  ✔ runs the approved change without logging a rejected-folder error (477.171336ms)
✔ Watcher skips archive and rejected folders (477.79321ms)
▶ Watcher stale build preflight
  ✔ exits with code 1 and exactly one stderr line when src/ is newer than dist/ (169.407068ms)
  ✔ exits with code 1 when a checkout has src/ but no dist/ (129.555526ms)
  ✔ continues when allowStale is true even with a stale layout (130.224241ms)
  ✔ continues for an installed package with no src/ directory (143.57053ms)
  ✔ continues when dist/ is newer than src/ (152.404974ms)
✔ Watcher stale build preflight (727.600219ms)
▶ Watcher Loop and CLI
  ✔ runWatcherOnce processes approved specs, executes tasks, and archives on completion (512.582892ms)
  ✔ runWatcherOnce executes multiple tasks sequentially in a multi-task spec without hash conflict and archives (777.309437ms)
  ✔ CLI registers watch and setup commands with expected options (40.182316ms)
✔ Watcher Loop and CLI (1336.148554ms)
▶ web graph change task progress
  ✔ counts done markers next to the task count on every change node (168.974296ms)
  ✔ counts every task of an archived change with all done markers (69.756726ms)
  ✔ reports zero for an archived change without done markers (85.887797ms)
✔ web graph change task progress (326.624665ms)
▶ web cost with no reported value
  ✔ keeps an unreported cost null with zero coverage in the graph (106.553369ms)
  ✔ keeps an unreported task cost null and a partially reported one summed (60.598634ms)
✔ web cost with no reported value (168.515155ms)
▶ web data graph nodes
  ✔ reads current capabilities plus active, archived, and rejected changes deterministically (194.342191ms)
  ✔ carries recorded lifecycle metadata and separate observed summaries (76.362906ms)
  ✔ keeps archived and rejected evidence separate and never estimates planning (51.125285ms)
  ✔ emits one deterministic edge per declared relationship (40.80497ms)
✔ web data graph nodes (364.720121ms)
▶ web data change detail
  ✔ resolves a numeric id and exposes task evidence without inference (87.895182ms)
  ✔ distinguishes ambiguous and absent selectors and resolves exact keys (109.786886ms)
  ✔ ignores malformed optional lines and missing history without dropping evidence (98.57535ms)
✔ web data change detail (296.84073ms)
▶ invalidation hub change trees
  ✔ classifies paths through the change tree it is given (1.786847ms)
✔ invalidation hub change trees (2.553397ms)
▶ dashboard static export
  ✔ inlines every view document with scrubbed paths beside the built UI (258.230254ms)
  ✔ refuses a non-empty target before writing anything (14.743503ms)
  ✔ stages the dashboard index with relative asset paths (39.579637ms)
✔ dashboard static export (314.197487ms)
▶ graph command
  ✔ prints the serialized system graph followed by a newline with --json (112.739966ms)
  ✔ prints node, edge, and gap summary lines for a project (24.903612ms)
  ✔ writes no file (39.313604ms)
  ✔ prints a config error to stderr and exits one (263.580488ms)
  ✔ names osq graph in the README command list (2.463759ms)
✔ graph command (445.178976ms)
▶ web planning cost coverage
  ✔ keeps a token-only planning cost null with zero cost coverage (77.531753ms)
  ✔ sums only the priced session while covering both (36.658209ms)
✔ web planning cost coverage (115.510411ms)
▶ system graph traceability
  ✔ holds the pricing sample test, function, and links (83.849194ms)
  ✔ holds a surviving mutant from an archived change on its function (55.036074ms)
  ✔ lists an unknown @adr tag without a follows edge (47.036605ms)
  ✔ adds no test or function nodes when pricing is not opted in (25.416951ms)
  ✔ builds two thousand scenarios and proves edges (2144.266061ms)
  ℹ built the 2000-scenario graph in 1166ms
✔ system graph traceability (2357.870021ms)
▶ system graph traceability gaps
  ✔ marks an untested scenario and an unclaimed function (41.316808ms)
  ✔ gives the same gap counts as the report (59.19546ms)
✔ system graph traceability gaps (101.018838ms)
▶ system graph document
  ✔ holds the capability, requirement, and scenario from the living spec (109.189613ms)
  ✔ reports the same output for two builds of the same project (130.306057ms)
  ✔ gives a colliding scenario id a suffixed id (71.310011ms)
✔ system graph document (312.686941ms)
▶ system graph links
  ✔ holds the group and ADR edges (92.864501ms)
  ✔ holds a change node with its reads and writes edges (83.99958ms)
  ✔ holds one import edge between two capabilities (76.719643ms)
  ✔ holds no import edge when no file crosses capabilities (57.026588ms)
✔ system graph links (311.425093ms)
▶ system graph gaps
  ✔ marks an unowned file and leaves owned files alone (58.420326ms)
✔ system graph gaps (58.764439ms)
▶ Violations kill in a worktree
  ✔ kills a worktree task that edits outside its scope before verify (701.511925ms)
  ✔ kills a worktree task that commits, with the warning as its marker body (361.448936ms)
  ✔ records the same edit in the checkout and still lands the task (326.044098ms)
✔ Violations kill in a worktree (1391.30397ms)
▶ New test file
  ✔ does not record a scope violation in a worktree (460.338618ms)
  ✔ does not record a scope violation in the checkout (287.338891ms)
✔ New test file (748.142547ms)
▶ Both violations
  ✔ records both and dies with vcs_violation (326.64443ms)
✔ Both violations (327.088522ms)
▶ lifecycle commands in a worktree
  ✔ reject moves the change inside the worktree and leaves the checkout untouched (646.665098ms)
  ✔ retry recertifies the task in the worktree scope and root (344.148455ms)
  ✔ manual done writes the marker in the worktree and not in the checkout (300.208058ms)
✔ lifecycle commands in a worktree (1292.840316ms)
▶ task running in the worktree
  ✔ warns below the worktree line while a live lock exists and not after (504.438334ms)
✔ task running in the worktree (505.11179ms)
▶ Worktree run
  ✔ runs the task in the worktree with OSQ_CHANGE set (794.152671ms)
  ✔ halts a dirty worktree and a human clears the halt (765.982013ms)
  ✔ treats uncommitted records and a ticked tasks.md as not dirt (500.573584ms)
✔ Worktree run (2062.632165ms)
▶ Worktree halt
  ✔ reports an off-branch worktree and writes the halt marker and event (255.721469ms)
✔ Worktree halt (256.134535ms)
▶ Verified task commit
  ✔ commits two tasks in task order with only each task files and records (789.632878ms)
  ✔ commits a new test file outside the task scope (507.90058ms)
  ✔ commits a done task the watcher had not committed before the next spawn (728.339506ms)
✔ Verified task commit (2026.610687ms)
▶ Archive commit
  ✔ archives with a commit that leaves the worktree clean (442.065578ms)
✔ Archive commit (442.320591ms)
▶ Commit failure
  ✔ halts on a rejected commit and retries it after the hook is fixed (687.356552ms)
✔ Commit failure (687.650817ms)
▶ Dead path in a worktree
  ✔ commits a verify failure, restores the agent edits, and keeps the patch (346.013158ms)
  ✔ commits a crash the reaper finds after a restart (258.058768ms)
✔ Dead path in a worktree (604.356751ms)
▶ Automatic retry
  ✔ retries a scope violation and names the violating file (491.248314ms)
✔ Automatic retry (491.435674ms)
▶ Watcher sync
  ✔ syncs the default branch before the first task (1029.544875ms)
  ✔ does not sync between tasks, only before archive (1121.844894ms)
  ✔ halts with sync_conflict when main changed the same line before archive (518.692888ms)
  ✔ skips both syncs for a stacked dependent while its dependency waits (1123.135328ms)
  ✔ syncs after the dependency lands during the dependent run (1463.304946ms)
✔ Watcher sync (5258.48399ms)
ℹ tests 2738
ℹ suites 678
ℹ pass 2737
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 49969.904084

✖ failing tests:

test at tests/living-specs-delta-equivalence.test.ts:3:1260
✖ re-seeds every living spec as the cumulative deterministic merge of 016..027 (931.583426ms)
  AssertionError [ERR_ASSERTION]: cli-foundation living spec is not the deterministic merge
  + actual - expected
  ... Skipped lines
  
    '# cli-foundation Specification\n' +
      '\n' +
      '## Purpose\n' +
      'Provides command-line interface entrypoints, configuration loading, leveled logging with an interactive status sink, project scaffolding, and npm package distribution.\n' +
      '\n' +
  ...
      '#### Scenario: Doctor rejects an incomplete gate configuration\n' +
  +   '- **WHEN** the r'... 121529 more characters
  -   '- **WHEN** the r'... 120272 more characters
  
      at TestContext.<anonymous> (tests/living-specs-delta-equivalence.test.ts:193:14)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1905:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: "# cli-foundation Specification\n\n## Purpose\nProvides command-line interface entrypoints, configuration loading, leveled logging with an interactive status sink, project scaffolding, and npm package distribution.\n\n## Requirements\n\n### Requirement: Configuration loading and schema validation\n<!-- source: src/core/config.ts, src/core/config-gates.ts, tests/config.test.ts, tests/pre-spawn-config.test.ts, tests/auto-retry-config.test.ts -->\nThe system SHALL load operational configuration from `osq.config.ts` merged\nover `DEFAULT_CONFIG` using the `defineConfig` helper. Public configuration\nSHALL contain `gates.changeVerifyAfterTask`, a boolean defaulting to `true`,\n`gates.preSpawnVerify`, one of `warn`, `fail`, or `off`, defaulting to `warn`,\nand `gates.autoRetries`, a non-negative integer defaulting to 1. Partial gate\nconfiguration SHALL merge over those defaults and invalid gate values SHALL be\nrejected.\n\n#### Scenario: Default configuration resolution\n- **WHEN** no `osq.config.ts` exists in the project root\n- **THEN** system defaults harness to `agy`, maxConcurrency to 1, maxScopeFiles to 8, timeouts to standard limits, `gates.changeVerifyAfterTask` to true, `gates.preSpawnVerify` to `warn`, and `gates.autoRetries` to 1\n\n#### Scenario: Environment variable overrides\n- **WHEN** `OSQ_HARNESS` or `OSQ_MODEL` is set in the process environment or `.env`\n- **THEN** system overrides the corresponding configuration values\n\n#### Scenario: Incremental verification opt-out\n- **WHEN** configuration declares `gates.changeVerifyAfterTask: false`\n- **THEN** resolved configuration retains false while preserving all unrelated gate defaults\n\n#### Scenario: Invalid incremental verification toggle\n- **WHEN** `gates.changeVerifyAfterTask` is present with a non-boolean value\n- **THEN** configuration validation fails with a diagnostic naming the key\n\n#### Scenario: Pre-spawn verify mode\n- **WHEN** configuration declares `gates.preSpawnVerify: fail` or `off`\n- **THEN** resolved configuration retains that mode while preserving `gates.changeVerifyAfterTask`\n\n#### Scenario: Invalid pre-spawn verify mode\n- **WHEN** `gates.preSpawnVerify` is present with a value other than `warn`, `fail`, or `off`\n- **THEN** configuration validation fails with a diagnostic naming the key\n\n#### Scenario: Automatic retry count\n- **WHEN** configuration declares `gates.autoRetries: 0`\n- **THEN** resolved configuration retains 0 while preserving the other gate defaults\n\n#### Scenario: Invalid automatic retry count\n- **WHEN** `gates.autoRetries` is negative, fractional, or not a number\n- **THEN** configuration validation fails with a diagnostic naming the key\n\n### Requirement: Scaffolding and project initialization\n<!-- source: features/cli-foundation.md # Scaffolding (osq init), tests/init.test.ts -->\nThe system SHALL initialize repository structure and agent instructions via `osq init` idempotently.\n\n#### Scenario: First initialization in clean directory\n- **WHEN** user executes `osq init`\n- **THEN** system creates `openspec/`, `specs/`, config files, templates, and injects managed block into `AGENTS.md`\n\n#### Scenario: Re-running initialization on existing repository\n- **WHEN** user executes `osq init` on an existing project\n- **THEN** system preserves existing files outside managed markers and reports existing paths as skipped\n\n### Requirement: Change specification creation\n<!-- source: features/cli-foundation.md # Change Creation (osq new <name>), tests/new.test.ts -->\nThe system SHALL prepare new change specifications via `osq new <name>`.\n\n#### Scenario: Numbering and slugification\n- **WHEN** user executes `osq new <name>`\n- **THEN** system calculates the next 3-digit padded identifier from active and archived changes, creates a slugified directory, copies templates, and writes the title\n\n### Requirement: Interactive terminal status line and log leveling\n<!-- source: features/cli-foundation.md # Leveled Logging & Terminal Output, tests/logger.test.ts, tests/logger-status.test.ts -->\nThe logger SHALL render a single-line live animated status row on interactive TTY terminals without corrupting permanent logs.\n\n#### Scenario: Interactive TTY rendering\n- **WHEN** stderr is an interactive TTY, quiet mode is unset, and CI is unset\n- **THEN** status row animates an 80ms spinner, truncates text to terminal width minus spinner prefix, and never applies `[osq]` prefix to status text\n\n#### Scenario: Non-TTY and CI fallback\n- **WHEN** stderr is not a TTY or `CI` environment variable is set\n- **THEN** logger disables dynamic status animation and status calls become no-ops\n\n### Requirement: Package hygiene and release distribution\n<!-- source: package.json, pnpm-workspace.yaml, scripts/stage-ui.mjs, src/core/web-static.ts, tests/package-hygiene.test.ts, tests/package-install-smoke.test.ts, tests/ui-budget.test.ts -->\nThe system SHALL package exclusively compiled CLI artifacts, staged dashboard\nassets, templates, and legal metadata for npm distribution. The private React\nand Vite workspace SHALL build production files into package-root `ui/dist`\nthrough the root build used by `prepublishOnly`, and root `package.json` SHALL\nlist that directory in `files`.\n\nReact, React DOM, their type declarations, and Vite SHALL remain build-time\ndependencies of the private UI workspace. The published CLI's runtime\ndependency set SHALL gain no frontend or server package. All regular files\nbelow staged `ui/dist` SHALL total no more than 1,000,000 bytes, enforced by\n`pnpm verify` after a production UI build.\n\nThe repository and published package SHALL use Node 24 as their supported\nmajor-version floor. Package engines, CI setup, consumer guidance, and the UI\nworkspace SHALL agree on that baseline; CI SHALL resolve the maintained Node 24\nLTS line rather than a Current release. At planning time the verified current\nLTS patch is 24.21.0.\n\n#### Scenario: Runtime executable version resolution\n- **WHEN** `osq --version` is executed from the compiled binary\n- **THEN** system dynamically reads version from `package.json` matching release metadata\n\n#### Scenario: Packed dashboard assets\n- **WHEN** the root package is built and packed\n- **THEN** the tarball contains `ui/dist/index.html` and production assets but excludes UI source, tests, and workspace build dependencies\n\n#### Scenario: Installed dashboard server\n- **WHEN** the tarball is installed into an isolated consumer project\n- **THEN** `osq serve` can return the packaged index without React or Vite appearing in the installed package's runtime dependencies\n\n#### Scenario: Dashboard exceeds its budget\n- **WHEN** staged UI regular files total more than one million bytes\n- **THEN** the ordinary verification gate fails and reports the measured total\n\n#### Scenario: Node toolchain alignment\n- **WHEN** package metadata, CI, documentation, and workspace manifests are inspected\n- **THEN** each names the Node 24 LTS baseline without retaining a Node 22-only setup\n\n### Requirement: Code ownership\n<!-- source: src/core/foundation/**, src/cli/**, src/index.ts, osq.config.ts, templates/**, AGENTS.md, PLANNER.md, README.md, .env.example -->\nThe CLI Foundation capability SHALL own CLI entrypoints, retry and rejection\ncommands, configuration and shared harness capability resolution, doctor\ndiagnostics, logger, initialization, public configuration exports, managed\nagent and planner instructions, templates, and consumer guidance.\n\n#### Scenario: Codebase ownership boundaries\n- **WHEN** file ownership is resolved for CLI, configuration, retry, scaffolding, or managed guidance files\n- **THEN** system maps `src/core/foundation/**`, `src/cli/**`, `src/index.ts`, `osq.config.ts`, `templates/**`, `AGENTS.md`, `PLANNER.md`, `README.md`, and `.env.example` to cli-foundation\n\n### Requirement: Watch stale build and dev mode CLI options\n<!-- source: src/cli/index.ts, src/cli/watch.ts -->\nThe CLI watch command SHALL support options to bypass stale build detection and enable reactive dev execution.\n\n#### Scenario: Stale build bypass flag\n- **WHEN** user executes `osq watch --allow-stale`\n- **THEN** CLI passes `allowStale: true` to the watch loop options\n\n#### Scenario: Reactive dev mode flag\n- **WHEN** user executes `osq watch --dev`\n- **THEN** CLI passes `dev: true` to the watch loop options\n\n### Requirement: Repository health diagnostics\n<!-- source: src/cli/doctor.ts, src/core/foundation/doctor.ts, src/core/foundation/config*.ts, tests/doctor.test.ts, tests/openspec-version.test.ts -->\nThe CLI SHALL provide a doctor command that validates configuration, harness binary availability, managed blocks, lock states, archive integrity, and the OpenSpec validator. A check MAY pass with a warning; doctor prints it as `[warn]` and it does not change the exit code.\n\n#### Scenario: Doctor passes on healthy repository\n- **WHEN** user executes `osq doctor` in a properly configured repository with the pinned validator\n- **THEN** command prints one status line per check (`config`, `harness`, `managed-blocks`, `locks`, `archives`, `validator`) and exits with code 0\n\n#### Scenario: Doctor fails on check violation\n- **WHEN** any diagnostic check fails (invalid config, missing harness binary, drift in managed blocks, orphaned locks, invalid archives, or a validator outside the peer range)\n- **THEN** command reports the failed check line and exits with code 1\n\n#### Scenario: Doctor fails on validator drift\n- **WHEN** the installed OpenSpec validator version lies outside the `peerDependencies` range declared in osq's `package.json`\n- **THEN** command reports a failing `validator` line describing version drift and exits with code 1\n\n#### Scenario: Doctor warns on a compatible validator\n- **WHEN** the installed OpenSpec validator version differs from the pinned version but lies inside the declared peer range\n- **THEN** command prints a `[warn] validator:` line naming the version and the range, and exits with code 0\n\n#### Scenario: Doctor rejects an incomplete gate configuration\n- **WHEN** the r"... 121529 more characters,
    expected: "# cli-foundation Specification\n\n## Purpose\nProvides command-line interface entrypoints, configuration loading, leveled logging with an interactive status sink, project scaffolding, and npm package distribution.\n\n## Requirements\n\n### Requirement: Configuration loading and schema validation\n<!-- source: src/core/config.ts, src/core/config-gates.ts, tests/config.test.ts, tests/pre-spawn-config.test.ts, tests/auto-retry-config.test.ts -->\nThe system SHALL load operational configuration from `osq.config.ts` merged\nover `DEFAULT_CONFIG` using the `defineConfig` helper. Public configuration\nSHALL contain `gates.changeVerifyAfterTask`, a boolean defaulting to `true`,\n`gates.preSpawnVerify`, one of `warn`, `fail`, or `off`, defaulting to `warn`,\nand `gates.autoRetries`, a non-negative integer defaulting to 1. Partial gate\nconfiguration SHALL merge over those defaults and invalid gate values SHALL be\nrejected.\n\n#### Scenario: Default configuration resolution\n- **WHEN** no `osq.config.ts` exists in the project root\n- **THEN** system defaults harness to `agy`, maxConcurrency to 1, maxScopeFiles to 8, timeouts to standard limits, `gates.changeVerifyAfterTask` to true, `gates.preSpawnVerify` to `warn`, and `gates.autoRetries` to 1\n\n#### Scenario: Environment variable overrides\n- **WHEN** `OSQ_HARNESS` or `OSQ_MODEL` is set in the process environment or `.env`\n- **THEN** system overrides the corresponding configuration values\n\n#### Scenario: Incremental verification opt-out\n- **WHEN** configuration declares `gates.changeVerifyAfterTask: false`\n- **THEN** resolved configuration retains false while preserving all unrelated gate defaults\n\n#### Scenario: Invalid incremental verification toggle\n- **WHEN** `gates.changeVerifyAfterTask` is present with a non-boolean value\n- **THEN** configuration validation fails with a diagnostic naming the key\n\n#### Scenario: Pre-spawn verify mode\n- **WHEN** configuration declares `gates.preSpawnVerify: fail` or `off`\n- **THEN** resolved configuration retains that mode while preserving `gates.changeVerifyAfterTask`\n\n#### Scenario: Invalid pre-spawn verify mode\n- **WHEN** `gates.preSpawnVerify` is present with a value other than `warn`, `fail`, or `off`\n- **THEN** configuration validation fails with a diagnostic naming the key\n\n#### Scenario: Automatic retry count\n- **WHEN** configuration declares `gates.autoRetries: 0`\n- **THEN** resolved configuration retains 0 while preserving the other gate defaults\n\n#### Scenario: Invalid automatic retry count\n- **WHEN** `gates.autoRetries` is negative, fractional, or not a number\n- **THEN** configuration validation fails with a diagnostic naming the key\n\n### Requirement: Scaffolding and project initialization\n<!-- source: features/cli-foundation.md # Scaffolding (osq init), tests/init.test.ts -->\nThe system SHALL initialize repository structure and agent instructions via `osq init` idempotently.\n\n#### Scenario: First initialization in clean directory\n- **WHEN** user executes `osq init`\n- **THEN** system creates `openspec/`, `specs/`, config files, templates, and injects managed block into `AGENTS.md`\n\n#### Scenario: Re-running initialization on existing repository\n- **WHEN** user executes `osq init` on an existing project\n- **THEN** system preserves existing files outside managed markers and reports existing paths as skipped\n\n### Requirement: Change specification creation\n<!-- source: features/cli-foundation.md # Change Creation (osq new <name>), tests/new.test.ts -->\nThe system SHALL prepare new change specifications via `osq new <name>`.\n\n#### Scenario: Numbering and slugification\n- **WHEN** user executes `osq new <name>`\n- **THEN** system calculates the next 3-digit padded identifier from active and archived changes, creates a slugified directory, copies templates, and writes the title\n\n### Requirement: Interactive terminal status line and log leveling\n<!-- source: features/cli-foundation.md # Leveled Logging & Terminal Output, tests/logger.test.ts, tests/logger-status.test.ts -->\nThe logger SHALL render a single-line live animated status row on interactive TTY terminals without corrupting permanent logs.\n\n#### Scenario: Interactive TTY rendering\n- **WHEN** stderr is an interactive TTY, quiet mode is unset, and CI is unset\n- **THEN** status row animates an 80ms spinner, truncates text to terminal width minus spinner prefix, and never applies `[osq]` prefix to status text\n\n#### Scenario: Non-TTY and CI fallback\n- **WHEN** stderr is not a TTY or `CI` environment variable is set\n- **THEN** logger disables dynamic status animation and status calls become no-ops\n\n### Requirement: Package hygiene and release distribution\n<!-- source: package.json, pnpm-workspace.yaml, scripts/stage-ui.mjs, src/core/web-static.ts, tests/package-hygiene.test.ts, tests/package-install-smoke.test.ts, tests/ui-budget.test.ts -->\nThe system SHALL package exclusively compiled CLI artifacts, staged dashboard\nassets, templates, and legal metadata for npm distribution. The private React\nand Vite workspace SHALL build production files into package-root `ui/dist`\nthrough the root build used by `prepublishOnly`, and root `package.json` SHALL\nlist that directory in `files`.\n\nReact, React DOM, their type declarations, and Vite SHALL remain build-time\ndependencies of the private UI workspace. The published CLI's runtime\ndependency set SHALL gain no frontend or server package. All regular files\nbelow staged `ui/dist` SHALL total no more than 1,000,000 bytes, enforced by\n`pnpm verify` after a production UI build.\n\nThe repository and published package SHALL use Node 24 as their supported\nmajor-version floor. Package engines, CI setup, consumer guidance, and the UI\nworkspace SHALL agree on that baseline; CI SHALL resolve the maintained Node 24\nLTS line rather than a Current release. At planning time the verified current\nLTS patch is 24.21.0.\n\n#### Scenario: Runtime executable version resolution\n- **WHEN** `osq --version` is executed from the compiled binary\n- **THEN** system dynamically reads version from `package.json` matching release metadata\n\n#### Scenario: Packed dashboard assets\n- **WHEN** the root package is built and packed\n- **THEN** the tarball contains `ui/dist/index.html` and production assets but excludes UI source, tests, and workspace build dependencies\n\n#### Scenario: Installed dashboard server\n- **WHEN** the tarball is installed into an isolated consumer project\n- **THEN** `osq serve` can return the packaged index without React or Vite appearing in the installed package's runtime dependencies\n\n#### Scenario: Dashboard exceeds its budget\n- **WHEN** staged UI regular files total more than one million bytes\n- **THEN** the ordinary verification gate fails and reports the measured total\n\n#### Scenario: Node toolchain alignment\n- **WHEN** package metadata, CI, documentation, and workspace manifests are inspected\n- **THEN** each names the Node 24 LTS baseline without retaining a Node 22-only setup\n\n### Requirement: Code ownership\n<!-- source: src/core/foundation/**, src/cli/**, src/index.ts, osq.config.ts, templates/**, AGENTS.md, PLANNER.md, README.md, .env.example -->\nThe CLI Foundation capability SHALL own CLI entrypoints, retry and rejection\ncommands, configuration and shared harness capability resolution, doctor\ndiagnostics, logger, initialization, public configuration exports, managed\nagent and planner instructions, templates, and consumer guidance.\n\n#### Scenario: Codebase ownership boundaries\n- **WHEN** file ownership is resolved for CLI, configuration, retry, scaffolding, or managed guidance files\n- **THEN** system maps `src/core/foundation/**`, `src/cli/**`, `src/index.ts`, `osq.config.ts`, `templates/**`, `AGENTS.md`, `PLANNER.md`, `README.md`, and `.env.example` to cli-foundation\n\n### Requirement: Watch stale build and dev mode CLI options\n<!-- source: src/cli/index.ts, src/cli/watch.ts -->\nThe CLI watch command SHALL support options to bypass stale build detection and enable reactive dev execution.\n\n#### Scenario: Stale build bypass flag\n- **WHEN** user executes `osq watch --allow-stale`\n- **THEN** CLI passes `allowStale: true` to the watch loop options\n\n#### Scenario: Reactive dev mode flag\n- **WHEN** user executes `osq watch --dev`\n- **THEN** CLI passes `dev: true` to the watch loop options\n\n### Requirement: Repository health diagnostics\n<!-- source: src/cli/doctor.ts, src/core/foundation/doctor.ts, src/core/foundation/config*.ts, tests/doctor.test.ts, tests/openspec-version.test.ts -->\nThe CLI SHALL provide a doctor command that validates configuration, harness binary availability, managed blocks, lock states, archive integrity, and the OpenSpec validator. A check MAY pass with a warning; doctor prints it as `[warn]` and it does not change the exit code.\n\n#### Scenario: Doctor passes on healthy repository\n- **WHEN** user executes `osq doctor` in a properly configured repository with the pinned validator\n- **THEN** command prints one status line per check (`config`, `harness`, `managed-blocks`, `locks`, `archives`, `validator`) and exits with code 0\n\n#### Scenario: Doctor fails on check violation\n- **WHEN** any diagnostic check fails (invalid config, missing harness binary, drift in managed blocks, orphaned locks, invalid archives, or a validator outside the peer range)\n- **THEN** command reports the failed check line and exits with code 1\n\n#### Scenario: Doctor fails on validator drift\n- **WHEN** the installed OpenSpec validator version lies outside the `peerDependencies` range declared in osq's `package.json`\n- **THEN** command reports a failing `validator` line describing version drift and exits with code 1\n\n#### Scenario: Doctor warns on a compatible validator\n- **WHEN** the installed OpenSpec validator version differs from the pinned version but lies inside the declared peer range\n- **THEN** command prints a `[warn] validator:` line naming the version and the range, and exits with code 0\n\n#### Scenario: Doctor rejects an incomplete gate configuration\n- **WHEN** the r"... 120272 more characters,
    operator: 'strictEqual',
    diff: 'simple'
  }
 ELIFECYCLE  Test failed. See above for more details.
 ELIFECYCLE  Command failed with exit code 1.
