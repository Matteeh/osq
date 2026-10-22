//! Building the steering prompt: the opening sections and `## Steering`.

use std::path::Path;

use osq_core::FeatureError;
use osq_kernel_config::Config;
use osq_kernel_specs::parse_frontmatter;
use osq_kernel_storage::ChangeSnapshot;
use osq_kernel_vcs::{GitVcs, Vcs};

use super::requirements::{self, Changed};
use super::triggers::Trigger;
use crate::next::{opening_prompt, sections};

/// Everything one steered change's prompt is built from.
pub(super) struct Steer<'a> {
    /// The root `plan` runs on, which the opening sections read.
    pub(super) root: &'a Path,
    /// The root of the tree the change sits in.
    pub(super) tree_root: &'a Path,
    /// The change's folder in its tree.
    pub(super) folder: &'a Path,
    /// The change's snapshot.
    pub(super) snapshot: &'a ChangeSnapshot,
    /// The id as the human gave it.
    pub(super) given_id: &'a str,
    /// The change's active steering triggers.
    pub(super) triggers: &'a [Trigger],
    /// The root's configuration.
    pub(super) config: &'a Config,
}

/// Builds the whole `plan-prompt.md` TypeScript writes for a steered change.
///
/// Implements: rust-plan/steering-prompt
pub(super) fn build(input: &Steer<'_>) -> Result<String, FeatureError> {
    let brief_path = input.folder.join("brief.md");
    let brief = std::fs::read_to_string(&brief_path).map_err(|source| {
        FeatureError::failed(
            "plan",
            format!("Cannot read {}: {source}", brief_path.display()),
        )
    })?;
    let title = input.snapshot.title.as_deref().unwrap_or(input.given_id);
    let opening = opening_prompt(
        input.root,
        &input.snapshot.id,
        Some(title),
        &input.snapshot.folder,
        &[],
        &brief,
    );
    let record = sections(input.root)?;
    let steering = section(input)?;
    Ok(format!("{opening}\n\n{record}\n\n{steering}"))
}

/// Builds the `## Steering` section, with no newline at its end.
///
/// Implements: rust-plan/steering-prompt
fn section(input: &Steer<'_>) -> Result<String, FeatureError> {
    let conflict = input.triggers.iter().any(Trigger::is_conflict);
    let has_default = input.triggers.iter().any(Trigger::has_default);
    let requirements = input.triggers.iter().any(Trigger::is_requirement_changed);
    let (branch, changed) = target(input, has_default, requirements)?;
    let mut lines = vec![
        "## Steering".to_owned(),
        String::new(),
        "osq halted this change and asks you to revise its plan.".to_owned(),
    ];
    for trigger in input.triggers {
        lines.push(String::new());
        lines.extend(trigger_lines(input.folder, trigger));
        if trigger.is_requirement_changed() {
            lines.extend(requirements::lines(&changed, &branch));
        }
    }
    lines.push(String::new());
    lines.push(format!(
        "The change runs in {}; read its code there. Edit only {}.",
        input.tree_root.display(),
        input.folder.display()
    ));
    if has_default {
        lines.push(approval_line(input.snapshot, &branch, conflict));
    }
    lines.push(if conflict {
        "Every task runs again after the restart. Revise any task the conflict shows is wrong."
            .to_owned()
    } else {
        format!(
            "Done tasks stay done: {}. Add a task for new work instead of rewriting a done one.",
            done_ids(input.snapshot)
        )
    });
    lines.push(format!(
        "Run `osq lint {}` and fix every finding. A human runs `osq approve {}`, and the run continues from the first task that is not done.",
        input.snapshot.id, input.snapshot.id
    ));
    Ok(lines.join("\n"))
}

/// The branch the approval line names and the requirements it changed.
///
/// Implements: rust-plan/steering-prompt
fn target(
    input: &Steer<'_>,
    has_default: bool,
    requirements: bool,
) -> Result<(String, Vec<Changed>), FeatureError> {
    if !has_default {
        return Ok((String::new(), Vec::new()));
    }
    if !input.config.vcs.enabled {
        return Ok(("main".to_owned(), Vec::new()));
    }
    let vcs = GitVcs::new(input.tree_root).with_timeouts(&input.config.timeouts);
    let fallback = input.config.vcs.default_branch.as_deref().unwrap_or("main");
    let branch = vcs
        .default_branch(fallback)
        .map_err(|error| FeatureError::failed("plan", error.to_string()))?;
    let changed = if requirements {
        requirements::changed(input.folder, &vcs, &branch)?
    } else {
        Vec::new()
    };
    Ok((branch, changed))
}

/// The default-branch approval line.
///
/// Implements: rust-plan/steering-prompt
fn approval_line(snapshot: &ChangeSnapshot, branch: &str, conflict: bool) -> String {
    if conflict {
        format!(
            "Approval restarts osq/{} from {branch}, and every task runs again.",
            snapshot.folder
        )
    } else {
        format!(
            "Approval merges {branch} into osq/{} without running verify; add a task that makes the merged tree pass.",
            snapshot.folder
        )
    }
}

/// The heading, evidence path and fenced marker body of one trigger.
///
/// Implements: rust-plan/steering-prompt
fn trigger_lines(folder: &Path, trigger: &Trigger) -> Vec<String> {
    let marker = folder.join(trigger.marker());
    let text = std::fs::read_to_string(&marker).unwrap_or_default();
    vec![
        format!(
            "### {} {} ({})",
            trigger.target_name(),
            trigger.name(),
            trigger.reason
        ),
        format!("Evidence: {}", marker.display()),
        String::new(),
        "```".to_owned(),
        body(&text),
        "```".to_owned(),
    ]
}

/// A marker's frontmatter body, trimmed, or its whole text when it does not parse.
///
/// Implements: rust-plan/steering-prompt
fn body(text: &str) -> String {
    match parse_frontmatter(text) {
        Ok(frontmatter) => frontmatter.body.trim().to_owned(),
        Err(_) => text.trim().to_owned(),
    }
}

/// The ids of tasks with a done marker and no regressed marker, joined by `, `.
///
/// Implements: rust-plan/steering-prompt
fn done_ids(snapshot: &ChangeSnapshot) -> String {
    let ids = snapshot
        .tasks
        .iter()
        .filter(|task| task.done && task.markers.regressed.is_none())
        .map(|task| task.id.to_string())
        .collect::<Vec<_>>();
    if ids.is_empty() {
        "none".to_owned()
    } else {
        ids.join(", ")
    }
}
