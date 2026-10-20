//! Reading functions out of item-level macros such as `proptest!`.

use proc_macro2::{Delimiter, Group, TokenTree};

use super::{CodeItem, collect, doc_tags};

/// Appends each function `mac` declares among its top-level tokens.
pub(super) fn items(mac: &syn::Macro, prefix: &[String], out: &mut Vec<CodeItem>) {
    let tokens: Vec<TokenTree> = mac.tokens.clone().into_iter().collect();
    for index in 0..tokens.len().saturating_sub(1) {
        let TokenTree::Ident(word) = &tokens[index] else {
            continue;
        };
        if word != "fn" {
            continue;
        }
        let TokenTree::Ident(name) = &tokens[index + 1] else {
            continue;
        };
        let attrs = attributes_before(&tokens, index);
        out.push(CodeItem {
            name: collect::qualified(prefix, &name.to_string()),
            line: name.span().start().line,
            public: false,
            test: attrs.iter().any(|group| doc_tags::group_is_test(group)),
            tags: attrs
                .iter()
                .flat_map(|group| doc_tags::from_group(group))
                .collect(),
        });
    }
}

/// The `#[...]` groups directly before an item, in source order.
fn attributes_before(tokens: &[TokenTree], item: usize) -> Vec<&Group> {
    let mut groups = Vec::new();
    let mut index = item;
    while index > 0 {
        let previous = index - 1;
        if is_modifier(&tokens[previous]) {
            index = previous;
            continue;
        }
        let TokenTree::Group(group) = &tokens[previous] else {
            break;
        };
        let hash = previous
            .checked_sub(1)
            .is_some_and(|hash| is_hash(&tokens[hash]));
        if group.delimiter() != Delimiter::Bracket || !hash {
            break;
        }
        groups.push(group);
        index = previous - 1;
    }
    groups.reverse();
    groups
}

/// Whether a token is one of the words allowed between attributes and `fn`.
fn is_modifier(token: &TokenTree) -> bool {
    let TokenTree::Ident(word) = token else {
        return false;
    };
    matches!(
        word.to_string().as_str(),
        "pub" | "async" | "const" | "unsafe"
    )
}

/// Whether a token is the `#` that opens an outer attribute.
fn is_hash(token: &TokenTree) -> bool {
    let TokenTree::Punct(punct) = token else {
        return false;
    };
    punct.as_char() == '#'
}
