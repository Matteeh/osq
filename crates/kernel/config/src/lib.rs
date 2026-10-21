//! Config kernel: reads `osq.toml` into typed settings (ADR 025).
//!
//! A kernel crate depends only on core and other kernel crates (ADR 022).

mod blocks;
mod config;
mod error;
mod roles;

pub use blocks::{ManualEdits, Timeouts, VcsConfig};
pub use config::{Config, load_config, parse_config};
pub use error::ConfigError;
pub use roles::{ExecutorConfig, Harness, PlannerConfig, ValidatorConfig};
