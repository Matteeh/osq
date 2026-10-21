#!/bin/sh
# A fake pi for preflight tests: version text, auth text and auth delays.
if [ "$1" = "--version" ]; then
    if [ -n "${FAKE_PI_VERSION:-}" ]; then
        printf '%s\n' "$FAKE_PI_VERSION"
    fi
    if [ -n "${FAKE_PI_VERSION_STDERR:-}" ]; then
        printf '%s\n' "$FAKE_PI_VERSION_STDERR" >&2
    fi
    exit "${FAKE_PI_VERSION_EXIT:-0}"
fi
if [ "$1" = "auth" ]; then
    for argument in "$@"; do
        printf '%s\n' "$argument"
    done > auth-args.txt
    if [ "${FAKE_PI_AUTH_WAIT:-}" = "1" ]; then
        sleep 10
    fi
    if [ -n "${FAKE_PI_AUTH:-}" ]; then
        printf '%s\n' "$FAKE_PI_AUTH"
    fi
    exit "${FAKE_PI_AUTH_EXIT:-0}"
fi
exit 1
