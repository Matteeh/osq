#!/bin/sh
# A fake pi for doctor tests: acts out the fake-pi-* files in its working directory.
if [ "$1" = "--version" ]; then
    if [ -f fake-pi-version-once ]; then
        if [ -f fake-pi-version-ran ]; then
            exit 1
        fi
        : > fake-pi-version-ran
    fi
    if [ -f fake-pi-version-wait ]; then
        sleep 10
    fi
    if [ -f fake-pi-version ]; then
        cat fake-pi-version
    fi
    if [ -f fake-pi-version-stderr ]; then
        cat fake-pi-version-stderr >&2
    fi
    exit "$(cat fake-pi-version-exit 2>/dev/null || echo 0)"
fi
if [ "$1" = "auth" ]; then
    if [ -f fake-pi-auth ]; then
        cat fake-pi-auth
    fi
    exit "$(cat fake-pi-auth-exit 2>/dev/null || echo 0)"
fi
exit 1
