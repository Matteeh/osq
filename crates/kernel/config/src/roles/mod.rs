//! The `[executor]`, `[planner]` and `[validator]` tables and their defaults.

pub(crate) mod executor;
pub(crate) mod harness;
pub(crate) mod planner;
pub(crate) mod validator;

pub use executor::ExecutorConfig;
pub use harness::Harness;
pub use planner::PlannerConfig;
pub use validator::ValidatorConfig;

/// The name `path`'s table holds its key under, the last dotted segment.
fn key_of(path: &str) -> &str {
    match path.rsplit_once('.') {
        Some((_, key)) => key,
        None => path,
    }
}
