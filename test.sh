#!/usr/bin/env bash

sh -c 'killall -9 node; sleep 1; pushd ~/projects/node-videos/;$(find . -type f -name "*.log" -exec rm -rf {} \;);sleep 1; sh FxBranchStream.sh; popd;'