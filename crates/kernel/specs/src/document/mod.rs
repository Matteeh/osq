//! Parsers for the frontmatter documents the specs kernel reads.

pub mod frontmatter;
pub mod proposal;
pub mod sidecar;
pub mod task_file;
pub mod task_list;
pub mod types;
pub mod yaml;

pub use frontmatter::parse_frontmatter;
pub use proposal::parse_proposal;
pub use sidecar::parse_sidecar;
pub use task_file::parse_task_file;
pub use task_list::parse_task_list;
pub use types::{
    ChecklistItem, Frontmatter, Proposal, Sidecar, SidecarError, SyntaxError, TaskFile,
    VerifyStarts,
};
