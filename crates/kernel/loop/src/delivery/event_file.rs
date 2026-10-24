//! Reading the complete new lines of one event file.

use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom};
use std::path::Path;

/// One open event file and the size it had when it was opened.
pub(crate) struct EventFile {
    /// The open file.
    file: File,
    /// Its size when it was opened.
    size: u64,
}

impl EventFile {
    /// Opens an event file and records its size.
    ///
    /// Implements: rust-loop/event-delivery
    pub(crate) fn open(path: &Path) -> io::Result<Self> {
        let file = File::open(path)?;
        let size = file.metadata()?.len();
        Ok(Self { file, size })
    }

    /// The file's size when it was opened.
    ///
    /// Implements: rust-loop/event-delivery
    pub(crate) fn size(&self) -> u64 {
        self.size
    }

    /// Whether `offset` follows a newline.
    ///
    /// Implements: rust-loop/event-delivery
    pub(crate) fn starts_line(&mut self, offset: u64) -> io::Result<bool> {
        if offset == 0 {
            return Ok(true);
        }
        self.file.seek(SeekFrom::Start(offset - 1))?;
        let mut byte = [0_u8; 1];
        self.file.read_exact(&mut byte)?;
        Ok(byte[0] == b'\n')
    }

    /// Reads every byte from `offset` to the end.
    ///
    /// Implements: rust-loop/event-delivery
    pub(crate) fn read_from(&mut self, offset: u64) -> io::Result<Vec<u8>> {
        self.file.seek(SeekFrom::Start(offset))?;
        let mut bytes = Vec::new();
        self.file.read_to_end(&mut bytes)?;
        Ok(bytes)
    }
}

/// The bytes up to and including the last newline, or nothing without one.
///
/// Implements: rust-loop/event-delivery
pub(crate) fn complete(bytes: &[u8]) -> &[u8] {
    match bytes.iter().rposition(|byte| *byte == b'\n') {
        Some(end) => &bytes[..=end],
        None => &[],
    }
}

/// The complete lines of `complete`, without their newlines.
///
/// `complete` always ends in a newline, so a final empty line is not one.
///
/// Implements: rust-loop/event-delivery
pub(crate) fn lines(bytes: &[u8]) -> Vec<&[u8]> {
    if bytes.is_empty() {
        return Vec::new();
    }
    bytes[..bytes.len() - 1]
        .split(|byte| *byte == b'\n')
        .collect()
}
