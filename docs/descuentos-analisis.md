# Análisis completo: el descuento de productos

Corte al **25/11/26**, verificado leyendo las funciones en producción. Esto
cubre **todo lo que puede bajar lo que paga el cliente**: precios, promos,
cupones, sellos, mancuernas, precio de personal, cortesías y el descuento
manual de caja. Para cada uno: qué hace, en qué pantalla, **cómo llega el
descuento al servidor** y qué lo protege.

---

## 1. La regla de oro

**El dinero lo calcula el servidor, siempre.** El cliente nunca manda un
precio. `fn_crear_orden` resuelve el precio de cada renglón con
`fn_precio_linea(producto, padre)` — y el precio de un extra depende del
shake al que cuelga, no del producto suelto. El subtotal sale de ahí, no de
lo que diga la pantalla.

Y al cobrar, **`fn_cobrar_orden` exige que el monto == total de la orden**
(±1 centavo) o rechaza el cobro. No existe «cobrar un número cualquiera»:
si la pantalla y el servidor no cuadran, la venta se frena, no se cobra mal.

Con esas dos vallas, **lo único que el cliente puede mover es un
descuento** — nunca un precio. Y casi todos los descuentos los calcula
también el servidor.

---

## 2. Las diez formas de descontar

| # | Descuento | Dónde | Función | Quién calcula | Candado |
|---|---|---|---|---|---|
| 1 | **Precio de lista** (base) | todas | `fn_precio_linea` | Servidor | — (no es cliente) |
| 2 | **Promo automática** | todas | `fn_descuento_promos` | Servidor | se aplica sola |
| 3 | **Promo segmentada** (manual) | POS | `fn_promos_cliente` + `p_descuento` | Pantalla | throttle 15 días, segmentación |
| 4 | **Descuento manual de caja** | POS | `p_descuento` | Pantalla | PIN de gerente (en pantalla) |
| 5 | **Cupón de descuento con PIN** ($20/10%/15%) | kiosko | `fn_cupon_autorizar` + `fn_cupon_aplicar` | Servidor | PIN, 1 por venta, no con personal |
| 6 | **Cupón de premio** (100 mancuernas / cumpleaños) | kiosko + POS | `fn_canjear_cupon_recompensa` | Servidor | del cliente, 1 solo uso |
| 7 | **Tarjeta de sellos** 13+1 | kiosko + POS | `fn_canjear_sellos` | Servidor | sellos del cliente, 1 por venta |
| 8 | **Mancuernas** (monedero) | kiosko + POS | `fn_canjear_mancuernas` | Servidor | saldo del cliente, tope al total |
| 9 | **Precio de personal** | kiosko | `fn_crear_orden_personal` | Servidor | clave bcrypt, turno, límites, tope |
| 10 | **Cortesía** ($0) | kiosko | `fn_cortesia_crear` | Servidor | PIN de lista `cortesia_autorizados` |

---

## 3. Dos patrones, y por qué importa

Todo descuento llega al servidor de **una de dos formas**:

### Patrón A — como parámetro de `crear_orden` (`p_descuento`)

La pantalla manda un número (`p_descuento`) y el servidor hace
`total = max(0, subtotal − p_descuento − promos_automáticas)`.

Lo usan: **descuento manual de caja (4)**, **promo segmentada (3)** y el
**precio de personal (9)** — aunque en el 9 el número lo calcula el
servidor desde la clave, no la pantalla.

`p_descuento` solo se limita a **≥ 0**; no se topa al subtotal. El total sí
se topa en 0, así que nunca sale negativo.

### Patrón B — canje sobre la orden ya creada

La orden se crea a precio normal; luego una función **baja
`ordenes.total`** y devuelve `total_a_pagar`, y la pantalla cobra **ese**
número (que `fn_cobrar_orden` vuelve a validar).

Lo usan: **cupón de descuento PIN (5)**, **cupón de premio (6)**, **sellos
(7)**, **mancuernas (8)** y **cortesía (10)**.

El patrón B es el robusto: el servidor decide el descuento y el monto a
cobrar sale de la orden, no del carrito. **El cambio del 24/11 movió el
cupón de premio del patrón A (POS mandaba el descuento) al patrón B**, así
que hoy las dos pantallas lo hacen igual.

> Un detalle del patrón B: para el cupón de premio, los sellos y el cupón
> PIN, el servidor deja el **renglón en $0 pero lo conserva** — así la
> comanda y el inventario siguen bien (el producto se prepara y se
> descuenta igual), solo que no se cobra.

---

## 4. Qué valida el servidor (las vallas)

- **Precios:** imposibles de tocar desde fuera (`fn_precio_linea`).
- **Promos automáticas:** solo las pone el servidor (`automatica = true`,
  por día/hora de Mérida). La pantalla solo las previsualiza.
- **Cobro:** `monto == ordenes.total` (±0.01) o se rechaza.
- **Cupón PIN:** autorización que caduca, **1 por venta**, y **no se junta
  con el precio de personal** (lo revisa adentro).
- **Cupón de premio / sellos / mancuernas:** la orden tiene que tener
  cliente (el cupón de premio permite orden sin cliente para el escaneo en
  POS; si hay cliente, el cupón debe ser suyo), **un solo uso**, e
  idempotentes por orden (no se canjea dos veces).
- **Precio de personal:** freno de PIN (15 fallos/15 min), **turno abierto
  en el checador**, límites **por grupo** (no pedir alimento no da un
  segundo shake), **tope diario** ($263), clave bcrypt única.
- **Cortesía:** PIN contra `cortesia_autorizados` (hoy Perla y Adrián), no
  un rol — nadie más la da.

---

## 5. Qué se junta con qué

| | Se combina | Nota |
|---|---|---|
| Promo automática | con todo | es la línea base, va sola |
| Promo segmentada + descuento manual | sí | los dos suman en `p_descuento` (POS) |
| Cupón PIN + precio de personal | **NO** | bloqueado en el servidor |
| Cupón de premio + sello | sí | dos productos gratis; el sello primero, el cupón el más caro de lo que queda |
| Mancuernas + cualquiera | sí | se topan a lo que quede por pagar |
| Precio de personal + promo | ⚠ hoy no choca | ver riesgo #2 |

---

## 6. Riesgos y pendientes

**1. El único hueco: `p_descuento` es del cliente, y el cobro corre como
`anon`.** El descuento manual de caja no se valida en el servidor (en la
pantalla pide PIN de gerente, pero `fn_crear_orden` no lo revisa). Como el
cobro está abierto a `anon` (a propósito, para que el kiosko cobre), con la
llave pública alguien podría crear una orden con `p_descuento` enorme →
total 0 → cobrarla en 0. **Es el hueco conocido y aceptado**: un atacante
puede *regalarse* un producto; **no** puede cambiar precios ni sacar dinero
del cajón. Se cierra el día que el kiosko sostenga su sesión (ver
`docs/pendiente-blindaje-cobro.md`).

**2. Promo + precio de personal se restarían dos veces** (latente, ya
anotado en CLAUDE.md). `fn_crear_orden_personal` manda el descuento de
personal en `p_descuento`, y `fn_crear_orden` **además** resta las promos
automáticas. Si una promo cayera sobre un producto que también tiene precio
de personal, se aplicarían las dos. **Hoy no pasa** porque la única promo
viva es de cookies y las cookies no tienen precio de personal. Hay que
decidir cuál gana antes de que una promo toque un producto con precio de
personal.

**3. Precio de personal + cupón de premio / sellos / mancuernas no está
bloqueado.** Solo el **cupón PIN** se niega a juntarse con el precio de
personal. Si alguien entra con clave de personal y además el cliente está
identificado, el panel de Rewards sigue saliendo, así que podrían encimarse
un precio de personal y un producto gratis. Es un beneficio doble, no una
pérdida de control — pero conviene decidir si se permite.

**4. POS + promo automática activa = el cobro se frena** (sin cupón). El
POS no previsualiza las promos automáticas (solo las segmentadas), así que
con una promo automática viva, el total que calcula el POS es mayor que el
de la orden y `fn_cobrar_orden` lo rechaza por no cuadrar. No cobra mal:
**se frena**. Importa poco porque la tienda cobra en el kiosko, no en el
POS; y con un cupón de premio el POS ya cobra el total del servidor, así
que ese caso quedó cubierto.

**5. `p_descuento` no se topa al subtotal.** El `descuento` guardado puede
quedar mayor que el subtotal (el total igual se topa en 0). Es cosmético en
reportes; no cobra de menos ni de más.

**Lo que NO es un problema (revisado):**
- **No hay doble descuento de promos.** `fn_promos_cliente` (POS) solo
  devuelve promos **no automáticas**; `fn_descuento_promos` solo aplica las
  **automáticas**. Son conjuntos disjuntos.
- **El cambio del cupón de premio al patrón B no rompió el POS**: compila,
  la aritmética cuadra y el pago dividido se reparte contra el total real.

---

## 7. Veredicto

El descuento de productos está **bien cimentado**: los precios y las promos
son del servidor, el cobro no acepta un monto que no cuadre, y ocho de los
diez descuentos los calcula y aplica el servidor sobre la orden ya creada.
El único lugar donde el cliente mueve el número es `p_descuento` (descuento
manual de caja), y ahí el riesgo es regalar un producto, nunca sacar
dinero ni tocar precios.

Lo que queda por decidir es **política, no seguridad**: qué gana cuando se
enciman precio de personal y promo (riesgo #2) o precio de personal y un
premio (riesgo #3). Y lo que queda por **cerrar** es el hueco de
`p_descuento`, que depende de que el kiosko sostenga su sesión primero.
