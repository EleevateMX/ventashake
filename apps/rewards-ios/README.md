# Shakeaholic Rewards — app de iOS

SwiftUI + `supabase-swift`, sobre el mismo Supabase que la PWA. El detalle
de por qué está armada así vive en `CLAUDE.md` → sección 2.7.

## En una Mac (lo más rápido para probar)

Una sola vez:

```bash
xcode-select --install          # si nunca has abierto Xcode
brew install xcodegen
git clone https://github.com/EleevateMX/ventashake.git
```

Cada vez que quieras abrirla:

```bash
cd ventashake/apps/rewards-ios
git pull
xcodegen generate               # crea Rewards.xcodeproj desde project.yml
open Rewards.xcodeproj
```

En Xcode: arriba elige un **iPhone del simulador** y dale ▶︎ (Cmd+R).

- **En el simulador** no hace falta firmar nada.
- **En tu iPhone conectado por cable**: Xcode → target *Rewards* →
  *Signing & Capabilities* → marca *Automatically manage signing* y elige
  tu equipo. Ese ajuste NO se guarda en el repo (el `.xcodeproj` se
  regenera); es solo para tu Mac.
- Si cambias `project.yml` (versiones, permisos, fuentes), vuelve a
  correr `xcodegen generate`. Lo que se cambie a mano en Xcode se pierde
  al regenerar: los ajustes que deban quedarse van en `project.yml`.

### Subir a TestFlight desde la Mac (opcional)

Lo normal es subirla desde GitHub (Actions → «iOS Rewards» → Run workflow
→ subir). Si prefieres hacerlo en local, con la llave `.p8` en tu Mac:

```bash
cd ventashake/apps/rewards-ios
bundle install
export ASC_KEY_ID=XXXXXXXXXX ASC_ISSUER_ID=xxxxxxxx-xxxx-... \
       ASC_KEY_PATH=~/.appstoreconnect/private_keys/AuthKey_XXXXXXXXXX.p8 \
       APPLE_TEAM_ID=XXXXXXXXXX VERSION=1.0.0 BUILD_NUMERO=NN
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
xcodegen generate
bundle exec fastlane ios subir
bundle exec fastlane ios limpiar   # revoca el certificado de esta subida
```

`BUILD_NUMERO` (el `NN`) tiene que ser mayor que el de cualquier build ya
subido de esa versión: mira el último en TestFlight y súmale uno. Ojo: los
de GitHub usan el número de corrida, así que si subes uno local muy alto,
los siguientes de GitHub se rechazan hasta pasarlo.

## Sin Mac

No hace falta: cada cambio que llega a GitHub se compila en una Mac de
GitHub Actions, se abre en el simulador y deja una captura en el registro
(busca `CAPTURA_INICIO` en el paso «Abrir en el simulador»).
