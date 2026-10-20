//! The delta checks and the four operations the merge applies in order.

use super::apply_names::{fold_requirement_name, missing_scenario_names, normalize_block_raw};
use super::base::Block;
use super::error::MergeError;
use crate::markdown::text::{js_trim_end, normalize_requirement_name};
use crate::markdown::types::{Delta, Rename};
use std::collections::{HashMap, HashSet};

/// The state one merge works on: the capability and its live block map.
pub(crate) struct MergeContext {
    /// The capability merged.
    pub(crate) capability: String,
    /// The requirement blocks, iterated in insertion order.
    pub(crate) blocks: BlockMap,
    /// The block names in the base's original positions.
    pub(crate) order: Vec<String>,
}

/// An insertion-ordered map of requirement blocks, as a JavaScript `Map` is.
#[derive(Debug, Default)]
pub(crate) struct BlockMap {
    /// The entries in insertion order; a deleted entry is none.
    entries: Vec<Option<Block>>,
    /// The index of each live name in `entries`.
    index: HashMap<String, usize>,
}

impl BlockMap {
    /// Builds a map from blocks in insertion order.
    #[must_use]
    pub(crate) fn new(blocks: Vec<Block>) -> Self {
        let mut entries = Vec::with_capacity(blocks.len());
        let mut index = HashMap::with_capacity(blocks.len());
        for block in blocks {
            index.insert(block.name.clone(), entries.len());
            entries.push(Some(block));
        }
        Self { entries, index }
    }

    /// Tells whether the map holds a name.
    #[must_use]
    pub(crate) fn has(&self, name: &str) -> bool {
        self.index.contains_key(name)
    }

    /// The block a name holds.
    #[must_use]
    pub(crate) fn get(&self, name: &str) -> Option<&Block> {
        self.index
            .get(name)
            .and_then(|position| self.entries[*position].as_ref())
    }

    /// Inserts a block, keeping an existing name's position.
    pub(crate) fn set(&mut self, block: Block) {
        if let Some(position) = self.index.get(&block.name).copied() {
            self.entries[position] = Some(block);
        } else {
            self.index.insert(block.name.clone(), self.entries.len());
            self.entries.push(Some(block));
        }
    }

    /// Removes a name from the map.
    pub(crate) fn delete(&mut self, name: &str) {
        if let Some(position) = self.index.remove(name) {
            self.entries[position] = None;
        }
    }

    /// The live blocks in insertion order.
    pub(crate) fn iter(&self) -> impl Iterator<Item = &Block> {
        self.entries.iter().filter_map(Option::as_ref)
    }
}

/// Refuses malformed renames, unpaired renames and duplicate ADDED names.
pub(crate) fn validate_delta(delta: &Delta, capability: &str) -> Result<(), MergeError> {
    if let Some(line) = delta.invalid_renames.first() {
        return Err(MergeError::InvalidRename {
            capability: capability.to_string(),
            line: line.clone(),
        });
    }

    if let Some(rename) = delta.unpaired_renames.first() {
        return Err(MergeError::UnpairedRename {
            capability: capability.to_string(),
            side: rename.side,
            requirement: rename.name.clone(),
        });
    }

    let mut seen: HashSet<String> = HashSet::new();
    for requirement in &delta.added {
        let key = normalize_requirement_name(&requirement.name);
        if !seen.insert(key) {
            return Err(MergeError::DuplicateAdded {
                capability: capability.to_string(),
                requirement: requirement.name.clone(),
            });
        }
    }

    Ok(())
}

/// Renames each block's FROM name to its TO name.
pub(crate) fn apply_renames(
    context: &mut MergeContext,
    renames: &[Rename],
) -> Result<(), MergeError> {
    for rename in renames {
        let from = normalize_requirement_name(&rename.from);
        let Some(block) = context.blocks.get(&from).cloned() else {
            return Err(MergeError::RenameSourceMissing {
                capability: context.capability.clone(),
                requirement: rename.from.clone(),
            });
        };
        let to = normalize_requirement_name(&rename.to);
        if context.blocks.has(&to) {
            return Err(MergeError::RenameTargetExists {
                capability: context.capability.clone(),
                requirement: rename.to.clone(),
            });
        }
        context.blocks.delete(&from);
        context.blocks.set(Block {
            name: to.clone(),
            raw: rename_raw(&block.raw, &to),
        });
        if let Some(position) = context.order.iter().position(|name| name == &from) {
            context.order[position] = to;
        }
    }
    Ok(())
}

/// Rewrites a block's first line to the TO header.
fn rename_raw(raw: &str, to: &str) -> String {
    match raw.split_once('\n') {
        Some((_, rest)) => format!("### Requirement: {to}\n{rest}"),
        None => format!("### Requirement: {to}"),
    }
}

/// Removes each REMOVED name's block.
pub(crate) fn apply_removals(
    context: &mut MergeContext,
    removed: &[String],
) -> Result<(), MergeError> {
    for requirement in removed {
        let key = normalize_requirement_name(requirement);
        if !context.blocks.has(&key) {
            return Err(MergeError::RemovedMissing {
                capability: context.capability.clone(),
                requirement: requirement.clone(),
            });
        }
        context.blocks.delete(&key);
    }
    Ok(())
}

/// Replaces each MODIFIED block, refusing a dropped scenario.
pub(crate) fn apply_modifications(
    context: &mut MergeContext,
    modified: &[crate::markdown::Requirement],
) -> Result<(), MergeError> {
    for requirement in modified {
        let key = normalize_requirement_name(&requirement.name);
        let Some(current) = context.blocks.get(&key) else {
            return Err(MergeError::ModifiedMissing {
                capability: context.capability.clone(),
                requirement: requirement.name.clone(),
            });
        };
        let missing = missing_scenario_names(&current.raw, &requirement.raw);
        if !missing.is_empty() {
            return Err(MergeError::ScenariosDropped {
                capability: context.capability.clone(),
                requirement: requirement.name.clone(),
                scenarios: missing,
            });
        }
        context.blocks.set(Block {
            name: key,
            raw: js_trim_end(&requirement.raw).to_string(),
        });
    }
    Ok(())
}

/// Adds each ADDED block, refusing a clash or a near miss.
pub(crate) fn apply_additions(
    context: &mut MergeContext,
    added: &[crate::markdown::Requirement],
) -> Result<(), MergeError> {
    for requirement in added {
        let key = normalize_requirement_name(&requirement.name);
        if let Some(existing) = context.blocks.get(&key) {
            if normalize_block_raw(&existing.raw) == normalize_block_raw(&requirement.raw) {
                continue;
            }
            return Err(MergeError::AddedExists {
                capability: context.capability.clone(),
                requirement: requirement.name.clone(),
            });
        }
        let folded = fold_requirement_name(&key);
        if context
            .blocks
            .iter()
            .any(|block| fold_requirement_name(&block.name) == folded)
        {
            return Err(MergeError::AddedNearMiss {
                capability: context.capability.clone(),
                requirement: requirement.name.clone(),
            });
        }
        context.blocks.set(Block {
            name: key,
            raw: js_trim_end(&requirement.raw).to_string(),
        });
    }
    Ok(())
}
