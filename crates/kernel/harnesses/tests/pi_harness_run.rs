//! Pi harness tests: a fake pi, its arguments, start errors and agent names.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use osq_core::event::{Event, FileChangedData, TextData, ToolData};
use osq_kernel_harnesses::{PiHarness, PiSettings, pi_args};
use osq_kernel_runners::{Harness, HarnessExit, Role, StartError, StartRequest};

/// The prompt every start gives pi.
const PROMPT: &str = "Do task 1.";

/// The grace every fake start gives the process runner.
const KILL_GRACE: Duration = Duration::from_millis(300);

/// The longest a row may take before the test calls the harness stuck.
const ROW_LIMIT: Duration = Duration::from_secs(5);

/// The agent names the scenario expects, in order.
const AGENT_NAMES: &[&str] = &[
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "ANTHROPIC_OAUTH_TOKEN",
    "OPENAI_API_KEY",
    "AZURE_OPENAI_API_KEY",
    "AZURE_OPENAI_BASE_URL",
    "AZURE_OPENAI_RESOURCE_NAME",
    "AZURE_OPENAI_API_VERSION",
    "AZURE_OPENAI_DEPLOYMENT_NAME_MAP",
    "DEEPSEEK_API_KEY",
    "GEMINI_API_KEY",
    "GROQ_API_KEY",
    "CEREBRAS_API_KEY",
    "XAI_API_KEY",
    "FIREWORKS_API_KEY",
    "TOGETHER_API_KEY",
    "OPENROUTER_API_KEY",
    "AI_GATEWAY_API_KEY",
    "ZAI_API_KEY",
    "MISTRAL_API_KEY",
    "MINIMAX_API_KEY",
    "MOONSHOT_API_KEY",
    "OPENCODE_API_KEY",
    "KIMI_API_KEY",
    "PI_CODING_AGENT_DIR",
];

/// One event a row expects from pi's stream.
#[derive(Clone, Copy)]
enum ExpectedEvent {
    /// A tool event with its tool and summary.
    Tool(&'static str, &'static str),
    /// A file-changed event with its project-relative path.
    FileChanged(&'static str),
    /// A text event with its text.
    Text(&'static str),
}

/// One row of the "Pi tasks with a fake pi" table.
struct Row {
    /// The row's name.
    name: &'static str,
    /// The fake's mode.
    mode: &'static str,
    /// The task timeout, or none.
    timeout: Option<Duration>,
    /// The expected exit code.
    exit_code: i32,
    /// Whether the start times out.
    timed_out: bool,
    /// The events the start gives, in order.
    events: &'static [ExpectedEvent],
    /// The exit's error, or none.
    error: Option<&'static str>,
    /// The least time the start may take, or none.
    least: Option<Duration>,
}

/// The rows of the "Pi tasks with a fake pi" table, in table order.
const ROWS: &[Row] = &[
    Row {
        name: "settle-stops-after-agent-settled",
        mode: "settle",
        timeout: None,
        exit_code: 0,
        timed_out: false,
        events: &[
            ExpectedEvent::Tool("write", "notes.md"),
            ExpectedEvent::FileChanged("notes.md"),
            ExpectedEvent::Text("done"),
        ],
        error: None,
        least: Some(Duration::from_millis(300)),
    },
    Row {
        name: "settle-stubborn-is-killed",
        mode: "settle-stubborn",
        timeout: None,
        exit_code: 0,
        timed_out: false,
        events: &[
            ExpectedEvent::Tool("write", "notes.md"),
            ExpectedEvent::FileChanged("notes.md"),
            ExpectedEvent::Text("done"),
        ],
        error: None,
        least: Some(Duration::from_millis(600)),
    },
    Row {
        name: "missing-key-gives-the-hint",
        mode: "missing-key",
        timeout: None,
        exit_code: 1,
        timed_out: false,
        events: &[],
        error: Some(
            "No API key found for deepseek.\nPi credentials are missing. Run: pi auth check --provider deepseek",
        ),
        least: None,
    },
    Row {
        name: "fail-keeps-stderr",
        mode: "fail",
        timeout: None,
        exit_code: 2,
        timed_out: false,
        events: &[],
        error: Some("boom\n"),
        least: None,
    },
    Row {
        name: "hang-times-out",
        mode: "hang",
        timeout: Some(Duration::from_millis(300)),
        exit_code: 124,
        timed_out: true,
        events: &[],
        error: Some("Task execution timed out"),
        least: Some(Duration::from_millis(300)),
    },
];

/// What one fake start produced.
struct Started {
    /// The folder the fake ran in.
    folder: PathBuf,
    /// The start's result.
    result: Result<HarnessExit, StartError>,
    /// The events the harness gave, in order.
    events: Vec<Event>,
    /// How long the start took.
    elapsed: Duration,
}

/// A counter that keeps each start's temporary folder apart.
static NEXT_FOLDER: AtomicU64 = AtomicU64::new(0);

/// Creates a fresh temporary folder under the crate's target folder.
fn temporary_folder(name: &str) -> PathBuf {
    let number = NEXT_FOLDER.fetch_add(1, Ordering::SeqCst);
    let folder = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("pi_harness_run")
        .join(format!("{name}-{number}"));
    let _ = fs::remove_dir_all(&folder);
    fs::create_dir_all(&folder).expect("the temporary folder is created");
    folder
}

/// The settings every table start uses.
fn settings() -> PiSettings {
    PiSettings {
        provider: Some("deepseek".to_owned()),
        model: Some("m-settings".to_owned()),
        thinking: Some("high".to_owned()),
    }
}

/// Builds one start request with exactly the fake's mode.
fn request(
    folder: &Path,
    mode: &str,
    model: Option<&str>,
    timeout: Option<Duration>,
) -> StartRequest {
    let env = [("FAKE_PI_MODE".to_owned(), mode.to_owned())]
        .into_iter()
        .collect::<BTreeMap<_, _>>();
    StartRequest {
        role: Role::Executor,
        harness: "pi".to_owned(),
        model: model.map(str::to_owned),
        prompt: PROMPT.to_owned(),
        cwd: folder.to_path_buf(),
        env,
        timeout,
    }
}

/// Runs one fake start in a fresh folder with the given settings.
fn start(
    mode: &str,
    model: Option<&str>,
    settings: PiSettings,
    timeout: Option<Duration>,
) -> Started {
    let folder = temporary_folder(mode);
    let bin = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/fake-pi/run.sh");
    let mut harness = PiHarness::new(bin.to_string_lossy().into_owned(), settings, KILL_GRACE);
    let mut events = Vec::new();
    let started = Instant::now();
    let result = harness.start(&request(&folder, mode, model, timeout), &mut |event| {
        events.push(event);
    });
    let elapsed = started.elapsed();
    Started {
        folder,
        result,
        events,
        elapsed,
    }
}

/// Builds the events one row expects.
fn expected_events(events: &[ExpectedEvent]) -> Vec<Event> {
    events
        .iter()
        .map(|event| match event {
            ExpectedEvent::Tool(tool, summary) => Event::Tool(ToolData {
                tool: (*tool).to_owned(),
                summary: (*summary).to_owned(),
            }),
            ExpectedEvent::FileChanged(path) => Event::FileChanged(FileChangedData {
                path: (*path).to_owned(),
            }),
            ExpectedEvent::Text(text) => Event::Text(TextData {
                text: (*text).to_owned(),
            }),
        })
        .collect()
}

/// Checks one row's exit, events, error and timing.
fn assert_row(row: &Row) {
    let started = start(row.mode, Some("m-role"), settings(), row.timeout);
    let exit = match started.result {
        Ok(exit) => exit,
        Err(error) => panic!("row {} failed with {}", row.name, error.message),
    };
    assert_eq!(row.exit_code, exit.exit_code, "row {}", row.name);
    assert_eq!(row.timed_out, exit.timed_out, "row {}", row.name);
    assert_eq!(
        expected_events(row.events),
        started.events,
        "row {}",
        row.name
    );
    assert_eq!(row.error.map(str::to_owned), exit.error, "row {}", row.name);
    assert!(
        started.elapsed < ROW_LIMIT,
        "row {} took {:?}",
        row.name,
        started.elapsed
    );
    if let Some(least) = row.least {
        assert!(
            started.elapsed >= least,
            "row {} returned in {:?}, before {least:?}",
            row.name,
            started.elapsed
        );
    }
}

/// Reads the arguments the fake wrote.
fn written_args(folder: &Path) -> Vec<String> {
    fs::read_to_string(folder.join("args.txt"))
        .expect("the fake wrote its arguments")
        .lines()
        .map(str::to_owned)
        .collect()
}

/// Covers: rust-harnesses/pi-tasks-with-a-fake-pi
#[test]
fn pi_tasks_with_a_fake_pi() {
    for row in ROWS {
        assert_row(row);
    }
}

/// Covers: rust-harnesses/pi-start-arguments-and-defaults
#[test]
fn pi_start_arguments_and_defaults() {
    let role_model = start("settle", Some("m-role"), settings(), None);
    assert_eq!(
        pi_args(
            &PiSettings {
                provider: Some("deepseek".to_owned()),
                model: Some("m-role".to_owned()),
                thinking: Some("high".to_owned()),
            },
            PROMPT
        ),
        written_args(&role_model.folder),
        "row request-model-wins"
    );

    let settings_model = start("settle", None, settings(), None);
    assert_eq!(
        pi_args(&settings(), PROMPT),
        written_args(&settings_model.folder),
        "row settings-model-is-the-fallback"
    );

    let no_provider = start("missing-key", Some("m-role"), PiSettings::default(), None);
    let exit = no_provider
        .result
        .expect("the missing-key start exits without a start error");
    assert_eq!(
        Some(
            "No API key found for deepseek.\nPi credentials are missing. Run: pi auth check --provider default"
                .to_owned()
        ),
        exit.error,
        "row missing-key-without-a-provider"
    );
}

/// Covers: rust-harnesses/pi-harness-that-cannot-start
#[test]
fn pi_harness_that_cannot_start() {
    let folder = temporary_folder("cannot-start");
    let mut harness = PiHarness::new("/nonexistent/pi".to_owned(), settings(), KILL_GRACE);
    let mut events = Vec::new();
    let error = harness
        .start(
            &request(&folder, "settle", Some("m-role"), None),
            &mut |event| events.push(event),
        )
        .expect_err("a missing program cannot start");
    assert!(
        error.message.starts_with("cannot start /nonexistent/pi: "),
        "the start error is {}",
        error.message
    );
    assert!(events.is_empty(), "on_event received {events:?}");
}

/// Covers: rust-harnesses/pi-agent-names
#[test]
fn pi_agent_names() {
    let harness = PiHarness::new("pi".to_owned(), settings(), KILL_GRACE);
    let expected: Vec<String> = AGENT_NAMES.iter().map(|name| (*name).to_owned()).collect();
    assert_eq!(expected, harness.agent_env());
}

/// Covers: rust-harnesses/pi-tasks-with-a-fake-pi
#[test]
fn settled_start_hides_stderr() {
    let started = start("settled-with-stderr", Some("m-role"), settings(), None);
    let exit = started
        .result
        .unwrap_or_else(|error| panic!("the settled start failed with {}", error.message));
    assert_eq!(0, exit.exit_code, "row settled-with-stderr");
    assert!(!exit.timed_out, "row settled-with-stderr timed out");
    assert_eq!(None, exit.error, "row settled-with-stderr");
}
