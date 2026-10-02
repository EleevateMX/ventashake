#!/usr/bin/env bash
# =============================================================================
#  Sube a Supabase el certificado del Pass Type ID (Apple Wallet).
#
#  Uso:
#      bash apps/rewards-ios/wallet/subir-certificado.sh ~/Downloads/pass.cer
#
#  La llave privada la generó esta misma Mac en ~/.shakeaholic-wallet/ (el
#  CSR que se subió a Apple salió de ahí). El .cer que devuelve Apple se
#  convierte a PEM y los dos se mandan como secrets de Edge Functions:
#  WALLET_PASS_CERT y WALLET_PASS_KEY. Nada se imprime.
# =============================================================================
set -euo pipefail

REF="zyjtnaystsporbuzcmqk"
CER="${1:-}"
LLAVE="$HOME/.shakeaholic-wallet/pass-type-id.key"

[ -n "$CER" ] && [ -f "$CER" ] || { echo "Uso: bash $0 /ruta/a/pass.cer"; exit 1; }
[ -f "$LLAVE" ] || { echo "No está la llave en $LLAVE: el CSR se generó en otra Mac."; exit 1; }

TMP="$(mktemp -d)"; chmod 700 "$TMP"; trap 'rm -rf "$TMP"' EXIT
if ! openssl x509 -inform der -in "$CER" -out "$TMP/cert.pem" 2>/dev/null; then
  openssl x509 -in "$CER" -out "$TMP/cert.pem" 2>/dev/null || { echo "Ese archivo no parece un certificado (.cer) de Apple."; exit 1; }
fi
openssl x509 -in "$TMP/cert.pem" -noout -subject | grep -q "Pass Type ID" || { echo "El certificado no es de un Pass Type ID."; exit 1; }
# La llave y el certificado tienen que ser pareja, si no Wallet rechaza el pase.
M1="$(openssl x509 -in "$TMP/cert.pem" -noout -modulus | openssl md5)"
M2="$(openssl rsa -in "$LLAVE" -noout -modulus 2>/dev/null | openssl md5)"
[ "$M1" = "$M2" ] || { echo "Ese certificado no corresponde a la llave de esta Mac."; exit 1; }

command -v npx >/dev/null 2>&1 || { echo "Falta node/npx: corre antes preparar-mac.sh"; exit 1; }
npx --yes supabase@latest projects list >/dev/null 2>&1 || npx --yes supabase@latest login

# La función se despliega desde aquí mismo (no necesita Docker con --use-api).
npx --yes supabase@latest functions deploy wallet-pase --project-ref "$REF" --use-api --workdir "$(cd "$(dirname "$0")/../../.." && pwd)"

npx --yes supabase@latest secrets set --project-ref "$REF" \
  "WALLET_PASS_CERT=$(cat "$TMP/cert.pem")" \
  "WALLET_PASS_KEY=$(cat "$LLAVE")"

echo
echo "  [OK] WALLET_PASS_CERT y WALLET_PASS_KEY quedaron en el proyecto $REF."
echo "  Vence: $(openssl x509 -in "$TMP/cert.pem" -noout -enddate | cut -d= -f2)"
echo "  Guarda el .cer y respalda ~/.shakeaholic-wallet/ (sin eso no hay pases)."
