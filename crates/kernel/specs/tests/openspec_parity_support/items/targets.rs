//! The validate target changes, validated against the target living specs.

use super::super::cli::OpenSpecCli;
use super::super::project::Project;
use super::super::report::Comparison;
use super::super::trees::{folders, name_of};
use super::openspec::{change_outcome, single_item_outcome};
use std::path::Path;

/// The target fixtures, relative to the repository root.
const TARGETS: &str = "crates/kernel/specs/tests/fixtures/validate/targets";

/// The changes under `targets/changes/`, each with `targets/specs/` as the
/// living specs.
pub(super) fn target_comparisons(repo: &Path, cli: &OpenSpecCli) -> Vec<Comparison> {
    let base = repo.join(TARGETS);
    let specs = base.join("specs");
    let project = Project::prepare("targets", repo).expect("the project writes");
    let mut comparisons = Vec::new();
    for folder in folders(&base.join("changes")) {
        let name = name_of(&folder);
        project
            .set_specs(Some(&specs))
            .expect("the living specs copy");
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
        let label = format!("fixtures/validate/targets/changes/{name}");
        comparisons.push(Comparison {
            rust: change_outcome(&folder, &specs),
            openspec: single_item_outcome(&output),
            label,
        });
    }
    comparisons
}
