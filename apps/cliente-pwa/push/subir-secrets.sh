#!/usr/bin/env bash
# Sube las llaves VAPID de Web Push a los secrets de las Edge Functions.
# Las llaves viven en ~/.shakeaholic-webpush/vapid.json (las generó
# `node` con WebCrypto; la pública está también en apps/cliente-pwa/src/lib/push.ts).
set -euo pipefail
ARCHIVO="${1:-$HOME/.shakeaholic-webpush/vapid.json}"
[ -f "$ARCHIVO" ] || { echo "No existe $ARCHIVO"; exit 1; }
PUB=$(node -e "console.log(require('$ARCHIVO').publica)")
PRIV=$(node -e "console.log(require('$ARCHIVO').privada_d)")
npx --yes supabase@latest secrets set --project-ref zyjtnaystsporbuzcmqk \
  "VAPID_PUBLIC_KEY=$PUB" "VAPID_PRIVATE_KEY=$PRIV" "VAPID_SUBJECT=mailto:hola@shakeaholic.mx"
echo "Secrets de Web Push subidos."
