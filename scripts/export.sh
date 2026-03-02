#!/bin/bash
# export.sh - Export Ops Copilot data via CLI

API_URL="https://car-rental-api.dataos-api.workers.dev"
TOKEN=""
OUT="export.json"

while [[ "$#" -gt 0 ]]; do
    case $1 in
        --token) TOKEN="$2"; shift ;;
        --out) OUT="$2"; shift ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
    shift
done

if [ -z "$TOKEN" ]; then
    echo "Usage: ./export.sh --token <SESSION_ID> [--out <FILENAME>]"
    exit 1
fi

curl -H "Authorization: Bearer $TOKEN" "$API_URL/api/admin/export" -o "$OUT"
echo "Export saved to $OUT"
