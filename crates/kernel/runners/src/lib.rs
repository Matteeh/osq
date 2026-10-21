//! Runners adapter: what every harness shares, such as the model per role, timeouts, retries and the usage-limit pause.
//!
//! A kernel crate depends only on core and other kernel crates (ADR 022).

mod clock;
mod env;
mod pause;
mod run;
mod settings;

pub use clock::{Clock, SystemClock};
pub use env::{BASE_ENV_NAMES, EnvRole, role_env};
pub use pause::{PauseSource, UsagePause, find_usage_limit, pause_until};
pub use run::{
    Harness, HarnessExit, RunError, RunOutcome, StartError, StartRequest, TaskRequest, run_task,
};
pub use settings::{Role, RoleSettings, RunnerSettings};
