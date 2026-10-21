//! The typed settings a caller gives the runner for each role.
//!
//! The runner never reads a configuration file; its caller builds this value
//! from whatever configuration source it uses.

use std::time::Duration;

/// A role whose task the runner starts.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Role {
    /// The role that executes a task.
    Executor,
    /// The role that plans a change.
    Planner,
    /// The role that validates a task or change.
    Validator,
}

/// The harness, model and timeout one role runs with.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RoleSettings {
    /// The harness name, which selects the adapter in the harness map.
    pub harness: String,
    /// The model the harness runs, absent when the harness chooses one.
    pub model: Option<String>,
    /// The task timeout, absent when the harness has none.
    pub timeout: Option<Duration>,
}

/// Everything the runner needs to start one task, given by its caller.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RunnerSettings {
    /// The executor role's settings.
    pub executor: RoleSettings,
    /// The planner role's settings.
    pub planner: RoleSettings,
    /// The validator role's settings.
    pub validator: RoleSettings,
    /// The names the settings list for the agent role.
    pub agent_env: Vec<String>,
    /// How many times a failed start is retried.
    pub start_retries: u32,
    /// How long the runner waits before each retry.
    pub retry_delay: Duration,
    /// How long a pause lasts when the harness gives no future reset time.
    pub usage_limit_wait: Duration,
}

impl RunnerSettings {
    /// The settings of `role`.
    ///
    /// Implements: rust-runners/harness-and-model-per-role
    #[must_use]
    pub fn role(&self, role: Role) -> &RoleSettings {
        match role {
            Role::Executor => &self.executor,
            Role::Planner => &self.planner,
            Role::Validator => &self.validator,
        }
    }
}
