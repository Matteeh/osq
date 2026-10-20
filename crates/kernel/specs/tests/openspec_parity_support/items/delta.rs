//! The delta spec fixtures, each as `specs/alpha/spec.md` of a change.

use super::super::cli::OpenSpecCli;
use super::super::project::Project;
use super::super::report::Comparison;
use super::super::trees::{markdown_files, name_of};
use super::openspec::{delta_outcome, single_item_outcome};
use std::path::Path;

/// The delta spec fixtures, relative to the repository root.
const DELTA_FIXTURES: &str = "crates/kernel/specs/tests/fixtures/validate/delta";

/// The delta spec fixtures, each as `specs/alpha/spec.md` of a change `parity`
/// with no living spec.
pub(super) fn delta_fixture_comparisons(repo: &Path, cli: &OpenSpecCli) -> Vec<Comparison> {
    let dir = repo.join(DELTA_FIXTURES);
    let project = Project::prepare("delta-fixtures", repo).expect("the project writes");
    let mut comparisons = Vec::new();
    for file in markdown_files(&dir) {
        let stem = name_of(&file);
        let stem = stem.trim_end_matches(".md");
        let text = std::fs::read_to_string(&file).expect("a fixture reads");
        project.set_specs(None).expect("the living specs clear");
        project.clear_changes().expect("the changes clear");
        project.make_change("parity").expect("the change writes");
        project
            .write("openspec/changes/parity/specs/alpha/spec.md", &text)
            .expect("the fixture writes");
        let output = cli.run(
            &[
                "validate",
                "parity",
                "--type",
                "change",
                "--strict",
                "--json",
                "--no-interactive",
            ],
            project.root(),
        );
        let label = format!("fixtures/validate/delta/{stem}.md");
        comparisons.push(Comparison {
            rust: delta_outcome(&label, &text),
            openspec: single_item_outcome(&output),
            label,
        });
    }
    comparisons
}
