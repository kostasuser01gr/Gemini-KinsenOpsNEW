#!/bin/bash
set -e

# Usage: bash anonymize.sh <INPUT_FILE> <OUTPUT_FILE>
INPUT=$1
OUTPUT=$2

if [ -z "$INPUT" ] || [ -z "$OUTPUT" ]; then
  echo "Usage: anonymize.sh <INPUT_FILE> <OUTPUT_FILE>"
  exit 1
fi

echo "Anonymizing PII from $INPUT..."

# Masking emails and removing passwords
zcat "$INPUT" | jq '
  .users |= map(
    .email = (.email | split("@")[0] | "user_" + .[:3] + "****@" + (.email | split("@")[1]))
    | del(.password_hash)
  )
  | .exported_at = "anonymized_$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
' | gzip > "$OUTPUT"

echo "Anonymized backup created: $OUTPUT"
sha256sum "$OUTPUT" > "$OUTPUT.sha256"
