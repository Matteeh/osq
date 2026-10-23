//! Proves `plan <id>` steers a change in its worktree or archive with vcs on.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use osq_core::{Feature, FeatureError, Invocation};
use osq_feature_plan::PlanFeature;

/// The fixture the tests copy.
fn fixture() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/steer-worktrees")
}

/// The golden folder the tests compare against.
fn goldens() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/steer-worktrees-golden")
}

/// The folders whose change sits in the tree's archive.
const ARCHIVED: [&str; 1] = ["003-land-stop"];

/// Creates a canonical scratch root for one row, removing any left-over folder.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("plan_steer_trees")
        .join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    fs::canonicalize(&root).expect("the scratch root resolves")
}

/// Copies a folder tree, dot folders and files included.
fn copy_tree(from: &Path, to: &Path) {
    fs::create_dir_all(to).expect("the target folder is created");
    for entry in fs::read_dir(from).expect("the source folder is read") {
        let entry = entry.expect("the source entry is read");
        let target = to.join(entry.file_name());
        if entry.file_type().expect("the entry type is read").is_dir() {
            copy_tree(&entry.path(), &target);
        } else {
            fs::copy(entry.path(), target).expect("the source file is copied");
        }
    }
}

/// Writes a file, creating its parent folders.
fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().expect("the file has a parent"))
        .expect("the file's folders are created");
    fs::write(path, text).expect("the file is written");
}

/// Runs git in a folder, failing with both streams when it refuses.
fn git(repo: &Path, args: &[&str]) -> String {
    let output = Command::new("git")
        .args(args)
        .current_dir(repo)
        .output()
        .expect("git starts");
    assert!(
        output.status.success(),
        "git {args:?}: {}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8_lossy(&output.stdout).into_owned()
}

/// Commits every change in a worktree or the checkout.
fn commit(repo: &Path, message: &str) {
    git(repo, &["add", "-A"]);
    git(repo, &["commit", "-q", "-m", message]);
}

/// The change folder of one fixture row, as the golden script places it.
fn change_path(scratch: &Path, folder: &str) -> PathBuf {
    if folder == "005-conflict" {
        return scratch
            .join("repo")
            .join("openspec")
            .join("changes")
            .join(folder);
    }
    let changes = scratch
        .join("trees")
        .join(folder)
        .join("openspec")
        .join("changes");
    if ARCHIVED.contains(&folder) {
        changes.join("archive").join(folder)
    } else {
        changes.join(folder)
    }
}

/// Builds the scratch repository the golden script describes, giving its checkout.
fn repository(scratch: &Path) -> PathBuf {
    let repo = scratch.join("repo");
    fs::create_dir_all(&repo).expect("the checkout is created");
    git(&repo, &["init", "-q", "-b", "trunk"]);
    git(&repo, &["config", "user.name", "osq"]);
    git(&repo, &["config", "user.email", "osq@example.com"]);
    git(&repo, &["config", "commit.gpgsign", "false"]);
    copy_tree(&fixture().join("project"), &repo);
    write(
        &repo.join("osq.toml"),
        "[vcs]\nenabled = true\nauthor = \"osq <osq@example.com>\"\ndefaultBranch = \"trunk\"\n",
    );
    commit(&repo, "init");
    let base = git(&repo, &["rev-parse", "HEAD"]).trim().to_owned();
    let mut folders: Vec<String> = fs::read_dir(fixture().join("changes"))
        .expect("the fixture changes are read")
        .flatten()
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .collect();
    folders.sort();
    for folder in folders {
        let worktree = scratch.join("trees").join(&folder);
        fs::create_dir_all(worktree.parent().expect("the worktree has a parent"))
            .expect("the worktree's folder is created");
        let branch = format!("osq/{folder}");
        git(
            &repo,
            &[
                "worktree",
                "add",
                "-q",
                "-b",
                &branch,
                worktree.to_str().expect("the worktree path is text"),
                "trunk",
            ],
        );
        let target = change_path(scratch, &folder);
        copy_tree(&fixture().join("changes").join(&folder), &target);
        write(&target.join(".run/base"), &format!("{base}\n"));
        commit(&worktree, &format!("osq: {folder}"));
    }
    copy_tree(&fixture().join("trunk"), &repo);
    commit(&repo, "trunk moves");
    repo
}

/// Runs `plan` with the given id on a root.
fn run_plan(root: &Path, id: &str) -> Result<String, FeatureError> {
    PlanFeature::new()
        .run(&Invocation::new(root, "plan", vec![id.to_owned()]))
        .map(|output| output.text)
}

/// Replaces the scratch root with `<scratch>` in a text.
fn normalise(text: &str, scratch: &Path) -> String {
    text.replace(&scratch.display().to_string(), "<scratch>")
}

/// Reads one golden file.
fn golden(name: &str) -> String {
    fs::read_to_string(goldens().join(name)).expect("the golden reads")
}

/// Proves every row of "Steering in worktrees equals TypeScript's".
///
/// Covers: rust-plan/steering-in-worktrees-equals-typescript-s
#[test]
fn steering_in_worktrees_equals_typescripts() {
    let rows: [(&str, &str, &str); 4] = [
        ("1", "001-blocked", "blocked-001"),
        ("002", "002-requirement", "requirement-002"),
        ("3", "003-land-stop", "land-stop-003"),
        ("5", "005-conflict", "conflict-005"),
    ];
    for (id, folder, name) in rows {
        let scratch = scratch(name);
        let repo = repository(&scratch);
        let output =
            run_plan(&repo, id).unwrap_or_else(|error| panic!("row {name} fails: {error}"));
        assert_eq!(
            normalise(&output, &scratch),
            golden(&format!("{name}.out.txt")),
            "row {name} output"
        );
        let prompt = fs::read_to_string(change_path(&scratch, folder).join("plan-prompt.md"))
            .expect("the prompt reads");
        assert_eq!(
            normalise(&prompt, &scratch),
            golden(&format!("{name}.prompt.txt")),
            "row {name} prompt"
        );
    }
}

/// Proves "Healthy worktree change".
///
/// Covers: rust-plan/healthy-worktree-change
#[test]
fn healthy_worktree_change() {
    let scratch = scratch("healthy-004");
    let repo = repository(&scratch);
    match run_plan(&repo, "4") {
        Err(FeatureError::Failed {
            command, message, ..
        }) => assert_eq!(
            (command.as_str(), message.as_str()),
            (
                "plan",
                "004-healthy is approved and needs no steering; osq plan 004 reopens an approved change only when it needs steering",
            )
        ),
        other => panic!("4 expects a Failed error, got {other:?}"),
    }
    let prompt = change_path(&scratch, "004-healthy").join("plan-prompt.md");
    assert!(!prompt.exists(), "the healthy change gets no prompt");
}

/// Writes an approved archived change with a sync regression marker.
fn archived_change(folder: &Path) {
    write(
        &folder.join("proposal.md"),
        "---\ntitle: Archived edge\n---\n## Goal\n\nEdge.\n",
    );
    write(&folder.join("brief.md"), "### Goal\n\nEdge.\n");
    write(
        &folder.join("tasks/1.md"),
        "---\ntitle: When one runs, it passes\n---\n",
    );
    write(&folder.join(".run/approved"), "sha256:aaaa\n");
    write(
        &folder.join(".run/regressed/change.md"),
        "---\nreason: sync_verify_red\n---\nEdge.\n",
    );
}

/// Proves an unnamed archived change is skipped, a missing base counts as no
/// text, and a conflict gets no requirement blocks.
///
/// Covers: rust-plan/steering-in-worktrees-equals-typescript-s
#[test]
fn archived_lookup_and_blocks_ignore_edges() {
    let scratch = scratch("steering_edges");
    let repo = repository(&scratch);
    archived_change(&repo.join("openspec/changes/archive/003-aaa"));
    let requirement = change_path(&scratch, "002-requirement");
    fs::remove_file(requirement.join(".run/base")).expect("the base marker is removed");
    write(
        &change_path(&scratch, "005-conflict").join("specs/alpha/spec.md"),
        "## MODIFIED Requirements\n\n### Requirement: Alpha\nThe system SHALL be alpha.\n",
    );
    let output = run_plan(&repo, "3").expect("the archived worktree change steers");
    assert_eq!(
        normalise(&output, &scratch),
        golden("land-stop-003.out.txt")
    );
    run_plan(&repo, "002").expect("the requirement change steers");
    let prompt = fs::read_to_string(requirement.join("plan-prompt.md")).expect("the prompt reads");
    assert!(
        prompt.contains("#### alpha: Gamma on trunk"),
        "a missing base side changes Gamma: {prompt}"
    );
    let output = run_plan(&repo, "5").expect("the conflict steers");
    assert_eq!(normalise(&output, &scratch), golden("conflict-005.out.txt"));
    let prompt = fs::read_to_string(change_path(&scratch, "005-conflict").join("plan-prompt.md"))
        .expect("the prompt reads");
    assert_eq!(
        normalise(&prompt, &scratch),
        golden("conflict-005.prompt.txt")
    );
}
