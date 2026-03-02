#!/bin/bash
# import.sh - Import Ops Copilot data via CLI

API_URL="https://car-rental-api.dataos-api.workers.dev"
TOKEN=""
IN="export.json"

while [[ "$#" -gt 0 ]]; do
    case $1 in
        --token) TOKEN="$2"; shift ;;
        --in) IN="$2"; shift ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
    shift
done

if [ -z "$TOKEN" ]; then
    echo "Usage: ./import.sh --token <SESSION_ID> [--in <FILENAME>]"
    exit 1
fi

curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d @"$IN" "$API_URL/api/admin/import"
echo "Import completed."
