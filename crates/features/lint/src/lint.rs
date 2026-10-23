//! Running `lint`: find the active change, load the config, run the proposal,
//! task, banned word, spec and link gate checks, and print their findings.

mod banned;
mod entry;
pub(crate) mod find;
mod finding;
mod proposal;
mod tasks;
mod text;
mod verify;

use std::fs;
use std::path::Path;

use osq_core::FeatureError;
use osq_kernel_config::{Config, load_config};
use osq_kernel_linter::change_link_gates;
use osq_kernel_specs::{
    MergeChangeError, SyntaxError, parse_frontmatter, parse_proposal, read_decisions,
    validate_change, validate_merged_change,
};
use osq_kernel_storage::{ChangeEntry, list_changes};

use finding::{Finding, Severity};
use text::{finding_line, merge_line, spec_line};
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

/// Runs `lint` for one query, returning the finding text or `valid`.
///
/// # Errors
///
/// Returns a `Failed` error with the command `lint` when no active change
/// matches, when a check cannot run, or when the change has any error finding.
///
/// Implements: rust-lint/lint-lookup
/// Implements: rust-lint/lint-findings
/// Implements: rust-lint/lint-errors
pub(crate) fn run_lint(root: &Path, query: &str) -> Result<String, FeatureError> {
    let changes = list_changes(root);
    let entry = find::find_change(&changes, query)
        .ok_or_else(|| failed(text::not_found(query, &root.join(OPENSPEC).join("changes"))))?;
    let config = load_config(root).map_err(|error| failed(error.to_string()))?;
    let change = root.join(OPENSPEC).join("changes").join(&entry.folder);
    let findings = rule_findings(root, &change, &entry.folder, &config);
    let mut lines = rule_lines(&entry.folder, &findings);
    lines.extend(error_lines(spec_findings(root, entry)?));
    lines.extend(error_lines(link_findings(root, &entry.folder)?));
    finish(&entry.folder, lines)
}

/// The proposal, task and banned word findings for a change, in TypeScript's order.
fn rule_findings(root: &Path, change: &Path, folder: &str, config: &Config) -> Vec<Finding> {
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
            findings.extend(entry_lines(root, change, folder, config));
            findings
        }
        ProposalRead::Parsed(proposal) => {
            parsed_findings(root, change, folder, config, &file, &proposal)
        }
    }
}

/// The findings once `proposal.md` reads and its frontmatter parses.
fn parsed_findings(
    root: &Path,
    change: &Path,
    folder: &str,
    config: &Config,
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
    findings.extend(task_and_entry_findings(root, change, folder, config));
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
) -> Vec<Finding> {
    let mut findings = tasks::findings(root, change, folder, config);
    let split = findings
        .iter()
        .position(|finding| finding.severity == Severity::Warning)
        .unwrap_or(findings.len());
    let warnings = findings.split_off(split);
    findings.extend(entry_lines(root, change, folder, config));
    findings.extend(warnings);
    findings
}

/// The entry findings for one change.
fn entry_lines(root: &Path, change: &Path, folder: &str, config: &Config) -> Vec<Finding> {
    entry::findings(root, change, folder, config)
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

/// The line for every proposal rule and banned word finding.
fn rule_lines(folder: &str, findings: &[Finding]) -> Vec<Line> {
    findings
        .iter()
        .map(|finding| Line {
            severity: finding.severity,
            text: text::rule_line(folder, finding),
        })
        .collect()
}

/// Wraps spec and link gate lines as errors.
fn error_lines(lines: Vec<String>) -> Vec<Line> {
    lines
        .into_iter()
        .map(|line| Line {
            severity: Severity::Error,
            text: line,
        })
        .collect()
}

/// One finding's line and whether it is an error.
struct Line {
    /// Whether the finding fails the change.
    severity: Severity,
    /// The line `text` writes.
    text: String,
}

/// Returns `valid` output for warnings only, or the count and finding lines.
fn finish(folder: &str, lines: Vec<Line>) -> Result<String, FeatureError> {
    if lines.iter().any(|line| line.severity == Severity::Error) {
        let texts: Vec<String> = lines.into_iter().map(|line| line.text).collect();
        return Err(failed(text::findings(folder, &texts)));
    }
    let texts: Vec<String> = lines.into_iter().map(|line| line.text).collect();
    Ok(text::warnings(folder, &texts))
}

/// Validates the change's delta specs, then their merge when the deltas are clean.
///
/// Implements: rust-lint/lint-findings
/// Implements: rust-lint/lint-errors
fn spec_findings(root: &Path, entry: &ChangeEntry) -> Result<Vec<String>, FeatureError> {
    let specs = root.join(OPENSPEC).join(SPECS);
    let findings =
        validate_change(&entry.path, &specs).map_err(|error| failed(error.to_string()))?;
    if !findings.is_empty() {
        return Ok(findings
            .iter()
            .map(|finding| spec_line(&entry.folder, root, finding))
            .collect());
    }
    match validate_merged_change(&entry.path, &specs) {
        Ok(findings) => Ok(findings
            .iter()
            .map(|finding| spec_line(&entry.folder, root, finding))
            .collect()),
        Err(MergeChangeError::Merge { path, error }) => {
            Ok(vec![merge_line(&entry.folder, root, &path, &error)])
        }
        Err(MergeChangeError::Read(error)) => Err(failed(error.to_string())),
    }
}

/// Runs the link gates over the project with the change in flight.
///
/// Implements: rust-lint/lint-findings
/// Implements: rust-lint/lint-errors
fn link_findings(root: &Path, folder: &str) -> Result<Vec<String>, FeatureError> {
    let change = Path::new(OPENSPEC).join("changes").join(folder);
    let findings = change_link_gates(
        root,
        Path::new(DECISIONS),
        Path::new(OPENSPEC),
        GROUP,
        &change,
    )
    .map_err(|error| failed(error.to_string()))?;
    Ok(findings
        .iter()
        .map(|finding| finding_line(folder, finding))
        .collect())
}

/// Builds the failed error for a check that cannot run.
fn failed(message: String) -> FeatureError {
    FeatureError::failed("lint", message)
}
