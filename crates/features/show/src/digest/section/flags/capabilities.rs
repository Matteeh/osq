//! The removed-requirement and unknown-capability flags.

use super::super::capability::resembling_capability;
use super::super::model::DigestCapability;
use super::Flag;

/// One flag per capability whose delta removes requirements.
pub(super) fn removed(capabilities: &[DigestCapability]) -> Vec<Flag> {
    let mut ordered: Vec<&DigestCapability> = capabilities
        .iter()
        .filter(|capability| !capability.removed.is_empty())
        .collect();
    ordered.sort_by(|left, right| left.name.cmp(&right.name));
    ordered
        .into_iter()
        .map(|capability| {
            Flag::new(
                "removed_requirement",
                format!(
                    "removes {} requirements from {}",
                    capability.removed.len(),
                    capability.name
                ),
                capability.removed.join(", "),
            )
        })
        .collect()
}

/// One flag per delta capability with no living spec and no declared creation.
pub(super) fn unknown(
    capabilities: &[DigestCapability],
    living: &[String],
    openspec: &str,
) -> Vec<Flag> {
    let mut ordered: Vec<&DigestCapability> = capabilities.iter().collect();
    ordered.sort_by(|left, right| left.name.cmp(&right.name));
    let mut flags = Vec::new();
    for capability in ordered {
        if living.contains(&capability.name) || capability.creates {
            continue;
        }
        let label = resembling_capability(&capability.name, living).map_or_else(
            || format!("unknown capability {} without a Purpose", capability.name),
            |resembles| {
                format!(
                    "unknown capability {} resembles {resembles}",
                    capability.name
                )
            },
        );
        flags.push(Flag::new(
            "unknown_capability",
            label,
            format!(
                "no living spec at {openspec}/specs/{}/spec.md",
                capability.name
            ),
        ));
    }
    flags
}
