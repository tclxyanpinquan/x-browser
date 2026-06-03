#!/usr/bin/env bash
# install-cert-macos.sh — one-shot Developer ID install + build.
#
# What it does:
#   1. Checks that the .cer downloaded from developer.apple.com is at
#      ~/Downloads/developerID_application.cer (the filename the portal gives).
#   2. Unlocks the login keychain (you'll be prompted for your macOS password).
#   3. Imports the .cer so it pairs with the private key already in the
#      keychain. If no matching private key is present, signing will still
#      fail with "no identity found" — see Troubleshooting below.
#   4. Verifies the identity shows up under `security find-identity`.
#   5. Confirms APPLE_ID / APPLE_PASSWORD / APPLE_TEAM_ID are set (prompts
#      you to paste the App-Specific Password; never committed).
#   6. Re-execs scripts/build-macos.sh to do the actual build.
#
# Usage (in YOUR OWN Terminal, not inside Codex's sandbox):
#   cd /Users/yanpinquan/software/cloatbrower/.worktrees/feat-macos-distribution
#   chmod +x scripts/install-cert-macos.sh
#   ./scripts/install-cert-macos.sh
set -euo pipefail

CERT_PATH="${1:-$HOME/Downloads/developerID_application.cer}"
KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"

if [ ! -f "$CERT_PATH" ]; then
  echo "ERROR: $CERT_PATH not found." >&2
  echo "Download it from https://developer.apple.com/account/resources/certificates/list" >&2
  echo "(Developer ID Application row → Download → it lands in Downloads)" >&2
  exit 1
fi

if [ ! -f "$KEYCHAIN" ]; then
  echo "ERROR: login keychain not found at $KEYCHAIN" >&2
  exit 1
fi

echo "=== 1/4 Unlocking login keychain (enter your macOS password) ==="
security unlock-keychain "$KEYCHAIN"

echo ""
echo "=== 2/4 Importing certificate ==="
security import "$CERT_PATH" \
  -k "$KEYCHAIN" \
  -T /usr/bin/codesign \
  -T /usr/bin/security

echo ""
echo "=== 3/4 Verifying signing identities ==="
security find-identity -p codesigning -v
if ! security find-identity -p codesigning | grep -q "Developer ID Application"; then
  echo "" >&2
  echo "ERROR: Developer ID Application identity is still not in the keychain." >&2
  echo "If the .cer was issued on a DIFFERENT machine, the private key is not" >&2
  echo "here. You need to either:" >&2
  echo "  (a) export the .p12 from the original machine and import that, or" >&2
  echo "  (b) revoke this cert on developer.apple.com and re-issue a new" >&2
  echo "      Developer ID Application with a CSR generated on THIS Mac" >&2
  echo "      (Keychain Access → Certificate Assistant → Request a Cert…)" >&2
  exit 1
fi

echo ""
echo "=== 4/4 Checking notarization env vars ==="
MISSING=0
for var in APPLE_ID APPLE_TEAM_ID; do
  if [ -z "${!var:-}" ]; then
    echo "  $var is not set" >&2
    MISSING=1
  fi
done
if [ -z "${APPLE_PASSWORD:-}" ]; then
  echo "  APPLE_PASSWORD is not set" >&2
  echo "  → Get one at https://appleid.apple.com → App-Specific Passwords," >&2
  echo "    name it 'x-browser-notarize', format xxxx-xxxx-xxxx-xxxx" >&2
  echo "  → Add to ~/.zshrc: export APPLE_PASSWORD='xxxx-xxxx-xxxx-xxxx'" >&2
  MISSING=1
fi
if [ "$MISSING" -ne 0 ]; then
  exit 1
fi

echo ""
echo "All checks passed. Handing off to scripts/build-macos.sh..."
echo ""
cd "$(dirname "$0")/.."
exec ./scripts/build-macos.sh
