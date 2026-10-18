//! Selecting the events the nine event tables are built from.
//!
//! Implements: rust-storage/table-events

use osq_core::{Envelope, Event, Stream};

/// One kept event, with its stream and timestamp, in fold order.
#[derive(Clone, Debug, PartialEq)]
pub struct TableEvent {
    /// The stream whose file held the event.
    pub stream: Stream,
    /// The timestamp string, as written.
    pub timestamp: String,
    /// The typed event.
    pub event: Event,
}

/// The table event one envelope holds, or `None` when no table reads it.
pub(super) fn table_event(stream: &Stream, envelope: &Envelope) -> Option<TableEvent> {
    keep(stream, &envelope.event).then(|| TableEvent {
        stream: stream.clone(),
        timestamp: envelope.timestamp.clone(),
        event: envelope.event.clone(),
    })
}

/// Whether the event tables are built from this event of this stream.
fn keep(stream: &Stream, event: &Event) -> bool {
    match stream {
        Stream::Task(_) => matches!(
            event,
            Event::Paused(_)
                | Event::Recertification(_)
                | Event::FocusedRan(_)
                | Event::MutationRan(_)
        ),
        Stream::Change => matches!(event, Event::ValidatorRan(_)),
        Stream::Validator => false,
    }
}
