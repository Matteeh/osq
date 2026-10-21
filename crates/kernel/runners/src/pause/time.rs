//! Reading and writing the fixed `YYYY-MM-DDTHH:MM:SS.mmmZ` UTC time form.
//!
//! Implements: rust-runners/usage-limit-pause-time

/// The fixed-form separator bytes, by their offset in a timestamp.
const SEPARATORS: [(usize, u8); 7] = [
    (4, b'-'),
    (7, b'-'),
    (10, b'T'),
    (13, b':'),
    (16, b':'),
    (19, b'.'),
    (23, b'Z'),
];

/// The milliseconds in one day.
const MILLIS_PER_DAY: i64 = 86_400_000;

/// The milliseconds in one second.
const MILLIS_PER_SECOND: i64 = 1000;

/// The seconds in one minute.
const SECONDS_PER_MINUTE: i64 = 60;

/// The minutes in one hour.
const MINUTES_PER_HOUR: i64 = 60;

/// The hours in one day.
const HOURS_PER_DAY: i64 = 24;

/// The epoch milliseconds of a fixed-form UTC timestamp.
pub(super) fn parse_timestamp_ms(text: &str) -> Option<i64> {
    let bytes = text.as_bytes();
    if bytes.len() != 24 || !has_separators(bytes) {
        return None;
    }
    let year = number(&bytes[0..4])?;
    let month = number(&bytes[5..7])?;
    let day = number(&bytes[8..10])?;
    let hour = number(&bytes[11..13])?;
    let minute = number(&bytes[14..16])?;
    let second = number(&bytes[17..19])?;
    let millis = number(&bytes[20..23])?;
    if !(1..=12).contains(&month) || !(1..=days_in_month(year, month)).contains(&day) {
        return None;
    }
    if hour > 23 || minute > 59 || second > 59 {
        return None;
    }
    let days = days_from_civil(year, month, day);
    let seconds =
        ((days * HOURS_PER_DAY + hour) * MINUTES_PER_HOUR + minute) * SECONDS_PER_MINUTE + second;
    Some(seconds * MILLIS_PER_SECOND + millis)
}

/// Writes epoch milliseconds back as a fixed-form UTC timestamp.
pub(super) fn format_timestamp_ms(ms: i64) -> String {
    let days = ms.div_euclid(MILLIS_PER_DAY);
    let millis_of_day = ms.rem_euclid(MILLIS_PER_DAY);
    let (year, month, day) = civil_from_days(days);
    let second_of_day = millis_of_day / MILLIS_PER_SECOND;
    let millis = millis_of_day % MILLIS_PER_SECOND;
    let hour = second_of_day / (MINUTES_PER_HOUR * SECONDS_PER_MINUTE);
    let minute = second_of_day % (MINUTES_PER_HOUR * SECONDS_PER_MINUTE) / SECONDS_PER_MINUTE;
    let second = second_of_day % SECONDS_PER_MINUTE;
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{millis:03}Z")
}

/// Whether the fixed-form separators sit where the format puts them.
fn has_separators(bytes: &[u8]) -> bool {
    SEPARATORS
        .iter()
        .all(|(index, expected)| bytes.get(*index) == Some(expected))
}

/// Parses a fixed-width run of ASCII digits.
fn number(bytes: &[u8]) -> Option<i64> {
    let mut value: i64 = 0;
    for byte in bytes {
        if !byte.is_ascii_digit() {
            return None;
        }
        value = value * 10 + i64::from(byte - b'0');
    }
    Some(value)
}

/// The days in a month, with February's leap day.
fn days_in_month(year: i64, month: i64) -> i64 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        _ if is_leap(year) => 29,
        _ => 28,
    }
}

/// Whether a year has a February 29.
fn is_leap(year: i64) -> bool {
    year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
}

/// Days from 1970-01-01 to a civil date.
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = year.div_euclid(400);
    let year_of_era = year - era * 400;
    let offset = if month > 2 { month - 3 } else { month + 9 };
    let day_of_year = (153 * offset + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}

/// The civil date at a day count from 1970-01-01.
fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let shifted = days + 719_468;
    let era = shifted.div_euclid(146_097);
    let day_of_era = shifted - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
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
