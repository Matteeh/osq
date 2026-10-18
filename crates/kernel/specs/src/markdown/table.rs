//! Reading of Markdown tables below scenario outcomes.

use super::text::{js_trim, js_trim_start};
use std::collections::BTreeMap;

/// True when a line, trimmed, starts and ends with a pipe.
fn is_table_line(line: &str) -> bool {
    let trimmed = js_trim(line);
    trimmed.starts_with('|') && trimmed.ends_with('|')
}

/// Splits one table row into its trimmed cells.
fn split_row(line: &str) -> Vec<String> {
    let trimmed = js_trim(line);
    let trimmed = trimmed.strip_prefix('|').unwrap_or(trimmed);
    let trimmed = trimmed.strip_suffix('|').unwrap_or(trimmed);
    trimmed
        .split('|')
        .map(|cell| js_trim(cell).to_string())
        .collect()
}

/// True for a cell made of dashes with an optional colon at either end.
fn is_separator_cell(cell: &str) -> bool {
    let cell = cell.strip_prefix(':').unwrap_or(cell);
    let cell = cell.strip_suffix(':').unwrap_or(cell);
    !cell.is_empty() && cell.chars().all(|c| c == '-')
}

/// True when every cell of a row is an alignment separator.
fn is_separator(line: &str) -> bool {
    split_row(line).iter().all(|cell| is_separator_cell(cell))
}

/// Reads the table directly under an outcome line, after any blank lines.
pub(crate) fn read_rows(lines: &[&str], start: usize) -> Option<Vec<BTreeMap<String, String>>> {
    let rest = lines.get(start..)?;
    let first = rest
        .iter()
        .position(|line| !js_trim_start(line).is_empty())?;
    let (header_line, table) = rest[first..].split_first()?;
    if !is_table_line(header_line) {
        return None;
    }
    let header = split_row(header_line);
    let table = match table.first() {
        Some(line) if is_separator(line) => &table[1..],
        _ => table,
    };
    let mut rows = Vec::new();
    for line in table {
        if !is_table_line(line) {
            break;
        }
        let cells = split_row(line);
        let mut row = BTreeMap::new();
        for (column, name) in header.iter().enumerate() {
            let cell = cells.get(column).cloned().unwrap_or_default();
            row.insert(name.clone(), cell);
        }
        rows.push(row);
    }
    Some(rows)
}
