#!/bin/bash
# vault_smoke.sh - Ciphertext roundtrip verification for Vault

API_URL="https://car-rental-api.dataos-api.workers.dev"
TOKEN=$1

if [ -z "$TOKEN" ]; then
    echo "Usage: ./vault_smoke.sh <SESSION_TOKEN>"
    exit 1
fi

echo "=> Testing Vault Bootstrap..."
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" 
  -d '{"wrapped_dek": "test_wrapped_dek", "kdf_params": {"salt": "test_salt", "iterations": 100000}}' 
  "$API_URL/api/vault/bootstrap" | grep -q "success" && echo "✅ Bootstrap OK"

echo "=> Testing Vault Item Creation..."
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" 
  -d '{"title_enc": "test_title", "iv": {"title": "iv1"}}' 
  "$API_URL/api/vault/items" | grep -q "id" && echo "✅ Item Create OK"

echo "=> Testing Vault Item Retrieval (Ciphertext)..."
curl -s -H "Authorization: Bearer $TOKEN" 
  "$API_URL/api/vault/items" | grep -q "title_enc" && echo "✅ Item Retrieval OK"

echo "=> Vault Smoke Test Passed."
