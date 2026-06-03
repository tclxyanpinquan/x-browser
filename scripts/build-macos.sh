#!/usr/bin/env bash
# Build, sign, and notarize x-browser.app for macOS distribution.
#
# Required env vars (set in ~/.zshrc, never commit them):
#   APPLE_ID        - Apple ID email (e.g. hysen.yan@outlook.com)
#   APPLE_PASSWORD  - App-Specific Password from appleid.apple.com
#   APPLE_TEAM_ID   - 10-character Team ID (e.g. 2VH263HBZJ)
#
# The Team ID and signing identity are also baked into tauri.conf.json
# (signingIdentity + providerShortName). The env vars above are for the
# notarization step only.
set -euo pipefail

# Run from project root (worktree) regardless of caller
cd "$(dirname "$0")/.."

ARCH=$(uname -m)
case "$ARCH" in
  arm64|aarch64) TARGET_TRIPLE="aarch64-apple-darwin"; DMG_ARCH_TAG="aarch64" ;;
  x86_64)        TARGET_TRIPLE="x86_64-apple-darwin";  DMG_ARCH_TAG="x86_64" ;;
  *)             echo "ERROR: unsupported arch $ARCH" >&2; exit 1 ;;
esac

# Sanity check
for var in APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID; do
  if [ -z "${!var:-}" ]; then
    echo "ERROR: env var $var is not set. Source ~/.zshrc or set it inline." >&2
    exit 1
  fi
done

# Optionally unlock the login keychain so codesign can use the cert.
# Set APPLE_KEYCHAIN_PW in your shell if you want the script to do this.
if [ -n "${APPLE_KEYCHAIN_PW:-}" ]; then
  security unlock-keychain -p "$APPLE_KEYCHAIN_PW" \
    ~/Library/Keychains/login.keychain-db || true
fi

# Best-effort: list the signing identities the build will pick from.
echo "=== Available signing identities ==="
security find-identity -p codesigning -v 2>/dev/null \
  | grep -E '"Developer ID Application' || \
  echo "  (no Developer ID Application identity found in keychain)"

# Ensure dependencies are installed
if [ ! -d "node_modules" ]; then
  npm install
fi

# Build (Tauri reads APPLE_* env vars automatically for notarization)

npm run tauri build -- --target "$TARGET_TRIPLE"

# Locate the produced app. With --target, Tauri drops the bundle under
# target/<triple>/release/bundle; without it, under target/release/bundle.
# We try the targeted path first, then fall back to the default path.
APP_PATH="src-tauri/target/${TARGET_TRIPLE}/release/bundle/macos/x-browser.app"
if [ ! -d "$APP_PATH" ]; then
  APP_PATH="src-tauri/target/release/bundle/macos/x-browser.app"
fi
DMG_PATH=$(ls -1 src-tauri/target/${TARGET_TRIPLE}/release/bundle/dmg/*.dmg 2>/dev/null | head -1)
if [ -z "$DMG_PATH" ] || [ ! -f "$DMG_PATH" ]; then
  DMG_PATH=$(ls -1 src-tauri/target/release/bundle/dmg/*.dmg 2>/dev/null | head -1)
fi

if [ ! -d "$APP_PATH" ]; then
  echo "ERROR: $APP_PATH not found" >&2
  exit 1
fi

echo ""
echo "=== Verifying code signature ==="
codesign --verify --deep --strict --verbose=2 "$APP_PATH"
spctl --assess --type execute --verbose=2 "$APP_PATH" || true

echo ""
echo "=== Verifying notarization ==="
stapler validate "$APP_PATH" || true

if [ -f "$DMG_PATH" ]; then
  echo ""
  echo "=== Verifying DMG ==="
  spctl --assess --type install --verbose=2 "$DMG_PATH" || true
  echo ""
  echo "DMG: $DMG_PATH"
  echo "Size: $(du -h "$DMG_PATH" | cut -f1)"
  echo "SHA256: $(shasum -a 256 "$DMG_PATH" | cut -d' ' -f1)"
fi

echo ""
echo "=== Recent notary submissions for this team ==="
xcrun notarytool history --apple-id "$APPLE_ID" \
  --password "$APPLE_PASSWORD" --team-id "$APPLE_TEAM_ID" 2>/dev/null | head -5 || \
  echo "  (could not fetch notary history)"
