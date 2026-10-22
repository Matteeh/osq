//! Living capability names, declared creations and name resemblance.

use std::fs;
use std::path::Path;

use osq_kernel_specs::js_trim;
use yaml_rust2::Yaml;
use yaml_rust2::yaml::Hash;

/// The living capability names under `<root>/<openspec>/specs` that hold a spec.
pub(super) fn living_names(root: &Path, openspec: &Path) -> Vec<String> {
    let directory = root.join(openspec).join("specs");
    let Ok(entries) = fs::read_dir(directory) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .filter(|entry| entry.path().join("spec.md").is_file())
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    names
}

/// The proposal's declared `creates` names, or none when malformed.
pub(super) fn declared_creates(data: &Hash) -> Vec<String> {
    let Some(value) = data.get(&Yaml::String("creates".to_owned())) else {
        return Vec::new();
    };
    let Yaml::Array(entries) = value else {
        return Vec::new();
    };
    let mut names = Vec::new();
    for entry in entries {
        if let Yaml::String(text) = entry {
            names.push(js_trim(text).to_owned());
            continue;
        }
        let Yaml::Hash(fields) = entry else {
            return Vec::new();
        };
        let (Some(Yaml::String(name)), Some(Yaml::String(_group))) = (
            fields.get(&Yaml::String("name".to_owned())),
            fields.get(&Yaml::String("group".to_owned())),
        ) else {
            return Vec::new();
        };
        names.push(js_trim(name).to_owned());
    }
    names
}

/// The first living name, in name order, that `name` resembles.
pub(super) fn resembling_capability(name: &str, living: &[String]) -> Option<String> {
    let mut ordered = living.to_vec();
    ordered.sort();
    ordered
        .into_iter()
        .find(|candidate| names_resemble(name, candidate))
}

/// Whether two capability names resemble each other.
fn names_resemble(name: &str, other: &str) -> bool {
    if strip_separators(name) == strip_separators(other) {
        return true;
    }
    let name_words = words(name);
    let other_words = words(other);
    if !name_words.is_empty()
        && !other_words.is_empty()
        && (is_subset(&name_words, &other_words) || is_subset(&other_words, &name_words))
    {
        return true;
    }
    if name.len() >= 5 && other.len() >= 5 {
        return edit_distance(name, other) <= 2;
    }
    false
}

/// A name without its hyphens and underscores.
fn strip_separators(name: &str) -> String {
    name.chars()
        .filter(|character| !matches!(character, '-' | '_'))
        .collect()
}

/// A name's non-empty words, split on hyphens and underscores.
fn words(name: &str) -> Vec<&str> {
    name.split(['-', '_'])
        .filter(|word| !word.is_empty())
        .collect()
}

/// Whether every word of `left` appears in `right`.
fn is_subset(left: &[&str], right: &[&str]) -> bool {
    left.iter().all(|word| right.contains(word))
}

/// The Levenshtein edit distance between two names.
fn edit_distance(left: &str, right: &str) -> usize {
    let right: Vec<char> = right.chars().collect();
    let mut previous: Vec<usize> = (0..=right.len()).collect();
    for (row, left_character) in left.chars().enumerate() {
        let mut diagonal = previous[0];
        previous[0] = row.saturating_add(1);
        for (column, right_character) in right.iter().enumerate() {
            let saved = previous[column.saturating_add(1)];
            let cost = usize::from(left_character != *right_character);
            let above = previous[column].saturating_add(1);
            let left_side = previous[column.saturating_add(1)].saturating_add(1);
            previous[column.saturating_add(1)] =
                above.min(left_side).min(diagonal.saturating_add(cost));
            diagonal = saved;
        }
    }
    previous[right.len()]
}
