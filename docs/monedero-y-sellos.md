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

## 6. Lo que falta (siguiente paso)

El motor está completo y probado. Falta la parte que se toca:

- **Kiosko / POS**: botón para canjear mancuernas al cobrar, canjear la
  tarjeta de sellos, y vender los paquetes de recarga.
- **App del cliente**: ver las dos bolsas, los sellos y comprar recarga.
- **Admin**: generar lotes de tarjetas, editar el catálogo de premios y ver
  cuánto saldo hay en la calle.
