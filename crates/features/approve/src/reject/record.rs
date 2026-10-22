//! Writing the rejection marker and event with TypeScript's bytes.

use std::fs;
use std::io::{self, Write};
use std::path::Path;

/// Writes `.run/rejected.md` and appends the `rejected` event line.
///
/// Implements: rust-approve/rejection-record
pub(crate) fn write(folder: &Path, reason: &str, timestamp: &str) -> io::Result<()> {
    let run = folder.join(".run");
    fs::create_dir_all(&run)?;
    let reason_json = json_string(reason)?;
    let timestamp_json = json_string(timestamp)?;
    let marker = format!("---\nreason: {reason_json}\ntimestamp: {timestamp_json}\n---\n");
    fs::write(run.join("rejected.md"), marker)?;
    let events = run.join("events");
    fs::create_dir_all(&events)?;
    let event = format!(
        "{{\"type\":\"rejected\",\"timestamp\":{timestamp_json},\"data\":{{\"reason\":{reason_json}}}}}\n"
    );
    fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(events.join("change.jsonl"))?
        .write_all(event.as_bytes())
}

/// One value as a JSON string, as TypeScript's `JSON.stringify` writes it.
fn json_string(value: &str) -> io::Result<String> {
    serde_json::to_string(value).map_err(io::Error::other)
}
