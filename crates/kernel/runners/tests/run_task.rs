//! Runner tests: the role's harness, the start request, retries and pauses.

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::time::Duration;

use osq_core::Event;
use osq_core::event::{HarnessRetryData, PausedData, TextData, ToolData, UsageLimitData};
use osq_kernel_runners::{
    Harness, PauseSource, Role, RoleSettings, RunError, RunOutcome, RunnerSettings, TaskRequest,
    UsagePause, run_task,
};

mod support;

use support::{FakeClock, FakeHarness, FakeRecord, StartScript, env_map, exit};

/// The retry delay every retry test configures.
const RETRY_DELAY: Duration = Duration::from_secs(300);

/// The pause wait every usage-limit test configures.
const USAGE_WAIT: Duration = Duration::from_secs(600);

/// The fixed time the usage-limit tests read.
const NOW_MS: i64 = 1_792_584_000_000;

/// Builds one role's settings.
fn role_settings(harness: &str, model: Option<&str>, timeout: Option<Duration>) -> RoleSettings {
    RoleSettings {
        harness: harness.to_owned(),
        model: model.map(str::to_owned),
        timeout,
    }
}

/// Builds the runner settings the role test uses.
fn role_test_settings() -> RunnerSettings {
    RunnerSettings {
        executor: role_settings("pi", Some("deepseek-flash"), Some(Duration::from_secs(60))),
        planner: role_settings("claude", Some("claude-opus-5-5"), None),
        validator: role_settings("claude", None, None),
        agent_env: Vec::new(),
        start_retries: 2,
        retry_delay: RETRY_DELAY,
        usage_limit_wait: USAGE_WAIT,
    }
}

/// Builds settings with two retries and a 300 second delay.
fn retry_settings() -> RunnerSettings {
    RunnerSettings {
        executor: role_settings("pi", None, None),
        planner: role_settings("claude", None, None),
        validator: role_settings("claude", None, None),
        agent_env: Vec::new(),
        start_retries: 2,
        retry_delay: RETRY_DELAY,
        usage_limit_wait: USAGE_WAIT,
    }
}

/// Builds the task the start-request test runs.
fn start_request_task() -> TaskRequest {
    TaskRequest {
        role: Role::Executor,
        task: "1".to_owned(),
        prompt: "Do task 1.".to_owned(),
        cwd: PathBuf::from("/work/project"),
        source_env: env_map(&[("PATH", "/bin"), ("PI_KEY", "k"), ("SECRET_PROBE", "s")]),
        extra_env: env_map(&[("OSQ_TASK_NUMBER", "1")]),
    }
}

/// Builds a task of `role` with the task `1` prompt and working directory.
fn task(role: Role) -> TaskRequest {
    TaskRequest {
        role,
        task: "1".to_owned(),
        prompt: "Do task 1.".to_owned(),
        cwd: PathBuf::from("/work/project"),
        source_env: BTreeMap::new(),
        extra_env: BTreeMap::new(),
    }
}

/// Runs the executor's fake `pi` against a script and returns what happened.
fn run_executor(
    scripts: Vec<StartScript>,
    settings: &RunnerSettings,
) -> (
    Result<RunOutcome, RunError>,
    Vec<Event>,
    FakeClock,
    FakeRecord,
) {
    let pi = FakeHarness::new(scripts, &[]);
    let record = pi.record();
    let mut map: BTreeMap<String, Box<dyn Harness>> = BTreeMap::new();
    map.insert("pi".to_owned(), Box::new(pi));
    let mut clock = FakeClock::new(NOW_MS);
    let mut events = Vec::new();
    let outcome = run_task(
        settings,
        &task(Role::Executor),
        &mut map,
        &mut clock,
        &mut |event| events.push(event),
    );
    let record = record.borrow().clone();
    (outcome, events, clock, record)
}

/// Runs one scripted start that exits as `code`.
fn run_script(events: Vec<Event>, code: i32, timed_out: bool) -> StartScript {
    StartScript::Run {
        events,
        exit: exit(code, timed_out),
    }
}

/// A harness retry start the fake gives.
fn open_retry(error: &str) -> Event {
    Event::HarnessRetry(HarnessRetryData {
        phase: "start".to_owned(),
        attempt: 7,
        max_attempts: None,
        delay_ms: None,
        success: None,
        error: Some(error.to_owned()),
    })
}

/// A successful harness retry end the fake gives.
fn ended_with_success() -> Event {
    Event::HarnessRetry(HarnessRetryData {
        phase: "end".to_owned(),
        attempt: 7,
        max_attempts: None,
        delay_ms: None,
        success: Some(true),
        error: None,
    })
}

/// A harness retry end the fake gives with a failure.
fn ended_with_failure() -> Event {
    Event::HarnessRetry(HarnessRetryData {
        phase: "end".to_owned(),
        attempt: 7,
        max_attempts: None,
        delay_ms: None,
        success: Some(false),
        error: None,
    })
}

/// A usage limit with the row's reset time and error.
fn usage_limit(resets_at: Option<&str>, error: Option<&str>) -> Event {
    Event::UsageLimit(UsageLimitData {
        resets_at: resets_at.map(str::to_owned),
        error: error.map(str::to_owned),
    })
}

/// The runner's retry start event.
fn retry_start(attempt: u64, max_attempts: u64, error: Option<&str>) -> Event {
    Event::HarnessRetry(HarnessRetryData {
        phase: "start".to_owned(),
        attempt,
        max_attempts: Some(max_attempts),
        delay_ms: Some(300_000),
        success: None,
        error: error.map(str::to_owned),
    })
}

/// The runner's retry end event.
fn retry_end(attempt: u64, max_attempts: u64) -> Event {
    Event::HarnessRetry(HarnessRetryData {
        phase: "end".to_owned(),
        attempt,
        max_attempts: Some(max_attempts),
        delay_ms: None,
        success: Some(true),
        error: None,
    })
}

/// The runner's own retry events, separated from the fake's.
fn runner_retries(events: &[Event]) -> Vec<Event> {
    events
        .iter()
        .filter(|event| {
            matches!(event,
                Event::HarnessRetry(data) if data.max_attempts.is_some())
        })
        .cloned()
        .collect()
}

/// The pause event for a task, until, source and error.
fn paused(task: &str, until: &str, source: PauseSource, error: Option<&str>) -> Event {
    Event::Paused(PausedData {
        task: task.to_owned(),
        until: until.to_owned(),
        source: source.as_str().to_owned(),
        error: error.map(str::to_owned),
    })
}

/// Proves each role's row starts its harness with that role's model and timeout.
///
/// Covers: rust-runners/each-role-gets-its-harness-and-model
#[test]
fn each_role_gets_its_harness_and_model() {
    let settings = role_test_settings();
    let rows = [
        (
            Role::Executor,
            "pi",
            Some("deepseek-flash"),
            Some(Duration::from_secs(60)),
        ),
        (Role::Planner, "claude", Some("claude-opus-5-5"), None),
        (Role::Validator, "claude", None, None),
    ];
    for (role, harness, model, timeout) in rows {
        let pi = FakeHarness::new(vec![run_script(Vec::new(), 0, false)], &[]);
        let pi_record = pi.record();
        let claude = FakeHarness::new(vec![run_script(Vec::new(), 0, false)], &[]);
        let claude_record = claude.record();
        let mut map: BTreeMap<String, Box<dyn Harness>> = BTreeMap::new();
        map.insert("pi".to_owned(), Box::new(pi));
        map.insert("claude".to_owned(), Box::new(claude));
        let mut clock = FakeClock::new(NOW_MS);
        let mut events = Vec::new();
        let outcome = run_task(&settings, &task(role), &mut map, &mut clock, &mut |event| {
            events.push(event);
        });
        assert_eq!(outcome, Ok(RunOutcome::Exited(exit(0, false))));
        assert_eq!(events.len(), 0);
        let chosen = if harness == "pi" {
            pi_record.borrow().clone()
        } else {
            claude_record.borrow().clone()
        };
        let other = if harness == "pi" {
            claude_record.borrow().clone()
        } else {
            pi_record.borrow().clone()
        };
        assert_eq!(chosen.requests.len(), 1, "{role:?} starts");
        assert_eq!(other.requests.len(), 0, "{role:?} other harness");
        let request = &chosen.requests[0];
        assert_eq!(request.role, role);
        assert_eq!(request.harness, harness);
        assert_eq!(request.model.as_deref(), model);
        assert_eq!(request.timeout, timeout);
    }
}

/// Proves the start request's environment, prompt, cwd and forwarded events.
///
/// Covers: rust-runners/start-request-and-events
#[test]
fn start_request_and_events() {
    let mut settings = retry_settings();
    settings.agent_env = vec!["AGENT_PROBE".to_owned()];
    let text = Event::Text(TextData {
        text: "working".to_owned(),
    });
    let tool = Event::Tool(ToolData {
        tool: "read".to_owned(),
        summary: "one file".to_owned(),
    });
    let pi = FakeHarness::new(
        vec![run_script(vec![text.clone(), tool.clone()], 3, false)],
        &["PI_KEY"],
    );
    let record = pi.record();
    let mut map: BTreeMap<String, Box<dyn Harness>> = BTreeMap::new();
    map.insert("pi".to_owned(), Box::new(pi));
    let mut clock = FakeClock::new(NOW_MS);
    let mut events = Vec::new();
    let outcome = run_task(
        &settings,
        &start_request_task(),
        &mut map,
        &mut clock,
        &mut |event| events.push(event),
    );
    assert_eq!(outcome, Ok(RunOutcome::Exited(exit(3, false))));
    assert_eq!(events, vec![text, tool]);
    let record = record.borrow();
    assert_eq!(record.requests.len(), 1);
    let request = &record.requests[0];
    assert_eq!(request.prompt, "Do task 1.");
    assert_eq!(request.cwd, PathBuf::from("/work/project"));
    assert_eq!(
        request.env,
        env_map(&[("OSQ_TASK_NUMBER", "1"), ("PATH", "/bin"), ("PI_KEY", "k"),])
    );
}

/// Proves an unconfigured harness is an error that starts and emits nothing.
///
/// Covers: rust-runners/unknown-harness
#[test]
fn unknown_harness() {
    let mut settings = retry_settings();
    settings.validator = role_settings("codex", None, None);
    let pi = FakeHarness::new(vec![run_script(Vec::new(), 0, false)], &[]);
    let pi_record = pi.record();
    let claude = FakeHarness::new(vec![run_script(Vec::new(), 0, false)], &[]);
    let claude_record = claude.record();
    let mut map: BTreeMap<String, Box<dyn Harness>> = BTreeMap::new();
    map.insert("pi".to_owned(), Box::new(pi));
    map.insert("claude".to_owned(), Box::new(claude));
    let mut clock = FakeClock::new(NOW_MS);
    let mut events = Vec::new();
    let outcome = run_task(
        &settings,
        &task(Role::Validator),
        &mut map,
        &mut clock,
        &mut |event| events.push(event),
    );
    let error = RunError::UnknownHarness {
        role: Role::Validator,
        harness: "codex".to_owned(),
    };
    assert_eq!(
        error.to_string(),
        "unknown harness `codex` for role Validator"
    );
    assert_eq!(outcome, Err(error));
    assert_eq!(pi_record.borrow().requests.len(), 0);
    assert_eq!(claude_record.borrow().requests.len(), 0);
    assert_eq!(events.len(), 0);
    assert_eq!(clock.waits().len(), 0);
}

/// Proves a clean first start exits without a retry.
///
/// Covers: rust-runners/failed-starts-are-retried
#[test]
fn clean_start_is_not_retried() {
    let (outcome, events, clock, record) =
        run_executor(vec![run_script(Vec::new(), 0, false)], &retry_settings());
    assert_eq!(outcome, Ok(RunOutcome::Exited(exit(0, false))));
    assert_eq!(record.requests.len(), 1);
    assert_eq!(clock.waits().len(), 0);
    assert_eq!(runner_retries(&events).len(), 0);
}

/// Proves a plain non-zero exit without an open retry is not retried.
///
/// Covers: rust-runners/failed-starts-are-retried
#[test]
fn plain_non_zero_exit_is_not_retried() {
    let (outcome, events, clock, record) =
        run_executor(vec![run_script(Vec::new(), 1, false)], &retry_settings());
    assert_eq!(outcome, Ok(RunOutcome::Exited(exit(1, false))));
    assert_eq!(record.requests.len(), 1);
    assert_eq!(clock.waits().len(), 0);
    assert_eq!(runner_retries(&events).len(), 0);
}

/// Proves an open retry with exit 0 is still not retried.
///
/// Covers: rust-runners/failed-starts-are-retried
#[test]
fn open_retry_with_zero_exit_is_not_retried() {
    let (outcome, events, clock, record) = run_executor(
        vec![run_script(vec![open_retry("503")], 0, false)],
        &retry_settings(),
    );
    assert_eq!(outcome, Ok(RunOutcome::Exited(exit(0, false))));
    assert_eq!(record.requests.len(), 1);
    assert_eq!(clock.waits().len(), 0);
    assert_eq!(runner_retries(&events).len(), 0);
}

/// Proves a retry that ended successfully does not fail a later exit 1.
///
/// Covers: rust-runners/failed-starts-are-retried
#[test]
fn ended_retry_with_exit_one_is_not_retried() {
    let (outcome, events, clock, record) = run_executor(
        vec![run_script(
            vec![open_retry("503"), ended_with_success()],
            1,
            false,
        )],
        &retry_settings(),
    );
    assert_eq!(outcome, Ok(RunOutcome::Exited(exit(1, false))));
    assert_eq!(record.requests.len(), 1);
    assert_eq!(clock.waits().len(), 0);
    assert_eq!(runner_retries(&events).len(), 0);
}

/// Proves a failed retry end alone does not start the provider-outage rule.
///
/// Covers: rust-runners/failed-starts-are-retried
#[test]
fn ended_retry_without_success_is_not_an_open_start() {
    let (outcome, events, clock, record) = run_executor(
        vec![
            run_script(vec![ended_with_failure()], 1, false),
            run_script(Vec::new(), 0, false),
        ],
        &retry_settings(),
    );
    assert_eq!(outcome, Ok(RunOutcome::Exited(exit(1, false))));
    assert_eq!(record.requests.len(), 1);
    assert_eq!(clock.waits().len(), 0);
    assert_eq!(runner_retries(&events).len(), 0);
}

/// Proves a failed retry end leaves the earlier open start an outage.
///
/// Covers: rust-runners/failed-starts-are-retried
#[test]
fn failed_retry_end_keeps_the_open_start() {
    let (outcome, events, clock, record) = run_executor(
        vec![
            run_script(vec![open_retry("503"), ended_with_failure()], 1, false),
            run_script(Vec::new(), 0, false),
        ],
        &retry_settings(),
    );
    assert_eq!(outcome, Ok(RunOutcome::Exited(exit(0, false))));
    assert_eq!(record.requests.len(), 2);
    assert_eq!(clock.waits(), vec![RETRY_DELAY]);
    assert_eq!(
        runner_retries(&events),
        vec![retry_start(1, 2, Some("503")), retry_end(1, 2)]
    );
}

/// Proves a start error is retried once and the retry's success is recorded.
///
/// Covers: rust-runners/failed-starts-are-retried
#[test]
fn start_error_is_retried() {
    let (outcome, events, clock, record) = run_executor(
        vec![
            StartScript::Error("cannot start pi".to_owned()),
            run_script(Vec::new(), 0, false),
        ],
        &retry_settings(),
    );
    assert_eq!(outcome, Ok(RunOutcome::Exited(exit(0, false))));
    assert_eq!(record.requests.len(), 2);
    assert_eq!(clock.waits(), vec![RETRY_DELAY]);
    assert_eq!(
        runner_retries(&events),
        vec![retry_start(1, 2, Some("cannot start pi")), retry_end(1, 2),]
    );
}

/// Proves two open-retry failures are retried before the third start works.
///
/// Covers: rust-runners/failed-starts-are-retried
#[test]
fn open_retries_are_retried() {
    let (outcome, events, clock, record) = run_executor(
        vec![
            run_script(vec![open_retry("503")], 1, false),
            run_script(vec![open_retry("503")], 124, true),
            run_script(Vec::new(), 0, false),
        ],
        &retry_settings(),
    );
    assert_eq!(outcome, Ok(RunOutcome::Exited(exit(0, false))));
    assert_eq!(record.requests.len(), 3);
    assert_eq!(clock.waits(), vec![RETRY_DELAY, RETRY_DELAY]);
    assert_eq!(
        runner_retries(&events),
        vec![
            retry_start(1, 2, Some("503")),
            retry_start(2, 2, Some("503")),
            retry_end(2, 2),
        ]
    );
}

/// Proves the last failure's error when every retry is used up.
///
/// Covers: rust-runners/failed-starts-are-retried
#[test]
fn exhausted_retries_fail_with_the_last_error() {
    let (outcome, events, clock, record) = run_executor(
        vec![
            run_script(vec![open_retry("503")], 1, false),
            run_script(vec![open_retry("503")], 1, false),
            run_script(vec![open_retry("529")], 1, false),
        ],
        &retry_settings(),
    );
    assert_eq!(
        outcome,
        Ok(RunOutcome::StartFailed {
            starts: 3,
            error: Some("529".to_owned()),
        })
    );
    assert_eq!(record.requests.len(), 3);
    assert_eq!(clock.waits(), vec![RETRY_DELAY, RETRY_DELAY]);
    assert_eq!(
        runner_retries(&events),
        vec![
            retry_start(1, 2, Some("503")),
            retry_start(2, 2, Some("503")),
        ]
    );
}

/// Proves a timeout fails a start even when its exit code is 0.
///
/// Covers: rust-runners/failed-starts-are-retried
#[test]
fn open_retry_timed_out_with_zero_exit_is_retried() {
    let (outcome, events, clock, record) = run_executor(
        vec![
            run_script(vec![open_retry("503")], 0, true),
            run_script(Vec::new(), 0, false),
        ],
        &retry_settings(),
    );
    assert_eq!(outcome, Ok(RunOutcome::Exited(exit(0, false))));
    assert_eq!(record.requests.len(), 2);
    assert_eq!(clock.waits(), vec![RETRY_DELAY]);
    assert_eq!(
        runner_retries(&events),
        vec![retry_start(1, 2, Some("503")), retry_end(1, 2),]
    );
}

/// Proves no retries configured fails after one start without an event or wait.
///
/// Covers: rust-runners/no-retries-configured
#[test]
fn no_retries_configured() {
    let mut settings = retry_settings();
    settings.start_retries = 0;
    let (outcome, events, clock, record) = run_executor(
        vec![StartScript::Error("cannot start pi".to_owned())],
        &settings,
    );
    assert_eq!(
        outcome,
        Ok(RunOutcome::StartFailed {
            starts: 1,
            error: Some("cannot start pi".to_owned()),
        })
    );
    assert_eq!(record.requests.len(), 1);
    assert_eq!(clock.waits().len(), 0);
    assert_eq!(runner_retries(&events).len(), 0);
}

/// Proves a future reset time pauses until the harness's time.
///
/// Covers: rust-runners/usage-limits-pause-the-task
#[test]
fn usage_limit_with_reset_time_pauses_on_harness() {
    let fake_events = vec![usage_limit(Some("2026-10-21T13:00:00.000Z"), None)];
    let (outcome, events, clock, record) = run_executor(
        vec![run_script(fake_events.clone(), 1, false)],
        &retry_settings(),
    );
    let pause = UsagePause {
        task: "1".to_owned(),
        until: "2026-10-21T13:00:00.000Z".to_owned(),
        source: PauseSource::Harness,
        error: None,
    };
    assert_eq!(outcome, Ok(RunOutcome::Paused(pause)));
    assert_eq!(record.requests.len(), 1);
    assert_eq!(clock.waits().len(), 0);
    let mut expected = fake_events;
    expected.push(paused(
        "1",
        "2026-10-21T13:00:00.000Z",
        PauseSource::Harness,
        None,
    ));
    assert_eq!(events, expected);
    assert_eq!(runner_retries(&events).len(), 0);
}

/// Proves a limit with an error and no future reset pauses for the wait.
///
/// Covers: rust-runners/usage-limits-pause-the-task
#[test]
fn usage_limit_with_error_pauses_for_the_wait() {
    let fake_events = vec![
        open_retry("503"),
        usage_limit(None, Some("Monthly quota exceeded")),
    ];
    let (outcome, events, clock, record) = run_executor(
        vec![run_script(fake_events.clone(), 1, false)],
        &retry_settings(),
    );
    let pause = UsagePause {
        task: "1".to_owned(),
        until: "2026-10-21T12:10:00.000Z".to_owned(),
        source: PauseSource::Wait,
        error: Some("Monthly quota exceeded".to_owned()),
    };
    assert_eq!(outcome, Ok(RunOutcome::Paused(pause)));
    assert_eq!(record.requests.len(), 1);
    assert_eq!(clock.waits().len(), 0);
    let mut expected = fake_events;
    expected.push(paused(
        "1",
        "2026-10-21T12:10:00.000Z",
        PauseSource::Wait,
        Some("Monthly quota exceeded"),
    ));
    assert_eq!(events, expected);
    assert_eq!(runner_retries(&events).len(), 0);
}

/// Proves a bare limit with exit 0 pauses for the wait.
///
/// Covers: rust-runners/usage-limits-pause-the-task
#[test]
fn bare_usage_limit_pauses_for_the_wait() {
    let fake_events = vec![usage_limit(None, None)];
    let (outcome, events, clock, record) = run_executor(
        vec![run_script(fake_events.clone(), 0, false)],
        &retry_settings(),
    );
    let pause = UsagePause {
        task: "1".to_owned(),
        until: "2026-10-21T12:10:00.000Z".to_owned(),
        source: PauseSource::Wait,
        error: None,
    };
    assert_eq!(outcome, Ok(RunOutcome::Paused(pause)));
    assert_eq!(record.requests.len(), 1);
    assert_eq!(clock.waits().len(), 0);
    let mut expected = fake_events;
    expected.push(paused(
        "1",
        "2026-10-21T12:10:00.000Z",
        PauseSource::Wait,
        None,
    ));
    assert_eq!(events, expected);
    assert_eq!(runner_retries(&events).len(), 0);
}
