# Shakeaholic Rewards — app de iOS

SwiftUI + `supabase-swift`, sobre el mismo Supabase que la PWA. El detalle
de por qué está armada así vive en `CLAUDE.md` → sección 2.7.

## En una Mac (lo más rápido para probar)

**Atajo:** con Xcode ya instalado (App Store) y abierto una vez,

```bash
git clone https://github.com/EleevateMX/ventashake.git
cd ventashake
bash apps/rewards-ios/preparar-mac.sh            # brew, xcodegen, gh; genera y abre el proyecto
bash apps/rewards-ios/subir-secrets.sh ~/Downloads/AuthKey_XXXXXXXXXX.p8   # los 4 secrets de GitHub
```

El segundo lee la llave directo del archivo y la manda cifrada a GitHub:
no se imprime ni se copia a ningún lado.

Paso a paso, a mano:

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

## Modo personal, discreto

La pantalla de entrada es del cliente: no hay botón «Soy del equipo». El
PIN se abre con **cinco toques seguidos a Milo** (el mismo pasadizo del kiosko) o,
ya con sesión, con la línea pequeña «Equipo Shakeaholic» al final de
*Cuenta*.

## Mi beneficio (precio de personal desde la app)

Con sesión de PIN, la pestaña *Personal* abre con «Mi beneficio»: cuántos
shakes, alimentos y bebidas llevo hoy, cuánto del tope, los precios de
personal y el botón **Mostrar mi código en la caja**: un QR `SHKP-…` de un
solo uso que vive 2 minutos. En el kiosko, «Es para personal» → escanear.
Lo valida y lo cobra el servidor con las mismas reglas que la clave.

## Apple Wallet (el QR en el iPhone y en el Apple Watch)

En «Tu tarjeta» hay un botón **Agregar a Apple Wallet**. El pase lo arma y
lo firma la Edge Function `wallet-pase` con el certificado del Pass Type ID;
la app solo lo pide y se lo entrega a Wallet. Lleva el QR `SHK-XXXXXX`, el
nombre y, al reverso, cómo funciona. **No lleva saldo** a propósito: un pase
no se actualiza solo y un número viejo en la muñeca es peor que ninguno.

Una sola vez, en developer.apple.com → Certificates, Identifiers & Profiles:

1. *Identifiers* → `+` → **Pass Type IDs** → identificador
   `pass.mx.shakeaholic.rewards`.
2. Entra a ese identificador → *Create Certificate* → sube
   `~/Desktop/Shakeaholic-PassTypeID.certSigningRequest` (la llave privada
   quedó en `~/.shakeaholic-wallet/`, respáldala) → descarga `pass.cer`.
3. `bash apps/rewards-ios/wallet/subir-certificado.sh ~/Downloads/pass.cer`
   convierte el `.cer` y manda los dos secrets a Supabase sin imprimirlos.

Las imágenes del pase (icon, logo y la franja con Milo) las genera
`wallet/imagenes.swift` desde las fuentes y el Milo del repo y quedan en
base64 en `supabase/functions/wallet-pase/imagenes.ts`. Si cambia la marca:

```bash
cd apps/rewards-ios/wallet && swiftc -O imagenes.swift -o /tmp/imagenes && \
  /tmp/imagenes ../Rewards/Resources/Fonts ../Rewards/Resources/Assets.xcassets/Milo.imageset/milo.png /tmp
```

y volver a embeber los PNG (`icon*.png`, `logo@2x/3x`, `strip@2x/3x`).
