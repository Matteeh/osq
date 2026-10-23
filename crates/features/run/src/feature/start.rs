//! Starting pi once for a task and appending the start's events.

use std::collections::BTreeMap;
use std::time::Duration;

use osq_core::FeatureError;
use osq_core::event::{Event, ExitedData, StartedData};
use osq_kernel_config::Config;
use osq_kernel_harnesses::PiHarness;
use osq_kernel_runners::{
    Harness, Role, RoleSettings, RunOutcome, RunnerSettings, SystemClock, TaskRequest, run_task,
};

use super::{events, pause, text, time};

/// The harness every Rust run starts for now.
const HARNESS: &str = "pi";

/// TypeScript's default `gates.usageLimitWaitSeconds`.
const USAGE_LIMIT_WAIT: Duration = Duration::from_secs(1800);

/// Everything one executor start needs.
pub(crate) struct Start<'a> {
    /// The root of the tree the change lives in.
    pub(crate) root: &'a std::path::Path,
    /// The change folder.
    pub(crate) folder: &'a std::path::Path,
    /// The change folder's name.
    pub(crate) name: &'a str,
    /// The task number.
    pub(crate) task: &'a str,
    /// The config with the executor and the limits.
    pub(crate) config: &'a Config,
    /// Whether the change lives in a worktree rather than the checkout.
    pub(crate) commits: bool,
    /// The attempt number the started event records.
    pub(crate) attempt: u64,
    /// The executor's prompt.
    pub(crate) prompt: &'a str,
}

/// What one executor start ended with.
pub(crate) struct Started {
    /// The epoch milliseconds just before the start.
    pub(crate) started_ms: i64,
    /// The process's exit, absent when the harness never started.
    pub(crate) exit: Option<Exit>,
}

/// One harness process's ending.
pub(crate) struct Exit {
    /// The process's exit code.
    pub(crate) code: i32,
    /// Whether the process hit its timeout.
    pub(crate) timed_out: bool,
}

/// Starts pi once as the executor, appending its events to the task's stream.
///
/// Implements: rust-run/executor-start
///
/// # Errors
///
/// Returns a `Failed` error when an event cannot be written, when the runner
/// cannot find pi, and on a usage limit, which fails the run without a marker.
pub(crate) fn run(start: &Start<'_>) -> Result<Started, FeatureError> {
    let source_env: BTreeMap<String, String> = std::env::vars().collect();
    let settings = runner_settings(start.config);
    let request = TaskRequest {
        role: Role::Executor,
        task: start.task.to_owned(),
        prompt: start.prompt.to_owned(),
        cwd: start.root.to_path_buf(),
        source_env: source_env.clone(),
        extra_env: BTreeMap::new(),
    };
    let mut harnesses: BTreeMap<String, Box<dyn Harness>> = BTreeMap::new();
    harnesses.insert(
        HARNESS.to_owned(),
        Box::new(PiHarness::from_config(start.config, &source_env)),
    );
    let started_ms = time::now_ms();
    events::append(
        start.folder,
        &format!("{}.jsonl", start.task),
        Event::Started(started_data(start.config, start.attempt)),
    )?;
    let mut gathered = Vec::new();
    let outcome = run_task(
        &settings,
        &request,
        &mut harnesses,
        &mut SystemClock,
        &mut |event| gathered.push(event),
    );
    for event in gathered {
        events::append(start.folder, &format!("{}.jsonl", start.task), event)?;
    }
    match outcome {
        Ok(RunOutcome::Exited(exit)) => {
            events::append(
                start.folder,
                &format!("{}.jsonl", start.task),
                Event::Exited(ExitedData {
                    exit_code: i64::from(exit.exit_code),
                    pid: None,
                    signal: None,
                    timed_out: Some(exit.timed_out),
                    elapsed_seconds: None,
                }),
            )?;
            Ok(Started {
                started_ms,
                exit: Some(Exit {
                    code: exit.exit_code,
                    timed_out: exit.timed_out,
                }),
            })
        }
        Ok(RunOutcome::StartFailed { .. }) => Ok(Started {
            started_ms,
            exit: None,
        }),
        Ok(RunOutcome::Paused(paused)) => {
            pause::write(start.folder, &paused)?;
            if start.commits {
                pause::discard_worktree(start.root, start.folder, start.config)?;
            }
            Err(failed(text::usage_limit(start.task, start.name)))
        }
        Err(error) => Err(failed(error.to_string())),
    }
}

/// Appends the `exit_continued` event for a result written during the start.
///
/// # Errors
///
/// Returns the write error `events::append` gives.
///
/// Implements: rust-run/executor-start
pub(crate) fn exit_continued(
    folder: &std::path::Path,
    task: &str,
    code: i32,
) -> Result<(), FeatureError> {
    events::append(
        folder,
        &format!("{task}.jsonl"),
        Event::ExitContinued(osq_core::event::ExitContinuedData {
            exit_code: i64::from(code),
        }),
    )
}

/// Builds the runner settings from the config, with no retries and no delays.
fn runner_settings(config: &Config) -> RunnerSettings {
    let role = RoleSettings {
        harness: HARNESS.to_owned(),
        model: config.executor.model.clone(),
        timeout: Some(config.timeouts.task_timeout),
    };
    RunnerSettings {
        executor: role.clone(),
        planner: role.clone(),
        validator: role,
        agent_env: Vec::new(),
        start_retries: 0,
        retry_delay: Duration::ZERO,
        usage_limit_wait: USAGE_LIMIT_WAIT,
    }
}

/// Builds the `started` event the executor start writes for `attempt`.
fn started_data(config: &Config, attempt: u64) -> StartedData {
    StartedData {
        harness: Some(HARNESS.to_owned()),
        model: config.executor.model.clone(),
        osq_version: Some(env!("CARGO_PKG_VERSION").to_owned()),
        attempt: Some(attempt),
        project_commit: None,
        commit: None,
        pid: None,
        timeout_seconds: Some(config.timeouts.task_timeout.as_secs()),
        version: None,
        harness_version: None,
        harness_auth: None,
        task_title: None,
        tier: None,
        scope: None,
        entry: None,
        skills: None,
    }
}

/// Builds the failed error for a start step.
fn failed(message: String) -> FeatureError {
    FeatureError::failed("run", message)
}
