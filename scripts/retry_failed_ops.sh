#!/bin/bash
set -euo pipefail

DB_NAME=${1:-ops-db}
WORKER_URL=${2:-}
ADMIN_TOKEN=${3:-}

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required"
  exit 1
fi

echo "=> Checking retry_queue for due operations..."
ROWS=$(npx wrangler d1 execute "$DB_NAME" \
  --remote \
  -c apps/worker/wrangler.toml \
  --json \
  --command "SELECT id, scope, payload_json, attempt_count FROM retry_queue WHERE next_attempt_at <= CURRENT_TIMESTAMP ORDER BY next_attempt_at ASC LIMIT 20;")

COUNT=$(echo "$ROWS" | jq '.[0].results | length')
if [ "$COUNT" -eq 0 ]; then
  echo "✅ No failed operations in queue."
  exit 0
fi

echo "Found $COUNT queued operations"

echo "$ROWS" | jq -c '.[0].results[]' | while read -r row; do
  ID=$(echo "$row" | jq -r '.id')
  SCOPE=$(echo "$row" | jq -r '.scope')
  PAYLOAD=$(echo "$row" | jq -c '.payload_json | fromjson? // {}')
  ATTEMPT=$(echo "$row" | jq -r '.attempt_count')

  echo "Replaying op=$ID scope=$SCOPE attempt=$ATTEMPT"

  STATUS=1
  if [ -n "$WORKER_URL" ] && [ -n "$ADMIN_TOKEN" ]; then
    case "$SCOPE" in
      chat_message)
        THREAD_ID=$(echo "$PAYLOAD" | jq -r '.thread_id // "retry-thread"')
        CONTENT=$(echo "$PAYLOAD" | jq -r '.content // "retry"')
        curl -sSf -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
          -H "Idempotency-Key: retry-$ID" \
          -d "{\"thread_id\":\"$THREAD_ID\",\"content\":\"$CONTENT\"}" \
          "$WORKER_URL/api/v1/chat/message" >/dev/null && STATUS=0 || STATUS=1
        ;;
      *)
        echo "Unknown scope '$SCOPE', marking for delayed retry"
        STATUS=1
        ;;
    esac
  fi

  if [ "$STATUS" -eq 0 ]; then
    npx wrangler d1 execute "$DB_NAME" --remote -c apps/worker/wrangler.toml \
      --command "DELETE FROM retry_queue WHERE id = '$ID';" >/dev/null
    echo "  -> applied"
  else
    npx wrangler d1 execute "$DB_NAME" --remote -c apps/worker/wrangler.toml \
      --command "UPDATE retry_queue SET attempt_count = attempt_count + 1, next_attempt_at = datetime('now', '+10 minutes'), last_error = 'replay_failed' WHERE id = '$ID';" >/dev/null
    echo "  -> deferred"
  fi
done
