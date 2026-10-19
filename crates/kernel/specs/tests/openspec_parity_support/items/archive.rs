//! The archived changes, each validated against the replay before it lands.

use super::super::cli::OpenSpecCli;
use super::super::project::Project;
use super::super::replay::archived_landing_order;
use super::super::report::Comparison;
use super::super::trees::name_of;
use super::openspec::{change_outcome, single_item_outcome};
use osq_kernel_specs::merge_change;
use std::path::{Path, PathBuf};

/// The archive, relative to the repository root.
const ARCHIVE: &str = "openspec/changes/archive";

/// The archived changes in landing order, each validated against the living
/// specs the replay gives before it, and then merged into the replay.
pub(super) fn archive_comparisons(repo: &Path, cli: &OpenSpecCli) -> Vec<Comparison> {
    let archive = repo.join(ARCHIVE);
    let scratch = scratch_specs();
    let project = Project::prepare("archive", repo).expect("the project writes");
    let mut comparisons = Vec::new();
    for folder in archived_landing_order(&archive) {
        let name = name_of(&folder);
        let rust = change_outcome(&folder, &scratch);
        project
            .set_specs(Some(&scratch))
            .expect("the replay specs copy");
        project.clear_changes().expect("the changes clear");
        project
            .put_change(&name, &folder)
            .expect("the change copies");
        let output = cli.run(
            &[
                "validate",
                &name,
                "--type",
                "change",
                "--strict",
                "--json",
                "--no-interactive",
            ],
            project.root(),
        );
        comparisons.push(Comparison {
            label: format!("openspec/changes/archive/{name}"),
            rust,
            openspec: single_item_outcome(&output),
        });
        merge_into(&folder, &scratch);
    }
    comparisons
}

/// An empty scratch specs folder for the replay.
fn scratch_specs() -> PathBuf {
    let scratch = Path::new(env!("CARGO_TARGET_TMPDIR")).join("openspec-parity/archive-specs");
    let _ = std::fs::remove_dir_all(&scratch);
    std::fs::create_dir_all(&scratch).expect("the scratch folder creates");
    scratch
}

/// Merges one change into the scratch specs, writing or removing before the
/// next change is compared.
fn merge_into(change: &Path, scratch: &Path) {
    let merged = merge_change(change, scratch).unwrap_or_else(|error| {
        panic!(
            "{}: the archive replay cannot merge: {error}",
            change.display()
        )
    });
    for spec in merged {
        let target = scratch.join(&spec.capability);
        match spec.text {
            Some(text) => {
                std::fs::create_dir_all(&target).expect("the scratch capability creates");
                std::fs::write(target.join("spec.md"), text).expect("the scratch spec writes");
            }
            None => {
                let _ = std::fs::remove_dir_all(&target);
            }
        }
    }
}
