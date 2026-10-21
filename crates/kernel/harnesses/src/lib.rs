//! Harnesses adapter: starts one harness tool per role and translates its stream into events.
//!
//! A kernel crate depends only on core and other kernel crates (ADR 022).

mod pi;
mod process;

pub use pi::{PiSettings, PiStreamState, pi_args, pi_line_events};
pub use process::{ProcessError, ProcessOutcome, ProcessSpec, run_process};
