//! Reading the `Implements:`, `Covers:` and `Adr:` doc tags of Rust source.

mod collect;
mod doc_tags;
mod item_macros;

use std::path::PathBuf;

use crate::scan::ScanError;

/// The kind of a doc tag.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TagKind {
    /// An `Implements: <requirement>` line.
    Implements,
    /// A `Covers: <scenario>` line.
    Covers,
    /// An `Adr: <number>` line.
    Adr,
}

/// One tag line of a doc attribute.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Tag {
    /// The tag's kind.
    pub kind: TagKind,
    /// The text after the tag word, trimmed.
    pub target: String,
    /// The 1-based line where the doc attribute starts.
    pub line: usize,
}

/// One item a source declares, with its name, line, flags and tags.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CodeItem {
    /// The item's name, qualified by its module, trait or impl.
    pub name: String,
    /// The 1-based line of the item's name.
    pub line: usize,
    /// Whether the item, or the trait that declares it, is bare `pub`.
    pub public: bool,
    /// Whether the item is a function.
    pub function: bool,
    /// Whether the item is a function carrying a test attribute.
    pub test: bool,
    /// The tags of the item's outer doc attributes, in source order.
    pub tags: Vec<Tag>,
}

/// The tags of a file and every item it declares, in source order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CodeTags {
    /// The tags of the file's and its inline modules' inner doc attributes.
    pub file_tags: Vec<Tag>,
    /// The items of the file, in source order.
    pub items: Vec<CodeItem>,
}

/// Reads the tags of one Rust source and every item it declares.
///
/// # Errors
///
/// Returns `ScanError::Parse` when `source` does not parse.
///
/// Implements: rust-linter/code-tags
pub fn code_tags(file: &str, source: &str) -> Result<CodeTags, ScanError> {
    let syntax = syn::parse_file(source).map_err(|error| ScanError::Parse {
        path: PathBuf::from(file),
        line: error.span().start().line,
        message: error.to_string(),
    })?;
    let mut file_tags = doc_tags::inner(&syntax.attrs);
    let mut items = Vec::new();
    collect::items(&syntax.items, &[], &mut items, &mut file_tags);
    Ok(CodeTags { file_tags, items })
}
