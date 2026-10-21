//! Starting one task on the harness and model its role gives it.
//!
//! The runner owns what every harness shares: the role's settings, the agent
//! environment, start retries and the usage-limit pause.

mod events;
mod failure;
mod pause;

use std::collections::BTreeMap;
use std::fmt;
use std::path::PathBuf;
use std::time::Duration;

use osq_core::Event;

use crate::env::{EnvRole, role_env};
use crate::settings::{Role, RoleSettings, RunnerSettings};
use crate::{Clock, UsagePause};

use failure::judge_start;

/// A harness adapter the runner can start.
pub trait Harness {
    /// The names the harness reads for its model.
    ///
    /// Implements: rust-runners/harness-and-model-per-role
    fn agent_env(&self) -> Vec<String>;

    /// Starts one process and gives each event to `on_event` as it arrives.
    ///
    /// Implements: rust-runners/harness-and-model-per-role
    /// Implements: rust-runners/start-retries
    ///
    /// # Errors
    ///
    /// Returns [`StartError`] when the process cannot be started at all.
    fn start(
        &mut self,
        request: &StartRequest,
        on_event: &mut dyn FnMut(Event),
    ) -> Result<HarnessExit, StartError>;
}

/// One start of one task, as the harness adapter receives it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StartRequest {
    /// The role the task runs as.
    pub role: Role,
    /// The harness name.
    pub harness: String,
    /// The model the harness runs, absent when it chooses one.
    pub model: Option<String>,
    /// The prompt the harness reads.
    pub prompt: String,
    /// The directory the harness runs in.
    pub cwd: PathBuf,
    /// The environment the harness process gets.
    pub env: BTreeMap<String, String>,
    /// The task timeout, absent when the harness has none.
    pub timeout: Option<Duration>,
}

/// One task the caller asks the runner to start.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TaskRequest {
    /// The role the task runs as.
    pub role: Role,
    /// The task number, as it is written.
    pub task: String,
    /// The prompt the harness reads.
    pub prompt: String,
    /// The directory the harness runs in.
    pub cwd: PathBuf,
    /// The environment the caller inherited.
    pub source_env: BTreeMap<String, String>,
    /// The environment the caller sets last.
    pub extra_env: BTreeMap<String, String>,
}

/// How one harness process ended.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HarnessExit {
    /// The process's exit code.
    pub exit_code: i32,
    /// Whether the process hit its timeout.
    pub timed_out: bool,
}

/// Why a harness could not be started at all.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StartError {
    /// The message the harness reported.
    pub message: String,
}

/// What one task's starts ended with.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RunOutcome {
    /// The harness exited; judging it is the caller's work.
    Exited(HarnessExit),
    /// A usage limit paused the task.
    Paused(UsagePause),
    /// Every start failed and the retries ran out.
    StartFailed {
        /// How many starts were made.
        starts: u32,
        /// The last failure's error, absent when it reported none.
        error: Option<String>,
    },
}

/// Why the runner could not start the task.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RunError {
    /// The role's harness is not among the adapters the caller gave.
    UnknownHarness {
        /// The role asking for the harness.
        role: Role,
        /// The harness name that is missing.
        harness: String,
    },
}

impl fmt::Display for RunError {
    /// Writes the error's message.
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnknownHarness { role, harness } => {
                write!(formatter, "unknown harness `{harness}` for role {role:?}")
            }
        }
    }
}

impl std::error::Error for RunError {}

/// Starts one task on the harness and model the role's settings name.
///
/// Every event the harness gives reaches `on_event` as it arrives. A failed
/// start is retried with a `HarnessRetry` event until the settings run out, and
/// a usage limit pauses the task instead of judging the start.
///
/// Implements: rust-runners/harness-and-model-per-role
/// Implements: rust-runners/start-retries
/// Implements: rust-runners/usage-limit-pause
///
/// # Errors
///
/// Returns [`RunError::UnknownHarness`] when the role's harness is not in
/// `harnesses`; no harness is started and no event is given.
pub fn run_task(
    settings: &RunnerSettings,
    request: &TaskRequest,
    harnesses: &mut BTreeMap<String, Box<dyn Harness>>,
    clock: &mut dyn Clock,
    on_event: &mut dyn FnMut(Event),
) -> Result<RunOutcome, RunError> {
    let role_settings = settings.role(request.role);
    let Some(harness) = harnesses.get_mut(&role_settings.harness) else {
        return Err(RunError::UnknownHarness {
            role: request.role,
            harness: role_settings.harness.clone(),
        });
    };
    let start_request = start_request(settings, request, role_settings, harness.as_ref());
    Ok(run_starts(
        settings,
        request,
        harness.as_mut(),
        &start_request,
        clock,
        on_event,
    ))
}

/// Builds the start request for one role from the caller's task.
fn start_request(
    settings: &RunnerSettings,
    request: &TaskRequest,
    role_settings: &RoleSettings,
    harness: &dyn Harness,
) -> StartRequest {
    let env = role_env(
        EnvRole::Agent,
        &request.source_env,
        &settings.agent_env,
        &harness.agent_env(),
        &request.extra_env,
    );
    StartRequest {
        role: request.role,
        harness: role_settings.harness.clone(),
        model: role_settings.model.clone(),
        prompt: request.prompt.clone(),
        cwd: request.cwd.clone(),
        env,
        timeout: role_settings.timeout,
    }
}

/// Starts, retries and pauses until the task has an outcome.
fn run_starts(
    settings: &RunnerSettings,
    request: &TaskRequest,
    harness: &mut dyn Harness,
    start_request: &StartRequest,
    clock: &mut dyn Clock,
    on_event: &mut dyn FnMut(Event),
) -> RunOutcome {
    let mut starts = 0;
    let mut retries = 0;
    loop {
        starts += 1;
        let (end, given) = start_once(harness, start_request, on_event);
        if let Some((usage_pause, event)) = pause::usage_pause(
            &request.task,
            &given,
            clock.now_ms(),
            settings.usage_limit_wait,
        ) {
            on_event(event);
            return RunOutcome::Paused(usage_pause);
        }
        match judge_start(&end, &given) {
            Ok(exit) => {
                if retries > 0 {
                    on_event(events::retry_end(retries, settings.start_retries));
                }
                return RunOutcome::Exited(exit);
            }
            Err(failure) if retries < settings.start_retries => {
                retries += 1;
                on_event(events::retry_start(
                    retries,
                    settings.start_retries,
                    settings.retry_delay,
                    failure.error,
                ));
                clock.wait(settings.retry_delay);
            }
            Err(failure) => {
                return RunOutcome::StartFailed {
                    starts,
                    error: failure.error,
                };
            }
        }
    }
}

/// Runs one start and keeps its events to judge it while forwarding each one.
fn start_once(
    harness: &mut dyn Harness,
    request: &StartRequest,
    on_event: &mut dyn FnMut(Event),
) -> (Result<HarnessExit, StartError>, Vec<Event>) {
    let mut given = Vec::new();
    let end = harness.start(request, &mut |event| {
        given.push(event.clone());
        on_event(event);
    });
    (end, given)
}
