//! The inbox feature: lists what needs a human.
//!
//! A feature crate depends only on kernel crates and core, never on another feature (ADR 022).

mod cursor;
mod groups;
mod json;
mod needs;
mod read;
mod text;

use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use osq_core::{Command, Feature, FeatureError, Invocation, Output};
use osq_kernel_storage::{read_after_land_failure, read_autopilot_stop, read_queue_titles};

/// The inbox command: lists what needs a human.
///
/// Implements: rust-inbox/inbox-command
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct InboxFeature {
    /// The fixed clock, or `None` to read the system clock at each run.
    now_ms: Option<i64>,
    /// The home folder, or `None` to read `HOME` at each run.
    home: Option<PathBuf>,
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
            home: None,
        }
    }

    /// The same feature with `home` as its home folder.
    ///
    /// Implements: rust-inbox/inbox-command
    #[must_use]
    pub fn with_home(self, home: impl Into<PathBuf>) -> Self {
        Self {
            now_ms: self.now_ms,
            home: Some(home.into()),
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
            "[--json]",
        )]
    }

    /// Prints the three inbox groups of the project root and every tree.
    ///
    /// # Errors
    ///
    /// Returns [`FeatureError::unknown_command`] for another command,
    /// [`FeatureError::usage`] for any argument other than `--json`, and
    /// [`FeatureError::failed`] when the config, git, a change folder or the
    /// cursor cannot be read or written.
    ///
    /// Implements: rust-inbox/inbox-command
    /// Implements: rust-inbox/last-look-cursor
    /// Implements: rust-inbox/inbox-json
    /// Implements: rust-inbox/inbox-trees
    /// Implements: rust-inbox/archived-items
    /// Implements: rust-inbox/needs-you-items
    /// Implements: rust-inbox/running-items
    /// Implements: rust-inbox/landed-items
    /// Implements: rust-inbox/validator-failing-item
    /// Implements: rust-inbox/paused-items
    /// Implements: rust-inbox/after-land-failed-item
    /// Implements: rust-inbox/autopilot-stopped-item
    /// Implements: rust-inbox/needs-you-order
    /// Implements: rust-inbox/typescript-inbox-parity
    fn run(&self, invocation: &Invocation) -> Result<Output, FeatureError> {
        if invocation.command != "inbox" {
            return Err(FeatureError::unknown_command(invocation.command.as_str()));
        }
        let json = json_requested(&invocation.args)?;
        let now_ms = self.now_ms.unwrap_or_else(system_now_ms);
        let home = self
            .home
            .clone()
            .or_else(|| std::env::var_os("HOME").map(PathBuf::from));
        let changes = read::changes(&invocation.root)?;
        let last_look = home
            .as_deref()
            .and_then(|home| cursor::read(&invocation.root, home));
        let after_land = home
            .as_deref()
            .and_then(|home| read_after_land_failure(&invocation.root, home));
        let stop = read_autopilot_stop(&invocation.root);
        let queue = read_queue_titles(&invocation.root);
        let mut items = needs::needs_you(&changes.all);
        items.extend(needs::archived(&changes.archived));
        if let Some(failure) = after_land.as_ref() {
            items.push(needs::after_land(&changes.root, failure));
        }
        if let Some(item) = groups::validator::item(&changes.all) {
            items.push(item);
        }
        if let Some(stop) = stop.as_ref() {
            items.push(needs::autopilot_stopped(&changes.all, &queue, stop));
        }
        let needs_you = needs::sort(items);
        let running = groups::running::items(&changes.all, &changes.pauses, now_ms);
        let landed = groups::landed::items(&changes.root, last_look);
        if let Some(home) = home.as_deref() {
            cursor::write(&invocation.root, home, now_ms)
                .map_err(|error| FeatureError::failed("inbox", error.to_string()))?;
        }
        Ok(Output::text(format!(
            "{}\n",
            render(json, &needs_you, &running, &landed)
        )))
    }
}

/// Whether the arguments ask for JSON, refusing any other argument.
///
/// Implements: rust-inbox/inbox-command
fn json_requested(args: &[String]) -> Result<bool, FeatureError> {
    let mut json = false;
    for arg in args {
        if arg == "--json" {
            json = true;
        } else {
            return Err(FeatureError::usage("inbox", "takes no arguments"));
        }
    }
    Ok(json)
}

/// The requested view of the three groups.
fn render(
    json: bool,
    needs_you: &[needs::Item],
    running: &[groups::running::Item],
    landed: &[groups::landed::Item],
) -> String {
    if json {
        return json::inbox(needs_you, running, landed);
    }
    let needs: Vec<String> = needs_you.iter().map(needs::Item::line).collect();
    let running: Vec<String> = running.iter().map(groups::running::Item::line).collect();
    let landed: Vec<String> = landed.iter().map(groups::landed::Item::line).collect();
    text::inbox_text(&needs, &running, &landed)
}

/// The system clock in epoch milliseconds.
fn system_now_ms() -> i64 {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    i64::try_from(millis).unwrap_or_default()
}
