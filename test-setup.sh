#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# sysPass-Browser Test Environment Setup
#
# This script sets up a local sysPass instance for testing sysPass-Browser.
# It uses Docker or Podman (auto-detected) to run sysPass and MariaDB,
# then configures API access and creates test accounts automatically.
#
# WARNING: This is for testing purposes only. Do not expose this instance
#          to the internet. Use a sandboxed browser profile for testing.
# ============================================================================

SYSPASS_ADMIN_USER="admin"
SYSPASS_ADMIN_PASS="syspass12345"
SYSPASS_MASTER_PASS="master12345"
SYSPASS_DB_PASS="syspass"
SYSPASS_API_PASS="apipass12345"
SYSPASS_PORT_HTTP=9080
SYSPASS_PORT_HTTPS=9443
SYSPASS_URL="https://localhost:${SYSPASS_PORT_HTTPS}"
SYSPASS_API_URL="${SYSPASS_URL}/api.php"

# --- Auto-detect container runtime -------------------------------------------

if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
    RUNTIME="docker"
    COMPOSE="docker compose"
elif command -v podman &>/dev/null; then
    RUNTIME="podman"
    if command -v podman-compose &>/dev/null; then
        COMPOSE="podman-compose"
    else
        COMPOSE="podman compose"
    fi
else
    echo "ERROR: Neither Docker nor Podman is available."
    echo "Install one of them and try again."
    exit 1
fi

echo "Using container runtime: ${RUNTIME}"
echo "Using compose command:   ${COMPOSE}"

# --- Helpers ------------------------------------------------------------------

api_call() {
    local method="$1"
    local params="$2"
    local id="${3:-1}"
    curl -sk -X POST "${SYSPASS_API_URL}" \
        -H 'Content-Type: application/json' \
        -d "{\"jsonrpc\":\"2.0\",\"method\":\"${method}\",\"params\":${params},\"id\":${id}}" 2>/dev/null
}

wait_for_syspass() {
    echo -n "Waiting for sysPass to be ready"
    local max_attempts=60
    local attempt=0
    while [ $attempt -lt $max_attempts ]; do
        if curl -sk "${SYSPASS_URL}" &>/dev/null; then
            echo " OK"
            return 0
        fi
        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done
    echo " FAILED"
    echo "ERROR: sysPass did not start within $((max_attempts * 2)) seconds."
    exit 1
}

# --- Start containers ---------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}/docker"

echo ""
echo "=== Starting sysPass containers ==="
${COMPOSE} down -v 2>/dev/null || true
${COMPOSE} up -d

wait_for_syspass

# --- Run the sysPass installer ------------------------------------------------

echo ""
echo "=== Running sysPass web installer ==="

# The sysPass installer is a web form. We submit it via curl.
INSTALL_RESULT=$(curl -sk -X POST "${SYSPASS_URL}/index.php" \
    -d "install=true" \
    -d "adminlogin=${SYSPASS_ADMIN_USER}" \
    -d "adminpass=${SYSPASS_ADMIN_PASS}" \
    -d "masterpassword=${SYSPASS_MASTER_PASS}" \
    -d "dbhost=db" \
    -d "dbadmin=root" \
    -d "dbpass=${SYSPASS_DB_PASS}" \
    -d "dbname=syspass" \
    -d "hostingmode=0" \
    -c /tmp/syspass-cookies.txt \
    -w "%{http_code}" \
    -o /dev/null 2>/dev/null || echo "000")

if [ "$INSTALL_RESULT" = "000" ]; then
    echo "Note: Installer may have already run or requires manual setup."
    echo "Visit ${SYSPASS_URL} to complete setup if needed."
fi

# Wait for sysPass to restart after install
sleep 5
wait_for_syspass

# --- Log in and create API authorization --------------------------------------

echo ""
echo "=== Configuring API access ==="

# Log in to get a session
LOGIN_RESULT=$(curl -sk -X POST "${SYSPASS_URL}/index.php?r=login" \
    -d "user=${SYSPASS_ADMIN_USER}" \
    -d "pass=${SYSPASS_ADMIN_PASS}" \
    -c /tmp/syspass-cookies.txt \
    -b /tmp/syspass-cookies.txt \
    -w "%{http_code}" \
    -o /dev/null 2>/dev/null || echo "000")

echo "Login response: ${LOGIN_RESULT}"

# Create API authorization via the API itself (sysPass allows bootstrapping)
# First, try to search to see if the API is already configured
API_TEST=$(api_call "account/search" '{"authToken":"test-api-token-syspass-browser01","text":""}' 2>/dev/null || echo "error")

if echo "$API_TEST" | grep -q '"error"'; then
    echo "API token not yet configured."
    echo ""
    echo "============================================================"
    echo "MANUAL STEP REQUIRED: Create API Authorization"
    echo "============================================================"
    echo ""
    echo "1. Open ${SYSPASS_URL} in your browser"
    echo "2. Accept the self-signed certificate warning"
    echo "3. Log in with:"
    echo "     Username: ${SYSPASS_ADMIN_USER}"
    echo "     Password: ${SYSPASS_ADMIN_PASS}"
    echo "4. Go to Users & Access > API Authorizations"
    echo "5. Click 'New' and create an authorization:"
    echo "     User: admin"
    echo "     Password: ${SYSPASS_API_PASS}"
    echo "     Enable actions: account/search, account/viewPass,"
    echo "                     account/create, account/editPass"
    echo "6. Save and copy the API token"
    echo ""
    echo "Then create test accounts:"
    echo "  - Name: Example Login"
    echo "    URL: https://example.com"
    echo "    User: testuser, Pass: testpass123"
    echo "    Client: (any), Category: Web"
    echo ""
    echo "  - Name: GitHub Login"
    echo "    URL: https://github.com"
    echo "    User: dev@example.com, Pass: ghpass456"
    echo "    Client: (any), Category: Web"
    echo ""
    echo "============================================================"
else
    echo "API is responding. Checking for test accounts..."

    # Create test accounts if they don't exist
    SEARCH=$(api_call "account/search" '{"authToken":"test-api-token-syspass-browser01","text":"example"}')
    if ! echo "$SEARCH" | grep -q "example.com"; then
        echo "Creating test account: Example Login"
        api_call "account/create" "{\"authToken\":\"test-api-token-syspass-browser01\",\"tokenPass\":\"${SYSPASS_API_PASS}\",\"name\":\"Example Login\",\"login\":\"testuser\",\"pass\":\"testpass123\",\"url\":\"https://example.com\",\"categoryId\":1,\"clientId\":1}" > /dev/null
    fi

    SEARCH=$(api_call "account/search" '{"authToken":"test-api-token-syspass-browser01","text":"github"}')
    if ! echo "$SEARCH" | grep -q "github.com"; then
        echo "Creating test account: GitHub Login"
        api_call "account/create" "{\"authToken\":\"test-api-token-syspass-browser01\",\"tokenPass\":\"${SYSPASS_API_PASS}\",\"name\":\"GitHub Login\",\"login\":\"dev@example.com\",\"pass\":\"ghpass456\",\"url\":\"https://github.com\",\"categoryId\":1,\"clientId\":1}" > /dev/null
    fi

    echo "Test accounts ready."
fi

# --- Print summary ------------------------------------------------------------

echo ""
echo "============================================================"
echo "  sysPass-Browser Test Environment is Ready"
echo "============================================================"
echo ""
echo "  sysPass Web UI:   ${SYSPASS_URL}"
echo "  sysPass API:      ${SYSPASS_API_URL}"
echo "  Admin login:      ${SYSPASS_ADMIN_USER} / ${SYSPASS_ADMIN_PASS}"
echo "  API password:     ${SYSPASS_API_PASS}"
echo ""
echo "  To configure the extension:"
echo "    1. Load the extension in your browser"
echo "    2. Open extension options > Connected Databases"
echo "    3. Enter:"
echo "         API URL:      ${SYSPASS_API_URL}"
echo "         API Key:      (from API Authorizations page)"
echo "         API Password: ${SYSPASS_API_PASS}"
echo "    4. Click Connect"
echo ""
echo "  Test accounts:"
echo "    - testuser on https://example.com"
echo "    - dev@example.com on https://github.com"
echo ""
echo "  To stop:  cd docker && ${COMPOSE} down"
echo "  To reset: cd docker && ${COMPOSE} down -v"
echo "============================================================"

# Clean up
rm -f /tmp/syspass-cookies.txt
