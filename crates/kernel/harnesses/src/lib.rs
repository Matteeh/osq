//! Harnesses adapter: starts one harness tool per role and translates its stream into events.
//!
//! A kernel crate depends only on core and other kernel crates (ADR 022).

mod pi;
mod process;

pub use pi::{
    PiHarness, PiPreflight, PiPreflightError, PiReady, PiSettings, PiStreamState,
    PiVersionAssessment, PiVersionRange, assess_pi_version, pi_args, pi_line_events, preflight_pi,
    resolve_pi_binary,
};
pub use process::{ProcessError, ProcessOutcome, ProcessSpec, run_process, run_process_until};
