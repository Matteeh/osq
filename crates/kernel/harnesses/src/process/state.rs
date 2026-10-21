//! The calling thread's state machine for one program run.

use std::process::ExitStatus;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use super::readers::Message;
use super::runner::signal;

/// The state the calling thread keeps while it receives run messages.
pub(super) struct RunState {
    /// The exit status once the program was reaped.
    exit: Option<ExitStatus>,
    /// Whether stdout reached end of file, or its grace ran out.
    stdout_closed: bool,
    /// All of stderr once its reader finished.
    stderr: Option<String>,
    /// Whether the run counts as timed out.
    timed_out: bool,
    /// Whether a line already asked the program to stop.
    stop_requested: bool,
    /// When the runner asks the program to stop after its timeout.
    timeout_at: Option<Instant>,
    /// When the runner asks the program to stop after a line asked it to.
    stop_at: Option<Instant>,
    /// When the runner kills the program.
    kill_at: Option<Instant>,
    /// When the runner stops waiting for stdout to close.
    stdout_at: Option<Instant>,
    /// How long the runner waits after a stop or an exit.
    kill_grace: Duration,
}

impl RunState {
    /// Creates the state for a run with the given limits.
    pub(super) fn new(timeout: Option<Duration>, kill_grace: Duration) -> Self {
        Self {
            exit: None,
            stdout_closed: false,
            stderr: None,
            timed_out: false,
            stop_requested: false,
            timeout_at: timeout.map(|limit| Instant::now() + limit),
            stop_at: None,
            kill_at: None,
            stdout_at: None,
            kill_grace,
        }
    }

    /// Whether the exit, stdout and stderr have all been received.
    pub(super) fn finished(&self) -> bool {
        self.exit.is_some() && self.stdout_closed && self.stderr.is_some()
    }

    /// The earliest deadline still waiting, if any.
    pub(super) fn deadline(&self) -> Option<Instant> {
        [self.timeout_at, self.stop_at, self.kill_at, self.stdout_at]
            .into_iter()
            .flatten()
            .min()
    }

    /// Acts on every deadline that has passed.
    pub(super) fn fire_due(&mut self, pid: u32, exited: &Arc<AtomicBool>) {
        let now = Instant::now();
        if self.timeout_at.is_some_and(|deadline| now >= deadline) {
            self.timeout_at = None;
            if !exited.load(Ordering::SeqCst) {
                self.timed_out = true;
                if self.kill_at.is_none() {
                    self.kill_at = Some(now + self.kill_grace);
                }
                signal(pid, "TERM");
            }
        }
        if self.stop_at.is_some_and(|deadline| now >= deadline) {
            self.stop_at = None;
            if !exited.load(Ordering::SeqCst) {
                if self.kill_at.is_none() {
                    self.kill_at = Some(now + self.kill_grace);
                }
                signal(pid, "TERM");
            }
        }
        if self.kill_at.is_some_and(|deadline| now >= deadline) {
            self.kill_at = None;
            if !exited.load(Ordering::SeqCst) {
                signal(pid, "KILL");
            }
        }
        if self.stdout_at.is_some_and(|deadline| now >= deadline) {
            self.stdout_at = None;
            self.stdout_closed = true;
            if self.stderr.is_none() {
                self.stderr = Some(String::new());
            }
        }
    }

    /// Folds one message from a helper thread into the state.
    pub(super) fn apply(&mut self, message: Message, on_line: &mut dyn FnMut(&str) -> bool) {
        match message {
            Message::Line(line) => self.line(&line, on_line),
            Message::Exited(status) => {
                self.exit = Some(status);
                self.timeout_at = None;
                self.stop_at = None;
                self.kill_at = None;
                if !self.stdout_closed {
                    self.stdout_at = Some(Instant::now() + self.kill_grace);
                }
            }
            Message::StdoutClosed => {
                self.stdout_closed = true;
                self.stdout_at = None;
            }
            Message::Stderr(text) => self.stderr = Some(text),
        }
    }

    /// Gives one stdout line to the caller and arms a stop on the first `true`.
    fn line(&mut self, line: &str, on_line: &mut dyn FnMut(&str) -> bool) {
        if on_line(line) && !self.stop_requested {
            self.stop_requested = true;
            self.stop_at = Some(Instant::now() + self.kill_grace);
        }
    }

    /// The exit code after mapping signals and timeouts.
    pub(super) fn exit_code(&self) -> i32 {
        let code = self.exit.and_then(|status| status.code());
        if self.timed_out {
            match code {
                Some(code) if code != 0 => code,
                _ => 124,
            }
        } else {
            code.unwrap_or(1)
        }
    }

    /// All of stderr, or nothing when its reader did not report.
    pub(super) fn stderr(&self) -> String {
        self.stderr.clone().unwrap_or_default()
    }

    /// Whether the runner stopped the program after its timeout.
    pub(super) fn timed_out(&self) -> bool {
        self.timed_out
    }
}
