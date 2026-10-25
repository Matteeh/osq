//! Proves `manual` through the CLI's feature registry.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{self, Command};

use osq_cli::{CliResult, features, run_cli};

/// A scratch repository under the system temporary directory, removed on drop.
struct Scratch {
    /// The repository's top level.
    path: PathBuf,
}

impl Scratch {
    /// Creates a fresh repository named for this test and process.
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!("osq-manual-command-{}", process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).expect("the scratch folder is created");
        let path = fs::canonicalize(path).expect("the scratch folder canonicalizes");
        Self { path }
    }
}

impl Drop for Scratch {
    /// Removes the scratch repository and everything it holds.
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

/// Runs git in `cwd`, giving its trimmed standard output.
fn git(cwd: &Path, args: &[&str]) -> String {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .expect("git starts");
    assert!(
        output.status.success(),
        "git {} failed: {}",
        args.join(" "),
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8(output.stdout)
        .expect("git writes text")
        .trim()
        .to_owned()
}

/// The arguments as owned strings.
fn args(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| (*value).to_owned()).collect()
}

/// Writes the scratch repository's committed project and its one edit.
fn set_up(root: &Path) {
    fs::write(
        root.join("osq.toml"),
        "[vcs]\nenabled = true\nauthor = \"osq <osq@example.com>\"\n",
    )
    .expect("the config is written");
    fs::write(root.join("a.txt"), "one\n").expect("the tracked file is written");
    git(root, &["init", "-q", "-b", "main"]);
    git(root, &["config", "user.name", "Ada"]);
    git(root, &["config", "user.email", "ada@example.com"]);
    git(root, &["config", "commit.gpgsign", "false"]);
    git(root, &["add", "-A"]);
    git(root, &["commit", "-q", "-m", "init"]);
    fs::write(root.join("a.txt"), "two\n").expect("the tracked file is edited");
}

/// Proves the blank, kept and nothing-to-keep rows in order.
///
/// Covers: rust-cli/manual-through-the-cli
#[test]
fn manual_through_the_cli() {
    let scratch = Scratch::new();
    let root = scratch.path.as_path();
    set_up(root);
    let registry = features();
    assert_eq!(
        run_cli(&registry, root, &args(&["manual", "   "])),
        CliResult {
            stdout: String::new(),
            stderr: "manual failed: osq manual needs a comment: osq manual \"<why>\"\n".to_owned(),
            code: 1,
        }
    );
    let keep = run_cli(&registry, root, &args(&["manual", "keep a"]));
    let commit = git(root, &["rev-parse", "HEAD"]);
    assert_eq!(
        keep,
        CliResult {
            stdout: format!("Kept a.txt as {}\n", &commit[..7]),
            stderr: String::new(),
            code: 0,
        }
    );
    assert_eq!(
        run_cli(&registry, root, &args(&["manual", "again"])),
        CliResult {
            stdout: String::new(),
            stderr: "manual failed: nothing to keep: the checkout has no uncommitted edits outside openspec/changes\n".to_owned(),
            code: 1,
        }
    );
}
