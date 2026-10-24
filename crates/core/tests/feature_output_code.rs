//! Proves the exit code an `Output` carries.

use osq_core::Output;

/// Proves every row of "Output exit codes".
///
/// Covers: rust-core/output-exit-codes
#[test]
fn output_exit_codes() {
    let cases: [(Output, &str, i32); 3] = [
        (Output::text("a b"), "a b", 0),
        (Output::with_code("bad", 1), "bad", 1),
        (Output::with_code("odd", 3), "odd", 3),
    ];
    for (output, text, code) in cases {
        assert_eq!(output.text, text, "{output:?}");
        assert_eq!(output.code, code, "{output:?}");
    }
}
