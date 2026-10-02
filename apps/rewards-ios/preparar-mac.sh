#!/usr/bin/env bash
# =============================================================================
#  Deja una Mac lista para abrir Shakeaholic Rewards en Xcode.
#
#  Uso (desde la carpeta del repo):
#      bash apps/rewards-ios/preparar-mac.sh
#
#  Se puede correr las veces que sea: lo que ya esta instalado no se toca.
#  No instala Xcode (pesa ~10 GB y va por la App Store): solo avisa si falta.
# =============================================================================
set -euo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ok()   { printf '  [OK] %s\n' "$1"; }
paso() { printf '\n== %s\n' "$1"; }
falla(){ printf '\n  [FALTA] %s\n\n' "$1"; exit 1; }

[ "$(uname)" = "Darwin" ] || falla "Esto es para macOS."

paso "Xcode"
if ! xcodebuild -version >/dev/null 2>&1; then
  falla "Instala Xcode desde la App Store, abrelo una vez (acepta la licencia y deja que instale sus componentes) y vuelve a correr este script."
fi
VERSION_XCODE="$(xcodebuild -version | head -1 | awk '{print $2}')"
ok "Xcode $VERSION_XCODE"
case "$VERSION_XCODE" in
  1[0-9].*|2[0-5].*) printf '  [AVISO] Apple pide Xcode 26 o mas nuevo para subir a la App Store. Para probar en el simulador sirve el que tienes.\n' ;;
esac

paso "Homebrew"
if ! command -v brew >/dev/null 2>&1; then
  echo "  Instalando Homebrew (te va a pedir la contrasena de la Mac)..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # En Macs con chip Apple, brew queda en /opt/homebrew.
  [ -x /opt/homebrew/bin/brew ] && eval "$(/opt/homebrew/bin/brew shellenv)"
fi
ok "brew $(brew --version | head -1 | awk '{print $2}')"

paso "Herramientas"
for h in xcodegen gh; do
  if command -v "$h" >/dev/null 2>&1; then ok "$h ya estaba"; else brew install "$h"; ok "$h instalado"; fi
done

paso "Proyecto de Xcode"
cd "$AQUI"
xcodegen generate
ok "Rewards.xcodeproj generado desde project.yml"

paso "Listo"
cat <<'TXT'
  Se abre Xcode. Arriba, junto al boton de play, elige un iPhone del
  simulador y dale Cmd+R. La primera vez tarda unos minutos en bajar
  supabase-swift.

  Para probar en tu iPhone (cable): target Rewards -> Signing & Capabilities
  -> Automatically manage signing -> elige tu equipo.

  Si cambias project.yml, vuelve a correr este script.
TXT
open Rewards.xcodeproj
