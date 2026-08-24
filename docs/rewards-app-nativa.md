# Rewards: de PWA a app en App Store y Play Store

`rewards.shakeaholic.mx` ya está construida como **app**, no como página:
pestañas fijas abajo, pantalla completa sin barra del navegador, atajos en
el icono y áreas seguras respetadas. Este documento explica qué queda hecho
y qué falta el día que se decida publicarla en las tiendas.

---

## 1. Qué tiene hoy

**Cuatro pestañas** (`apps/cliente-pwa/src/App.tsx`):

| Pestaña | Qué muestra |
|---|---|
| **Tarjeta** | Mancuernas, barra de progreso al próximo cupón, el código con QR grande, cupones activos y estadísticas de vida |
| **Menú** | La carta viva de la barra, leída de la misma base que la caja |
| **Actividad** | Lo que siempre pide, sus compras con las mancuernas de cada una, y el movimiento de puntos |
| **Cuenta** | Datos, teléfono, cómo funciona el programa, contacto y cerrar sesión |

**Un solo viaje de datos.** Todo el expediente llega en una llamada
(`fn_mi_resumen_lealtad`), con el progreso y las estadísticas **ya
calculados en el servidor**. En un celular con la red de la tienda, cuatro
consultas separadas eran cuatro esperas — y una app nativa consumiría
exactamente la misma función.

**Instalable de verdad.** El manifest declara `standalone`, orientación
vertical, categorías y dos atajos (*Mi código*, *Menú de hoy*) que abren
directo en su pestaña. iOS no lee el manifest, así que lleva además sus
propias etiquetas `apple-mobile-web-app-*`.

**Preparada para pantallas con notch.** `viewport-fit=cover` más
`env(safe-area-inset-*)`: la barra de pestañas no queda debajo del
indicador de inicio del iPhone.

### Cómo se instala hoy (sin tiendas)

- **Android/Chrome**: menú ⋮ → "Instalar aplicación" / "Agregar a pantalla
  de inicio".
- **iPhone/Safari**: botón compartir → "Agregar a pantalla de inicio".

Queda con su icono, sin barra del navegador y con los atajos al mantener
presionado. Para la mayoría de los negocios esto es suficiente y evita el
costo y la burocracia de las tiendas.

---

## 2. El día que se quiera publicar en las tiendas

### 2.1 El camino corto: envolverla (Capacitor)

La app ya es una web autocontenida, así que **no hay que reescribir nada**:
Capacitor la envuelve en un proyecto iOS y otro Android que cargan el
mismo código.

```bash
pnpm add -D @capacitor/cli
pnpm add @capacitor/core @capacitor/ios @capacitor/android
npx cap init "Shakeaholic Rewards" mx.shakeaholic.rewards --web-dir=apps/cliente-pwa/dist
npx cap add ios
npx cap add android
pnpm --filter @shake/cliente-pwa build && npx cap sync
```

Dos decisiones a tomar en ese momento:

- **Contenido local o remoto.** Si en `capacitor.config` se apunta
  `server.url` a `https://rewards.shakeaholic.mx`, la app siempre trae la
  última versión sin pasar por revisión de tienda — pero Apple lo mira con
  lupa si la app es *solo* eso. Empaquetar el `dist` es más aceptado y
  obliga a publicar versión por cada cambio.
- **Login de Google.** En web funciona con el redirect actual; dentro de la
  app nativa hay que usar el flujo nativo (`@capacitor/browser` o el plugin
  de Google) y **agregar el esquema de la app a las URLs de redirección de
  Supabase**. Es el punto que más tiempo consume.

### 2.2 Lo que Apple va a pedir

Apple rechaza apps que son "solo un sitio web envuelto". Para pasar, la app
tiene que hacer algo que el navegador no hace. Lo natural aquí:

- **Notificaciones push** — "tu cupón vence en 5 días", "hoy hay Matcha
  Glow". Es la razón más fuerte para tener app y ya hay dónde engancharla
  (los cupones tienen fecha de vencimiento).
- **Wallet / tarjeta en el Apple Wallet** con el código del cliente.
- **Widget** con las mancuernas en la pantalla de inicio.

También pedirán: cuenta de desarrollador ($99 USD/año Apple, $25 USD única
vez Google), política de privacidad publicada, capturas de pantalla, y una
forma de **borrar la cuenta desde la app** (requisito de Apple desde 2022 —
hoy no existe y habría que agregarla).

### 2.3 Qué NO hay que cambiar

- La base de datos y las funciones: `fn_mi_resumen_lealtad`,
  `fn_vincular_cliente_auth`, `fn_cliente_registrar` y los cupones sirven
  igual desde una app nativa.
- El diseño: ya está pensado en vertical, con toques grandes y sin depender
  del cursor.
- La identificación en caja: el código `SHK-XXXXXX` y su QR funcionan
  igual, los lea un lector de la barra o los muestre una app.

---

## 3. Lo que hace que Rewards funcione (y hoy es el cuello de botella)

**El programa de lealtad depende de que la venta se ligue al cliente.** La
mecánica existe en las dos cajas:

- Kiosko (modo cajero) → botón **"🏋️ Sumar mancuernas a un cliente"** en el
  carrito, junto a "A pagar".
- POS → modal de cliente en el cobro.

Ambos aceptan **código `SHK-` o teléfono**, y un lector de códigos teclea el
código y manda Enter, así que no hay que tocar la pantalla.

Si nadie lo usa, la app se ve preciosa y la tarjeta se queda en cero: al
24/08/26, de 6 clientes registrados, **ninguno tenía compras ligadas** con
~700 ventas hechas. No es un problema de software — es de operación, y se
resuelve con el equipo, no con código.

Se vigila desde **Admin → Diagnóstico** ("Clientes registrados que nunca
compraron"): si ese número crece, es la señal de que no se está pidiendo el
código en caja.
