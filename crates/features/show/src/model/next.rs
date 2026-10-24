//! The next-step values a change prints.

use std::fmt::Write as _;

/// One state, its optional detail and its optional command.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct NextStep {
    /// The state word TypeScript prints, with hyphens.
    state: &'static str,
    /// The parenthesised detail, when there is one.
    detail: Option<String>,
    /// The command after an em dash, when there is one.
    command: Option<String>,
}

impl NextStep {
    /// The next step of a change that is not planned yet.
    pub(crate) fn unplanned(id: &str, brief: bool) -> Self {
        let command = if brief {
            format!("osq plan {id}")
        } else {
            format!("osq lint {id}")
        };
        Self::new("unplanned", None, Some(command))
    }

    /// The next step of a change whose plan is ready for approval.
    pub(crate) fn ready_for_approval(id: &str, before_approval: bool) -> Self {
        let detail = before_approval.then(|| "do the steps before approval first".to_owned());
        Self::new(
            "ready-for-approval",
            detail,
            Some(format!("osq approve {id}")),
        )
    }

    /// The next step of a change that needs steering.
    pub(crate) fn dead_steering(id: &str) -> Self {
        Self::new(
            "dead",
            Some("needs steering".to_owned()),
            Some(format!("osq plan {id}")),
        )
    }

    /// The next step of a change with a dead or regressed task or change.
    pub(crate) fn dead_retry(id: &str, task: Option<&str>) -> Self {
        let target = task.unwrap_or("change");
        Self::new("dead", None, Some(format!("osq retry {id} {target}")))
    }

    /// The next step of a change waiting for an unmet dependency.
    pub(crate) fn blocked(unmet: &[String]) -> Self {
        let first = unmet.first().map_or("", String::as_str);
        Self::new(
            "blocked",
            Some(format!("waiting for {}", unmet.join(", "))),
            Some(format!("osq show {first}")),
        )
    }

    /// The next step of a change that runs now.
    pub(crate) fn running(id: &str) -> Self {
        Self::new("running", None, Some(format!("osq show {id}")))
    }

    /// The next step of a landed, archived change.
    pub(crate) fn landed() -> Self {
        Self::new("landed", None, None)
    }

    /// The next step of an archived change the default branch lacks.
    pub(crate) fn archived_not_landed(id: &str) -> Self {
        Self::new(
            "archived",
            Some("not landed".to_owned()),
            Some(format!("osq land {id}")),
        )
    }

    /// Builds a next step from its state, detail and command.
    fn new(state: &'static str, detail: Option<String>, command: Option<String>) -> Self {
        Self {
            state,
            detail,
            command,
        }
    }

    /// The state word, with hyphens.
    /// Implements: rust-show/show-json
    pub(crate) fn state(&self) -> &'static str {
        self.state
    }

    /// The detail text, when there is one.
    /// Implements: rust-show/show-json
    pub(crate) fn detail(&self) -> Option<&str> {
        self.detail.as_deref()
    }

    /// The command, when there is one.
    /// Implements: rust-show/show-json
    pub(crate) fn command(&self) -> Option<&str> {
        self.command.as_deref()
    }

    /// The line TypeScript prints after `Next: `.
    pub(crate) fn line(&self) -> String {
        let mut text = self.state.replace('-', " ");
        if let Some(detail) = &self.detail {
            let _ = write!(text, " ({detail})");
        }
        if let Some(command) = &self.command {
            let _ = write!(text, " — {command}");
        }
        text
    }
}
