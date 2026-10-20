//! Walking a file's items in source order.

use syn::{Attribute, ImplItem, Item, TraitItem, Visibility};

use super::{CodeItem, Tag, doc_tags, item_macros};

/// Appends each item of `items`, and each item nested in it, to `out`.
pub(super) fn items(
    items: &[Item],
    prefix: &[String],
    out: &mut Vec<CodeItem>,
    file_tags: &mut Vec<Tag>,
) {
    for item in items {
        one(item, prefix, out, file_tags);
    }
}

/// Appends one item, and each item nested in it, to `out`.
fn one(item: &Item, prefix: &[String], out: &mut Vec<CodeItem>, file_tags: &mut Vec<Tag>) {
    match item {
        Item::Fn(item) => out.push(leaf(
            &item.attrs,
            qualified(prefix, &item.sig.ident.to_string()),
            item.sig.ident.span(),
            public(&item.vis),
            true,
            is_test(&item.attrs),
        )),
        Item::Const(item) => out.push(leaf(
            &item.attrs,
            qualified(prefix, &item.ident.to_string()),
            item.ident.span(),
            public(&item.vis),
            false,
            false,
        )),
        Item::Static(item) => out.push(leaf(
            &item.attrs,
            qualified(prefix, &item.ident.to_string()),
            item.ident.span(),
            public(&item.vis),
            false,
            false,
        )),
        Item::Struct(item) => out.push(named(&item.attrs, prefix, &item.ident, &item.vis)),
        Item::Enum(item) => out.push(named(&item.attrs, prefix, &item.ident, &item.vis)),
        Item::Union(item) => out.push(named(&item.attrs, prefix, &item.ident, &item.vis)),
        Item::Type(item) => out.push(named(&item.attrs, prefix, &item.ident, &item.vis)),
        Item::Trait(item) => trait_item(item, prefix, out),
        Item::Impl(item) => impl_item(item, prefix, out),
        Item::Mod(item) => module(item, prefix, out, file_tags),
        Item::Macro(item) if !item.mac.path.is_ident("macro_rules") => {
            item_macros::items(&item.mac, prefix, out);
        }
        _ => {}
    }
}

/// Appends a struct, enum, union or type alias, which is never a test.
fn named(attrs: &[Attribute], prefix: &[String], ident: &syn::Ident, vis: &Visibility) -> CodeItem {
    leaf(
        attrs,
        qualified(prefix, &ident.to_string()),
        ident.span(),
        public(vis),
        false,
        false,
    )
}

/// Appends a trait, then each function and constant it declares.
fn trait_item(item: &syn::ItemTrait, prefix: &[String], out: &mut Vec<CodeItem>) {
    let public = public(&item.vis);
    out.push(named(&item.attrs, prefix, &item.ident, &item.vis));
    let mut inner = prefix.to_vec();
    inner.push(item.ident.to_string());
    for nested in &item.items {
        match nested {
            TraitItem::Fn(nested) => out.push(leaf(
                &nested.attrs,
                qualified(&inner, &nested.sig.ident.to_string()),
                nested.sig.ident.span(),
                public,
                true,
                is_test(&nested.attrs),
            )),
            TraitItem::Const(nested) => out.push(leaf(
                &nested.attrs,
                qualified(&inner, &nested.ident.to_string()),
                nested.ident.span(),
                public,
                false,
                false,
            )),
            _ => {}
        }
    }
}

/// Appends each function and constant of an `impl` block with its visibility.
fn impl_item(item: &syn::ItemImpl, prefix: &[String], out: &mut Vec<CodeItem>) {
    let mut inner = prefix.to_vec();
    inner.push(impl_container(item));
    for nested in &item.items {
        match nested {
            ImplItem::Fn(nested) => out.push(leaf(
                &nested.attrs,
                qualified(&inner, &nested.sig.ident.to_string()),
                nested.sig.ident.span(),
                public(&nested.vis),
                true,
                is_test(&nested.attrs),
            )),
            ImplItem::Const(nested) => out.push(leaf(
                &nested.attrs,
                qualified(&inner, &nested.ident.to_string()),
                nested.ident.span(),
                public(&nested.vis),
                false,
                false,
            )),
            _ => {}
        }
    }
}

/// Appends a module and, when it is inline, each item it declares.
fn module(
    item: &syn::ItemMod,
    prefix: &[String],
    out: &mut Vec<CodeItem>,
    file_tags: &mut Vec<Tag>,
) {
    out.push(named(&item.attrs, prefix, &item.ident, &item.vis));
    let Some((_, nested)) = &item.content else {
        return;
    };
    file_tags.extend(doc_tags::inner(&item.attrs));
    let mut inner = prefix.to_vec();
    inner.push(item.ident.to_string());
    items(nested, &inner, out, file_tags);
}

/// Builds one item with its tags.
fn leaf(
    attrs: &[Attribute],
    name: String,
    span: proc_macro2::Span,
    public: bool,
    function: bool,
    test: bool,
) -> CodeItem {
    CodeItem {
        name,
        line: span.start().line,
        public,
        function,
        test,
        tags: doc_tags::outer(attrs),
    }
}

/// Prefixes a name with the modules around it, joined by `::`.
pub(super) fn qualified(prefix: &[String], name: &str) -> String {
    if prefix.is_empty() {
        name.to_owned()
    } else {
        format!("{}::{name}", prefix.join("::"))
    }
}

/// Whether a visibility is a bare `pub`.
fn public(vis: &Visibility) -> bool {
    matches!(vis, Visibility::Public(_))
}

/// Whether an attribute list holds a test attribute.
fn is_test(attrs: &[Attribute]) -> bool {
    attrs.iter().any(|attr| doc_tags::is_test(&attr.meta))
}

/// Names an `impl` block by its self type, and its trait in a trait `impl`.
fn impl_container(item: &syn::ItemImpl) -> String {
    let self_name = type_last(&item.self_ty).unwrap_or_else(|| "_".to_owned());
    match &item.trait_ {
        Some((_, path, _)) => {
            let trait_name = path
                .segments
                .last()
                .map_or_else(|| "_".to_owned(), |segment| segment.ident.to_string());
            format!("<{self_name} as {trait_name}>")
        }
        None => self_name,
    }
}

/// The last path segment of a type, or none when it is not a path.
fn type_last(ty: &syn::Type) -> Option<String> {
    let syn::Type::Path(path) = ty else {
        return None;
    };
    path.path
        .segments
        .last()
        .map(|segment| segment.ident.to_string())
}
