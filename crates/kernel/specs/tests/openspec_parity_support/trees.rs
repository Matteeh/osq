//! Reading and copying directory trees for the parity projects.

use std::collections::BTreeMap;
use std::io;
use std::path::{Path, PathBuf};

/// The repository root, three folders above this crate's manifest.
///
/// # Panics
///
/// Panics when the crate's manifest is not three folders below the root.
#[must_use]
pub fn repository_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(3)
        .expect("the repository root is three folders above crates/kernel/specs")
        .to_path_buf()
}

/// The folders directly under `dir`, in byte order of their names.
#[must_use]
pub fn folders(dir: &Path) -> Vec<PathBuf> {
    entries(dir)
        .into_iter()
        .filter(|path| path.is_dir())
        .collect()
}

/// The `.md` files directly under `dir`, in byte order of their names.
#[must_use]
pub fn markdown_files(dir: &Path) -> Vec<PathBuf> {
    entries(dir)
        .into_iter()
        .filter(|path| path.is_file() && path.extension().is_some_and(|ext| ext == "md"))
        .collect()
}

/// The entries directly under `dir`, in byte order of their file names.
fn entries(dir: &Path) -> Vec<PathBuf> {
    let Ok(read) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut paths: Vec<PathBuf> = read.flatten().map(|entry| entry.path()).collect();
    paths.sort_by(|left, right| left.file_name().cmp(&right.file_name()));
    paths
}

/// The file name of `path` as text, or empty when it has none.
#[must_use]
pub fn name_of(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Copies the tree at `source` into `target`, creating every folder.
///
/// # Errors
///
/// Returns the IO error of a folder it cannot create or a file it cannot copy.
pub fn copy_tree(source: &Path, target: &Path) -> io::Result<()> {
    std::fs::create_dir_all(target)?;
    for entry in std::fs::read_dir(source)?.flatten() {
        let from = entry.path();
        let to = target.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_tree(&from, &to)?;
        } else {
            std::fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

/// Reads every regular file under `root` as its `/`-joined relative path and
/// its text.
///
/// # Errors
///
/// Returns the IO or UTF-8 error of the first file that cannot be read.
pub fn read_tree(root: &Path) -> io::Result<BTreeMap<String, String>> {
    let mut tree = BTreeMap::new();
    collect_tree(root, "", &mut tree)?;
    Ok(tree)
}

/// Collects the files under `dir`, prefixing each key with `prefix`.
fn collect_tree(dir: &Path, prefix: &str, tree: &mut BTreeMap<String, String>) -> io::Result<()> {
    for entry in std::fs::read_dir(dir)?.flatten() {
        let path = entry.path();
        let key = if prefix.is_empty() {
            name_of(&path)
        } else {
            format!("{prefix}/{}", name_of(&path))
        };
        if entry.file_type()?.is_dir() {
            collect_tree(&path, &key, tree)?;
        } else {
            tree.insert(key, std::fs::read_to_string(&path)?);
        }
    }
    Ok(())
}
