//! Proves doctor's managed-block lines and its git lines.

use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use osq_core::{Feature, FeatureError, Invocation};
use osq_feature_doctor::DoctorFeature;

/// The marker that tells the git-lines child which row to run.
const GIT_ROW_MARKER: &str = "OSQ_DOCTOR_GIT_ROW";
/// The marker that tells the git-environment child which row to run.
const GIT_ENV_MARKER: &str = "OSQ_DOCTOR_GIT_ENV_ROW";
/// The test name the git-lines child runs.
const GIT_TEST: &str = "doctor_git_lines";
/// The test name the git-environment child runs.
const GIT_ENV_TEST: &str = "doctor_git_environment";
/// The line the git scenarios split at.
const DONE_OK: &str = "[ok] done-markers: all done markers verified";
/// The managed block's opening marker.
const START: &str = "<!-- OSQ:START -->";
/// The managed block's closing marker.
const END: &str = "<!-- OSQ:END -->";
/// The `vcs` table every repository row writes.
const VCS: &str = "[vcs]\nenabled = true\nauthor = \"osq <osq@example.com>\"";
/// The `vcs` table with a six-name line-ending limit.
const VCS_LIMITS: &str = "[vcs]\nenabled = true\nauthor = \"osq <osq@example.com>\"\n\n[limits]\nmaxListedLineEndings = 6";
/// The `vcs` table with an install command.
const VCS_PREPARE: &str =
    "[vcs]\nenabled = true\nauthor = \"osq <osq@example.com>\"\nprepare = \"pnpm install\"";
/// The `.gitattributes` block followed by an earlier line.
const ATTRIBUTES_AFTER: &str =
    "# keep\n# OSQ:GITATTRIBUTES:START\n* text=auto\n# OSQ:GITATTRIBUTES:END\n";
/// The current `.gitattributes` block alone.
const ATTRIBUTES_CURRENT: &str =
    "# OSQ:GITATTRIBUTES:START\n* text=auto\n# OSQ:GITATTRIBUTES:END\n";

/// One row of "Doctor managed block lines".
struct ManagedRow {
    /// The row's name and its scratch folder.
    name: &'static str,
    /// The `osq.toml` text, or none when the root has no file.
    config: Option<&'static str>,
    /// Files written in the root, with the fixture and marker placeholders.
    files: &'static [(&'static str, &'static str)],
    /// The expected `managed-blocks` line.
    line: &'static str,
}

/// The rows of "Doctor managed block lines", in table order.
const MANAGED_ROWS: &[ManagedRow] = &[
    ManagedRow {
        name: "managed-valid",
        config: None,
        files: &[
            ("AGENTS.md", "# Agents\n\n<agents>\n"),
            ("PLANNER.md", "<planner>\n"),
            (".claude/commands/osq-plan.md", "<command>"),
        ],
        line: "[ok] managed-blocks: managed blocks valid",
    },
    ManagedRow {
        name: "managed-missing",
        config: None,
        files: &[],
        line: "[fail] managed-blocks: AGENTS.md is missing; PLANNER.md is missing; .claude/commands/osq-plan.md is missing (run osq init)",
    },
    ManagedRow {
        name: "managed-problems",
        config: None,
        files: &[
            ("AGENTS.md", "# Agents\n"),
            ("PLANNER.md", "<start>\n<start>\n<end>\n"),
            (".claude/commands/osq-plan.md", "<start>\n"),
        ],
        line: "[fail] managed-blocks: AGENTS.md is missing its managed block; PLANNER.md has duplicate managed blocks; .claude/commands/osq-plan.md has a partial managed block (run osq init)",
    },
    ManagedRow {
        name: "managed-reversed",
        config: None,
        files: &[
            ("AGENTS.md", "<end>\n<start>\n"),
            ("PLANNER.md", "<start>\nold\n<end>\n"),
            (".claude/commands/osq-plan.md", "<start>\n<end>\n<end>\n"),
        ],
        line: "[fail] managed-blocks: AGENTS.md has a reversed managed block; PLANNER.md has a stale managed block; .claude/commands/osq-plan.md has duplicate managed blocks (run osq init)",
    },
    ManagedRow {
        name: "opencode-missing",
        config: Some("[executor]\nharness = \"opencode\""),
        files: &[
            ("AGENTS.md", "<agents>\n"),
            ("PLANNER.md", "<planner>\n"),
            (".claude/commands/osq-plan.md", "<command>\n"),
        ],
        line: "[fail] managed-blocks: .opencode/agent/osq-coder.md is missing (run osq setup)",
    },
    ManagedRow {
        name: "opencode-planner-missing",
        config: Some("[planner]\nharness = \"opencode\"\nmodel = \"m\""),
        files: &[
            ("AGENTS.md", "<agents>\n"),
            ("PLANNER.md", "<planner>\n"),
            (".claude/commands/osq-plan.md", "<command>\n"),
        ],
        line: "[fail] managed-blocks: .opencode/agent/osq-coder.md is missing (run osq setup)",
    },
    ManagedRow {
        name: "opencode-planner-valid",
        config: Some("[planner]\nharness = \"opencode\"\nmodel = \"m\""),
        files: &[
            ("AGENTS.md", "<agents>\n"),
            ("PLANNER.md", "<planner>\n"),
            (".claude/commands/osq-plan.md", "<command>\n"),
            (".opencode/agent/osq-coder.md", "<agents>\n"),
        ],
        line: "[ok] managed-blocks: managed blocks valid",
    },
    ManagedRow {
        name: "opencode-partial",
        config: Some("[executor]\nharness = \"opencode\""),
        files: &[(".opencode/agent/osq-coder.md", "<end>\n")],
        line: "[fail] managed-blocks: AGENTS.md is missing; PLANNER.md is missing; .claude/commands/osq-plan.md is missing (run osq init); .opencode/agent/osq-coder.md has a partial managed block (run osq setup)",
    },
    ManagedRow {
        name: "opencode-stale",
        config: Some("[executor]\nharness = \"opencode\""),
        files: &[
            ("AGENTS.md", "<agents>\n"),
            ("PLANNER.md", "<planner>\n"),
            (".claude/commands/osq-plan.md", "<command>\n"),
            (".opencode/agent/osq-coder.md", "<start>\nold\n<end>\n"),
        ],
        line: "[fail] managed-blocks: .opencode/agent/osq-coder.md has a stale managed block (run osq setup)",
    },
];

/// The kind of root a git row builds.
#[derive(Clone, Copy)]
enum RootKind {
    /// A folder no repository holds.
    Plain,
    /// The `sub` folder of a repository.
    Sub,
    /// A folder no repository holds, with no program on `PATH`.
    MissingGit,
    /// A repository with one commit.
    Repository,
}

/// One row of "Doctor git lines".
struct GitRow {
    /// The row's name and its scratch folder.
    name: &'static str,
    /// The `osq.toml` text, or none when the root has no file.
    config: Option<&'static str>,
    /// The kind of root the row builds.
    root: RootKind,
    /// Files written and committed before any hook or signing setting.
    before: &'static [(&'static str, &'static str)],
    /// Hook files written after the commit, with their modes.
    hooks: &'static [(&'static str, u32)],
    /// The `commit.gpgsign` value written after the commit.
    signing: Option<&'static str>,
    /// Files written after the commit and the signing setting.
    after: &'static [(&'static str, &'static str)],
    /// The lines after the done-marker line.
    expected: &'static [&'static str],
}

/// The rows of "Doctor git lines", in table order.
const GIT_ROWS: &[GitRow] = &[
    GitRow {
        name: "git-no-repository",
        config: None,
        root: RootKind::Plain,
        before: &[],
        hooks: &[],
        signing: None,
        after: &[],
        expected: &["[warn] git: not a git repository; git checks off"],
    },
    GitRow {
        name: "git-sub-folder",
        config: None,
        root: RootKind::Sub,
        before: &[],
        hooks: &[],
        signing: None,
        after: &[],
        expected: &["[warn] git: not the repository root; git checks off"],
    },
    GitRow {
        name: "git-missing-program",
        config: None,
        root: RootKind::MissingGit,
        before: &[],
        hooks: &[],
        signing: None,
        after: &[],
        expected: &["[warn] git: git not found; git checks off"],
    },
    GitRow {
        name: "git-vcs-off",
        config: None,
        root: RootKind::Repository,
        before: &[("pnpm-lock.yaml", "x"), ("c.txt", "a\r\n")],
        hooks: &[("pre-commit", 0o755)],
        signing: Some("true"),
        after: &[],
        expected: &["<git>"],
    },
    GitRow {
        name: "git-many-warnings",
        config: Some(VCS_LIMITS),
        root: RootKind::Repository,
        before: &[
            ("pnpm-lock.yaml", "x"),
            ("yarn.lock", "x"),
            ("c1.txt", "a\r\n"),
            ("c2.txt", "a\r\n"),
            ("c3.txt", "a\r\n"),
            ("c4.txt", "a\r\n"),
            ("c5.txt", "a\r\n"),
            ("c6.txt", "a\r\n"),
            ("c7.txt", "a\r\n"),
        ],
        hooks: &[
            ("pre-commit", 0o755),
            ("commit-msg", 0o755),
            ("pre-push", 0o755),
            ("post-commit", 0o644),
        ],
        signing: Some("On"),
        after: &[],
        expected: &[
            "<git>",
            "[warn] vcs-prepare: pnpm-lock.yaml, yarn.lock found without vcs.prepare; set vcs.prepare to the install command",
            "[warn] git-hooks: active commit hooks: commit-msg, pre-commit; check each runs unattended and leaves the tree as verified",
            "[warn] git-signing: commit.gpgsign is true; check signing runs without a prompt",
            "[warn] gitattributes: .gitattributes has no current osq line endings block; run osq init",
            "[warn] git-line-endings: 7 tracked files have CRLF or mixed line endings: c1.txt, c2.txt, c3.txt, c4.txt, c5.txt, c6.txt and 1 more; run git add --renormalize . and commit",
        ],
    },
    GitRow {
        name: "git-prepared",
        config: Some(VCS_PREPARE),
        root: RootKind::Repository,
        before: &[
            ("pnpm-lock.yaml", "x"),
            ("l.txt", "a\n"),
            ("m.txt", "a\r\nb\n"),
        ],
        hooks: &[],
        signing: Some("false"),
        after: &[(".gitattributes", ATTRIBUTES_AFTER)],
        expected: &[
            "<git>",
            "[warn] git-line-endings: 1 tracked file has CRLF or mixed line endings: m.txt; run git add --renormalize . and commit",
        ],
    },
    GitRow {
        name: "git-current-attributes",
        config: Some(VCS),
        root: RootKind::Repository,
        before: &[("l.txt", "a\n")],
        hooks: &[],
        signing: None,
        after: &[(".gitattributes", ATTRIBUTES_CURRENT)],
        expected: &["<git>"],
    },
];

/// One row of "Doctor git environment".
struct EnvRow {
    /// The row's name and its scratch folder.
    name: &'static str,
    /// The variables added to the child's environment.
    vars: &'static [(&'static str, &'static str)],
    /// The lines after the done-marker line.
    expected: &'static [&'static str],
}

/// The rows of "Doctor git environment", in table order.
const ENV_ROWS: &[EnvRow] = &[
    EnvRow {
        name: "git-env-dir",
        vars: &[("GIT_DIR", "/nowhere")],
        expected: &[
            "[warn] git: not a git repository; git checks off",
            "[warn] git-env: GIT_DIR is set; osq's own git reads ignore it while verify commands and hooks do not",
        ],
    },
    EnvRow {
        name: "git-env-index-and-work-tree",
        vars: &[
            ("GIT_DIR", ""),
            ("GIT_INDEX_FILE", "x"),
            ("GIT_WORK_TREE", "y"),
        ],
        expected: &[
            "[warn] git: not a git repository; git checks off",
            "[warn] git-env: GIT_INDEX_FILE and GIT_WORK_TREE are set; osq's own git reads ignore them while verify commands and hooks do not",
        ],
    },
];

/// The managed files doctor checks, paired with their test fixture copies.
const MANAGED_FILES: [(&str, &str); 3] = [
    ("AGENTS.md", "agents-block.txt"),
    ("PLANNER.md", "planner-block.txt"),
    (".claude/commands/osq-plan.md", "claude-plan-command.txt"),
];

/// Reads one committed managed-block fixture.
fn fixture(name: &str) -> String {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/managed")
        .join(name);
    fs::read_to_string(path).expect("the managed fixture reads")
}

/// The replacement for one placeholder, or none when it is not a placeholder.
fn replacement(placeholder: &str) -> Option<String> {
    match placeholder {
        "<agents>" => Some(fixture("agents-block.txt")),
        "<planner>" => Some(fixture("planner-block.txt")),
        "<command>" => Some(fixture("claude-plan-command.txt")),
        "<start>" => Some(START.to_owned()),
        "<end>" => Some(END.to_owned()),
        _ => None,
    }
}

/// Expands the fixture and marker placeholders in one row file, without
/// re-reading placeholders inside the fixture texts.
fn expand(text: &str) -> String {
    let mut expanded = String::new();
    let mut rest = text;
    while let Some(index) = rest.find('<') {
        expanded.push_str(&rest[..index]);
        let tail = &rest[index..];
        let Some(end) = tail.find('>') else {
            expanded.push_str(tail);
            return expanded;
        };
        if let Some(value) = replacement(&tail[..=end]) {
            expanded.push_str(&value);
            rest = &tail[end + 1..];
        } else {
            expanded.push('<');
            rest = &tail[1..];
        }
    }
    expanded.push_str(rest);
    expanded
}

/// A fresh empty scratch folder for one row.
fn scratch(name: &str) -> PathBuf {
    let base = base(name);
    let _ = fs::remove_dir_all(&base);
    fs::create_dir_all(&base).expect("the scratch folder is created");
    base
}

/// The row's scratch folder without touching its contents.
fn base(name: &str) -> PathBuf {
    Path::new(env!("CARGO_TARGET_TMPDIR")).join(name)
}

/// The folder no repository holds, inside the row's ceiling folder.
fn plain_root(name: &str) -> PathBuf {
    base(name).join("root")
}

/// The root a row's child runs doctor on.
fn root_of(row: &GitRow) -> PathBuf {
    match row.root {
        RootKind::Plain | RootKind::MissingGit => plain_root(row.name),
        RootKind::Sub => base(row.name).join("outer/sub"),
        RootKind::Repository => base(row.name).join("repo"),
    }
}

/// Writes a file, creating its parent folders.
fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().expect("the file has a parent"))
        .expect("the parent folders are created");
    fs::write(path, text).expect("the file is written");
}

/// Writes the managed files every doctor root holds.
fn managed_files(root: &Path) {
    for (path, name) in MANAGED_FILES {
        write(&root.join(path), &format!("{}\n", fixture(name)));
    }
}

/// Runs git in a folder with isolated global and system config.
fn git(base: &Path, dir: &Path, args: &[&str]) {
    let mut command = Command::new("git");
    command.args(args).current_dir(dir);
    command
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GIT_CEILING_DIRECTORIES", base);
    let output = command.output().expect("git starts");
    assert!(
        output.status.success(),
        "git {args:?} in {}: {}",
        dir.display(),
        String::from_utf8_lossy(&output.stderr)
    );
}

/// Starts a repository with the identity and line-ending settings rows need.
fn init_repo(base: &Path, repo: &Path) {
    fs::create_dir_all(repo).expect("the repository folder is created");
    git(base, repo, &["init", "-q", "-b", "main"]);
    git(base, repo, &["config", "core.autocrlf", "false"]);
    git(base, repo, &["config", "user.name", "osq"]);
    git(base, repo, &["config", "user.email", "osq@example.com"]);
}

/// Stages everything in a repository and commits it.
fn commit_all(base: &Path, repo: &Path) {
    git(base, repo, &["add", "-A"]);
    git(base, repo, &["commit", "-q", "-m", "setup"]);
}

/// Writes one hook file with the row's mode.
fn write_hook(repo: &Path, name: &str, mode: u32) {
    let path = repo.join(".git/hooks").join(name);
    fs::write(&path, "#!/bin/sh\nexit 0\n").expect("the hook is written");
    fs::set_permissions(path, fs::Permissions::from_mode(mode)).expect("the hook mode is set");
}

/// The variables a row adds to its child, including a missing program on `PATH`.
fn row_vars(row: &GitRow) -> Vec<(String, String)> {
    if matches!(row.root, RootKind::MissingGit) {
        let empty = base(row.name).join("empty");
        return vec![("PATH".to_owned(), empty.to_string_lossy().into_owned())];
    }
    Vec::new()
}

/// Builds one git row's root in the parent process.
fn build_git_row(row: &GitRow) {
    let base = scratch(row.name);
    match row.root {
        RootKind::Plain => managed_files(&plain_root(row.name)),
        RootKind::MissingGit => {
            managed_files(&plain_root(row.name));
            fs::create_dir_all(base.join("empty")).expect("the empty PATH folder is created");
        }
        RootKind::Sub => {
            let outer = base.join("outer");
            init_repo(&base, &outer);
            let sub = outer.join("sub");
            fs::create_dir_all(&sub).expect("the sub folder is created");
            managed_files(&sub);
        }
        RootKind::Repository => build_repository(row, &base),
    }
}

/// Builds one repository row and its later settings.
fn build_repository(row: &GitRow, base: &Path) {
    let repo = base.join("repo");
    init_repo(base, &repo);
    if let Some(config) = row.config {
        write(&repo.join("osq.toml"), config);
    }
    managed_files(&repo);
    for (path, text) in row.before {
        write(&repo.join(path), text);
    }
    commit_all(base, &repo);
    for (name, mode) in row.hooks {
        write_hook(&repo, name, *mode);
    }
    if let Some(value) = row.signing {
        git(base, &repo, &["config", "commit.gpgsign", value]);
    }
    for (path, text) in row.after {
        write(&repo.join(path), text);
    }
}

/// The git line for a repository doctor accepts.
fn git_line() -> String {
    let output = Command::new("git")
        .arg("--version")
        .output()
        .expect("git starts");
    assert!(
        output.status.success(),
        "git --version: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let version = String::from_utf8_lossy(&output.stdout);
    let first = version.lines().next().unwrap_or("").trim();
    format!("[ok] git: {first}")
}

/// Expands the `<git>` placeholder in a row's expected lines.
fn expected_lines(row: &GitRow) -> Vec<String> {
    let has_git = row.expected.iter().any(|line| line.contains("<git>"));
    let git = has_git.then(git_line);
    row.expected
        .iter()
        .map(|line| match &git {
            Some(git) => line.replace("<git>", git),
            None => (*line).to_owned(),
        })
        .collect()
}

/// Runs doctor on a root and returns its output or its failure message.
fn doctor_text(root: &Path) -> String {
    match DoctorFeature.run(&Invocation::new(root, "doctor", Vec::new())) {
        Ok(output) => output.text,
        Err(FeatureError::Failed {
            command, message, ..
        }) => {
            assert_eq!("doctor", command);
            message
        }
        Err(other) => panic!("doctor returned {other:?}"),
    }
}

/// The lines after the done-marker line of a doctor result.
fn lines_after_done(text: &str) -> Vec<String> {
    let mut after = Vec::new();
    let mut found = false;
    for line in text.lines() {
        if found {
            after.push(line.to_owned());
        } else if line == DONE_OK {
            found = true;
        }
    }
    assert!(found, "the done-marker line is printed");
    after
}

/// Checks a root's lines after the done-marker line against the row's lines.
fn check_after_done(root: &Path, expected: &[String]) {
    let actual = lines_after_done(&doctor_text(root));
    assert_eq!(expected, actual.as_slice());
}

/// Starts this test's child for one row with isolated git settings.
fn spawn_child(test: &str, marker: &str, name: &str, base: &Path, vars: &[(String, String)]) {
    let mut command = Command::new(std::env::current_exe().expect("the test binary is known"));
    command
        .args(["--exact", test, "--nocapture"])
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .env(marker, name)
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GIT_CEILING_DIRECTORIES", base)
        .env_remove("GIT_DIR")
        .env_remove("GIT_INDEX_FILE")
        .env_remove("GIT_WORK_TREE");
    for (key, value) in vars {
        command.env(key, value);
    }
    let status = command.status().expect("the child starts");
    assert!(status.success(), "the child for {name} fails");
}

/// Finds the git row with a name.
fn git_row(name: &str) -> &'static GitRow {
    GIT_ROWS
        .iter()
        .find(|row| row.name == name)
        .expect("the row is known")
}

/// Finds the git-environment row with a name.
fn env_row(name: &str) -> &'static EnvRow {
    ENV_ROWS
        .iter()
        .find(|row| row.name == name)
        .expect("the row is known")
}

/// Proves every row of "Doctor managed block lines".
///
/// Covers: rust-doctor/doctor-managed-block-lines
#[test]
fn doctor_managed_block_lines() {
    for row in MANAGED_ROWS {
        let root = scratch(row.name);
        if let Some(config) = row.config {
            write(&root.join("osq.toml"), config);
        }
        for (path, text) in row.files {
            write(&root.join(path), &expand(text));
        }
        let text = doctor_text(&root);
        let line = text
            .lines()
            .find(|line| {
                line.starts_with("[ok] managed-blocks:")
                    || line.starts_with("[fail] managed-blocks:")
            })
            .unwrap_or_else(|| panic!("row {} prints no managed-blocks line", row.name));
        assert_eq!(row.line, line, "row {}", row.name);
    }
}

/// Proves every row of "Doctor git lines" in its own child process.
///
/// Covers: rust-doctor/doctor-git-lines
#[test]
fn doctor_git_lines() {
    if let Some(name) = std::env::var_os(GIT_ROW_MARKER) {
        let row = git_row(&name.to_string_lossy());
        check_after_done(&root_of(row), &expected_lines(row));
        return;
    }
    for row in GIT_ROWS {
        build_git_row(row);
        let vars = row_vars(row);
        spawn_child(GIT_TEST, GIT_ROW_MARKER, row.name, &base(row.name), &vars);
    }
}

/// Proves every row of "Doctor git environment" in its own child process.
///
/// Covers: rust-doctor/doctor-git-environment
#[test]
fn doctor_git_environment() {
    if let Some(name) = std::env::var_os(GIT_ENV_MARKER) {
        let row = env_row(&name.to_string_lossy());
        let expected: Vec<String> = row.expected.iter().map(|line| (*line).to_owned()).collect();
        check_after_done(&plain_root(row.name), &expected);
        return;
    }
    for row in ENV_ROWS {
        let base = scratch(row.name);
        managed_files(&plain_root(row.name));
        let vars: Vec<(String, String)> = row
            .vars
            .iter()
            .map(|(key, value)| ((*key).to_owned(), (*value).to_owned()))
            .collect();
        spawn_child(GIT_ENV_TEST, GIT_ENV_MARKER, row.name, &base, &vars);
    }
}
