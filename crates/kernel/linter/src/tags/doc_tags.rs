//! Turning doc attributes into tags.

use proc_macro2::Group;
use syn::spanned::Spanned;
use syn::{Attribute, Expr, ExprLit, Lit, Meta};

use super::{Tag, TagKind};

/// The tags of a list's outer doc attributes.
pub(super) fn outer(attrs: &[Attribute]) -> Vec<Tag> {
    tags(attrs, false)
}

/// The tags of a list's inner doc attributes.
pub(super) fn inner(attrs: &[Attribute]) -> Vec<Tag> {
    tags(attrs, true)
}

/// The tags of the doc attributes on one side, outer or inner.
fn tags(attrs: &[Attribute], inner: bool) -> Vec<Tag> {
    let mut tags = Vec::new();
    for attr in attrs {
        let is_inner = matches!(attr.style, syn::AttrStyle::Inner(_));
        if is_inner != inner {
            continue;
        }
        tags.extend(from_meta(&attr.meta, attr.span().start().line));
    }
    tags
}

/// The tags one parsed meta item holds, reported at `line`.
pub(super) fn from_meta(meta: &Meta, line: usize) -> Vec<Tag> {
    let Meta::NameValue(value) = meta else {
        return Vec::new();
    };
    if !value.path.is_ident("doc") {
        return Vec::new();
    }
    let Expr::Lit(ExprLit {
        lit: Lit::Str(text),
        ..
    }) = &value.value
    else {
        return Vec::new();
    };
    text.value()
        .lines()
        .filter_map(|text| tag_line(text, line))
        .collect()
}

/// Whether a meta item is a test attribute, whose path ends in `test`.
pub(super) fn is_test(meta: &Meta) -> bool {
    let Meta::Path(path) = meta else {
        return false;
    };
    path.segments
        .last()
        .is_some_and(|segment| segment.ident == "test")
}

/// The tags of an attribute token group, reported at the group's line.
pub(super) fn from_group(group: &Group) -> Vec<Tag> {
    let Ok(meta) = syn::parse2::<Meta>(group.stream()) else {
        return Vec::new();
    };
    from_meta(&meta, group.span().start().line)
}

/// Whether an attribute token group is a test attribute.
pub(super) fn group_is_test(group: &Group) -> bool {
    syn::parse2::<Meta>(group.stream()).is_ok_and(|meta| is_test(&meta))
}

/// Builds the tag on one line of a doc attribute, or none when it names none.
fn tag_line(text: &str, line: usize) -> Option<Tag> {
    let text = text.trim();
    let (kind, rest) = if let Some(rest) = text.strip_prefix("Implements:") {
        (TagKind::Implements, rest)
    } else if let Some(rest) = text.strip_prefix("Covers:") {
        (TagKind::Covers, rest)
    } else {
        (TagKind::Adr, text.strip_prefix("Adr:")?)
    };
    Some(Tag {
        kind,
        target: rest.trim().to_owned(),
        line,
    })
}
