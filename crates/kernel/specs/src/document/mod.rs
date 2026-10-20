//! Parsers for the frontmatter documents the specs kernel reads.

pub(crate) mod frontmatter;
pub(crate) mod proposal;
pub(crate) mod sidecar;
pub(crate) mod task_file;
pub(crate) mod task_list;
pub(crate) mod types;
pub(crate) mod yaml;

pub use frontmatter::parse_frontmatter;
pub use proposal::parse_proposal;
pub use sidecar::parse_sidecar;
pub use task_file::parse_task_file;
pub use task_list::parse_task_list;
pub use types::{
    ChecklistItem, Frontmatter, Proposal, Sidecar, SidecarError, SyntaxError, TaskFile,
    VerifyStarts,
};
