#!/usr/bin/env bash
set -e
# These experiments have produced SIGSEGV. Never produce process-memory dumps.
ulimit -c 0
exec "$@"
