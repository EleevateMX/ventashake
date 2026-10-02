# Rewards: dónde vamos

Punto de partida para retomar **solo la app del cliente**, sin cargar con el
kiosko ni la caja. Al 25/08/26.

> Los detalles están en los otros tres documentos:
> `rewards-app-nativa.md` (TestFlight y tiendas),
> `monedero-y-sellos.md` (mancuernas compradas y 13+1),
> `metas-y-perfil.md` (logros y foto).
> Esto es el mapa que dice qué existe, qué falta y qué NO hay que romper.

---

## 1. Qué es y dónde vive

`rewards.shakeaholic.mx` → `apps/cliente-pwa`. React + Vite, desplegada a
Cloudflare Pages al hacer push a `main`. Cuatro pestañas:

| Pestaña | Archivo | Qué muestra |
|---|---|---|
| Tarjeta | `App.tsx` (`Inicio`) + `Metas.tsx` | El pase con QR, las dos bolsas, metas, sellos, cupones, paquetes, canje de tarjeta de regalo |
| Menú | `App.tsx` (`Menu`) | La carta viva de la barra |
| Actividad | `App.tsx` (`Actividad`) | Favoritos, compras, movimientos |
| Cuenta | `App.tsx` (`Cuenta`) + `Avatar.tsx` | Foto, datos, teléfono, cómo funciona |

Otros archivos propios: `Iconos.tsx` (SVG, nunca emoji), `QR.tsx`,
`nativo.ts` (login de Google dentro de la app envuelta).

**Un solo viaje de datos.** Todo el expediente llega en
`fn_mi_resumen_lealtad()`. Las metas van aparte (`fn_mis_metas()`) porque
cambian por su cuenta. Si hay que agregar un dato a la tarjeta, **va dentro
del resumen**, no en una consulta nueva: en el celular de la tienda cada
llamada extra es otra espera.

---

## 2. Los cuatro programas que conviven

| Programa | De dónde salen | ¿Caducan? | Dónde se define |
|---|---|---|---|
| **Mancuernas ganadas** | 1 por cada $10 de compra | Pueden | `fn_acumular_mancuernas` |
| **Saldo comprado** | Recarga o tarjeta de regalo | **No** — es dinero del cliente | `paquetes_saldo`, `fn_canjear_tarjeta` |
| **Sellos 13+1** | Un sello por producto, bebidas y comida por separado | — | `config_sellos`, `premios_sellos` |
| **Metas** | Abrir la app, reseña, perfil | Pueden | tabla `misiones` |

**Están separados a propósito.** El saldo comprado es un pasivo: hay que
poder responder "¿cuánto dinero de clientes tenemos en la calle?" sin que
se mezcle con la promoción. Al canjear se gastan **primero las ganadas**,
justo porque son las que caducan.

---

## 3. La superficie de la base

Lo que la app llama, y nada más:

```
fn_vincular_cliente_auth(nombre)   alta/vinculación + foto de Google
fn_mi_resumen_lealtad()            TODO el expediente en una llamada
fn_mis_metas()                     catálogo de metas con mi estado
fn_meta_automatica(clave)          cobra una meta que el servidor comprueba
fn_meta_enviar_evidencia(...)      manda captura → queda pendiente
fn_canjear_tarjeta(codigo)         tarjeta de regalo → saldo
fn_guardar_mi_foto(url)            foto propia (solo URL de nuestro storage)
fn_guardar_mi_telefono(tel)
```

Gerencia: `fn_metas_por_revisar()`, `fn_meta_revisar(id, aprobar)`,
`fn_generar_tarjetas(n, mancuernas, lote)`.

Caja: `fn_canjear_mancuernas(orden, n)`, `fn_canjear_sellos(...)`,
`fn_devolver_canje(orden)`.

**Reglas que no se negocian:**

- El dinero se calcula en el servidor. El cliente nunca manda precios ni
  cantidades a acreditar.
- Toda mancuerna pasa por `mancuernas_movimientos` (o `saldo_movimientos`).
  Un `update` suelto a `clientes.mancuernas` daría el número correcto y
  dejaría un hueco en la historia.
- Las URLs de imágenes se validan contra **nuestro** storage. Aceptar
  cualquiera convierte la foto de perfil en un hueco por donde cargar un
  servidor ajeno en la app de la tienda.
- Las metas automáticas comprueban el hecho **en el servidor**. Si el
  cliente pudiera declararlo, la meta sería un botón de regalarse puntos.

---

## 4. Qué está hecho

- Las cuatro pestañas, con el pase estilo wallet y el QR que se agranda
  sobre blanco al tocarlo.
- Monedero, sellos y tarjetas de regalo: **motor completo y probado** de
  punta a punta contra producción.
- Metas y foto de perfil, con bandeja de aprobación en Admin → Metas.
- Instalable como PWA: manifest con icono maskable, capturas y atajos.
- **Compilación a TestFlight desde la nube** — sin Mac.

## 5. Qué falta

1. **Kiosko / POS: canjear.** Es lo único que bloquea el uso real. El
   cliente ya ve su saldo pero **no hay dónde gastarlo**: falta el botón
   para canjear mancuernas al cobrar, canjear la tarjeta de sellos y vender
   los paquetes de recarga.
2. **Borrar la cuenta desde la app.** Requisito de Apple (5.1.1 v) para
   publicar. No para TestFlight interno. Con el monedero de por medio no es
   un `delete` a secas: hay que decidir qué pasa con el saldo comprado, que
   es dinero del cliente.
3. **Notificaciones push.** Es la razón más fuerte para tener app y lo que
   contesta la guideline 4.2 ("no es solo un sitio web envuelto"). Ya hay
   dónde engancharlas: los cupones tienen vencimiento.
4. **Pase de Apple Wallet / Google Wallet.** La tarjeta ya está dibujada
   con la anatomía de un pase; falta el certificado de firma y quién lo
   emita.
5. **Admin**: generar lotes de tarjetas de regalo, editar el catálogo de
   premios y ver el saldo en la calle.

---

## 6. El cuello de botella, y no es código

**Al 25/08/26: 32 ventas pagadas en el día, 0 ligadas a un cliente.**
Seis clientes registrados, ninguno con compra ligada.

La mecánica existe en las dos cajas — kiosko en modo cajero → botón
**"🏋️ Sumar mancuernas a un cliente"**; POS → modal de cliente al cobrar —
y aceptan código `SHK-` o teléfono, así que un lector lo teclea solo.

Mientras nadie lo use, la app se ve preciosa y la tarjeta se queda en cero.
Se vigila en **Admin → Diagnóstico** ("Clientes registrados que nunca
compraron").

---

## 7. Para probar

Dos tarjetas de regalo de prueba, lote `PRUEBA-APP`, sin usar:

| Código | Trae |
|---|---:|
| `SHKG-GT4NVPX7` | 2,200 mancuernas ($220) |
| `SHKG-JVRDVA2H` | 500 mancuernas ($50) |

Se canjean desde la app, en *Tarjeta → ¿Tienes una tarjeta de regalo?*.
Eso prueba el monedero. Para probar **mancuernas ganadas y sellos** hace
falta una venta real ligada al cliente desde el kiosko.

Cuenta de pruebas: `edykiira@gmail.com` → `SHK-BDA05B`.

---

## 8. TestFlight: lo que hay que tener a mano

`.github/workflows/testflight-ios.yml`, disparado a mano desde Actions o
con `git tag rewards-v1.0.0`. Cuatro secrets en GitHub:

`APPSTORE_KEY_ID`, `APPSTORE_ISSUER_ID`, `APPSTORE_PRIVATE_KEY` (el
contenido del `.p8`), `APPLE_TEAM_ID`.

**Antes de la primera subida, en App Store Connect → Apps → «+» → Nueva
app**, con el bundle ID `mx.shakeaholic.rewards`. Es el único paso que no
puede hacer el workflow: la API de Apple registra el bundle ID y los
certificados sola, pero **no crea la ficha de la app**, y sin ficha la
subida falla al final con *"No suitable application records were found"*.
Si el bundle ID no aparece en la lista al crear la ficha, se da de alta en
developer.apple.com → Identifiers (o se corre una vez el workflow, que lo
registra al archivar).

**Tres cosas que tumbaban la primera corrida (02/10/26)** y ya están en el
workflow: Capacitor 8 pide **Node 22** (con 20, `cap add ios` no corre);
Apple pide el **SDK de iOS 26** desde abril de 2026, y la imagen
`macos-15` trae Xcode 16 por omisión (`setup-xcode` → `latest-stable`); y
Capacitor 8 genera el proyecto con **Swift Package Manager**, sin
`App.xcworkspace`, así que se archiva con el que exista.

Y en **Supabase → Authentication → URL Configuration → Redirect URLs**:
`mx.shakeaholic.rewards://auth`. Sin eso el login se queda a medias.

**El proyecto nativo no se versiona**: se regenera en cada corrida desde
`capacitor.config.ts` + `scripts/app-nativa-preparar.sh`. Si algún ajuste
nativo hace falta, va en ese script — hecho a mano en Xcode se pierde en el
siguiente `cap sync`, sin ningún error que lo delate.


---

## 9. Lo que sigue en la app nativa (decidido el 02/10/26)

Lo que ya está: Apple/Google, Wallet, Menú con fotos, modo personal con
«Mi beneficio» y QR para la caja, avisos push, aliados (Admin → Aliados),
eliminar cuenta. Lo que
sigue, en el orden en que vale la pena:

| # | Qué | Cómo | Qué decide el negocio |
|---|---|---|---|
| 1 | **«Mi shake de siempre»** arriba de la tarjeta | Sale de `favoritos` del resumen, que ya existe: el más pedido con sus extras habituales (hay que agregar los extras al resumen). Un toque lo enseña grande para pedirlo en caja | Nada: es automático |
| 2 | **Pedir desde la app y recoger en barra** | Botón «Lo quiero» en el Menú → `fn_crear_orden` con `canal = 'app'` y el nombre del cliente; **se paga al recoger** (sin dinero en la app en la v1). Sale en cocina como cualquier orden y la TV de folios lo da por listo. **Prendido/apagado desde Admin → Rewards** (`parametros.pedidos_app`): si está apagado, el botón no existe | Horario en que se acepta, tiempo de preparación que se promete |
| 3 | **Referidos** | Código `SHK-…` del que invita; el nuevo lo escribe al entrar (`fn_vincular_cliente_auth` con `p_referido`) y los dos ganan al **primer cobro** del nuevo, por `mancuernas_movimientos` como todo. Un cliente solo puede ser referido una vez | Cuántas mancuernas gana cada uno |
| 4 | **«Tu pedido está listo»** por push | Trigger sobre `pedidos_cocina` cuando **todas** las partes están `listo` y la orden tiene cliente con teléfono registrado → `push_cola`. Mismo camino que «+mancuernas» | Nada |
| 5 | **Widget y Live Activity** | Widget con las mancuernas y el QR (App Group para compartir la sesión); Live Activity con Milo mientras preparan el pedido. Depende del 2 y del 4 | Nada |

Lo que **no** va: feed social, chat, rachas, más tipos de puntos. Y la
regla sigue: la sorpresa del 13+1 no se anuncia ni aquí ni en push.
