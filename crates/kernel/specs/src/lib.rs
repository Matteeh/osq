//! Specs adapter: parses, validates and merges living specs, proposals, task files and delta specs.
//!
//! A kernel crate depends only on core and other kernel crates (ADR 022).

pub mod document;
pub mod markdown;
pub mod owners;
pub mod read;

pub use document::{
    ChecklistItem, Frontmatter, Proposal, Sidecar, SidecarError, SyntaxError, TaskFile,
    VerifyStarts, parse_frontmatter, parse_proposal, parse_sidecar, parse_task_file,
    parse_task_list,
};
pub use markdown::{
    Delta, LivingSpec, Outcome, Rename, RenameSide, Requirement, Scenario, UnpairedRename,
    code_ownership, js_trim, normalize_requirement_name, parse_delta, parse_living_spec,
    parse_requirement, parse_scenario, section,
};
pub use owners::{
    CapabilityOwnership, owner_capabilities, read_capability_ownership, scope_covers_path,
};
pub use read::{
    SpecsError, read_delta, read_living_spec, read_proposal, read_sidecar, read_task_file,
    read_task_list,
};
