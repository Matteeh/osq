//! The one line each needs-you item prints.

use super::{Entry, Kind};

/// Renders one entry's line.
pub(crate) fn render(entry: &Entry) -> String {
    let head = format!("  {}: {}", entry.id, entry.title);
    match entry.kind {
        Kind::Planning => format!("{head} — unplanned — {}", entry.command),
        Kind::Approval { steps_first: true } => format!(
            "{head} — do the steps before approval first — {}",
            entry.command
        ),
        Kind::Approval { steps_first: false } => format!("{head} — {}", entry.command),
        Kind::ChangeRegressed => match &entry.steering {
            Some(trigger) => format!(
                "{head} — needs steering: {} ({}) — {}",
                trigger.name(),
                trigger.reason,
                entry.command
            ),
            None => format!("{head} — change regressed — {}", entry.command),
        },
        Kind::Task => {
            let row = entry.task.as_ref().map_or_else(
                || head.clone(),
                |task| format!("{head} — task {}: {}", task.number, task.title),
            );
            match &entry.steering {
                Some(trigger) => {
                    let need = entry
                        .need
                        .as_ref()
                        .map_or_else(String::new, |need| format!(": {need}"));
                    format!(
                        "{row} — needs steering: {} ({}){need} — {}",
                        trigger.name(),
                        trigger.reason,
                        entry.command
                    )
                }
                None => format!("{row} — {}", entry.command),
            }
        }
    }
}
