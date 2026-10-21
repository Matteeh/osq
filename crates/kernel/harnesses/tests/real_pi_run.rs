//! Real pi integration test, ignored unless `OSQ_PI_INTEGRATION=1`.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use osq_core::event::Event;
use osq_kernel_harnesses::{PiHarness, PiSettings, resolve_pi_binary};
use osq_kernel_runners::{EnvRole, Harness, Role, StartRequest, role_env};

/// A counter that keeps the test's temporary folder unique.
static NEXT_FOLDER: AtomicU64 = AtomicU64::new(0);

/// Creates a fresh temporary folder under the crate's target folder.
fn temporary_folder() -> PathBuf {
    let number = NEXT_FOLDER.fetch_add(1, Ordering::SeqCst);
    let folder = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("real_pi_run")
        .join(format!("run-{number}"));
    let _ = fs::remove_dir_all(&folder);
    fs::create_dir_all(&folder).expect("the temporary folder is created");
    folder
}

/// Covers: rust-harnesses/real-pi-run
#[test]
#[ignore = "integration test: runs real pi with a model key"]
fn real_pi_run() {
    if std::env::var("OSQ_PI_INTEGRATION").as_deref() != Ok("1") {
        return;
    }
    let source_env = std::env::vars().collect::<BTreeMap<_, _>>();
    let bin = resolve_pi_binary(None, &source_env);
    let settings = PiSettings {
        provider: std::env::var("OSQ_PI_PROVIDER").ok(),
        ..PiSettings::default()
    };
    let mut harness = PiHarness::new(bin, settings, Duration::from_secs(5));
    let env = role_env(
        EnvRole::Agent,
        &source_env,
        &[],
        &harness.agent_env(),
        &BTreeMap::new(),
    );
    let folder = temporary_folder();
    let request = StartRequest {
        role: Role::Executor,
        harness: "pi".to_owned(),
        model: None,
        prompt: "Reply with the word done and nothing else.".to_owned(),
        cwd: folder,
        env,
        timeout: Some(Duration::from_secs(300)),
    };
    let mut events = Vec::new();
    let exit = harness
        .start(&request, &mut |event| events.push(event))
        .unwrap_or_else(|error| panic!("real pi failed to start: {}", error.message));
    assert_eq!(0, exit.exit_code, "real pi exited with {}", exit.exit_code);
    assert!(
        events.iter().any(|event| matches!(event, Event::Text(_))),
        "real pi gave no text event: {events:?}"
    );
}
