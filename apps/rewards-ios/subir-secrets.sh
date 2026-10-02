#!/usr/bin/env bash
# =============================================================================
#  Sube a GitHub los 4 secrets que necesita la subida a TestFlight.
#
#  Uso:
#      bash apps/rewards-ios/subir-secrets.sh ~/Downloads/AuthKey_XXXXXXXXXX.p8
#
#  La llave se lee DIRECTO del archivo y se manda cifrada a GitHub con `gh`:
#  no se imprime, no se copia al portapapeles y no queda en el historial de
#  la terminal. El Key ID sale del nombre del archivo; el Issuer ID y el
#  Team ID se preguntan (no son secretos, pero si se escriben mal la subida
#  falla al final).
# =============================================================================
set -euo pipefail

REPO="EleevateMX/ventashake"
P8="${1:-}"

[ -n "$P8" ] && [ -f "$P8" ] || { echo "Uso: bash $0 /ruta/a/AuthKey_XXXXXXXXXX.p8"; exit 1; }
grep -q "BEGIN PRIVATE KEY" "$P8" || { echo "Ese archivo no parece una llave .p8 de App Store Connect."; exit 1; }

KEY_ID="$(basename "$P8" | sed -n 's/^AuthKey_\([A-Z0-9]\{10\}\)\.p8$/\1/p')"
if [ -z "$KEY_ID" ]; then
  read -r -p "Key ID (10 caracteres, sale en App Store Connect junto a la llave): " KEY_ID
fi

command -v gh >/dev/null 2>&1 || { echo "Falta gh: corre antes preparar-mac.sh (o: brew install gh)"; exit 1; }
gh auth status >/dev/null 2>&1 || gh auth login

read -r -p "Issuer ID (UUID, arriba de la lista de llaves en App Store Connect): " ISSUER
read -r -p "Team ID (10 caracteres, developer.apple.com -> Membership): " TEAM

[[ "$KEY_ID" =~ ^[A-Z0-9]{10}$ ]] || { echo "El Key ID debe tener 10 caracteres."; exit 1; }
[[ "$ISSUER" =~ ^[0-9a-fA-F-]{36}$ ]] || { echo "El Issuer ID debe ser un UUID (36 caracteres)."; exit 1; }
[[ "$TEAM" =~ ^[A-Z0-9]{10}$ ]] || { echo "El Team ID debe tener 10 caracteres."; exit 1; }

gh secret set APPSTORE_PRIVATE_KEY --repo "$REPO" < "$P8"
printf '%s' "$KEY_ID" | gh secret set APPSTORE_KEY_ID --repo "$REPO"
printf '%s' "$ISSUER" | gh secret set APPSTORE_ISSUER_ID --repo "$REPO"
printf '%s' "$TEAM"   | gh secret set APPLE_TEAM_ID --repo "$REPO"

echo
echo "  [OK] Los 4 secrets quedaron en $REPO."
echo "  Guarda el .p8 en un lugar seguro (Apple no deja volver a bajarlo) y"
echo "  no lo subas a ningun repo."
