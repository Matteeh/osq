//! Proves the sections `plan-prompt.md` is built from.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, Invocation};
use osq_feature_plan::PlanFeature;

/// The one-item queue every row uses.
const QUEUE: &str = "## [a] A\n\nDepends on: nothing\n\nA.\n";

/// The fixed time whose UTC date the brief records.
const TIME: i64 = 1_792_584_000_000;

/// The third section's heading, empty line and sentence.
const SPECS: &str = "## Capability Specs\n\nAll living specs. Read the requirements this change writes or whose code it uses, not whole specs: `osq spec <capability>` lists them and `osq spec <capability> <requirement>` prints one.";

/// The first three sections for a repository with nothing to add.
const PLAIN: &str = "# Planning a change for osq\n\n# Change: 001 - A\nChange ID: 001\nChange Folder: 001-a\n\n## Capability Specs\n\nAll living specs. Read the requirements this change writes or whose code it uses, not whole specs: `osq spec <capability>` lists them and `osq spec <capability> <requirement>` prints one.";

/// Creates a scratch root for one row, removing any left-over folder.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    root
}

/// Writes one file under a base folder, creating its parent folders.
fn write(base: &Path, relative: &str, text: &str) {
    let path = base.join(relative);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("the file's parent is created");
    }
    fs::write(path, text).expect("the file is written");
}

/// Writes the repository's `openspec/queue.md`.
fn write_queue(root: &Path, text: &str) {
    write(root, "openspec/queue.md", text);
}

/// Creates one folder under a base folder.
fn directory(base: &Path, relative: &str) {
    fs::create_dir_all(base.join(relative)).expect("the folder is created");
}

/// Runs `plan --next` at the fixed time and reads the new prompt and brief.
fn prompt_and_brief(root: &Path) -> (String, String) {
    PlanFeature::at(TIME)
        .run(&Invocation::new(root, "plan", vec!["--next".to_owned()]))
        .expect("the row's plan succeeds");
    let folder = root.join("openspec").join("changes").join("001-a");
    let prompt = fs::read_to_string(folder.join("plan-prompt.md")).expect("the prompt reads");
    let brief = fs::read_to_string(folder.join("brief.md")).expect("the brief reads");
    (prompt, brief.trim().to_owned())
}

/// Adds no files.
fn nothing(_root: &Path) {}

/// Adds a padded `PLANNER.md`, two capability folders and a file beside them.
fn planner_and_specs(root: &Path) {
    write(root, "PLANNER.md", "\n  Plan well.\n\n");
    directory(root, "openspec/specs/zeta");
    directory(root, "openspec/specs/eta");
    write(
        root,
        "openspec/specs/readme.md",
        "A file beside the folders.\n",
    );
}

/// Adds a proposed decision only.
fn proposed_decision(root: &Path) {
    write(
        root,
        "decisions/001-x.md",
        "---\nstatus: proposed\napplies_to: all\nrule: R.\n---\n# 1. X\n",
    );
}

/// Adds an accepted decision that applies to one capability.
fn accepted_decision(root: &Path) {
    write(
        root,
        "decisions/007-x.md",
        "---\nstatus: accepted\napplies_to: [beta]\nrule: R.\n---\n# 7. X\n",
    );
}

/// Proves every row of "Prompt sections".
///
/// Covers: rust-plan/prompt-sections
#[test]
fn prompt_sections() {
    type Setup = fn(&Path);
    let rows: [(&str, Setup, &str); 4] = [
        ("nothing", nothing, PLAIN),
        (
            "planner and specs",
            planner_and_specs,
            "Plan well.\n\n# Change: 001 - A\nChange ID: 001\nChange Folder: 001-a\n\n## Capability Specs\n\nAll living specs. Read the requirements this change writes or whose code it uses, not whole specs: `osq spec <capability>` lists them and `osq spec <capability> <requirement>` prints one.\n\n- openspec/specs/eta/spec.md\n- openspec/specs/zeta/spec.md",
        ),
        ("proposed decision", proposed_decision, PLAIN),
        (
            "accepted decision",
            accepted_decision,
            "# Planning a change for osq\n\n# Change: 001 - A\nChange ID: 001\nChange Folder: 001-a\n\n## Capability Specs\n\nAll living specs. Read the requirements this change writes or whose code it uses, not whole specs: `osq spec <capability>` lists them and `osq spec <capability> <requirement>` prints one.\n\n## Architecture Decisions\n\nRead in full every ADR that applies to all, and every ADR that applies to a capability this change writes. Name each governing capability ADR in the proposal's ## Decisions section.\n\n- ADR 007: X. Applies to: beta. Rule: R. Path: decisions/007-x.md",
        ),
    ];
    for (name, setup, prefix) in rows {
        let root = scratch(&format!("prompt_sections/{}", name.replace(' ', "_")));
        write_queue(&root, QUEUE);
        setup(&root);
        let (prompt, brief) = prompt_and_brief(&root);
        let expected = format!("{prefix}\n\n## Brief\n\n{brief}");
        assert_eq!(prompt, expected, "row {name}");
    }
}

/// Proves a proposal whose title is not a string gives an empty title.
///
/// Covers: rust-plan/prompt-sections
#[test]
fn title_fallback() {
    let root = scratch("title_fallback");
    write_queue(&root, "## [a] null\n\nDepends on: nothing\n\nA.\n");
    let (prompt, brief) = prompt_and_brief(&root);
    let expected = format!(
        "# Planning a change for osq\n\n# Change: 001 - \nChange ID: 001\nChange Folder: 001-a\n\n{SPECS}\n\n## Brief\n\n{brief}"
    );
    assert_eq!(prompt, expected, "row title fallback");
}

/// Proves every scope form: all, the names as written, and empty text.
///
/// Covers: rust-plan/prompt-sections
#[test]
fn decision_scopes() {
    let root = scratch("decision_scopes");
    write_queue(&root, QUEUE);
    write(
        &root,
        "decisions/004-all.md",
        "---\nstatus: accepted\napplies_to: all\nrule: A.\n---\n# 4. All rule\n",
    );
    write(
        &root,
        "decisions/005-named.md",
        "---\nstatus: accepted\napplies_to: [beta, gamma]\nrule: B.\n---\n# 5. Named rule\n",
    );
    write(
        &root,
        "decisions/006-none.md",
        "---\nstatus: accepted\nrule: C.\n---\n# 6. No scope\n",
    );
    let (prompt, brief) = prompt_and_brief(&root);
    let decisions = "## Architecture Decisions\n\nRead in full every ADR that applies to all, and every ADR that applies to a capability this change writes. Name each governing capability ADR in the proposal's ## Decisions section.\n\n- ADR 004: All rule. Applies to: all. Rule: A. Path: decisions/004-all.md\n- ADR 005: Named rule. Applies to: beta, gamma. Rule: B. Path: decisions/005-named.md\n- ADR 006: No scope. Applies to: . Rule: C. Path: decisions/006-none.md";
    let expected = format!("{PLAIN}\n\n{decisions}\n\n## Brief\n\n{brief}");
    assert_eq!(prompt, expected, "row decision scopes");
}
