//! The plain data an approval digest prints.

/// One task's digest row.
pub(crate) struct DigestTask {
    /// The task number from its file name.
    pub(crate) number: String,
    /// The task file's title.
    pub(crate) title: String,
    /// The number of scope entries that name an existing file.
    pub(crate) scope_files: usize,
    /// Whether the task may change preexisting tests.
    pub(crate) tests_modify: bool,
    /// The existing gated test files in the task's scope, sorted.
    pub(crate) existing_tests: Vec<String>,
}

/// One written capability's digest row.
pub(crate) struct DigestCapability {
    /// The capability name.
    pub(crate) name: String,
    /// The added requirement names.
    pub(crate) added: Vec<String>,
    /// The modified requirement names.
    pub(crate) modified: Vec<String>,
    /// The removed requirement names.
    pub(crate) removed: Vec<String>,
    /// Whether the change creates this capability.
    pub(crate) creates: bool,
}

/// One accepted ADR the change's capabilities are governed by.
pub(crate) struct DigestDecision {
    /// The ADR number, as its file name writes it.
    pub(crate) number: String,
    /// The ADR's rule text.
    pub(crate) rule: String,
}

/// Everything one approval digest prints.
pub(crate) struct Digest {
    /// The change folder's name.
    pub(crate) change: String,
    /// The goal's first two sentences, whitespace-collapsed.
    pub(crate) goal: String,
    /// The change's tasks in task-number order.
    pub(crate) tasks: Vec<DigestTask>,
    /// The written capabilities in name order.
    pub(crate) capabilities: Vec<DigestCapability>,
    /// The governing decisions in number order.
    pub(crate) decisions: Vec<DigestDecision>,
    /// The trimmed `## Human steps` section, or empty text.
    pub(crate) human_steps: String,
    /// The before-approval steps, or empty text.
    pub(crate) before_approval: String,
}
