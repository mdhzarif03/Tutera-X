#!/usr/bin/env sh
# Reads the SHA-256 signing fingerprint from the Android keystore and writes it into
# public/.well-known/assetlinks.json, replacing the placeholder. Run from the twa/ folder.
#   sh set-fingerprint.sh android.keystore tutera-x
set -eu
KEYSTORE="${1:-./android.keystore}"
ALIAS="${2:-tutera-x}"
JSON="../public/.well-known/assetlinks.json"

if [ ! -f "$KEYSTORE" ]; then echo "Keystore not found: $KEYSTORE" >&2; exit 1; fi

FP=$(keytool -list -v -keystore "$KEYSTORE" -alias "$ALIAS" 2>/dev/null \
  | sed -n 's/^[[:space:]]*SHA256: //p' | head -n 1)
if [ -z "$FP" ]; then echo "Could not read the SHA256 fingerprint for alias '$ALIAS'." >&2; exit 1; fi

sed -i.bak "s/REPLACE_WITH_YOUR_SIGNING_KEY_SHA256/$FP/" "$JSON"
rm -f "$JSON.bak"
echo "Fingerprint written to $JSON:"
echo "$FP"
echo "Redeploy the site, then open https://tuterax.vercel.app/.well-known/assetlinks.json to check it."
