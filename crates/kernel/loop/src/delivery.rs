//! Running a command and delivering its new events to the features that react.
//!
//! A command runs through [`run_command`], which then delivers each active
//! change's unreported event lines to every feature that lists their kinds.
//! Delivery is at least once, from a durable cursor per feature and change,
//! under one lock per change, as ADR 030 says.

mod changes;
mod cursor;
mod event_file;
mod failure;
mod lock;
mod run;

pub use failure::ReactionFailure;
pub use run::{CommandRun, run_command};
