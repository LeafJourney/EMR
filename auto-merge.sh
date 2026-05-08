#!/bin/bash
while true; do
  for pr in $(gh pr list --state open --json number --jq '.[].number'); do
    echo "Checking PR $pr..."
    gh pr merge $pr --auto --squash || true
  done
  sleep 15
done
