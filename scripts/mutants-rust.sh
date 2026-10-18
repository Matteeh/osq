#!/bin/sh
# Run cargo-mutants over the Rust workspace (ADR 024), or over one diff's lines.
#
# With one argument, only the mutants in lines that diff touches are tested; the
# path is resolved from the caller's directory before this script changes
# directory. OSQ_MUTANTS_JOBS sets the job count, 4 by default. The output goes
# to a temporary folder outside the source tree, removed on exit. cargo-mutants'
# status is this script's status, so a missed mutant (2), a timeout (3) or
# unmutated tests that fail (4) fail it.
set -eu

diff_file=""
if [ "$#" -gt 0 ]; then
    diff_file="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
fi

cd "$(dirname "$0")/.."

output="$(mktemp -d)"
trap 'rm -rf "$output"' EXIT

set -- --workspace --jobs "${OSQ_MUTANTS_JOBS:-4}" --output "$output"
if [ -n "$diff_file" ]; then
    set -- "$@" --in-diff "$diff_file"
fi

cargo mutants "$@"
