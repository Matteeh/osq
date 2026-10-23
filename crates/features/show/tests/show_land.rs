//! Proves an archived change's land lines against TypeScript's goldens.

use std::fs;
use std::io::Write as _;
use std::path::{Path, PathBuf};
use std::process::Command;

use osq_core::{Feature, FeatureError, Invocation};
use osq_feature_show::ShowFeature;
use osq_kernel_config::load_config;

/// The archived change folder every row shows.
const ARCHIVED: &str = "openspec/changes/archive/010-archived";
/// The marker that says the land test runs in its own home.
const HOME_MARKER: &str = "OSQ_SHOW_LAND_HOME";
/// The author and committer name every setup commit gets.
const NAME: &str = "osq";
/// The author and committer email every setup commit gets.
const EMAIL: &str = "osq@example.com";

/// The git state one row builds before it shows the change.
#[derive(Clone, Copy)]
enum Setup {
    /// Every file is committed on `main`.
    Landed,
    /// `main` lacks the archived folder and no branch holds it.
    NoBranch,
    /// A worktree branch holds the change, and `main` gains this many commits.
    Worktree(u32),
    /// No git runs, and the change's stream gains a sync and then a stop.
    SyncStopped,
}

/// One golden row's setup, expected lines and optional diff line.
struct Row {
    /// The golden's file name.
    golden: &'static str,
    /// Whether the row writes `vcs.enabled` into `osq.toml`.
    vcs: bool,
    /// The git state the row builds.
    setup: Setup,
    /// The line after the `Next: ` prefix.
    next: &'static str,
    /// The `Land:` headline.
    land: &'static str,
    /// The `Diff:` line, when the row prints one.
    diff: Option<&'static str>,
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
    fn new(name: &str, vcs: bool) -> Self {
        let base = scratch(name);
        let root = base.join("checkout");
        fs::create_dir_all(&root).expect("the checkout folder is created");
        copy_dir(&fixture(), &root);
        write(
            &running_marker(&root),
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
    fn git(&self, dir: &Path, args: &[&str]) -> String {
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
        String::from_utf8_lossy(&output.stdout).into_owned()
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

/// Builds one row's git state as `print-land-goldens.mjs.txt` does.
fn setup(repo: &Repo, setup: Setup) {
    match setup {
        Setup::Landed => {
            repo.init();
            repo.commit_all(&repo.root, "all");
        }
        Setup::NoBranch => no_branch(repo),
        Setup::Worktree(moves) => worktree(repo, moves),
        Setup::SyncStopped => sync_stopped(&repo.root),
    }
}

/// Commits every file but the archived folder, then leaves that folder untracked.
fn no_branch(repo: &Repo) {
    let keep = repo.base.join("keep");
    fs::rename(repo.root.join(ARCHIVED), &keep).expect("the archived folder is moved");
    repo.init();
    repo.commit_all(&repo.root, "all");
    fs::rename(&keep, repo.root.join(ARCHIVED)).expect("the archived folder returns");
}

/// Adds the change and one line on a worktree branch, then moves `main`.
fn worktree(repo: &Repo, moves: u32) {
    let keep = repo.base.join("keep");
    fs::rename(repo.root.join(ARCHIVED), &keep).expect("the archived folder is moved");
    repo.init();
    repo.commit_all(&repo.root, "all");
    let worktree = repo.base.join("worktree");
    repo.git(
        &repo.root,
        &[
            "worktree",
            "add",
            "-q",
            "-b",
            "osq/010-archived",
            worktree.to_str().expect("the worktree path is text"),
        ],
    );
    copy_dir(&keep, &worktree.join(ARCHIVED));
    fs::remove_dir_all(&keep).expect("the kept folder is removed");
    append(&worktree.join("src/alpha.ts"), "export const more = 2;\n");
    repo.commit_all(&worktree, "archive 010");
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

/// The seven rows TypeScript's `print-land-goldens.mjs.txt` writes.
fn rows() -> [Row; 7] {
    [
        Row {
            golden: "land-landed-010.txt",
            vcs: false,
            setup: Setup::Landed,
            next: "landed",
            land: "Land: landed",
            diff: None,
        },
        Row {
            golden: "land-no-branch-010.txt",
            vcs: false,
            setup: Setup::NoBranch,
            next: "landed",
            land: "Land: not landed; branch osq/010-archived not found",
            diff: None,
        },
        Row {
            golden: "land-no-branch-vcs-010.txt",
            vcs: true,
            setup: Setup::NoBranch,
            next: "archived (not landed) — osq land 010",
            land: "Land: not landed; branch osq/010-archived not found",
            diff: None,
        },
        Row {
            golden: "land-unmoved-010.txt",
            vcs: true,
            setup: Setup::Worktree(0),
            next: "archived (not landed) — osq land 010",
            land: "Land: not landed; main has not moved since archive",
            diff: Some("  Diff: 1 files, +1 -0"),
        },
        Row {
            golden: "land-one-commit-010.txt",
            vcs: true,
            setup: Setup::Worktree(1),
            next: "archived (not landed) — osq land 010",
            land: "Land: not landed; main has 1 new commit since archive, so osq land will sync and verify again",
            diff: Some("  Diff: 1 files, +1 -0"),
        },
        Row {
            golden: "land-two-commits-010.txt",
            vcs: true,
            setup: Setup::Worktree(2),
            next: "archived (not landed) — osq land 010",
            land: "Land: not landed; main has 2 new commits since archive, so osq land will sync and verify again",
            diff: Some("  Diff: 1 files, +1 -0"),
        },
        Row {
            golden: "land-sync-stopped-010.txt",
            vcs: false,
            setup: Setup::SyncStopped,
            next: "landed",
            land: "Land: git is off",
            diff: None,
        },
    ]
}

/// Proves every golden row and its `Next:`, `Land:` and `Diff:` lines.
///
/// Covers: rust-show/show-land-lines-equal-typescript-s
#[test]
fn show_land_lines_equal_typescript() {
    if std::env::var_os(HOME_MARKER).is_none() {
        spawn_home_child();
        return;
    }
    for row in rows() {
        let repo = Repo::new(row.golden.trim_end_matches(".txt"), row.vcs);
        setup(&repo, row.setup);
        let output = run(&repo.root, "10").expect("the change is shown");
        let golden = fs::read_to_string(golden(row.golden)).expect("the golden reads");
        assert_eq!(output, golden, "{}", row.golden);
        assert_eq!(
            line(&output, "Next: "),
            Some(format!("Next: {}", row.next)),
            "{}",
            row.golden
        );
        assert_eq!(
            line(&output, "Land: "),
            Some(row.land.to_owned()),
            "{}",
            row.golden
        );
        if let Some(diff) = row.diff {
            assert!(output.lines().any(|line| line == diff), "{}", row.golden);
        }
    }
    assert_stacked_lookup();
}

/// Proves a change that lives only under the stacked approvals root is found.
fn assert_stacked_lookup() {
    let home = PathBuf::from(std::env::var_os(HOME_MARKER).expect("the child has a home"));
    let repo = Repo::new("show-land-stacked", true);
    repo.init();
    repo.commit_all(&repo.root, "all");
    let repo_name = repo.root.file_name().expect("the checkout has a name");
    let stacked = home
        .join(".osq/worktrees")
        .join(repo_name)
        .join(".stacked/020-stacked");
    write(
        &stacked.join("openspec/changes/archive/020-stacked/proposal.md"),
        "---\ntitle: Stacked\n---\n## Goal\n\nStacked.\n",
    );
    let output = run(&repo.root, "20").expect("the stacked change is found");
    assert_eq!(output.lines().next(), Some("Spec: 020-stacked (020)"));
}

/// Proves show refuses a root below its repository's top level.
///
/// Covers: rust-vcs/every-git-command-refuses-a-nested-root
#[test]
fn show_git_on_requires_the_repository_root() {
    let repo = Repo::new("show-land-subdir", false);
    let outer = repo.base.join("outer");
    fs::create_dir_all(&outer).expect("the outer folder is created");
    repo.git(&outer, &["init", "-q", "-b", "main"]);
    repo.git(&outer, &["config", "commit.gpgSign", "false"]);
    let sub = outer.join("sub");
    copy_dir(&repo.root, &sub);
    write(
        &sub.join("osq.toml"),
        "[vcs]\nenabled = true\nauthor = \"osq <osq@example.com>\"\n",
    );
    repo.commit_all(&outer, "all");
    let root = fs::canonicalize(&sub).expect("the sub folder resolves");
    let top = fs::canonicalize(&outer).expect("the outer folder resolves");
    let error = run(&sub, "10").expect_err("the nested root is refused");
    assert_eq!(
        error.to_string(),
        format!(
            "show failed: {} is inside the git repository at {} but is not its top level; run osq from {} or set vcs.enabled to false",
            root.display(),
            top.display(),
            top.display()
        )
    );
}

/// Proves which sync stops print after malformed and reordered sync events.
///
/// Covers: rust-show/show-land-lines-equal-typescript-s
#[test]
fn sync_stop_edges() {
    let synced = "{\"type\":\"synced\",\"timestamp\":\"2026-10-06T08:00:00.000Z\",\"data\":{\"defaultBranch\":\"main\",\"commits\":2}}\n";
    let stop = "{\"type\":\"sync_stopped\",\"timestamp\":\"2026-10-06T09:00:00.000Z\",\"data\":{\"reason\":\"conflict\",\"message\":\"src/alpha.ts conflicts\\nsecond line\"}}\n";
    let timestamp = "{\"type\":\"synced\",\"timestamp\":\"2026-10-06T08:00:00.000Z\"}\n";
    let data = "{\"type\":\"synced\",\"data\":{\"defaultBranch\":\"main\",\"commits\":2}}\n";
    let default = "{\"type\":\"synced\",\"timestamp\":\"2026-10-06T08:00:00.000Z\",\"data\":{\"defaultBranch\":\"main\"}}\n";
    let commits = "{\"type\":\"synced\",\"timestamp\":\"2026-10-06T08:00:00.000Z\",\"data\":{\"commits\":2}}\n";
    let empty = "{\"type\":\"synced\",\"timestamp\":\"2026-10-06T08:00:00.000Z\",\"data\":{}}\n";
    let cases = [
        ("after-sync", synced.to_owned() + stop, true),
        ("before-sync", stop.to_owned() + synced, false),
        ("timestamp-only", stop.to_owned() + timestamp, true),
        ("data-only", stop.to_owned() + data, true),
        ("default-only", stop.to_owned() + default, true),
        ("commits-only", stop.to_owned() + commits, true),
        ("empty-data", stop.to_owned() + empty, true),
    ];
    for (name, events, expected) in cases {
        let root = fixture_copy(&format!("show-land-sync-{name}"));
        append(
            &root.join(ARCHIVED).join(".run/events/change.jsonl"),
            &events,
        );
        let output = run(&root, "10").expect("the change is shown");
        let found = output
            .lines()
            .any(|line| line == "  Sync stopped: conflict: src/alpha.ts conflicts");
        assert_eq!(found, expected, "{name}");
    }
}

/// Proves that a refused `osq.toml` fails show with the config error's display.
///
/// Covers: rust-show/show-refuses-a-bad-config
#[test]
fn show_refuses_a_bad_config() {
    let root = fixture_copy("show-land-bad-config");
    write(&root.join("osq.toml"), "[vcs]\nenabled = \"yes\"\n");
    let expected = load_config(&root)
        .expect_err("the config is refused")
        .to_string();
    let error = run(&root, "10").expect_err("show refuses the config");
    match error {
        FeatureError::Failed {
            command, message, ..
        } => {
            assert_eq!(command, "show");
            assert_eq!(message, expected);
        }
        other => panic!("expected a failed error, got {other:?}"),
    }
}

/// Runs this test in a child whose HOME is a fresh empty folder.
fn spawn_home_child() {
    let home = scratch("home");
    let status = Command::new(std::env::current_exe().expect("the test binary is known"))
        .args(["--exact", "show_land_lines_equal_typescript", "--nocapture"])
        .env(HOME_MARKER, &home)
        .env("HOME", &home)
        .status()
        .expect("the child starts");
    assert!(status.success(), "the isolated-home child fails");
}

/// Runs show with one literal argument on a root.
fn run(root: &Path, argument: &str) -> Result<String, FeatureError> {
    ShowFeature
        .run(&Invocation::new(root, "show", vec![argument.to_owned()]))
        .map(|output| output.text)
}

/// The line that starts with `prefix`.
fn line(text: &str, prefix: &str) -> Option<String> {
    text.lines()
        .find(|line| line.starts_with(prefix))
        .map(ToOwned::to_owned)
}

/// The path of one golden file in the crate's fixtures.
fn golden(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/golden")
        .join(name)
}

/// The fixture project every row copies.
fn fixture() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/show-project")
}

/// A fresh scratch copy of the fixture with the running marker written.
fn fixture_copy(name: &str) -> PathBuf {
    let root = scratch(name);
    copy_dir(&fixture(), &root);
    write(
        &running_marker(&root),
        "{\"pid\":4242,\"startedAt\":1759395600000}\n",
    );
    root
}

/// The running marker path inside a fixture copy.
fn running_marker(root: &Path) -> PathBuf {
    root.join("openspec/changes/003-running/.run/running/1.pid")
}

/// A fresh empty scratch folder for one row.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("show_land")
        .join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch folder is created");
    root
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
