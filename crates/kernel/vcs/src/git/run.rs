//! The one runner that spawns, bounds, collects and reaps each git command.

use std::io::{Read, Write as _};
use std::process::{Child, Stdio};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::thread;
use std::time::{Duration, Instant};

use osq_kernel_config::Timeouts;

use crate::VcsError;

use super::GitVcs;

/// One git command's exit status and decoded streams.
pub(super) struct RunOutput {
    /// Whether git exited with code 0.
    pub(super) success: bool,
    /// Standard output, decoded with invalid bytes replaced.
    pub(super) stdout: String,
    /// Standard error, decoded with invalid bytes replaced.
    pub(super) stderr: String,
}

/// One decoded stream, tagged by which pipe it came from.
enum Stream {
    /// Standard output.
    Stdout(Vec<u8>),
    /// Standard error.
    Stderr(Vec<u8>),
}

/// The limit that bounds the command `args`.
fn limit(args: &[&str], timeouts: &Timeouts) -> Duration {
    match args.first().copied() {
        Some("commit" | "commit-tree" | "merge") => timeouts.git_commit,
        _ => timeouts.git,
    }
}

/// Reads `stream` to its end, giving the bytes read.
fn read_all(mut stream: impl Read) -> Vec<u8> {
    let mut bytes = Vec::new();
    let _ = stream.read_to_end(&mut bytes);
    bytes
}

/// Reads both of `child`'s streams until they close or `deadline` passes.
fn read_streams(child: &mut Child, deadline: Instant) -> Option<(Vec<u8>, Vec<u8>)> {
    let (sender, receiver) = mpsc::channel();
    let mut expected = 0;
    if let Some(stream) = child.stdout.take() {
        let sender = sender.clone();
        thread::spawn(move || {
            let _ = sender.send(Stream::Stdout(read_all(stream)));
        });
        expected += 1;
    }
    if let Some(stream) = child.stderr.take() {
        let sender = sender.clone();
        thread::spawn(move || {
            let _ = sender.send(Stream::Stderr(read_all(stream)));
        });
        expected += 1;
    }
    drop(sender);
    let mut stdout = Vec::new();
    let mut stderr = Vec::new();
    while expected > 0 {
        let timeout = deadline.saturating_duration_since(Instant::now());
        match receiver.recv_timeout(timeout) {
            Ok(Stream::Stdout(bytes)) => {
                stdout = bytes;
                expected -= 1;
            }
            Ok(Stream::Stderr(bytes)) => {
                stderr = bytes;
                expected -= 1;
            }
            Err(RecvTimeoutError::Timeout | RecvTimeoutError::Disconnected) => return None,
        }
    }
    Some((stdout, stderr))
}

/// Runs one command, giving its exit and both decoded streams.
pub(super) fn run(
    vcs: &GitVcs,
    args: &[&str],
    env: &[(&str, &str)],
    input: Option<&str>,
) -> Result<RunOutput, VcsError> {
    let mut command = vcs.command(args);
    for (key, value) in env {
        command.env(key, value);
    }
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let command_line = vcs.command_line(args);
    let limit = limit(args, &vcs.timeouts);
    let mut child = command.spawn().map_err(|source| VcsError::Spawn {
        command: command_line.clone(),
        source,
    })?;
    let started = Instant::now();
    if let (Some(text), Some(mut pipe)) = (input, child.stdin.take()) {
        let _ = pipe.write_all(text.as_bytes());
    }
    let Some((stdout, stderr)) = read_streams(&mut child, started + limit) else {
        let _ = child.kill();
        let _ = child.wait();
        return Err(VcsError::TimedOut {
            command: command_line,
            limit,
        });
    };
    let status = child.wait().map_err(|source| VcsError::Spawn {
        command: command_line,
        source,
    })?;
    Ok(RunOutput {
        success: status.success(),
        stdout: String::from_utf8_lossy(&stdout).into_owned(),
        stderr: String::from_utf8_lossy(&stderr).into_owned(),
    })
}
