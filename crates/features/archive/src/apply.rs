//! Writing the living specs and sidecars an archive leaves.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use osq_kernel_specs::{MergedSpec, js_trim, parse_frontmatter};
use yaml_rust2::yaml::{Hash, Yaml};

/// The living specs folder under the project root.
const SPECS: &str = "openspec/specs";

/// The living spec file of one capability.
const LIVING_SPEC: &str = "spec.md";

/// The sidecar file of one capability.
const SIDECAR: &str = "osq.yml";

/// The change's proposal, whose frontmatter declares `creates`.
const PROPOSAL: &str = "proposal.md";

/// The frontmatter key listing the capabilities a change creates.
const CREATES: &str = "creates";

/// The `creates` entry key naming the capability.
const NAME: &str = "name";

/// The `creates` entry key naming its group.
const GROUP: &str = "group";

/// Why writing a living spec or sidecar failed.
#[derive(Debug)]
pub(crate) struct WriteError {
    /// The path that could not be written.
    pub(crate) path: PathBuf,
    /// The operating system's error.
    pub(crate) source: io::Error,
}

/// One `creates` entry: its trimmed name and trimmed group, or no group.
struct CreatesEntry {
    /// The capability's trimmed name.
    name: String,
    /// The trimmed group, or none for a bare name.
    group: Option<String>,
}

/// Writes the merged specs, then the created and replacement sidecars.
///
/// # Errors
///
/// Returns the first [`WriteError`] a living file or sidecar raises.
///
/// Implements: rust-archive/living-spec-writes
/// Implements: rust-archive/archive-sidecars
pub(crate) fn write(root: &Path, change: &Path, merged: &[MergedSpec]) -> Result<(), WriteError> {
    let specs_root = root.join(SPECS);
    for spec in merged {
        write_spec(&specs_root, spec)?;
    }
    write_created(&specs_root, change)?;
    copy_replacements(&specs_root, change)
}

/// Writes one merged living spec, or removes the capability it empties.
fn write_spec(specs_root: &Path, spec: &MergedSpec) -> Result<(), WriteError> {
    let folder = specs_root.join(&spec.capability);
    let path = folder.join(LIVING_SPEC);
    match &spec.text {
        Some(text) => {
            fs::create_dir_all(&folder).map_err(|source| WriteError {
                path: path.clone(),
                source,
            })?;
            fs::write(&path, text).map_err(|source| WriteError { path, source })
        }
        None => remove_emptied(&folder, &path),
    }
}

/// Removes an emptied capability's `spec.md`, `osq.yml` and then its folder.
fn remove_emptied(folder: &Path, spec: &Path) -> Result<(), WriteError> {
    remove_file(spec)?;
    remove_file(&folder.join(SIDECAR))?;
    let _ = fs::remove_dir(folder);
    Ok(())
}

/// Removes a file, treating a missing one as already removed.
fn remove_file(path: &Path) -> Result<(), WriteError> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(source) if source.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(source) => Err(WriteError {
            path: path.to_path_buf(),
            source,
        }),
    }
}

/// Writes the sidecar of each created capability that declares a group.
fn write_created(specs_root: &Path, change: &Path) -> Result<(), WriteError> {
    let Some(entries) = read_creates(change) else {
        return Ok(());
    };
    for entry in entries {
        let Some(group) = entry.group else {
            continue;
        };
        let folder = specs_root.join(&entry.name);
        if !folder.join(LIVING_SPEC).is_file() {
            continue;
        }
        let sidecar = folder.join(SIDECAR);
        if fs::metadata(&sidecar).is_ok() {
            continue;
        }
        fs::create_dir_all(&folder).map_err(|source| WriteError {
            path: sidecar.clone(),
            source,
        })?;
        fs::write(&sidecar, format!("group: {group}\n")).map_err(|source| WriteError {
            path: sidecar,
            source,
        })?;
    }
    Ok(())
}

/// Reads the proposal's `creates` entries, or none when it is malformed.
fn read_creates(change: &Path) -> Option<Vec<CreatesEntry>> {
    let text = fs::read_to_string(change.join(PROPOSAL)).ok()?;
    let frontmatter = parse_frontmatter(&text).ok()?;
    let value = frontmatter.data.get(&Yaml::String(CREATES.to_owned()));
    match value {
        None => Some(Vec::new()),
        Some(Yaml::Array(items)) => items.iter().map(creates_entry).collect(),
        Some(_) => None,
    }
}

/// Reads one `creates` entry, or none when its shape is not a string or mapping.
fn creates_entry(value: &Yaml) -> Option<CreatesEntry> {
    match value {
        Yaml::String(name) => Some(CreatesEntry {
            name: js_trim(name).to_owned(),
            group: None,
        }),
        Yaml::Hash(mapping) => {
            let name = string_field(mapping, NAME)?;
            let group = string_field(mapping, GROUP)?;
            Some(CreatesEntry {
                name: js_trim(&name).to_owned(),
                group: Some(js_trim(&group).to_owned()),
            })
        }
        _ => None,
    }
}

/// One string field of a YAML mapping.
fn string_field(mapping: &Hash, key: &str) -> Option<String> {
    match mapping.get(&Yaml::String(key.to_owned())) {
        Some(Yaml::String(text)) => Some(text.clone()),
        _ => None,
    }
}

/// Copies each replacement `osq.yml` the change carries over the living one.
fn copy_replacements(specs_root: &Path, change: &Path) -> Result<(), WriteError> {
    let Ok(entries) = fs::read_dir(change.join("specs")) else {
        return Ok(());
    };
    let mut folders: Vec<PathBuf> = entries
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .map(|entry| entry.path())
        .collect();
    folders.sort();
    for folder in folders {
        let Ok(bytes) = fs::read(folder.join(SIDECAR)) else {
            continue;
        };
        let Some(name) = folder.file_name() else {
            continue;
        };
        let target_folder = specs_root.join(name);
        let target = target_folder.join(SIDECAR);
        fs::create_dir_all(&target_folder).map_err(|source| WriteError {
            path: target.clone(),
            source,
        })?;
        fs::write(&target, bytes).map_err(|source| WriteError {
            path: target,
            source,
        })?;
    }
    Ok(())
}
