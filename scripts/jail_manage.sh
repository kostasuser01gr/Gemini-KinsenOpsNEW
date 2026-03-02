#!/bin/bash
set -e

ACTION=$1
IP=$2
JAIL_KV_ID="your-jail-kv-id-placeholder" # To be filled after provision

if [ "$ACTION" == "list" ]; then
  echo "Listing Jailed IPs..."
  npx wrangler kv:key list --namespace-id "$JAIL_KV_ID" --prefix "jail:"
elif [ "$ACTION" == "release" ]; then
  if [ -z "$IP" ]; then echo "Usage: jail_manage.sh release <IP>"; exit 1; fi
  echo "Releasing IP $IP from jail..."
  npx wrangler kv:key delete --namespace-id "$JAIL_KV_ID" "jail:$IP"
  echo "IP $IP released."
else
  echo "Usage: jail_manage.sh [list|release]"
  exit 1
fi
