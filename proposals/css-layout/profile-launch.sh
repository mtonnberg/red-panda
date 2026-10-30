#!/bin/sh
exec /workspace/shared/rea-tools/node_modules/.bin/node --cpu-prof --cpu-prof-dir=/tmp/red-panda-flow-cpu-profiles --experimental-vm-modules /tmp/red-panda-horizontal-layout-s4qsz9zw/bin/red-panda.js "$@"
