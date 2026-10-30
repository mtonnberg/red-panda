#!/bin/sh
exec /workspace/shared/rea-tools/node_modules/.bin/node --cpu-prof --cpu-prof-dir=/tmp/red-panda-layout-revision-cpu-dmhc_jfb --experimental-vm-modules /tmp/red-panda-layout-perf-working-cq5f9qi8/bin/red-panda.js "$@"
