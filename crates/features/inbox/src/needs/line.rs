//! The one line each needs-you item prints.

use super::{Item, Kind};

/// Renders one item's line.
pub(crate) fn render(item: &Item) -> String {
    let head = format!("  {}: {}", item.id, item.title);
    match &item.kind {
        Kind::Planning => format!("{head} — unplanned — {}", item.command),
        Kind::Approval { steps_first: true } => format!(
            "{head} — do the steps before approval first — {}",
            item.command
        ),
        Kind::Approval { steps_first: false } => format!("{head} — {}", item.command),
        Kind::ChangeRegressed => change_regressed(item, &head),
        Kind::TaskDead | Kind::TaskRegressed => task(item, &head),
        Kind::ChangeArchived => {
            format!("{head} — archived, not landed — {}", item.command)
        }
        Kind::AfterLandFailed => {
            format!("{head} — after-land command failed — {}", item.command)
        }
        Kind::ValidatorFailing(facts) => format!(
            "{head} — validator {} {}× in a row: {} — {}",
            facts.outcome, facts.runs, facts.error, item.command
        ),
        Kind::AutopilotStopped(facts) => {
            let detail = facts
                .detail
                .as_ref()
                .map_or_else(String::new, |detail| format!(": {}", squash(detail)));
            format!(
                "{head} — autopilot stopped: {}{detail} — {}",
                facts.reason, item.command
            )
        }
    }
}

/// A change-regressed item's line, with its steering trigger when it has one.
fn change_regressed(item: &Item, head: &str) -> String {
    match &item.steering {
        Some(trigger) => format!(
            "{head} — needs steering: {} ({}) — {}",
            trigger.name(),
            trigger.reason,
            item.command
        ),
        None => format!("{head} — change regressed — {}", item.command),
    }
}

/// A dead or regressed task item's line, with steering and its stated need.
fn task(item: &Item, head: &str) -> String {
    let row = item.task.as_ref().map_or_else(
        || head.to_owned(),
        |task| format!("{head} — task {}: {}", task.number, task.title),
    );
    match &item.steering {
        Some(trigger) => {
            let need = item
                .need
                .as_ref()
                .map_or_else(String::new, |need| format!(": {}", squash(need)));
            format!(
                "{row} — needs steering: {} ({}){need} — {}",
                trigger.name(),
                trigger.reason,
                item.command
            )
        }
        None => format!("{row} — {}", item.command),
    }
}

/// Has every run of whitespace read as one space.
fn squash(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}
