//! Temporary `OpenSpec` projects the parity tests build and validate.

use super::trees::copy_tree;
use std::io;
use std::path::{Path, PathBuf};

/// The proposal a fixture change without one gets, because `OpenSpec` reads a
/// change only through its proposal.
const PARITY_PROPOSAL: &str = "# Parity fixture\n";

/// A temporary `OpenSpec` project under `CARGO_TARGET_TMPDIR`.
#[derive(Debug)]
pub struct Project {
    /// The project's root folder.
    root: PathBuf,
}

impl Project {
    /// Prepares an empty project folder with the scaffolded osq schema.
    ///
    /// Removes any earlier folder at the same path, so a rerun starts clean.
    ///
    /// # Errors
    ///
    /// Returns the IO error of the scaffold copy.
    pub fn prepare(name: &str, repo: &Path) -> io::Result<Self> {
        let root = Path::new(env!("CARGO_TARGET_TMPDIR"))
            .join("openspec-parity")
            .join(name);
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("openspec"))?;
        copy_tree(&repo.join("templates/openspec"), &root.join("openspec"))?;
        Ok(Self { root })
    }

    /// The project's root folder.
    #[must_use]
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Replaces `openspec/specs` with a copy of `source`, or removes it when
    /// there is no source.
    ///
    /// # Errors
    ///
    /// Returns the IO error of the copy.
    pub fn set_specs(&self, source: Option<&Path>) -> io::Result<()> {
        let target = self.root.join("openspec/specs");
        let _ = std::fs::remove_dir_all(&target);
        match source {
            Some(source) => copy_tree(source, &target),
            None => Ok(()),
        }
    }

    /// Removes `openspec/changes`.
    ///
    /// # Errors
    ///
    /// Never fails today, but keeps the `io::Result` shape of its siblings.
    pub fn clear_changes(&self) -> io::Result<()> {
        let _ = std::fs::remove_dir_all(self.root.join("openspec/changes"));
        Ok(())
    }

    /// Creates `openspec/changes/<name>` with the parity proposal.
    ///
    /// # Errors
    ///
    /// Returns the IO error of the folder or proposal write.
    pub fn make_change(&self, name: &str) -> io::Result<PathBuf> {
        let target = self.root.join("openspec/changes").join(name);
        std::fs::create_dir_all(&target)?;
        ensure_proposal(&target)?;
        Ok(target)
    }

    /// Puts a change's `proposal.md`, `tasks.md` and `specs/` under
    /// `openspec/changes/<name>`, writing the parity proposal when the source
    /// holds none.
    ///
    /// # Errors
    ///
    /// Returns the IO error of the copy or the proposal write.
    pub fn put_change(&self, name: &str, source: &Path) -> io::Result<PathBuf> {
        let target = self.make_change(name)?;
        for part in ["proposal.md", "tasks.md"] {
            let from = source.join(part);
            if from.is_file() {
                std::fs::copy(&from, target.join(part))?;
            }
        }
        let specs = source.join("specs");
        if specs.is_dir() {
            copy_tree(&specs, &target.join("specs"))?;
        }
        ensure_proposal(&target)?;
        Ok(target)
    }

    /// Writes `text` to `relative` under the project root, creating folders.
    ///
    /// # Errors
    ///
    /// Returns the IO error of the folder or file write.
    pub fn write(&self, relative: &str, text: &str) -> io::Result<()> {
        let path = self.root.join(relative);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(path, text)
    }
}

/// Writes the parity proposal into `change` when it holds none.
fn ensure_proposal(change: &Path) -> io::Result<()> {
    let proposal = change.join("proposal.md");
    if proposal.is_file() {
        return Ok(());
    }
    std::fs::write(proposal, PARITY_PROPOSAL)
}
