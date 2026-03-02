#!/bin/bash
set -e

# Usage: bash incident_collect.sh <BASE_URL> <ADMIN_TOKEN>
BASE_URL=$1
ADMIN_TOKEN=$2

if [ -z "$BASE_URL" ] || [ -z "$ADMIN_TOKEN" ]; then
  echo "Usage: incident_collect.sh <BASE_URL> <ADMIN_TOKEN>"
  exit 1
fi

REPORT_DIR="incident_reports"
mkdir -p "$REPORT_DIR"
REPORT_FILE="$REPORT_DIR/report_$(date +%Y%m%d_%H%M%S).json"

echo "Collecting incident data..."

# Fetch admin report
REPORT_JSON=$(curl -s -f -H "Cookie: session=$ADMIN_TOKEN" "$BASE_URL/api/admin/report")

# Fetch limits
LIMITS_JSON=$(curl -s -f "$BASE_URL/api/limits")

# Fetch quota/router status (simulated/placeholder)
QUOTA_JSON='{"status": "within_quota", "usage": "45%"}'

# Combine into one report
echo "{
  \"timestamp\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\",
  \"base_url\": \"$BASE_URL\",
  \"admin_report\": $REPORT_JSON,
  \"limits\": $LIMITS_JSON,
  \"quota\": $QUOTA_JSON,
  \"last_deploy\": \"$(git log -1 --format=%cd)\"
}" | jq . > "$REPORT_FILE"

echo "Incident report collected: $REPORT_FILE"
