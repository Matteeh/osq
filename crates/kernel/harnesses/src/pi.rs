//! Pi's headless arguments and the events its `--mode json` stream implies.
//!
//! The adapter decides nothing about when pi runs. It builds the argv for one
//! task and translates each stdout line into the core events TypeScript's
//! `processPiStdoutLine` writes for the same line. ADR 025 keeps the stream
//! shape today's pi writes.

mod args;
mod harness;
mod limit;
mod path;
mod preflight;
mod stream;
mod summary;

use std::collections::BTreeMap;

use osq_core::event::Event;
use osq_kernel_config::PiConfig;

pub use harness::PiHarness;
pub use preflight::{
    PiPreflight, PiPreflightError, PiReady, PiVersionAssessment, PiVersionRange, assess_pi_version,
    preflight_pi, resolve_pi_binary,
};

/// The pi settings a runner chose for one task.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PiSettings {
    /// The provider pi should use, when set.
    pub provider: Option<String>,
    /// The model pi should use, when set.
    pub model: Option<String>,
    /// The thinking level pi should use, when set.
    pub thinking: Option<String>,
}

impl PiSettings {
    /// Builds pi's settings from the config kernel's `[pi]` table.
    ///
    /// Implements: rust-harnesses/pi-harness-from-config
    #[must_use]
    pub fn from_config(pi: &PiConfig) -> Self {
        Self {
            provider: pi.provider.clone(),
            model: pi.model.clone(),
            thinking: pi.thinking.clone(),
        }
    }
}

/// One tool call remembered between pi's start and end lines.
#[derive(Debug, Clone)]
struct ToolCall {
    /// The tool the call named.
    tool: String,
    /// The path argument the call carried, when it had one.
    path: Option<String>,
}

/// What the pi stream remembers between lines.
#[derive(Debug, Clone, Default)]
pub struct PiStreamState {
    /// Tool calls by call id.
    tool_calls: BTreeMap<String, ToolCall>,
    /// Whether an `agent_settled` line was read.
    settled: bool,
}

impl PiStreamState {
    /// Whether pi reported that it settled.
    ///
    /// Implements: rust-harnesses/pi-stream-events
    #[must_use]
    pub fn settled(&self) -> bool {
        self.settled
    }
}

/// Builds pi's arguments for one headless task run.
///
/// Implements: rust-harnesses/pi-arguments
#[must_use]
pub fn pi_args(settings: &PiSettings, prompt: &str) -> Vec<String> {
    args::build(settings, prompt)
}

/// Turns one pi stdout line into the core events TypeScript writes for it.
///
/// Implements: rust-harnesses/pi-stream-events
#[must_use]
pub fn pi_line_events(line: &str, project_root: &str, state: &mut PiStreamState) -> Vec<Event> {
    stream::events(line, project_root, state)
}
