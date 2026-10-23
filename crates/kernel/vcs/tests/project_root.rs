//! Proves the one place Rust osq decides whether git is on at a project root.

mod support;

use std::fs;
use std::os::unix::fs::symlink;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use osq_kernel_config::Config;
use osq_kernel_vcs::{Vcs, project_git_root};

use support::Scratch;

/// A fresh folder under the system temporary directory that no repository
/// holds, removed when dropped.
struct Plain {
    /// The folder, made canonical.
    path: PathBuf,
}

impl Plain {
    /// Makes the folder.
    fn new() -> Self {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path =
            std::env::temp_dir().join(format!("osq-project-root-{}-{stamp}", std::process::id()));
        fs::create_dir_all(&path).unwrap();
        Self {
            path: fs::canonicalize(path).unwrap(),
        }
    }

    /// The canonical folder.
    fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for Plain {
    /// Removes the folder.
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

/// A config whose `vcs.enabled` is `enabled`.
fn config(enabled: bool) -> Config {
    let mut config = Config::default();
    config.vcs.enabled = enabled;
    config
}

/// Makes a repository at the scratch folder's `outer` and gives its canonical
/// path.
fn repository(scratch: &Scratch) -> PathBuf {
    let path = scratch.path().join("outer");
    let _ = scratch.git(
        scratch.path(),
        &["init", "-q", "-b", "main", path.to_str().unwrap()],
    );
    let root = fs::canonicalize(path).unwrap();
    assert_eq!(scratch.vcs(&root).root().unwrap(), Some(root.clone()));
    root
}

/// Makes `outer/sub` and gives its canonical path.
fn subfolder(scratch: &Scratch, outer: &Path) -> PathBuf {
    scratch.write("outer/sub/.keep", "");
    fs::canonicalize(outer.join("sub")).unwrap()
}

/// The message a nested root displays.
fn nested_message(root: &Path, top: &Path) -> String {
    format!(
        "{} is inside the git repository at {} but is not its top level; run osq from {} or set vcs.enabled to false",
        root.display(),
        top.display(),
        top.display()
    )
}

/// Proves every row of "Project root check outcomes".
///
/// Covers: rust-vcs/project-root-check-outcomes
#[test]
fn project_root_check_outcomes() {
    let scratch = Scratch::new("project_root_outcomes");
    let outer = repository(&scratch);
    let sub = subfolder(&scratch, &outer);
    let plain = Plain::new();
    let link = scratch.path().join("outer-link");
    symlink(&outer, &link).unwrap();

    assert_eq!(project_git_root(plain.path(), &config(true)), Ok(None));
    assert_eq!(project_git_root(&outer, &config(false)), Ok(None));
    assert_eq!(
        project_git_root(&outer, &config(true)),
        Ok(Some(outer.clone()))
    );
    assert_eq!(
        project_git_root(&link, &config(true)),
        Ok(Some(outer.clone()))
    );
    assert_eq!(project_git_root(&sub, &config(false)), Ok(None));

    let nested = project_git_root(&sub, &config(true)).unwrap_err();
    assert_eq!(nested.root, sub);
    assert_eq!(nested.top, outer);
    assert_eq!(nested.to_string(), nested_message(&sub, &outer));
}

/// Proves `NestedRoot` is a `std::error::Error` with public root and top
/// fields.
///
/// Covers: rust-vcs/project-root-check-outcomes
#[test]
fn nested_root_is_an_error() {
    let scratch = Scratch::new("project_root_error");
    let outer = repository(&scratch);
    let sub = subfolder(&scratch, &outer);

    let nested = project_git_root(&sub, &config(true)).unwrap_err();
    let error: &dyn std::error::Error = &nested;
    assert_eq!(error.to_string(), nested_message(&sub, &outer));
    assert_eq!(nested.root, sub);
    assert_eq!(nested.top, outer);
}
