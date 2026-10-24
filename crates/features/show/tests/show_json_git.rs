//! Proves the archived and worktree JSON against TypeScript's goldens.

use std::fs;
use std::io::Write as _;
use std::path::{Path, PathBuf};
use std::process::Command;

use osq_core::{Feature, FeatureError, Invocation};
use osq_feature_show::ShowFeature;

/// The marker that says the JSON git test runs in its own home.
const HOME_MARKER: &str = "OSQ_SHOW_JSON_GIT_HOME";
/// The archived change folder every archived row shows.
const ARCHIVED: &str = "openspec/changes/archive/010-archived";
/// The approved change folder the worktree row shows.
const APPROVED: &str = "openspec/changes/002-approved";
/// The author and committer name every setup commit gets.
const NAME: &str = "osq";
/// The author and committer email every setup commit gets.
const EMAIL: &str = "osq@example.com";

/// The git state one row builds before it shows the change.
#[derive(Clone, Copy)]
enum Setup {
    /// No git runs.
    None,
    /// Every file is committed on `main`.
    Landed,
    /// `main` lacks the archived folder and no branch holds it.
    NoBranch,
    /// A worktree branch holds a folder, and `main` gains this many commits.
    Worktree(&'static str, u32),
    /// No git runs, and the change's stream gains a sync and then a stop.
    SyncStopped,
}

/// One golden row's setup, argument and `vcs.enabled`.
struct Row {
    /// The golden's file name.
    golden: &'static str,
    /// The change argument after `--json` is added.
    argument: &'static str,
    /// Whether the row writes `vcs.enabled` into `osq.toml`.
    vcs: bool,
    /// The git state the row builds.
    setup: Setup,
}

/// A scratch repository: its own folder and its canonical checkout.
struct Repo {
    /// The row's scratch folder, holding the checkout and its worktree.
    base: PathBuf,
    /// The canonical checkout on `main`.
    root: PathBuf,
}

impl Repo {
    /// Copies the fixture into a fresh scratch checkout for one row.
    fn new(test: &str, row: &str, vcs: bool) -> Self {
        let base = scratch(test, row);
        fs::create_dir_all(base.join("home")).expect("the home is created");
        let root = base.join("checkout");
        fs::create_dir_all(&root).expect("the checkout folder is created");
        copy_dir(&fixture(), &root);
        write(
            &root.join("openspec/changes/003-running/.run/running/1.pid"),
            "{\"pid\":4242,\"startedAt\":1759395600000}\n",
        );
        if vcs {
            write(
                &root.join("osq.toml"),
                "[vcs]\nenabled = true\nauthor = \"osq <osq@example.com>\"\n",
            );
        }
        Self {
            base: fs::canonicalize(&base).expect("the scratch folder resolves"),
            root: fs::canonicalize(&root).expect("the checkout resolves"),
        }
    }

    /// Runs `git` in `dir` with isolated settings and the fixed identity.
    fn git(&self, dir: &Path, args: &[&str]) {
        let mut command = Command::new("git");
        command.args(args).current_dir(dir);
        command
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .env("GIT_CEILING_DIRECTORIES", &self.base)
            .env("GIT_CONFIG_COUNT", "1")
            .env("GIT_CONFIG_KEY_0", "maintenance.auto")
            .env("GIT_CONFIG_VALUE_0", "false")
            .env("GIT_AUTHOR_NAME", NAME)
            .env("GIT_AUTHOR_EMAIL", EMAIL)
            .env("GIT_COMMITTER_NAME", NAME)
            .env("GIT_COMMITTER_EMAIL", EMAIL);
        let output = command.output().expect("git starts");
        assert!(
            output.status.success(),
            "git {} failed in {}: {}",
            args.join(" "),
            dir.display(),
            String::from_utf8_lossy(&output.stderr)
        );
    }

    /// Starts the repository and refuses signed commits.
    fn init(&self) {
        self.git(&self.root, &["init", "-q", "-b", "main"]);
        self.git(&self.root, &["config", "commit.gpgSign", "false"]);
    }

    /// Stages everything in `dir` and commits it.
    fn commit_all(&self, dir: &Path, message: &str) {
        self.git(dir, &["add", "-A"]);
        self.git(dir, &["commit", "-q", "-m", message]);
    }
}

/// Builds one row's git state as `print-json-goldens.mjs.txt` does.
fn setup(repo: &Repo, setup: Setup) {
    match setup {
        Setup::None => {}
        Setup::Landed => {
            repo.init();
            repo.commit_all(&repo.root, "all");
        }
        Setup::NoBranch => no_branch(repo, ARCHIVED),
        Setup::Worktree(folder, moves) => worktree(repo, folder, moves),
        Setup::SyncStopped => sync_stopped(&repo.root),
    }
}

/// Commits every file but the folder, then leaves that folder untracked.
fn no_branch(repo: &Repo, folder: &str) {
    let keep = repo.base.join("keep");
    fs::rename(repo.root.join(folder), &keep).expect("the folder is moved");
    repo.init();
    repo.commit_all(&repo.root, "all");
    fs::rename(&keep, repo.root.join(folder)).expect("the folder returns");
}

/// Adds the folder and one line on a worktree branch, then moves `main`.
fn worktree(repo: &Repo, folder: &str, moves: u32) {
    let keep = repo.base.join("keep");
    fs::rename(repo.root.join(folder), &keep).expect("the folder is moved");
    repo.init();
    repo.commit_all(&repo.root, "all");
    let worktree = repo.base.join("worktree");
    let name = Path::new(folder)
        .file_name()
        .expect("the folder has a name")
        .to_string_lossy();
    repo.git(
        &repo.root,
        &[
            "worktree",
            "add",
            "-q",
            "-b",
            &format!("osq/{name}"),
            worktree.to_str().expect("the worktree path is text"),
        ],
    );
    copy_dir(&keep, &worktree.join(folder));
    fs::remove_dir_all(&keep).expect("the kept folder is removed");
    append(&worktree.join("src/alpha.ts"), "export const more = 2;\n");
    repo.commit_all(&worktree, &format!("add {name}"));
    for number in 1..=moves {
        append(
            &repo.root.join("src/beta.ts"),
            &format!("export const move{number} = {number};\n"),
        );
        repo.git(
            &repo.root,
            &["commit", "-q", "-am", &format!("move {number}")],
        );
    }
}

/// Appends a sync and then a stop to the archived change's event stream.
fn sync_stopped(root: &Path) {
    append(
        &root.join(ARCHIVED).join(".run/events/change.jsonl"),
        concat!(
            "{\"type\":\"synced\",\"timestamp\":\"2026-10-06T08:00:00.000Z\",\"data\":{\"defaultBranch\":\"main\",\"commits\":2}}\n",
            "{\"type\":\"sync_stopped\",\"timestamp\":\"2026-10-06T09:00:00.000Z\",\"data\":{\"reason\":\"conflict\",\"message\":\"src/alpha.ts conflicts\\nsecond line\"}}\n",
        ),
    );
}

/// The seven rows of "Show JSON of an archived change".
fn archived_rows() -> [Row; 7] {
    [
        Row {
            golden: "archived-010.json",
            argument: "10",
            vcs: false,
            setup: Setup::None,
        },
        Row {
            golden: "archived-path-010.json",
            argument: ARCHIVED,
            vcs: false,
            setup: Setup::None,
        },
        Row {
            golden: "land-landed-010.json",
            argument: "10",
            vcs: false,
            setup: Setup::Landed,
        },
        Row {
            golden: "land-no-branch-vcs-010.json",
            argument: "10",
            vcs: true,
            setup: Setup::NoBranch,
        },
        Row {
            golden: "land-unmoved-010.json",
            argument: "10",
            vcs: true,
            setup: Setup::Worktree(ARCHIVED, 0),
        },
        Row {
            golden: "land-two-commits-010.json",
            argument: "10",
            vcs: true,
            setup: Setup::Worktree(ARCHIVED, 2),
        },
        Row {
            golden: "land-sync-stopped-010.json",
            argument: "10",
            vcs: false,
            setup: Setup::SyncStopped,
        },
    ]
}

/// Proves every archived setup prints TypeScript's full golden.
///
/// Covers: rust-show/show-json-of-an-archived-change
#[test]
fn show_json_of_an_archived_change() {
    if std::env::var_os(HOME_MARKER).is_none() {
        spawn_home_child("show_json_of_an_archived_change");
        return;
    }
    for row in archived_rows() {
        let name = row.golden.trim_end_matches(".json");
        let repo = Repo::new("show_json_of_an_archived_change", name, row.vcs);
        setup(&repo, row.setup);
        let output = run_text(&repo.root, &[row.argument, "--json"]).expect("the change is shown");
        assert_eq!(
            replace_base(&output, &repo.base),
            golden(row.golden),
            "{}",
            row.golden
        );
    }
}

/// Proves an osq worktree change prints TypeScript's full golden.
///
/// Covers: rust-show/show-json-of-a-worktree-change
#[test]
fn show_json_of_a_worktree_change() {
    if std::env::var_os(HOME_MARKER).is_none() {
        spawn_home_child("show_json_of_a_worktree_change");
        return;
    }
    let repo = Repo::new("show_json_of_a_worktree_change", "worktree-002", true);
    setup(&repo, Setup::Worktree(APPROVED, 1));
    let output = run_text(&repo.root, &["2", "--json"]).expect("the change is shown");
    let expected = replace_base(&golden("worktree-002.json"), &repo.base);
    assert_eq!(replace_base(&output, &repo.base), expected);
    assert!(
        output.contains(&base_text(&repo.base.join("worktree").join(APPROVED))),
        "{output}"
    );
}

/// Proves the land members the archived goldens leave empty.
///
/// Covers: rust-show/show-json-of-an-archived-change
#[test]
fn show_json_land_edges() {
    let repo = Repo::new("show_json_land_edges", "row", false);
    let folder = repo.root.join(ARCHIVED);
    write(
        &folder.join(".run/regressed/change.md"),
        "---\nreason: conflicting edits\n---\nStop here.\n",
    );
    append(
        &folder.join(".run/results/2.md"),
        "\n## Outside scope\n\n- A beta helper is unused.\n",
    );
    append(
        &folder.join("specs/beta/spec.md"),
        concat!(
            "\n## REMOVED Requirements\n\n- `### Requirement: Beta old`\n",
            "\n## RENAMED Requirements\n\n",
            "- FROM: `### Requirement: Beta before`\n",
            "- TO: `### Requirement: Beta after`\n",
        ),
    );
    let events = folder.join(".run/events/change.jsonl");
    let text = fs::read_to_string(&events)
        .expect("the events read")
        .replace(
            "\"findings\":[{\"kind\":\"scenario\"",
            "\"findings\":[{\"kind\":\"scenario\"},{\"kind\":\"scenario\"},{\"kind\":\"scenario\"",
        );
    fs::write(&events, text).expect("the events are written");
    let output = run_text(&repo.root, &["10", "--json"]).expect("the change is shown");
    for expected in [
        "\"reason\": \"conflicting edits\"",
        "\"message\": \"Stop here.\"",
        "\"outsideScope\": \"- A beta helper is unused.\"",
        "\"Beta old\"",
        "\"from\": \"Beta before\"",
        "\"to\": \"Beta after\"",
        "\"findings\": 3",
    ] {
        assert!(output.contains(expected), "missing {expected}: {output}");
    }
}

/// Runs show with arguments and returns its output text.
fn run_text(root: &Path, args: &[&str]) -> Result<String, FeatureError> {
    ShowFeature
        .run(&Invocation::new(
            root,
            "show",
            args.iter().map(|arg| (*arg).to_owned()).collect(),
        ))
        .map(|output| output.text)
}

/// Replaces every spelling of a base folder's path by `<base>`.
fn replace_base(text: &str, base: &Path) -> String {
    let canonical = fs::canonicalize(base).unwrap_or_else(|_| base.to_path_buf());
    text.replace(&base_text(&canonical), "<base>")
        .replace(&base_text(base), "<base>")
}

/// A path as text.
fn base_text(base: &Path) -> String {
    base.to_string_lossy().into_owned()
}

/// The golden file's text.
fn golden(name: &str) -> String {
    fs::read_to_string(
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/json-golden")
            .join(name),
    )
    .expect("the golden reads")
}

/// The fixture project every row copies.
fn fixture() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/show-project")
}

/// A fresh base folder named after its test and row.
fn scratch(test: &str, row: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("show_json_git")
        .join(test)
        .join(row);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the base folder is created");
    root
}

/// Runs this test in a child whose HOME is a fresh empty folder.
fn spawn_home_child(name: &str) {
    let home = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("show_json_git_home")
        .join(name);
    let _ = fs::remove_dir_all(&home);
    fs::create_dir_all(&home).expect("the home is created");
    let status = Command::new(std::env::current_exe().expect("the test binary is known"))
        .args(["--exact", name, "--nocapture"])
        .env(HOME_MARKER, &home)
        .env("HOME", &home)
        .status()
        .expect("the child starts");
    assert!(status.success(), "the isolated-home child fails");
}

/// Copies a directory tree recursively.
fn copy_dir(from: &Path, to: &Path) {
    fs::create_dir_all(to).expect("the destination folder is created");
    for entry in fs::read_dir(from)
        .expect("the source folder reads")
        .flatten()
    {
        let target = to.join(entry.file_name());
        if entry.file_type().expect("the entry type reads").is_dir() {
            copy_dir(&entry.path(), &target);
        } else {
            fs::copy(entry.path(), target).expect("the file is copied");
        }
    }
}

/// Writes a file, creating its parent folders.
fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().expect("the file has a parent"))
        .expect("the parent folders are created");
    fs::write(path, text).expect("the file is written");
}

/// Appends text to a file, creating its parent folders.
fn append(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().expect("the file has a parent"))
        .expect("the parent folders are created");
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .expect("the file opens");
    file.write_all(text.as_bytes())
        .expect("the text is written");
}
