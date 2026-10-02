#!/usr/bin/env bash
# =============================================================================
#  Sube a Supabase la llave de APNs (avisos push) y despliega las funciones.
#
#  Uso:
#      bash apps/rewards-ios/push/subir-secrets.sh ~/Downloads/AuthKey_XXXXXXXXXX.p8
#
#  La llave se crea una vez en developer.apple.com -> Keys -> "+" ->
#  "Apple Push Notifications service (APNs)". El Key ID sale del nombre del
#  archivo. Nada se imprime.
# =============================================================================
set -euo pipefail

REF="zyjtnaystsporbuzcmqk"
TEAM="269U859QV3"
BUNDLE="mx.shakeaholic.rewards"
P8="${1:-}"

[ -n "$P8" ] && [ -f "$P8" ] || { echo "Uso: bash $0 /ruta/a/AuthKey_XXXXXXXXXX.p8"; exit 1; }
grep -q "BEGIN PRIVATE KEY" "$P8" || { echo "Ese archivo no parece una llave .p8 de Apple."; exit 1; }
KEY_ID="$(basename "$P8" | sed -n 's/^AuthKey_\([A-Z0-9]\{10\}\)\.p8$/\1/p')"
[ -n "$KEY_ID" ] || read -r -p "Key ID (10 caracteres, junto a la llave en developer.apple.com): " KEY_ID
[[ "$KEY_ID" =~ ^[A-Z0-9]{10}$ ]] || { echo "El Key ID debe tener 10 caracteres."; exit 1; }

command -v npx >/dev/null 2>&1 || { echo "Falta node/npx: corre antes preparar-mac.sh"; exit 1; }
npx --yes supabase@latest projects list >/dev/null 2>&1 || npx --yes supabase@latest login

RAIZ="$(cd "$(dirname "$0")/../../.." && pwd)"
npx --yes supabase@latest functions deploy push-cola --project-ref "$REF" --use-api --workdir "$RAIZ"
npx --yes supabase@latest functions deploy push-enviar --project-ref "$REF" --use-api --workdir "$RAIZ"

npx --yes supabase@latest secrets set --project-ref "$REF" \
  "APNS_KEY_ID=$KEY_ID" "APNS_TEAM_ID=$TEAM" "APNS_BUNDLE_ID=$BUNDLE" \
  "APNS_KEY_P8=$(cat "$P8")"

echo
echo "  [OK] APNs listo en el proyecto $REF (Key ID $KEY_ID)."
echo "  Guarda el .p8 en un lugar seguro: Apple no deja volver a bajarlo."
