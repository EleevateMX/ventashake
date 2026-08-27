# Flujo cocina

## Generación

Al pagarse una orden, `trg_crear_pedidos_cocina` divide los items por
estación:

```
item → producto → categoría → categorias.cocina_id
   (fallback: orden_items.cocina_slug; default: 'bebidas')
```

Resultado: hasta 2 filas en `pedidos_cocina` (una por cocina presente) con
sus `cocina_items`.

## Pantallas (apps/cocina-alimentos, apps/cocina-bebidas)

```ts
const pedidos = await listarPedidosCocina(sb, 'alimentos') // o 'bebidas'
const off = suscribirPedidosCocina(sb, recargar) // realtime ya habilitado
await cambiarEstadoPedido(sb, pedidoId, 'en_preparacion')
```

Estados: `pendiente → en_preparacion → listo → entregado` (+ `cancelado`).

## Cliente display

Escucha los mismos cambios y muestra folios (`ordenes.folio`) agrupados en
"Preparando" (`pendiente`/`en_preparacion`) y "Listo" (`listo`).

## Qué grita la tarjeta antes de que nadie la toque

Tres cosas viajan en la cabecera de cada comanda porque cambian *cómo* se
prepara, no solo *qué*:

**El acento de urgencia** (la franja de color de arriba). La regla vive en
`packages/utils/src/comandas.ts` — una sola, compartida por las dos
estaciones, porque si cada app la calculara a su manera acabarían
discrepando en la misma barra:

| Estado | Franja |
|---|---|
| `pendiente` (nadie la ha activado) | menta **parpadeando** |
| `en_preparacion` dentro del umbral | plátano fijo |
| `en_preparacion` pasado el umbral | fresa **parpadeando** |
| `listo` | menta fija |

El umbral es distinto por estación y es deliberado: **bebidas 3 min,
alimentos 5 min** (`UMBRAL_MINUTOS`). Se cuenta desde `updated_at`, o sea
desde que alguien la activó — no desde que entró la venta, porque el reloj
que importa es el de quien la está preparando.

**A nombre de quién**, debajo del folio y en fresa: es con lo que se
entrega.

**Aquí o para llevar** (`ordenes.para_llevar`), como chip a la derecha.
`true` sale en fresa y grita; `false` sale apagado, porque es el caso común
y no hay que revisarlo; `null` **no pinta nada** — son las ventas de antes
de que existiera la opción, y afirmar "aquí" por omisión haría que barra
sirviera en vaso de vidrio algo que se va a la calle. El mismo dato se
imprime en la etiqueta, pegado al `n de N` para no gastar un renglón de los
25 mm (ver `docs/etiquetas-comanda-tspl.md`).

Se elige en el kiosko, en la misma pantalla donde se escribe el nombre, y
viaja por las dos puertas que crean órdenes: `fn_crear_orden` y
`fn_crear_orden_kiosko_caja`. Arreglar solo una de las dos deja el dato
saliendo a veces sí y a veces no, que es peor que no tenerlo.

## Un extra nunca viaja huérfano

`categorias.va_a_pantalla` decide qué renglones llegan a las estaciones. Un
scoop de pre-entreno suelto tiene `false` a propósito: lo sirve el cajero.

Pero si el cliente lo pide **preparado**, ese "Preparado" es un renglón
hijo cuya categoría (Extras Bebidas) sí va a pantalla — y durante un tiempo
llegaba el hijo solo. Barra veía una comanda que decía "Preparado" y nada
más, sin saber de qué.

Hoy `fn_crear_pedidos_cocina` arrastra al padre: si un renglón hijo va a
pantalla, su producto se va con él, y a la misma cocina. Un extra sin su
producto no es una instrucción, es un acertijo.

## Pendiente (fase 6)

- Sincronizar `ordenes.estado` global cuando TODOS los pedidos de la orden
  estén listos/entregados (trigger adicional o update desde KDS).
- Modificadores/proteína elegida visibles en `personalizacion`.
