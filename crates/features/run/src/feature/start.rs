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

use super::{events, text, time};

/// The harness every Rust run starts for now.
const HARNESS: &str = "pi";

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
pub(crate) fn run(
    root: &std::path::Path,
    folder: &std::path::Path,
    name: &str,
    task: &str,
    config: &Config,
    attempt: u64,
    prompt: &str,
) -> Result<Started, FeatureError> {
    let source_env: BTreeMap<String, String> = std::env::vars().collect();
    let settings = runner_settings(config);
    let request = TaskRequest {
        role: Role::Executor,
        task: task.to_owned(),
        prompt: prompt.to_owned(),
        cwd: root.to_path_buf(),
        source_env: source_env.clone(),
        extra_env: BTreeMap::new(),
    };
    let mut harnesses: BTreeMap<String, Box<dyn Harness>> = BTreeMap::new();
    harnesses.insert(
        HARNESS.to_owned(),
        Box::new(PiHarness::from_config(config, &source_env)),
    );
    let started_ms = time::now_ms();
    events::append(
        folder,
        &format!("{task}.jsonl"),
        Event::Started(started_data(config, attempt)),
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
        events::append(folder, &format!("{task}.jsonl"), event)?;
    }
    match outcome {
        Ok(RunOutcome::Exited(exit)) => {
            events::append(
                folder,
                &format!("{task}.jsonl"),
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
        Ok(RunOutcome::Paused(_)) => Err(failed(text::usage_limit(task, name))),
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
        usage_limit_wait: Duration::ZERO,
    }
}

/// Builds the `started` event the executor start writes for `attempt`.
fn started_data(config: &Config, attempt: u64) -> StartedData {
    StartedData {
        harness: Some(HARNESS.to_owned()),
        model: config.executor.model.clone(),
        osq_version: None,
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
