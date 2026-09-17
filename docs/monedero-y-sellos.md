# Monedero de mancuernas y tarjeta de sellos

Dos programas distintos que conviven sin mezclarse:

- **Monedero** — mancuernas que se **compran** (dinero real prepagado).
- **Sellos** — 13 compras y la 14 va por cuenta de la casa.

Y sigue vivo el de siempre: **mancuernas que se ganan** (1 por cada $10).

---

## 1. La tabla de equivalencias

**La tasa: 10 mancuernas = $1 MXN.** Fácil de calcular de cabeza — se
recorre el punto decimal.

### Qué alcanza

| Producto | Precio | Mancuernas |
|---|---:|---:|
| Comida (sándwich, wrap) | $139 | 1,390 |
| Shake de la carta | $125 | 1,250 |
| Paquete Americano | $99 | 990 |
| Café | $55 | 550 |
| Kombucha / Té / Amino | $49 | 490 |

### Los paquetes de recarga

| Pagas | Recibes | Vale | Regalo |
|---:|---:|---:|:--|
| $200 | 2,200 | $220 | **+10%** |
| $500 | 5,750 | $575 | **+15%** |
| $1,000 | 12,000 | $1,200 | **+20%** |

Con $200 se lleva un shake **y** un café, y le sobran 400 mancuernas.

> **Por qué no se usó el ejemplo original** ($200 → 1,350 → un shake de
> $125): el cliente pagaría $200 por $125 de producto. Nadie compra eso dos
> veces, y quien lo hiciera se sentiría estafado. El monedero solo funciona
> si el cliente **siempre gana algo** por adelantar su dinero.

### Cuánto cuesta el bono

En un shake de $125 el costo real ronda los $40. Regalar 10–20% en producto
sale de un margen que aguanta — y a cambio entra dinero por adelantado, el
cliente vuelve porque "ya tiene saldo ahí", y baja el manejo de efectivo.

---

## 2. Las dos bolsas (y por qué están separadas)

| | Mancuernas ganadas | Saldo comprado |
|---|---|---|
| De dónde salen | 1 por cada $10 de compra | Recarga o tarjeta de regalo |
| Qué son | Promoción | **Dinero del cliente** |
| ¿Caducan? | Pueden | **No** — sería quedarse con dinero ajeno |
| Al canjear | Se gastan **primero** | Después |

En la app se ven las dos y también el total. Al cobrar se descuentan
primero las ganadas, justo porque son las que caducan.

Separarlas permite responder en cualquier momento: **¿cuánto dinero de
clientes tenemos en la calle?** Es un pasivo, no una promoción, y hay que
poder verlo aparte.

⚠️ **Recargar no da mancuernas de lealtad.** Sería pagar el bono dos veces
(el +10% ya es el premio). Si en la misma compra va una recarga y un shake,
sí se ganan mancuernas — pero solo por el shake.

---

## 3. Tarjeta de sellos: 13 + 1

Dos tarjetas independientes: **bebidas** por un lado, **comida** por otro.
Quien toma café a diario no debería llenar la tarjeta de sándwiches.

- Cuenta **productos**, no visitas: quien pide tres shakes se lleva tres
  sellos.
- El premio sale de un **catálogo fijo** (`premios_sellos`), configurable
  desde la base. Así el costo del regalo está siempre bajo control, aunque
  los 13 sellos se junten con lo más barato de la carta.
- Las recargas nunca sellan (no son consumo).

### El cliente NO ve cuántas le faltan (17/09/26)

La app ya no dice «3/13» ni «te faltan 10 para tu bebida **gratis**», y ya
no pinta los trece circulitos. Lo pidió el negocio y la razón es buena:
anunciar el premio lo convierte en una deuda que el cliente va tachando, y
el día que la cobra no hay sorpresa que dar — solo una cuenta que se salda.

Lo que hace ahora: **calla** hasta que falta poco, y entonces suelta un
guiño sin decir qué es ni que es gratis.

| Sellos (de 13) | Qué ve el cliente |
|---:|---|
| 0–10 | **Nada.** Ni una palabra de esta tarjeta |
| 11–12 | «Con un par de visitas más, quizá te llegue una sorpresa.» |
| 13 o más | «Tienes una sorpresa esperándote. Pregúntanos en caja.» |

Los dos textos y el umbral (`aviso_desde`, por omisión 2) los escribe
gerencia en **Admin → Rewards → Tarjetas de sellos**, con vista previa de
cómo se va a leer. `aviso_desde = 0` apaga el guiño por completo.

> **El número se quitó del SERVIDOR, no de la pantalla.** `fn_mi_resumen_lealtad`
> ya no manda `tiene`, `requeridos`, `faltan` ni el catálogo de premios:
> manda una frase. Esconderlo solo en el frontend habría sido teatro — el
> JSON se lee en el inspector del navegador en dos clics.
>
> **El personal sí sigue viendo el número exacto** por `fn_rewards_para_caja`
> y `fn_rewards_admin`. Quien entrega el premio tiene que saber.

### Dónde vive cada número

Estaban repartidos en cinco lugares y la única forma de contestar «¿cuánto
vale una mancuerna?» era abrir el repo. Ahora están todos en **Admin →
Rewards → Cómo está armado**, con un conversor y con la columna que dice
dónde vive cada uno — porque no se tocan igual:

| Parámetro | Valor | Dónde vive | ¿Se edita en Admin? |
|---|---|---|---|
| Tasa de canje | 10 = $1 | `fn_tasa_mancuernas()` | No |
| Se gana | 1 por cada $10 | dentro del trigger `fn_acumular_mancuernas` | **No, y a propósito** |
| Tope por ticket | 100 | el mismo trigger | No |
| Cupón | 100 mancuernas | `fn_mi_resumen_lealtad` | No |
| Paquetes de recarga | tabla | `paquetes_saldo` | No (todavía) |
| Sellos: compras, mínimo, guiño | tabla | `config_sellos` | **Sí** |

Lo de la ganancia no se movió al panel a propósito: ese trigger corre en
**cada cobro**, y un trigger sobre `ordenes` ya dejó a la tienda 50 minutos
sin poder cobrar. Se cambia con una migración, no con un botón — y el panel
dice dónde está para que quien lo busque no tenga que adivinar.

### El ajuste que conviene vigilar

`config_sellos.precio_minimo` está en **$0**: hoy cualquier producto sella.
Eso significa que 13 aguas de $10 dan derecho a un premio del catálogo.

No es catastrófico (13 aguas dejan más margen del que cuesta un shake),
pero si se nota abuso, subir ese mínimo a $89 hace que solo sellen shakes
y bebidas de carta. Es un `update` de una fila:

```sql
update config_sellos set precio_minimo = 89 where tipo = 'bebida';
```

---

## 4. Tarjetas físicas de regalo

La tarjeta es el **vehículo de la venta, no el monedero**: al canjearla,
sus mancuernas pasan a la cuenta del cliente y la tarjeta queda muerta.

Se hizo así, y no con "saldo que vive en el plástico", porque:

- Si la pierde después de canjearla, no pierde nada.
- Todo el saldo vive en un solo lugar: no hay dos verdades que puedan
  desincronizarse.
- El saldo se sigue viendo en la app aunque la tarjeta se tire.

**Generar un lote** (solo gerencia):

```sql
select codigo, mancuernas from fn_generar_tarjetas(50, 2200, 'NAVIDAD-2026');
```

Devuelve 50 códigos tipo `SHKG-QKYFZCE8` listos para mandar a imprimir con
su QR. Los códigos **no son secuenciales** — con lotes numerados, quien
compra una tarjeta podría adivinar las de al lado. Tampoco llevan letras
que se confundan al teclear (sin O/0, sin I/1/L).

**Canjearla**: se escanea el QR y el saldo entra a la cuenta del cliente.

---

## 5. Por qué esto no va a fallar cobrando

Es dinero real, así que cada camino tiene su candado:

| Riesgo | Qué lo impide |
|---|---|
| Dos cajas gastan el mismo saldo a la vez | La fila del cliente se **bloquea** (`for update`) durante el canje |
| La red se cae, el cajero repite, se descuenta doble | **Un canje por orden** (índice único en la base) |
| Un cobro rechazado deja saldo regalado | El saldo se abona **al pagar**, no al pedir |
| El trigger se dispara dos veces y acredita doble | Comprueba si esa orden ya se acreditó |
| Canjear más de lo que cuesta la orden | Se recorta solo al costo (el monedero no da cambio) |
| Se cancela una venta pagada con mancuernas | `fn_devolver_canje` regresa el saldo |
| Alguien usa el saldo de otro | Solo el personal o el dueño de la cuenta |
| Sellar dos veces la misma orden | Índice único por orden y tipo |
| Canjear una tarjeta dos veces | Se bloquea y se marca `canjeada` en la misma transacción |

Además, **todo movimiento queda registrado** (`saldo_movimientos`,
`sellos_movimientos`) con cuántas mancuernas, de qué bolsa, en qué folio,
quién lo hizo y **cuánto quedó después**. Con dinero real, "el saldo dice
X" no basta: hay que poder reconstruir cómo llegó a X.

### Probado de punta a punta

- Recarga $200 → 2,200 acreditadas, y **no se duplicó** al reintentar.
- Canje de 99,999 mancuernas sobre un shake de $125 → se recortó solo a
  1,250, total a pagar $0, gastando primero las ganadas.
- Recarga sola → 0 mancuernas de lealtad; compra mixta → solo por el shake.
- 13 compras → 13 sellos; la 14 salió en $0 y la tarjeta volvió a cero.
- Tarjeta canjeada dos veces → rechazada con la fecha del primer uso.

---

## 6. Cómo lo ve el cliente

`rewards.shakeaholic.mx` → pestaña **Tarjeta**. Todo se pinta con una sola
llamada (`fn_mi_resumen_lealtad`), así que abrir la app es una espera, no
cinco.

**El pase.** Dibujado con la anatomía de un pase de Apple Wallet —
titular, un dato grande, perforación y el código abajo — para que el día
que se emita el `.pkpass` real el cliente reconozca lo mismo en los dos
lados. Arriba va el **total canjeable** y lo que vale en pesos, que es la
única cifra que le importa parado en la barra.

**El QR va chico.** En la tarjeta es la firma, no la herramienta: se toca
y ocupa la pantalla completa **sobre blanco**. Un lector falla con un QR
pequeño sobre fondo verde y el celular a media luz; blanco de borde a
borde es lo más cerca que se puede estar de subir el brillo desde la web.

Debajo del pase, en este orden: **las dos bolsas** por separado (ganadas /
compradas), **las dos tarjetas de sellos** dibujadas como las de papel —
13 círculos y un regalo, para ver cuántas faltan sin leer un número —,
**los cupones**, **los paquetes de recarga** con su bono, y el campo para
**canjear una tarjeta de regalo**.

### Apple Wallet y Google Wallet

El pase real necesita certificado de firma y un servidor que lo emita: es
el siguiente paso, y por eso la app **no** enseña un botón que todavía no
funciona. Lo que sí resuelve hoy el mismo problema — tenerla a un toque —
es instalarla en la pantalla de inicio, y la app explica cómo según sea
iPhone o Android (y esconde el aviso si ya está instalada).

---

## 7. El canje, en la caja

En el kiosko en modo cajero, al identificar al cliente aparece un panel
**solo si trae algo que usar**. Si no, la pantalla de cobro se queda igual
de simple que siempre.

**El orden de las dos operaciones importa**, y por eso está fijo en el
código: primero el premio de sellos y después las mancuernas. El servidor
recorta las mancuernas a lo que cuesta la orden, así que al revés se
gastarían de más sobre un total que todavía iba a bajar.

El canje ocurre **entre crear la orden y cobrarla**:

1. `fn_crear_orden` — el total lo calcula el servidor.
2. `fn_canjear_sellos` — el producto premiado, que **ya tiene que estar en
   la orden**, pasa a $0. El renglón se queda para que la comanda y el
   inventario sigan bien: el cliente se lleva el producto igual.
3. `fn_canjear_mancuernas` — baja `ordenes.total`.
4. `fn_cobrar_orden` con el total que devolvió el paso anterior, **no** con
   el que traía la orden al crearse.

### Probado de punta a punta

Orden de $250 (dos shakes), cliente con 300 ganadas + 2,000 compradas y la
tarjeta de bebidas llena:

- Sellos → un shake a $0, total **$125**, 13 sellos consumidos.
- Mancuernas → se pidieron 99,999 y el servidor recortó solo a **1,250**
  (exactamente $125), gastando primero las 300 ganadas y luego 950
  compradas. Total **$0**.
- Quedaron 1,050 compradas y 0 sellos. Los renglones: uno en $125 y otro
  en $0.

## 8. En Admin

**Rewards** muestra el **saldo en la calle** separado en dos, y esa
separación es el punto: las compradas son dinero que ya entró a la caja y
se debe en producto — un pasivo —; las ganadas son promoción y no le deben
nada a nadie. Sumarlas escondería justo el dato que importa.

Desde ahí también se generan los lotes de tarjetas de regalo (los códigos
se muestran una sola vez, para copiar y mandar a imprimir) y se ve cuánto
falta por canjear de cada lote.

## 9. Lo que falta

- **Wallet**: emitir el `.pkpass` firmado y su equivalente de Google.
- **Editar el catálogo de premios** desde Admin (hoy es un `insert` en
  `premios_sellos`).
- **Devolución**: `fn_devolver_canje` existe pero no tiene botón; si se
  cancela una venta pagada con mancuernas hay que llamarla a mano.
