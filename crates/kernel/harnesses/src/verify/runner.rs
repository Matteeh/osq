//! Starting one verify command, reading its pipes and enforcing its timeout.

use std::collections::BTreeMap;
use std::io::Read;
use std::os::unix::process::CommandExt;
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{Receiver, RecvTimeoutError, Sender, channel};
use std::thread;
use std::time::{Duration, Instant};

use super::VerifyRequest;
use crate::ProcessError;

/// The shell every verify command runs through.
const SHELL: &str = "/bin/sh";

/// The most bytes one pipe read may return.
const CHUNK: usize = 8192;

/// Everything one started command reported.
pub(super) struct CommandRun {
    /// The shell's exit status, when the runner reaped it.
    pub(super) status: Option<ExitStatus>,
    /// Whether the runner stopped the command after its timeout.
    pub(super) timed_out: bool,
    /// stdout and stderr in the order the runner read them.
    pub(super) output: String,
}

/// One message from a helper thread to the collecting thread.
enum Message {
    /// A decoded chunk from one of the command's pipes.
    Output(String),
    /// One pipe reached end of file.
    Closed(Stream),
    /// The shell's exit status.
    Exited(ExitStatus),
}

/// One of the command's two output pipes.
#[derive(Clone, Copy)]
enum Stream {
    /// The command's stdout pipe.
    Stdout,
    /// The command's stderr pipe.
    Stderr,
}

/// The collecting thread's state for one run.
struct State {
    /// The shell's exit status once it was reaped.
    status: Option<ExitStatus>,
    /// Whether stdout reached end of file or its grace ran out.
    stdout_closed: bool,
    /// Whether stderr reached end of file or its grace ran out.
    stderr_closed: bool,
    /// The combined output read so far.
    output: String,
    /// Whether the run counts as timed out.
    timed_out: bool,
    /// When the runner asks the command's group to stop.
    timeout_at: Option<Instant>,
    /// When the runner kills the command's group.
    kill_at: Option<Instant>,
    /// When the runner stops waiting for the output pipes.
    close_at: Option<Instant>,
    /// How long the runner waits after a stop or an exit.
    kill_grace: Duration,
}

impl State {
    /// Creates the state for a run with the given limits.
    fn new(timeout: Option<Duration>, kill_grace: Duration) -> Self {
        let timeout_at = timeout
            .filter(|limit| !limit.is_zero())
            .map(|limit| Instant::now() + limit);
        Self {
            status: None,
            stdout_closed: false,
            stderr_closed: false,
            output: String::new(),
            timed_out: false,
            timeout_at,
            kill_at: None,
            close_at: None,
            kill_grace,
        }
    }

    /// Whether the exit and both output pipes have been received.
    fn finished(&self) -> bool {
        self.status.is_some() && self.stdout_closed && self.stderr_closed
    }

    /// The earliest deadline still waiting, if any.
    fn deadline(&self) -> Option<Instant> {
        [self.timeout_at, self.kill_at, self.close_at]
            .into_iter()
            .flatten()
            .min()
    }

    /// Acts on every deadline that has passed.
    fn fire_due(&mut self, pid: u32, exited: &Arc<AtomicBool>) {
        let now = Instant::now();
        if self.timeout_at.is_some_and(|deadline| now >= deadline) {
            self.timeout_at = None;
            if !exited.load(Ordering::SeqCst) {
                self.timed_out = true;
                self.kill_at = Some(now + self.kill_grace);
                signal_group(pid, "TERM");
            }
        }
        if self.kill_at.is_some_and(|deadline| now >= deadline) {
            self.kill_at = None;
            if !exited.load(Ordering::SeqCst) {
                signal_group(pid, "KILL");
            }
        }
        if self.close_at.is_some_and(|deadline| now >= deadline) {
            self.close_at = None;
            self.stdout_closed = true;
            self.stderr_closed = true;
        }
    }

    /// Folds one message from a helper thread into the state.
    fn apply(&mut self, message: Message) {
        match message {
            Message::Output(text) => self.output.push_str(&text),
            Message::Closed(Stream::Stdout) => self.stdout_closed = true,
            Message::Closed(Stream::Stderr) => self.stderr_closed = true,
            Message::Exited(status) => self.reap(status),
        }
    }

    /// Records the exit and starts the grace for any pipe still open.
    fn reap(&mut self, status: ExitStatus) {
        self.status = Some(status);
        self.timeout_at = None;
        self.kill_at = None;
        if !(self.stdout_closed && self.stderr_closed) {
            self.close_at = Some(Instant::now() + self.kill_grace);
        }
    }
}

/// Runs one command in its own process group and collects its combined output.
pub(super) fn run(
    request: &VerifyRequest,
    env: &BTreeMap<String, String>,
) -> Result<CommandRun, ProcessError> {
    let mut child = spawn(request, env)?;
    let pid = child.id();
    let (sender, receiver) = channel();
    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();
    spawn_reader(stdout, Stream::Stdout, sender.clone());
    spawn_reader(stderr, Stream::Stderr, sender.clone());
    let exited = Arc::new(AtomicBool::new(false));
    spawn_waiter(child, sender, Arc::clone(&exited));
    Ok(collect(
        &receiver,
        &mut State::new(request.timeout, request.kill_grace),
        pid,
        &exited,
    ))
}

/// Starts the shell in a new process group with only the declared environment.
fn spawn(request: &VerifyRequest, env: &BTreeMap<String, String>) -> Result<Child, ProcessError> {
    Command::new(SHELL)
        .arg("-c")
        .arg(&request.command)
        .current_dir(&request.cwd)
        .env_clear()
        .envs(env)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .process_group(0)
        .spawn()
        .map_err(|error| ProcessError::Spawn {
            program: SHELL.to_owned(),
            message: error.to_string(),
        })
}

/// Starts the thread that reads one pipe and reports its chunks and close.
fn spawn_reader(pipe: impl Read + Send + 'static, stream: Stream, sender: Sender<Message>) {
    thread::spawn(move || {
        let mut pipe = pipe;
        let mut buffer = [0_u8; CHUNK];
        loop {
            match pipe.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(read) => {
                    let text = String::from_utf8_lossy(&buffer[..read]).into_owned();
                    if sender.send(Message::Output(text)).is_err() {
                        return;
                    }
                }
            }
        }
        let _ = sender.send(Message::Closed(stream));
    });
}

/// Starts the thread that reaps the shell and reports its exit status.
fn spawn_waiter(mut child: Child, sender: Sender<Message>, exited: Arc<AtomicBool>) {
    thread::spawn(move || {
        if let Ok(status) = child.wait() {
            exited.store(true, Ordering::SeqCst);
            let _ = sender.send(Message::Exited(status));
        }
    });
}

/// Receives output and the exit until every pipe and deadline has passed.
fn collect(
    receiver: &Receiver<Message>,
    state: &mut State,
    pid: u32,
    exited: &Arc<AtomicBool>,
) -> CommandRun {
    while !state.finished() {
        match state.deadline() {
            Some(deadline) => {
                let wait = deadline.saturating_duration_since(Instant::now());
                match receiver.recv_timeout(wait) {
                    Ok(message) => state.apply(message),
                    Err(RecvTimeoutError::Timeout) => state.fire_due(pid, exited),
                    Err(RecvTimeoutError::Disconnected) => break,
                }
            }
            None => match receiver.recv() {
                Ok(message) => state.apply(message),
                Err(_) => break,
            },
        }
    }
    CommandRun {
        status: state.status,
        timed_out: state.timed_out,
        output: state.output.clone(),
    }
}

/// Asks the command's whole process group to stop through the system `kill`.
fn signal_group(pid: u32, name: &str) {
    let _ = Command::new("kill")
        .arg(format!("-{name}"))
        .arg("--")
        .arg(format!("-{pid}"))
        .status();
}
