//! The finding types every validation run of the specs kernel returns.

use serde::Serialize;

/// The stable code of one validation finding.
///
/// A code serializes as its kebab-case string, and `fix` gives the one fix the
/// code prescribes for a human (ADR 026).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub enum FindingCode {
    /// The living spec has no purpose.
    #[serde(rename = "missing-purpose")]
    MissingPurpose,
    /// The living spec holds no requirement.
    #[serde(rename = "missing-requirements")]
    MissingRequirements,
    /// A requirement sits outside a Requirements section.
    #[serde(rename = "requirement-outside-section")]
    RequirementOutsideSection,
    /// A living spec holds a delta section heading.
    #[serde(rename = "delta-section-in-living-spec")]
    DeltaSectionInLivingSpec,
    /// A requirement name is used twice.
    #[serde(rename = "duplicate-requirement")]
    DuplicateRequirement,
    /// A requirement states neither SHALL nor MUST outside code fences.
    #[serde(rename = "requirement-without-shall")]
    RequirementWithoutShall,
    /// A requirement holds no scenario.
    #[serde(rename = "requirement-without-scenario")]
    RequirementWithoutScenario,
    /// A scenario holds no WHEN bullet.
    #[serde(rename = "scenario-without-when")]
    ScenarioWithoutWhen,
    /// A scenario holds no THEN bullet.
    #[serde(rename = "scenario-without-then")]
    ScenarioWithoutThen,
    /// A scenario name an earlier scenario of the requirement has.
    #[serde(rename = "duplicate-scenario")]
    DuplicateScenario,
    /// A delta spec holds a section that is not a known one.
    #[serde(rename = "unknown-delta-section")]
    UnknownDeltaSection,
    /// A delta section holds no entry.
    #[serde(rename = "empty-delta-section")]
    EmptyDeltaSection,
    /// A delta spec holds no operation section.
    #[serde(rename = "missing-delta-sections")]
    MissingDeltaSections,
    /// A rename side has no partner.
    #[serde(rename = "unpaired-rename")]
    UnpairedRename,
    /// A rename line is malformed.
    #[serde(rename = "invalid-rename")]
    InvalidRename,
    /// One requirement name appears in two delta operations that conflict.
    #[serde(rename = "conflicting-delta")]
    ConflictingDelta,
    /// A delta entry names a requirement the living spec does not have.
    #[serde(rename = "unknown-requirement")]
    UnknownRequirement,
    /// A change holds no delta spec.
    #[serde(rename = "change-without-delta")]
    ChangeWithoutDelta,
}

impl FindingCode {
    /// The code as its kebab-case string.
    #[must_use]
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::MissingPurpose => "missing-purpose",
            Self::MissingRequirements => "missing-requirements",
            Self::RequirementOutsideSection => "requirement-outside-section",
            Self::DeltaSectionInLivingSpec => "delta-section-in-living-spec",
            Self::DuplicateRequirement => "duplicate-requirement",
            Self::RequirementWithoutShall => "requirement-without-shall",
            Self::RequirementWithoutScenario => "requirement-without-scenario",
            Self::ScenarioWithoutWhen => "scenario-without-when",
            Self::ScenarioWithoutThen => "scenario-without-then",
            Self::DuplicateScenario => "duplicate-scenario",
            Self::UnknownDeltaSection => "unknown-delta-section",
            Self::EmptyDeltaSection => "empty-delta-section",
            Self::MissingDeltaSections => "missing-delta-sections",
            Self::UnpairedRename => "unpaired-rename",
            Self::InvalidRename => "invalid-rename",
            Self::ConflictingDelta => "conflicting-delta",
            Self::UnknownRequirement => "unknown-requirement",
            Self::ChangeWithoutDelta => "change-without-delta",
        }
    }

    /// The one fix the code prescribes, as the fix table gives it.
    #[must_use]
    pub fn fix(&self) -> &'static str {
        match self {
            Self::MissingPurpose => {
                "Add a `## Purpose` section that says what the capability is for."
            }
            Self::MissingRequirements => {
                "Add a `## Requirements` section with at least one requirement."
            }
            Self::RequirementOutsideSection => {
                "Move the requirement under `## Requirements`, or in a delta spec under an \
                 ADDED or MODIFIED section."
            }
            Self::DeltaSectionInLivingSpec => {
                "Move the requirements into `## Requirements` and remove the delta heading."
            }
            Self::DuplicateRequirement => {
                "Rename or remove one of the requirements, so each name is used once."
            }
            Self::RequirementWithoutShall => {
                "State the requirement with SHALL or MUST outside code fences."
            }
            Self::RequirementWithoutScenario => {
                "Add a `#### Scenario:` block with WHEN and THEN bullets."
            }
            Self::ScenarioWithoutWhen => "Add a `- **WHEN**` bullet to the scenario.",
            Self::ScenarioWithoutThen => "Add a `- **THEN**` bullet to the scenario.",
            Self::DuplicateScenario => {
                "Rename one of the scenarios, so each name is used once in the requirement."
            }
            Self::UnknownDeltaSection => {
                "Use only `## Purpose` and the ADDED, MODIFIED, REMOVED and RENAMED \
                 Requirements sections."
            }
            Self::EmptyDeltaSection => "Add requirements under the heading, or remove it.",
            Self::MissingDeltaSections => {
                "Add an ADDED, MODIFIED, REMOVED or RENAMED Requirements section."
            }
            Self::UnpairedRename => "Pair each `FROM:` line with a `TO:` line directly after it.",
            Self::InvalidRename => {
                "Write each side as `- FROM:` or `- TO:` and a backticked requirement header."
            }
            Self::ConflictingDelta => {
                "Name the requirement in one operation only; after a rename, MODIFIED uses \
                 the new name."
            }
            Self::UnknownRequirement => {
                "Name a requirement the living spec has, or add a new one under ADDED."
            }
            Self::ChangeWithoutDelta => "Add a delta spec at `specs/<capability>/spec.md`.",
        }
    }
}

/// One finding a validation run returns.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SpecFinding {
    /// The stable code of the finding.
    pub code: FindingCode,
    /// The file the finding concerns, as the caller named it.
    pub file: String,
    /// The 1-based line the finding points at.
    pub line: usize,
    /// The requirement name where one applies, or none.
    pub requirement: Option<String>,
    /// A one-sentence message that names the requirement or scenario.
    pub message: String,
    /// The one fix for the human, taken from the code.
    pub fix: String,
}

impl SpecFinding {
    /// Builds a finding, taking its fix from the code.
    #[must_use]
    pub(crate) fn new(
        code: FindingCode,
        file: &str,
        line: usize,
        requirement: Option<String>,
        message: String,
    ) -> Self {
        let fix = code.fix().to_string();
        Self {
            code,
            file: file.to_string(),
            line,
            requirement,
            message,
            fix,
        }
    }
}
