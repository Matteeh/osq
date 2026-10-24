//! Writing costs as JavaScript's `toFixed` and `formatReportedCost` write them.
//!
//! Implements: rust-report/report-cost-text

/// A cost's reported text: `not reported` only when nothing reported a cost.
///
/// Implements: rust-report/report-cost-text
pub(crate) fn reported_cost(total: f64, reported_count: u64) -> String {
    if total == 0.0 && reported_count == 0 {
        return "not reported".to_owned();
    }
    cost(total)
}

/// A total as a dollar amount with JavaScript's `toFixed` decimals.
///
/// Implements: rust-report/report-cost-text
fn cost(total: f64) -> String {
    let decimals = if total >= 0.01 { 2 } else { 4 };
    format!("${}", fixed(total, decimals))
}

/// A number with `decimals` digits, rounding a tie away from zero.
fn fixed(value: f64, decimals: usize) -> String {
    let negative = value < 0.0;
    let scale = 10_f64.powi(i32::try_from(decimals).expect("a digit count fits in an i32"));
    let rounded = (value.abs() * scale).round();
    let digits = format!("{rounded:.0}");
    let (whole, fraction) = if digits.len() <= decimals {
        (
            "0".to_owned(),
            format!("{}{}", "0".repeat(decimals - digits.len()), digits),
        )
    } else {
        let split = digits.len() - decimals;
        (digits[..split].to_owned(), digits[split..].to_owned())
    };
    let text = format!("{whole}.{fraction}");
    if negative { format!("-{text}") } else { text }
}
