//! The UTC rejection timestamp, as `YYYY-MM-DDTHH:MM:SS.mmmZ`.

use std::time::{SystemTime, UNIX_EPOCH};

/// Milliseconds in one day.
const MILLIS_PER_DAY: i64 = 86_400_000;

/// Milliseconds in one second.
const MILLIS_PER_SECOND: i64 = 1_000;

/// Seconds in one hour.
const SECONDS_PER_HOUR: i64 = 3_600;

/// Seconds in one minute.
const SECONDS_PER_MINUTE: i64 = 60;

/// The current UTC time as `YYYY-MM-DDTHH:MM:SS.mmmZ`.
///
/// Implements: rust-approve/rejection-record
pub(crate) fn now() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| {
            i64::try_from(elapsed.as_millis()).unwrap_or(i64::MAX)
        });
    format_millis(millis)
}

/// Turns epoch milliseconds into a fixed-form UTC timestamp.
///
/// Implements: rust-approve/rejection-record
pub(crate) fn format_millis(millis: i64) -> String {
    let days = millis.div_euclid(MILLIS_PER_DAY);
    let millis_of_day = millis.rem_euclid(MILLIS_PER_DAY);
    let (year, month, day) = civil_from_days(days);
    let second_of_day = millis_of_day / MILLIS_PER_SECOND;
    let millis = millis_of_day % MILLIS_PER_SECOND;
    let hour = second_of_day / SECONDS_PER_HOUR;
    let minute = second_of_day % SECONDS_PER_HOUR / SECONDS_PER_MINUTE;
    let second = second_of_day % SECONDS_PER_MINUTE;
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{millis:03}Z")
}

/// The civil date at a day count from 1970-01-01.
fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let shifted = days + 719_468;
    let era = shifted.div_euclid(146_097);
    let day_of_era = shifted - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_index = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_index + 2) / 5 + 1;
    let month = if month_index < 10 {
        month_index + 3
    } else {
        month_index - 9
    };
    (if month <= 2 { year + 1 } else { year }, month, day)
}
