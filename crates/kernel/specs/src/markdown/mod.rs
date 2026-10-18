//! Markdown parsers for the `OpenSpec` documents the specs kernel reads.

pub mod delta;
pub mod living;
pub mod ownership;
pub mod requirement;
pub mod scenario;
pub mod section;
pub mod table;
pub mod text;
pub mod types;

pub use delta::parse_delta;
pub use living::parse_living_spec;
pub use ownership::code_ownership;
pub use requirement::parse_requirement;
pub use scenario::parse_scenario;
pub use section::section;
pub use text::{js_trim, normalize_requirement_name};
pub use types::{
    Delta, LivingSpec, Outcome, Rename, RenameSide, Requirement, Scenario, UnpairedRename,
};
