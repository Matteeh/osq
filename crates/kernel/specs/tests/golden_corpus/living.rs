//! The live living specs and sidecars of this repository.

use super::scan::file_name;
use osq_kernel_specs::{read_living_spec, read_sidecar};
use std::path::{Path, PathBuf};

/// Every failure the live living specs and sidecars show.
#[must_use]
pub fn living_failures(root: &Path) -> Vec<String> {
    let mut failures = Vec::new();
    for (capability, folder) in capability_folders(&root.join("openspec/specs")) {
        check_living(&capability, &folder, &mut failures);
    }
    failures
}

/// The living capability folders under a specs directory, in name order.
fn capability_folders(specs: &Path) -> Vec<(String, PathBuf)> {
    let Ok(entries) = std::fs::read_dir(specs) else {
        return Vec::new();
    };
    let mut folders: Vec<(String, PathBuf)> = entries
        .flatten()
        .map(|entry| (file_name(&entry.path()), entry.path()))
        .filter(|(_, path)| path.join("spec.md").is_file())
        .collect();
    folders.sort();
    folders
}

/// Records a failure for each part of a living spec or sidecar that is wrong.
fn check_living(capability: &str, folder: &Path, failures: &mut Vec<String>) {
    match read_living_spec(&folder.join("spec.md")) {
        Err(error) => failures.push(format!("{capability}: {error}")),
        Ok(spec) => {
            if spec.title.is_empty() {
                failures.push(format!("{capability}: empty title"));
            }
            if spec.purpose.is_empty() {
                failures.push(format!("{capability}: empty purpose"));
            }
            if spec.requirements.is_empty() {
                failures.push(format!("{capability}: no requirements"));
            }
        }
    }
    match read_sidecar(&folder.join("osq.yml")) {
        Err(error) => failures.push(format!("{capability}: {error}")),
        Ok(sidecar) if sidecar.group.is_empty() => {
            failures.push(format!("{capability}: empty sidecar group"));
        }
        Ok(_) => {}
    }
}
