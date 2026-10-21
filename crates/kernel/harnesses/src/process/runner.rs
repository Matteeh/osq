//! Starting a program and orchestrating its readers and deadlines.

use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use std::sync::mpsc::{Receiver, RecvTimeoutError, channel};
use std::time::Instant;

use super::readers::{Message, spawn_stderr_reader, spawn_stdout_reader, spawn_waiter};
use super::state::RunState;
use super::{ProcessError, ProcessOutcome, ProcessSpec};

/// Runs one program with its declared environment and forwards its stdout lines.
///
/// Each non-blank stdout line is passed to `on_line` on the calling thread as it
/// arrives. stderr is collected whole. A timeout stops the program with
/// `SIGTERM`, then kills it with `SIGKILL` after `spec.kill_grace`.
///
/// # Errors
///
/// Returns [`ProcessError::Spawn`] when the program cannot be started.
///
/// # Panics
///
/// Panics when the child has no stdout or stderr pipe, which cannot happen
/// because the runner pipes both.
///
/// Implements: rust-harnesses/process-runner
/// Implements: rust-harnesses/process-stop-after-a-line
pub fn run_process(
    spec: &ProcessSpec,
    on_line: &mut dyn FnMut(&str),
) -> Result<ProcessOutcome, ProcessError> {
    run_process_until(spec, &mut |line| {
        on_line(line);
        false
    })
}

/// Runs one program and stops it after the first line `on_line` accepts.
///
/// Behaves as [`run_process`], except that the first `true` from `on_line`
/// asks the program to stop with `SIGTERM` after `spec.kill_grace`, then kills
/// it with `SIGKILL` after another `spec.kill_grace`. A stop is not a timeout;
/// a timeout still ends the run as [`run_process`] says.
///
/// # Errors
///
/// Returns [`ProcessError::Spawn`] when the program cannot be started.
///
/// # Panics
///
/// Panics when the child has no stdout or stderr pipe, which cannot happen
/// because the runner pipes both.
///
/// Implements: rust-harnesses/process-stop-after-a-line
pub fn run_process_until(
    spec: &ProcessSpec,
    on_line: &mut dyn FnMut(&str) -> bool,
) -> Result<ProcessOutcome, ProcessError> {
    let mut child = spawn(spec)?;
    let pid = child.id();
    let exited = Arc::new(AtomicBool::new(false));
    let (sender, receiver) = channel();
    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();
    spawn_stdout_reader(stdout, sender.clone());
    spawn_stderr_reader(stderr, sender.clone());
    spawn_waiter(child, sender, Arc::clone(&exited));
    let mut state = RunState::new(spec.timeout, spec.kill_grace);
    receive(&receiver, &mut state, on_line, pid, &exited);
    Ok(ProcessOutcome {
        exit_code: state.exit_code(),
        timed_out: state.timed_out(),
        stderr: state.stderr(),
    })
}

/// Starts the program with only the declared environment and piped output.
fn spawn(spec: &ProcessSpec) -> Result<Child, ProcessError> {
    Command::new(&spec.program)
        .args(&spec.args)
        .current_dir(&spec.cwd)
        .env_clear()
        .envs(&spec.env)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| ProcessError::Spawn {
            program: spec.program.clone(),
            message: error.to_string(),
        })
}

/// Receives lines and the exit on one channel until every deadline has passed.
fn receive(
    receiver: &Receiver<Message>,
    state: &mut RunState,
    on_line: &mut dyn FnMut(&str) -> bool,
    pid: u32,
    exited: &Arc<AtomicBool>,
) {
    while !state.finished() {
        match state.deadline() {
            Some(deadline) => {
                let wait = deadline.saturating_duration_since(Instant::now());
                match receiver.recv_timeout(wait) {
                    Ok(message) => state.apply(message, on_line),
                    Err(RecvTimeoutError::Timeout) => state.fire_due(pid, exited),
                    Err(RecvTimeoutError::Disconnected) => break,
                }
            }
            None => match receiver.recv() {
                Ok(message) => state.apply(message, on_line),
                Err(_) => break,
            },
        }
    }
}

/// Asks one process to stop or die through the system `kill` utility.
pub(super) fn signal(pid: u32, name: &str) {
    let _ = Command::new("kill")
        .arg(format!("-{name}"))
        .arg(pid.to_string())
        .status();
}
