//! The inbox feature: lists what needs a human.
//!
//! A feature crate depends only on kernel crates and core, never on another feature (ADR 022).

mod groups;
mod needs;
mod read;
mod text;

use std::time::{SystemTime, UNIX_EPOCH};

use osq_core::{Command, Feature, FeatureError, Invocation, Output};

/// The inbox command: lists what needs a human.
///
/// Implements: rust-inbox/inbox-command
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct InboxFeature {
    /// The fixed clock, or `None` to read the system clock at each run.
    now_ms: Option<i64>,
}

impl InboxFeature {
    /// The inbox feature, reading the system clock at each run.
    ///
    /// Implements: rust-inbox/inbox-command
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// The inbox feature with a fixed clock, `now_ms` in epoch milliseconds.
    ///
    /// Implements: rust-inbox/inbox-command
    #[must_use]
    pub fn at(now_ms: i64) -> Self {
        Self {
            now_ms: Some(now_ms),
        }
    }
}

impl Feature for InboxFeature {
    /// The feature's name.
    ///
    /// Implements: rust-inbox/inbox-command
    fn name(&self) -> &'static str {
        "inbox"
    }

    /// The single `inbox` command.
    ///
    /// Implements: rust-inbox/inbox-command
    fn commands(&self) -> Vec<Command> {
        vec![Command::new(
            "inbox",
            "List the changes that need you, what runs, and what landed",
            "",
        )]
    }

    /// Prints the three inbox groups of the project root.
    ///
    /// # Errors
    ///
    /// Returns [`FeatureError::unknown_command`] for another command,
    /// [`FeatureError::usage`] for any argument, and [`FeatureError::failed`]
    /// when a change folder cannot be read.
    ///
    /// Implements: rust-inbox/inbox-command
    /// Implements: rust-inbox/needs-you-items
    /// Implements: rust-inbox/running-items
    /// Implements: rust-inbox/landed-items
    /// Implements: rust-inbox/validator-failing-item
    /// Implements: rust-inbox/typescript-inbox-parity
    fn run(&self, invocation: &Invocation) -> Result<Output, FeatureError> {
        if invocation.command != "inbox" {
            return Err(FeatureError::unknown_command(invocation.command.as_str()));
        }
        if !invocation.args.is_empty() {
            return Err(FeatureError::usage("inbox", "takes no arguments"));
        }
        let snapshots = read::changes(&invocation.root)?;
        let now_ms = self.now_ms.unwrap_or_else(system_now_ms);
        let mut items = needs::needs_you(&snapshots);
        if let Some(item) = groups::validator::item(&snapshots) {
            items.push(item);
        }
        let needs_you: Vec<String> = needs::sort(items)
            .into_iter()
            .map(|item| item.line)
            .collect();
        let running = groups::running::lines(&snapshots, now_ms);
        let landed = groups::landed::lines(&snapshots);
        Ok(Output::text(format!(
            "{}\n",
            text::inbox_text(&needs_you, &running, &landed)
        )))
    }
}

/// The system clock in epoch milliseconds.
fn system_now_ms() -> i64 {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    i64::try_from(millis).unwrap_or_default()
}
