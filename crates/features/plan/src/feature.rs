//! The plan feature's `Feature` implementation.

use std::time::{SystemTime, UNIX_EPOCH};

use osq_core::{Command, Feature, FeatureError, Invocation, Output};

use crate::arguments::{Arguments, parse};
use crate::{new, next, queue, steer};

/// The plan feature.
///
/// Implements: rust-plan/plan-feature
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct PlanFeature {
    /// The fixed clock, or `None` to read the system clock at each run.
    now_ms: Option<i64>,
}

impl PlanFeature {
    /// The plan feature, reading the system clock at each run.
    ///
    /// Implements: rust-plan/plan-feature
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// The plan feature with a fixed clock, `now_ms` in epoch milliseconds.
    ///
    /// Implements: rust-plan/plan-feature
    #[must_use]
    pub fn at(now_ms: i64) -> Self {
        Self {
            now_ms: Some(now_ms),
        }
    }
}

impl Feature for PlanFeature {
    /// The feature's name, `plan`.
    ///
    /// Implements: rust-plan/plan-feature
    fn name(&self) -> &'static str {
        "plan"
    }

    /// The feature's commands, `queue` and `plan`.
    ///
    /// Implements: rust-plan/plan-feature
    fn commands(&self) -> Vec<Command> {
        vec![
            Command::new("queue", "print the read-only brief queue projection", ""),
            Command::new(
                "plan",
                "prepare a change and hand off its opening prompt to your planning tool",
                "--next [--replan] [--print] | <id> [--print] | <name> --brief <file> [--print]",
            ),
        ]
    }

    /// Runs `queue` or `plan`, refusing an unknown command or arguments.
    ///
    /// Implements: rust-plan/plan-feature
    /// Implements: rust-plan/queue-arguments
    /// Implements: rust-plan/plan-arguments
    /// Implements: rust-plan/steering-lookup
    /// Implements: rust-plan/steering-prompt
    /// Implements: rust-plan/steering-handoff
    fn run(&self, invocation: &Invocation) -> Result<Output, FeatureError> {
        if invocation.command != "queue" && invocation.command != "plan" {
            return Err(FeatureError::unknown_command(invocation.command.as_str()));
        }
        if invocation.command == "queue" {
            if !invocation.args.is_empty() {
                return Err(FeatureError::usage(
                    "queue",
                    format!("expected no arguments, got {}", invocation.args.len()),
                ));
            }
            return queue::run_queue(&invocation.root).map(Output::text);
        }
        let now_ms = self.now_ms.unwrap_or_else(system_now_ms);
        match parse(&invocation.args)? {
            Arguments::Next { replan, print } => {
                next::run_next(&invocation.root, now_ms, replan, print).map(Output::text)
            }
            Arguments::Steer { name, brief, print } => match brief {
                Some(brief) => {
                    new::run_new(&invocation.root, &name, &brief, now_ms, print).map(Output::text)
                }
                None => steer::run_steer(&invocation.root, &name, print).map(Output::text),
            },
        }
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
