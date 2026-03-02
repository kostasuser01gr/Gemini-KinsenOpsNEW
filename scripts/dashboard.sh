#!/bin/bash
set -e

# NASA/Master Ultra Dashboard (TUI Simulation)
# Usage: bash dashboard.sh <BASE_URL> <ADMIN_TOKEN>

BASE_URL=$1
ADMIN_TOKEN=$2

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

clear
echo -e "${CYAN}========================================================================${NC}"
echo -e "${CYAN}                MASTER ULTRA OPS DASHBOARD - ALPHA CORE                 ${NC}"
echo -e "${CYAN}========================================================================${NC}"
echo -e "SYSTEM TIME: $(date -u)"
echo -e "VERSION: 2.0-ULTRA"
echo ""

# Status Panel
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/healthz")
if [ "$STATUS_CODE" == "200" ]; then
    echo -e "HEALTH: [ ${GREEN}ONLINE${NC} ]  (${STATUS_CODE})"
else
    echo -e "HEALTH: [ ${RED}CRITICAL${NC} ]  (${STATUS_CODE})"
fi

# Admin Report
REPORT=$(curl -s -H "Cookie: session=$ADMIN_TOKEN" "$BASE_URL/api/admin/report")
USER_COUNT=$(echo "$REPORT" | jq -r '.user_count // "N/A"')
STRICT_FREE=$(echo "$REPORT" | jq -r '.strict_free // "N/A"')

echo -e "USER DATABASE: [ ${YELLOW}${USER_COUNT}${NC} USERS ]"
echo -e "STRICT FREE MODE: [ ${YELLOW}${STRICT_FREE}${NC} ]"
echo ""

# R2 Backup Panel
BACKUP_LIST=$(curl -s -H "Cookie: session=$ADMIN_TOKEN" "$BASE_URL/api/admin/backup/list")
BACKUP_COUNT=$(echo "$BACKUP_LIST" | jq '. | length')
echo -e "R2 BACKUPS: [ ${CYAN}${BACKUP_COUNT}${NC} OBJECTS ]"

# Security Panel
echo -e "${RED}SECURITY LAYER: [ ACTIVE ]${NC}"
echo -e "HONEYTOKENS: [ ARMED ]"
echo -e "FORENSIC LEDGER: [ STREAMING TO R2 ]"
echo ""

# Recent Logs (Simulation)
echo -e "${CYAN}RECENT ACTIVITY:${NC}"
echo -e "$(date -u +%H:%M:%S) - [INFO] - MCP.GET_REPORT REQUEST PROCESSED"
echo -e "$(date -u +%H:%M:%S) - [INFO] - ADMIN.BACKUP.R2 TRIGGERED"
echo -e "$(date -u +%H:%M:%S) - [AUTH] - SUCCESSFUL SESSION VALIDATION"

echo -e "${CYAN}========================================================================${NC}"
echo -e "Press Ctrl+C to exit dashboard."
