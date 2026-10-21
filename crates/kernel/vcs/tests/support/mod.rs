//! Scratch repositories and the isolated git settings every vcs read test uses.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use osq_kernel_vcs::GitVcs;

/// The date every test commit gets.
const DATE: &str = "2000-01-01T00:00:00+0000";
/// The author and committer name every test commit gets.
const NAME: &str = "Osq Test";
/// The author and committer email every test commit gets.
const EMAIL: &str = "osq@example.com";

/// One test's scratch folder, and the isolated repository settings it needs.
#[derive(Debug)]
pub struct Scratch {
    /// The scratch folder, made canonical.
    root: PathBuf,
}

impl Scratch {
    /// Creates the scratch folder `name` under `CARGO_TARGET_TMPDIR`, empty.
    #[must_use]
    pub fn new(name: &str) -> Self {
        let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        Self {
            root: fs::canonicalize(root).unwrap(),
        }
    }

    /// The canonical scratch folder.
    #[must_use]
    pub fn path(&self) -> &Path {
        &self.root
    }

    /// Runs `git` in `dir` with the isolated settings, giving its output.
    #[must_use]
    pub fn git(&self, dir: &Path, args: &[&str]) -> String {
        let mut command = Command::new("git");
        command.args(args).current_dir(dir);
        isolate(&mut command, &self.root);
        command
            .env("GIT_AUTHOR_NAME", NAME)
            .env("GIT_AUTHOR_EMAIL", EMAIL)
            .env("GIT_AUTHOR_DATE", DATE)
            .env("GIT_COMMITTER_NAME", NAME)
            .env("GIT_COMMITTER_EMAIL", EMAIL)
            .env("GIT_COMMITTER_DATE", DATE);
        let output = command.output().unwrap();
        assert!(
            output.status.success(),
            "git {} failed in {}: {}",
            args.join(" "),
            dir.display(),
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8_lossy(&output.stdout).into_owned()
    }

    /// Writes one file of the scratch folder, creating its folders.
    pub fn write(&self, relative: &str, contents: impl AsRef<[u8]>) {
        let path = self.root.join(relative);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, contents).unwrap();
    }

    /// A `GitVcs` for `root` with the same isolated settings as `git`.
    #[must_use]
    pub fn vcs(&self, root: &Path) -> GitVcs {
        GitVcs::new(root)
            .with_env("GIT_CONFIG_GLOBAL", "/dev/null")
            .with_env("GIT_CONFIG_NOSYSTEM", "1")
            .with_env("GIT_CEILING_DIRECTORIES", self.root.to_string_lossy())
            .with_env("GIT_CONFIG_COUNT", "1")
            .with_env("GIT_CONFIG_KEY_0", "maintenance.auto")
            .with_env("GIT_CONFIG_VALUE_0", "false")
    }
}

/// Applies the isolated settings no global or system git config may override.
fn isolate(command: &mut Command, scratch: &Path) {
    command
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GIT_CEILING_DIRECTORIES", scratch)
        .env("GIT_CONFIG_COUNT", "1")
        .env("GIT_CONFIG_KEY_0", "maintenance.auto")
        .env("GIT_CONFIG_VALUE_0", "false");
}
