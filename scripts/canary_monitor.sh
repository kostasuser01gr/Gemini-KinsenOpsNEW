#!/bin/bash
set -e

WORKER_URL=$1
CHECK_DURATION=30
INTERVAL=5
ERROR_THRESHOLD=5

echo "Starting Canary Monitor for $WORKER_URL..."
ERROR_COUNT=0
START_TIME=$(date +%s)

while [ $(($(date +%s) - START_TIME)) -lt $CHECK_DURATION ]; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$WORKER_URL/healthz")
  if [ "$STATUS" != "200" ]; then
    ERROR_COUNT=$((ERROR_COUNT + 1))
    echo "Alert: Health check returned $STATUS. Error count: $ERROR_COUNT"
  fi
  
  if [ "$ERROR_COUNT" -ge "$ERROR_THRESHOLD" ]; then
    echo "CRITICAL: Error threshold exceeded! Triggering Auto-Rollback..."
    # Automated rollback via last stable tag
    STABLE_TAG=$(git tag -l "stable-*" | tail -n 1)
    if [ ! -z "$STABLE_TAG" ]; then
      bash scripts/rollback.sh "$STABLE_TAG"
      exit 1
    else
      echo "No stable tag found. Manual intervention required."
      exit 1
    fi
  fi
  
  sleep $INTERVAL
done

echo "Canary Monitoring Passed. No rollback needed."
