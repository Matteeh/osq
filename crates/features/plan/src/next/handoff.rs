//! The handoff text `plan --next` prints after writing a change folder.

use std::fmt::Write as _;
use std::path::Path;

/// Formats the handoff, adding the Claude Code line when its command is a file.
///
/// Implements: rust-plan/plan-handoff
pub(super) fn format(root: &Path, folder: &str, id: &str, slash_command: bool) -> String {
    let path = root.join("openspec").join("changes").join(folder);
    let prompt = path.join("plan-prompt.md");
    let mut text = format!(
        "{}: ask your planning tool to plan change {folder} \u{2014} next: unplanned \u{2014} osq plan {id}\n\nPaste this into a new agent session to plan it:\n\nYou are the planner for osq change {folder}.\nRead {} and follow it exactly; it is your complete prompt.\n",
        path.display(),
        prompt.display()
    );
    if slash_command {
        let _ = write!(text, "\nIn Claude Code, /osq-plan {id} does the same.\n");
    }
    text
}
