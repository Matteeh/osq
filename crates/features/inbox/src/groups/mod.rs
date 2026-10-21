//! The running and landed lines and the validator-failing item.

pub(crate) mod landed;
pub(crate) mod running;
pub(crate) mod validator;

use std::cmp::Ordering;

use osq_kernel_storage::ChangeSnapshot;

/// A change's id: its leading digits, else its folder name.
pub(crate) fn change_id(snapshot: &ChangeSnapshot) -> String {
    if snapshot.id.is_empty() {
        snapshot.folder.clone()
    } else {
        snapshot.id.clone()
    }
}

/// Orders two ids by leading number first, then by bytes.
pub(crate) fn compare_ids(left: &str, right: &str) -> Ordering {
    match (leading_number(left), leading_number(right)) {
        (Some(a), Some(b)) => a.cmp(&b).then_with(|| left.cmp(right)),
        _ => left.cmp(right),
    }
}

/// The number an id leads with, or `None` when it leads with no digit.
fn leading_number(id: &str) -> Option<u128> {
    let digits: String = id.chars().take_while(char::is_ascii_digit).collect();
    if digits.is_empty() {
        None
    } else {
        digits.parse().ok()
    }
}
