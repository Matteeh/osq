//! The executor prompt for one task, matching TypeScript's `buildExecutorPrompt`.

mod lines;
mod statements;

use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

use osq_kernel_specs::{SpecsError, read_proposal, read_task_file};

use statements::{Requirement, bounded_output, requirements};

/// The prior attempt the caller hands to `executor_prompt`.
pub struct PriorAttempt {
    /// The target-wide execution attempt; the first execution is 1.
    pub attempt: u32,
    /// The failure reason carried from the preceding retry, when any.
    pub reason: Option<String>,
    /// The failed verification output carried from a requeue, when any.
    pub output: Option<String>,
}

impl Default for PriorAttempt {
    /// Gives the first attempt with neither a reason nor an output.
    fn default() -> Self {
        Self {
            attempt: 1,
            reason: None,
            output: None,
        }
    }
}

/// One delta spec the change writes.
struct Delta {
    /// The capability name, the directory under `<change>/specs`.
    name: String,
    /// The spec file's path relative to the project root.
    path: String,
}

/// Builds the executor prompt for task `task` of `change` under `project_root`.
///
/// # Errors
///
/// Returns the error `read_task_file` gives when the task file cannot be read
/// or parsed.
///
/// Implements: rust-run/executor-prompt
/// Implements: rust-run/prompt-spec-lists
/// Implements: rust-run/prompt-capability-rules
/// Implements: rust-run/prompt-prior-context
pub fn executor_prompt(
    project_root: &Path,
    change: &Path,
    task: &str,
    prior: &PriorAttempt,
) -> Result<String, SpecsError> {
    let change = project_root.join(change);
    let task_file = read_task_file(&change.join("tasks").join(format!("{task}.md")))?;
    let reads = read_proposal(&change.join("proposal.md"))
        .map(|proposal| proposal.reads)
        .unwrap_or_default();
    let result = change
        .join(".run")
        .join("results")
        .join(format!("{task}.md"));
    let prior_result = result.exists().then(|| relative(project_root, &result));
    let deltas = delta_specs(project_root, &change);
    let living = living_specs(project_root, &deltas, &reads);
    let rules = capability_rules(project_root, &change, &deltas);

    let mut prompt = vec![
        lines::INTRO.to_owned(),
        format!(
            "Task File: {}",
            relative(
                project_root,
                &change.join("tasks").join(format!("{task}.md"))
            )
        ),
        format!(
            "Parent Spec: {}",
            relative(project_root, &change.join("proposal.md"))
        ),
        format!("Task Title: {}", task_file.title),
        format!("Scope: {}", task_file.scope.join(", ")),
        format!("Entry: {}", task_file.entry.join(", ")),
        format!("Verify Command: {}", task_file.verify),
        format!("Result Destination: {}", relative(project_root, &result)),
    ];
    prompt.extend(prior_context(prior, prior_result.as_deref()));
    push_section(&mut prompt, "Delta Specs:", &paths(&deltas));
    push_section(&mut prompt, "Living Capability Specs:", &living);
    prompt.push(String::new());
    prompt.push("Rules:".to_owned());
    prompt.extend(lines::STEPS.map(str::to_owned));
    push_section(&mut prompt, "Capability Rules:", &rules);
    prompt.push(String::new());
    prompt.push("Exiting:".to_owned());
    prompt.extend(lines::EXIT_LINES.map(str::to_owned));
    prompt.push(String::new());
    prompt.push(format!(
        "CRITICAL: Before exiting, you MUST write {} as the Exiting rules above describe. Change no file outside Scope except that result file. Never run git.",
        relative(project_root, &result)
    ));
    Ok(prompt.join("\n"))
}

/// Adds a blank line, a heading and its `- ` lines, or nothing for an empty list.
fn push_section(prompt: &mut Vec<String>, heading: &str, entries: &[String]) {
    if entries.is_empty() {
        return;
    }
    prompt.push(String::new());
    prompt.push(heading.to_owned());
    prompt.extend(entries.iter().map(|entry| format!("- {entry}")));
}

/// The prior context lines TypeScript's `priorContextLines` renders.
fn prior_context(prior: &PriorAttempt, result: Option<&str>) -> Vec<String> {
    let output = prior.output.as_deref().unwrap_or_default();
    let has_output = !statements::trim(output).is_empty();
    let reason = prior.reason.as_deref().unwrap_or_default();
    if prior.attempt <= 1 && reason.is_empty() && result.is_none() && !has_output {
        return Vec::new();
    }
    let mut context = vec![
        String::new(),
        "Prior Context:".to_owned(),
        format!("- Prior Attempt: {}", prior.attempt),
    ];
    if !reason.is_empty() {
        context.push(format!("- Prior Failure: {reason}"));
    }
    if has_output {
        context.push("- Prior Failure Output:".to_owned());
        context.extend(
            bounded_output(output)
                .split('\n')
                .map(|line| format!("  {line}")),
        );
    }
    if let Some(path) = result {
        context.push(format!("- Prior Result: {path}"));
    }
    context
}

/// The spec paths of every delta directory, in byte order.
fn delta_specs(project_root: &Path, change: &Path) -> Vec<Delta> {
    let directory = change.join("specs");
    let Ok(entries) = std::fs::read_dir(&directory) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    names
        .into_iter()
        .map(|name| Delta {
            path: relative(project_root, &directory.join(&name).join("spec.md")),
            name,
        })
        .collect()
}

/// The delta spec paths, relative to the project root.
fn paths(deltas: &[Delta]) -> Vec<String> {
    deltas.iter().map(|delta| delta.path.clone()).collect()
}

/// The existing living spec paths named by the reads and the deltas, in byte order.
fn living_specs(project_root: &Path, deltas: &[Delta], reads: &[String]) -> Vec<String> {
    let mut names: BTreeSet<String> = BTreeSet::new();
    for read in reads {
        let name = statements::trim(read);
        if !name.is_empty() {
            names.insert(name.to_owned());
        }
    }
    names.extend(deltas.iter().map(|delta| delta.name.clone()));
    names
        .into_iter()
        .filter_map(|name| {
            let path = Path::new("openspec")
                .join("specs")
                .join(name)
                .join("spec.md");
            project_root
                .join(&path)
                .exists()
                .then(|| path.to_string_lossy().into_owned())
        })
        .collect()
}

/// The capability rule lines of every delta spec, in byte order.
fn capability_rules(project_root: &Path, change: &Path, deltas: &[Delta]) -> Vec<String> {
    let mut rules = Vec::new();
    for delta in deltas {
        let spec = change.join("specs").join(&delta.name).join("spec.md");
        let Ok(content) = std::fs::read_to_string(spec) else {
            continue;
        };
        let living = living_requirements(project_root, &delta.name);
        for requirement in requirements(&content) {
            if living
                .as_ref()
                .is_some_and(|known| known.get(&requirement.title) == Some(&requirement.statement))
            {
                continue;
            }
            rules.push(rule(&delta.name, &requirement));
        }
    }
    rules
}

/// The living statements of one capability keyed by title, or none without a spec.
fn living_requirements(project_root: &Path, capability: &str) -> Option<BTreeMap<String, String>> {
    let path = project_root
        .join("openspec")
        .join("specs")
        .join(capability)
        .join("spec.md");
    let content = std::fs::read_to_string(path).ok()?;
    let mut statements = BTreeMap::new();
    for requirement in requirements(&content) {
        statements.insert(requirement.title, requirement.statement);
    }
    Some(statements)
}

/// Renders one capability rule.
fn rule(capability: &str, requirement: &Requirement) -> String {
    if requirement.statement.is_empty() {
        format!("{capability}: {}", requirement.title)
    } else {
        format!(
            "{capability}: {} — {}",
            requirement.title, requirement.statement
        )
    }
}

/// One path relative to the project root, as the prompt writes it.
fn relative(project_root: &Path, path: &Path) -> String {
    path.strip_prefix(project_root)
        .unwrap_or(path)
        .to_string_lossy()
        .into_owned()
}
