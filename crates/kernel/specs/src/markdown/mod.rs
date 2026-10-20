//! Markdown parsers for the `OpenSpec` documents the specs kernel reads.

pub(crate) mod delta;
pub(crate) mod living;
pub(crate) mod ownership;
pub(crate) mod requirement;
pub(crate) mod scenario;
pub(crate) mod section;
pub(crate) mod table;
pub(crate) mod text;
pub(crate) mod types;

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
