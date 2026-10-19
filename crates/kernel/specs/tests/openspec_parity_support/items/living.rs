//! The living specs under `openspec/specs/` and the living spec fixtures.

use super::super::cli::OpenSpecCli;
use super::super::project::Project;
use super::super::report::Comparison;
use super::super::trees::{folders, markdown_files, name_of};
use super::openspec::{item_outcome, items_of, living_outcome, single_item_outcome};
use std::path::Path;

/// The living spec fixtures, relative to the repository root.
const LIVING_FIXTURES: &str = "crates/kernel/specs/tests/fixtures/validate/living";

/// The living specs under `openspec/specs/`, one comparison per capability.
pub(super) fn living_spec_comparisons(repo: &Path, cli: &OpenSpecCli) -> Vec<Comparison> {
    let specs = repo.join("openspec/specs");
    let project = Project::prepare("living-specs", repo).expect("the project writes");
    project
        .set_specs(Some(&specs))
        .expect("the living specs copy");
    let output = cli.run(
        &[
            "validate",
            "--specs",
            "--strict",
            "--json",
            "--no-interactive",
        ],
        project.root(),
    );
    let items = items_of(&output).unwrap_or_default();
    let mut comparisons = Vec::new();
    for folder in folders(&specs) {
        let path = folder.join("spec.md");
        if !path.is_file() {
            continue;
        }
        let capability = name_of(&folder);
        let label = format!("openspec/specs/{capability}/spec.md");
        let text = std::fs::read_to_string(&path).expect("a living spec reads");
        comparisons.push(Comparison {
            rust: living_outcome(&label, &text),
            openspec: item_outcome(&items, &capability),
            label,
        });
    }
    comparisons
}

/// The living spec fixtures, each as the only spec of a project.
pub(super) fn living_fixture_comparisons(repo: &Path, cli: &OpenSpecCli) -> Vec<Comparison> {
    let dir = repo.join(LIVING_FIXTURES);
    let project = Project::prepare("living-fixtures", repo).expect("the project writes");
    let mut comparisons = Vec::new();
    for file in markdown_files(&dir) {
        let stem = name_of(&file);
        let stem = stem.trim_end_matches(".md");
        let text = std::fs::read_to_string(&file).expect("a fixture reads");
        project.set_specs(None).expect("the living specs clear");
        project
            .write(&format!("openspec/specs/{stem}/spec.md"), &text)
            .expect("the fixture writes");
        let output = cli.run(
            &[
                "validate",
                stem,
                "--type",
                "spec",
                "--strict",
                "--json",
                "--no-interactive",
            ],
            project.root(),
        );
        let label = format!("fixtures/validate/living/{stem}.md");
        comparisons.push(Comparison {
            rust: living_outcome(&label, &text),
            openspec: single_item_outcome(&output),
            label,
        });
    }
    comparisons
}
