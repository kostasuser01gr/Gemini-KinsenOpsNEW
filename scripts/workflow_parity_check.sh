#!/bin/bash
set -euo pipefail

WORKFLOW_DIR=.github/workflows
EXPECTED=main.yml

if [ ! -d "$WORKFLOW_DIR" ]; then
  echo "workflow directory missing"
  exit 1
fi

FILES=$(ls "$WORKFLOW_DIR")
COUNT=$(echo "$FILES" | wc -l | tr -d ' ')

if [ "$COUNT" -ne 1 ] || [ "$FILES" != "$EXPECTED" ]; then
  echo "workflow parity violation: expected only $EXPECTED, found:"
  ls "$WORKFLOW_DIR"
  exit 1
fi

echo "workflow parity ok"
