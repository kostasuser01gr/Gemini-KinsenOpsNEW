#!/bin/bash
set -euo pipefail

ACTION=${1:-}
IP=${2:-}

if [ -z "$ACTION" ]; then
  echo "Usage: jail_manage.sh [list|release] [IP]"
  exit 1
fi

case "$ACTION" in
  list)
    echo "Listing jailed keys from JAIL namespace..."
    npx wrangler kv:key list --binding JAIL -c apps/worker/wrangler.toml --prefix "jail:"
    ;;
  release)
    if [ -z "$IP" ]; then
      echo "Usage: jail_manage.sh release <IP>"
      exit 1
    fi
    echo "Releasing IP $IP from jail..."
    npx wrangler kv:key delete --binding JAIL -c apps/worker/wrangler.toml "jail:$IP"
    echo "IP $IP released."
    ;;
  *)
    echo "Usage: jail_manage.sh [list|release] [IP]"
    exit 1
    ;;
esac
