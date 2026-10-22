//! Building the steering prompt: the opening sections and `## Steering`.

use std::path::Path;

use osq_core::FeatureError;
use osq_kernel_specs::parse_frontmatter;
use osq_kernel_storage::ChangeSnapshot;

use super::triggers::Trigger;
use crate::next::{opening_prompt, sections};

/// Builds the whole `plan-prompt.md` TypeScript writes for a steered change.
///
/// Implements: rust-plan/steering-prompt
pub(super) fn build(
    root: &Path,
    folder: &Path,
    snapshot: &ChangeSnapshot,
    given_id: &str,
    triggers: &[Trigger],
) -> Result<String, FeatureError> {
    let brief_path = folder.join("brief.md");
    let brief = std::fs::read_to_string(&brief_path).map_err(|source| {
        FeatureError::failed(
            "plan",
            format!("Cannot read {}: {source}", brief_path.display()),
        )
    })?;
    let title = snapshot.title.as_deref().unwrap_or(given_id);
    let opening = opening_prompt(
        root,
        &snapshot.id,
        Some(title),
        &snapshot.folder,
        &[],
        &brief,
    );
    let record = sections(root)?;
    let steering = section(root, folder, &snapshot.id, snapshot, triggers);
    Ok(format!("{opening}\n\n{record}\n\n{steering}"))
}

/// Builds the `## Steering` section, with no newline at its end.
///
/// Implements: rust-plan/steering-prompt
fn section(
    root: &Path,
    folder: &Path,
    id: &str,
    snapshot: &ChangeSnapshot,
    triggers: &[Trigger],
) -> String {
    let mut lines = vec![
        "## Steering".to_owned(),
        String::new(),
        "osq halted this change and asks you to revise its plan.".to_owned(),
    ];
    for trigger in triggers {
        lines.push(String::new());
        lines.extend(trigger_lines(folder, trigger));
    }
    lines.push(String::new());
    lines.push(format!(
        "The change runs in {}; read its code there. Edit only {}.",
        root.display(),
        folder.display()
    ));
    let conflict = triggers.iter().any(Trigger::is_conflict);
    if triggers.iter().any(Trigger::has_default) {
        lines.push(if conflict {
            format!(
                "Approval restarts osq/{} from main, and every task runs again.",
                snapshot.folder
            )
        } else {
            format!(
                "Approval merges main into osq/{} without running verify; add a task that makes the merged tree pass.",
                snapshot.folder
            )
        });
    }
    lines.push(if conflict {
        "Every task runs again after the restart. Revise any task the conflict shows is wrong."
            .to_owned()
    } else {
        format!(
            "Done tasks stay done: {}. Add a task for new work instead of rewriting a done one.",
            done_ids(snapshot)
        )
    });
    lines.push(format!(
        "Run `osq lint {id}` and fix every finding. A human runs `osq approve {id}`, and the run continues from the first task that is not done."
    ));
    lines.join("\n")
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
