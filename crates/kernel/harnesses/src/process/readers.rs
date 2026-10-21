//! The helper threads that read the program's pipes and wait for its exit.

use std::io::{BufRead, BufReader, Read};
use std::process::{Child, ChildStderr, ChildStdout, ExitStatus};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::Sender;
use std::thread;

/// The byte that ends one stdout line.
const NEWLINE: u8 = b'\n';

/// One message from a helper thread to the calling thread.
pub(super) enum Message {
    /// One non-blank stdout line, without its newline.
    Line(String),
    /// The program's exit status.
    Exited(ExitStatus),
    /// stdout reached end of file.
    StdoutClosed,
    /// Everything the program wrote to stderr.
    Stderr(String),
}

/// Starts the thread that forwards stdout lines and then reports stdout closed.
pub(super) fn spawn_stdout_reader(stdout: ChildStdout, sender: Sender<Message>) {
    thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        let mut buffer = Vec::new();
        loop {
            buffer.clear();
            match reader.read_until(NEWLINE, &mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(_) => {
                    let text = String::from_utf8_lossy(&buffer);
                    let line = text.strip_suffix('\n').unwrap_or(&text);
                    if !line.trim().is_empty()
                        && sender.send(Message::Line(line.to_owned())).is_err()
                    {
                        return;
                    }
                }
            }
        }
        let _ = sender.send(Message::StdoutClosed);
    });
}

/// Starts the thread that reads stderr whole and then reports it.
pub(super) fn spawn_stderr_reader(mut stderr: ChildStderr, sender: Sender<Message>) {
    thread::spawn(move || {
        let mut bytes = Vec::new();
        let _ = stderr.read_to_end(&mut bytes);
        let text = String::from_utf8_lossy(&bytes).into_owned();
        let _ = sender.send(Message::Stderr(text));
    });
}

/// Starts the thread that reaps the program and reports its exit status.
pub(super) fn spawn_waiter(mut child: Child, sender: Sender<Message>, exited: Arc<AtomicBool>) {
    thread::spawn(move || {
        if let Ok(status) = child.wait() {
            exited.store(true, Ordering::SeqCst);
            let _ = sender.send(Message::Exited(status));
        }
    });
}
