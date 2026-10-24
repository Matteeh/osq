//! Running `lint`: find the active change, load the config, run the proposal,
//! task, banned word, spec and link gate checks, and print their findings.

mod banned;
mod entry;
pub(crate) mod find;
mod finding;
mod json;
mod proposal;
mod tasks;
mod text;
mod verify;

use std::fs;
use std::path::Path;

use osq_core::{FeatureError, Output};
use osq_kernel_config::{Config, load_config};
use osq_kernel_linter::change_link_gates;
use osq_kernel_specs::{
    MergeChangeError, SyntaxError, parse_frontmatter, parse_proposal, read_decisions,
    validate_change, validate_living_specs, validate_merged_change,
};
use osq_kernel_storage::{ChangeEntry, Location, list_changes};
use osq_kernel_vcs::project_git_root;

use finding::{Finding, ReportFinding, Severity};
use verify::Project;

/// The folder of the link gates' decisions.
const DECISIONS: &str = "decisions";
/// The folder of the living specs and the changes.
const OPENSPEC: &str = "openspec";
/// The sidecar group the complete-capabilities gate checks.
const GROUP: &str = "rust";
/// The file that holds a change's proposal.
const PROPOSAL: &str = "proposal.md";
/// The error for a change folder without a proposal.
const MISSING_PROPOSAL: &str = "proposal.md (or legacy spec.md) not found in change folder";
/// The file that holds the project rules block.
const AGENTS: &str = "AGENTS.md";
/// The folder of a change's delta specs.
const SPECS: &str = "specs";
/// The file that holds a capability's delta spec.
const SPEC_FILE: &str = "spec.md";

/// Runs `lint` over `ids` and the repository, returning the text or JSON
/// output.
///
/// # Errors
///
/// Returns a `Failed` error with the command `lint` when no active change
/// matches, when a check cannot run, or when text output has any error
/// finding.
///
/// Implements: rust-lint/lint-arguments
/// Implements: rust-lint/lint-lookup
/// Implements: rust-lint/lint-findings
/// Implements: rust-lint/lint-repository-findings
/// Implements: rust-lint/lint-json
pub(crate) fn run_lint(
    root: &Path,
    ids: &[&str],
    show_repository: bool,
    json: bool,
) -> Result<Output, FeatureError> {
    let config = load_config(root).map_err(|error| failed(error.to_string()))?;
    let git_root = project_git_root(root, &config).map_err(|error| failed(error.to_string()))?;
    let changes = list_changes(root);
    let selected = select_changes(root, &changes, ids)?;
    let mut checked = Vec::new();
    for entry in &selected {
        checked.push(check_change(root, entry, &config, git_root.as_deref())?);
    }
    let repository = repository_findings(root, &changes, &selected)?;
    if json {
        return Ok(json::output(&checked, &repository));
    }
    render(root, &checked, &repository, show_repository).map(Output::text)
}

/// The changes the ids name, or every active change when there is no id.
fn select_changes<'a>(
    root: &Path,
    changes: &'a [ChangeEntry],
    ids: &[&str],
) -> Result<Vec<&'a ChangeEntry>, FeatureError> {
    if ids.is_empty() {
        return Ok(changes
            .iter()
            .filter(|entry| entry.location == Location::Active)
            .collect());
    }
    let folder = root.join(OPENSPEC).join("changes");
    ids.iter()
        .map(|query| {
            find::find_change(changes, query).ok_or_else(|| failed(text::not_found(query, &folder)))
        })
        .collect()
}

/// One checked change's block, as findings rather than only as lines.
struct ChangeReport {
    /// The change folder's name.
    folder: String,
    /// The change's findings, in the order the checks give them.
    findings: Vec<ReportFinding>,
}

impl ChangeReport {
    /// Whether the change has no error finding.
    fn valid(&self) -> bool {
        !self
            .findings
            .iter()
            .any(|finding| finding.severity == Severity::Error)
    }

    /// The block: each warning then `valid`, or the count then every line.
    fn lines(&self, root: &Path) -> Vec<String> {
        let mut lines = Vec::new();
        if !self.valid() {
            lines.push(text::count(&self.folder, self.findings.len()));
        }
        lines.extend(
            self.findings
                .iter()
                .map(|finding| text::report_line(&self.folder, root, finding)),
        );
        if self.valid() {
            lines.push(text::valid(&self.folder));
        }
        lines
    }
}

/// Checks one change's own findings in the order "Lint findings" gives them.
fn check_change(
    root: &Path,
    entry: &ChangeEntry,
    config: &Config,
    git_root: Option<&Path>,
) -> Result<ChangeReport, FeatureError> {
    let change = root.join(OPENSPEC).join("changes").join(&entry.folder);
    let mut findings: Vec<ReportFinding> =
        rule_findings(root, &change, &entry.folder, config, git_root)
            .into_iter()
            .map(ReportFinding::rule)
            .collect();
    findings.extend(spec_findings(root, entry)?);
    findings.extend(link_findings(root, &entry.folder)?);
    Ok(ChangeReport {
        folder: entry.folder.clone(),
        findings,
    })
}

/// The repository findings of a run, deduplicated by every reported field.
fn repository_findings(
    root: &Path,
    changes: &[ChangeEntry],
    selected: &[&ChangeEntry],
) -> Result<Vec<ReportFinding>, FeatureError> {
    let specs = root.join(OPENSPEC).join(SPECS);
    let mut per_change: Vec<(&str, Vec<ReportFinding>)> = Vec::new();
    for entry in changes
        .iter()
        .filter(|entry| entry.location == Location::Active)
    {
        let findings = validate_change(&entry.path, &specs)
            .map_err(|error| failed(error.to_string()))?
            .into_iter()
            .map(|finding| ReportFinding::spec(root, finding))
            .collect();
        per_change.push((entry.folder.as_str(), findings));
    }
    let living: Vec<ReportFinding> = validate_living_specs(&specs)
        .map_err(|error| failed(error.to_string()))?
        .into_iter()
        .map(|finding| ReportFinding::spec(root, finding))
        .collect();
    let mut all = Vec::new();
    for entry in selected {
        for (folder, findings) in &per_change {
            if *folder != entry.folder.as_str() {
                all.extend(findings.iter().cloned());
            }
        }
        all.extend(living.iter().cloned());
    }
    let mut unique: Vec<ReportFinding> = Vec::new();
    for finding in all {
        if !unique.contains(&finding) {
            unique.push(finding);
        }
    }
    Ok(unique)
}

/// The lines of every change block, then the repository lines, as text or failure.
fn render(
    root: &Path,
    checked: &[ChangeReport],
    repository: &[ReportFinding],
    show_repository: bool,
) -> Result<String, FeatureError> {
    let invalid = checked.iter().any(|change| !change.valid());
    let mut lines = Vec::new();
    for change in checked {
        lines.extend(change.lines(root));
    }
    lines.extend(repository_lines(root, repository, show_repository));
    if invalid {
        return Err(failed(lines.join("\n")));
    }
    if lines.is_empty() {
        return Ok(String::new());
    }
    let mut output = lines.join("\n");
    output.push('\n');
    Ok(output)
}

/// The repository count line, or the header and every repository finding.
fn repository_lines(root: &Path, findings: &[ReportFinding], show_repository: bool) -> Vec<String> {
    if findings.is_empty() {
        return Vec::new();
    }
    if !show_repository {
        return vec![text::repository_count(findings.len())];
    }
    let mut lines = vec![text::REPOSITORY_HEADER.to_owned()];
    lines.extend(
        findings
            .iter()
            .map(|finding| text::report_line("repository", root, finding)),
    );
    lines
}

/// The proposal, task and banned word findings for a change, in TypeScript's order.
fn rule_findings(
    root: &Path,
    change: &Path,
    folder: &str,
    config: &Config,
    git_root: Option<&Path>,
) -> Vec<Finding> {
    let file = format!("{OPENSPEC}/changes/{folder}/{PROPOSAL}");
    match read_proposal(change) {
        ProposalRead::Missing => vec![Finding::new(Severity::Error, file, None, MISSING_PROPOSAL)],
        ProposalRead::Unreadable => Vec::new(),
        ProposalRead::Invalid(error) => {
            let mut findings = vec![Finding::new(
                Severity::Error,
                file,
                None,
                format!(
                    "proposal.md frontmatter is not valid YAML at line {}: {}",
                    error.line, error.message
                ),
            )];
            findings.extend(tasks::findings(root, change, folder, config));
            findings.extend(entry_lines(root, change, folder, config, git_root));
            findings
        }
        ProposalRead::Parsed(proposal) => {
            parsed_findings(root, change, folder, config, git_root, &file, &proposal)
        }
    }
}

/// The findings once `proposal.md` reads and its frontmatter parses.
fn parsed_findings(
    root: &Path,
    change: &Path,
    folder: &str,
    config: &Config,
    git_root: Option<&Path>,
    file: &str,
    proposal: &ProposalDoc,
) -> Vec<Finding> {
    let records = read_decisions(root, Path::new(DECISIONS), Path::new(OPENSPEC));
    let agents = agents_text(root);
    let written = written_capabilities(change);
    let project = Project::read(root);
    let mut findings = proposal::findings(&proposal::Input {
        root,
        body: &proposal.body,
        file,
        verify: &proposal.verify,
        records: &records,
        agents: &agents,
        max_project_rules: config.limits.max_project_rules,
        written: &written,
        project: &project,
    });
    findings.extend(task_and_entry_findings(
        root, change, folder, config, git_root,
    ));
    findings.extend(banned::findings(change, folder, &config.banned_words));
    findings
}

/// The task findings with the entry findings between the per-task errors and
/// the cross-task warnings.
fn task_and_entry_findings(
    root: &Path,
    change: &Path,
    folder: &str,
    config: &Config,
    git_root: Option<&Path>,
) -> Vec<Finding> {
    let mut findings = tasks::findings(root, change, folder, config);
    let split = findings
        .iter()
        .position(|finding| finding.severity == Severity::Warning)
        .unwrap_or(findings.len());
    let warnings = findings.split_off(split);
    findings.extend(entry_lines(root, change, folder, config, git_root));
    findings.extend(warnings);
    findings
}

/// The entry findings for one change.
fn entry_lines(
    root: &Path,
    change: &Path,
    folder: &str,
    config: &Config,
    git_root: Option<&Path>,
) -> Vec<Finding> {
    entry::findings(root, change, folder, config, git_root)
}

/// A proposal document once it reads and its frontmatter parses.
struct ProposalDoc {
    /// The text after the frontmatter.
    body: String,
    /// The frontmatter's `verify`, as `parse_proposal` reads it.
    verify: String,
}

/// What reading a change's `proposal.md` found.
enum ProposalRead {
    /// The file does not exist.
    Missing,
    /// The file cannot be read as UTF-8.
    Unreadable,
    /// The frontmatter is not valid YAML.
    Invalid(SyntaxError),
    /// The proposal reads and its frontmatter parses.
    Parsed(ProposalDoc),
}

/// Reads `proposal.md` once, distinguishing the states its rules need.
fn read_proposal(change: &Path) -> ProposalRead {
    let Ok(bytes) = fs::read(change.join(PROPOSAL)) else {
        return ProposalRead::Missing;
    };
    let Ok(text) = String::from_utf8(bytes) else {
        return ProposalRead::Unreadable;
    };
    match parse_frontmatter(&text) {
        Ok(frontmatter) => {
            let verify =
                parse_proposal(&text).map_or_else(|_| String::new(), |parsed| parsed.verify);
            ProposalRead::Parsed(ProposalDoc {
                body: frontmatter.body,
                verify,
            })
        }
        Err(error) => ProposalRead::Invalid(error),
    }
}

/// Reads `AGENTS.md` as text, with invalid UTF-8 replaced, or the empty text.
fn agents_text(root: &Path) -> String {
    match fs::read(root.join(AGENTS)) {
        Ok(bytes) => String::from_utf8_lossy(&bytes).into_owned(),
        Err(_) => String::new(),
    }
}

/// The names of the folders directly under the change's `specs` that hold a
/// `spec.md`, in byte order.
fn written_capabilities(change: &Path) -> Vec<String> {
    let Ok(entries) = fs::read_dir(change.join(SPECS)) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .filter(|entry| entry.path().join(SPEC_FILE).is_file())
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    names
}

/// Validates the change's delta specs, then their merge when the deltas are clean.
///
/// Implements: rust-lint/lint-findings
fn spec_findings(root: &Path, entry: &ChangeEntry) -> Result<Vec<ReportFinding>, FeatureError> {
    let specs = root.join(OPENSPEC).join(SPECS);
    let findings =
        validate_change(&entry.path, &specs).map_err(|error| failed(error.to_string()))?;
    if !findings.is_empty() {
        return Ok(findings
            .into_iter()
            .map(|finding| ReportFinding::spec(root, finding))
            .collect());
    }
    match validate_merged_change(&entry.path, &specs) {
        Ok(findings) => Ok(findings
            .into_iter()
            .map(|finding| ReportFinding::spec(root, finding))
            .collect()),
        Err(MergeChangeError::Merge { path, error }) => {
            Ok(vec![ReportFinding::merge(root, path, error)])
        }
        Err(MergeChangeError::Read(error)) => Err(failed(error.to_string())),
    }
}

/// Runs the link gates over the project with the change in flight.
///
/// Implements: rust-lint/lint-findings
fn link_findings(root: &Path, folder: &str) -> Result<Vec<ReportFinding>, FeatureError> {
    let change = Path::new(OPENSPEC).join("changes").join(folder);
    let findings = change_link_gates(
        root,
        Path::new(DECISIONS),
        Path::new(OPENSPEC),
        GROUP,
        &change,
    )
    .map_err(|error| failed(error.to_string()))?;
    Ok(findings.into_iter().map(ReportFinding::link).collect())
}

/// Builds the failed error for a check that cannot run.
fn failed(message: String) -> FeatureError {
    FeatureError::failed("lint", message)
}
