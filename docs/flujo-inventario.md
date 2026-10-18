# Flujo inventario

Dos almacenes sembrados por sucursal: **Bodega** y **Kiosko**.

| Operación | Cómo | Movimiento |
|---|---|---|
| Entrada de compra | `registrarMovimiento({ tipo: 'compra', cantidad: +n, almacen: Bodega, costoUnitario })` | `compra` |
| Transferencia Bodega → Kiosko | `transferir({ origenId, destinoId, items })` | `traspaso` −origen / +destino |
| Venta | automática (trigger al pagar la orden, descuenta del `almacen_id` de la orden) | `venta` |
| Merma | fila en `mermas` + `registrarMovimiento({ tipo: 'merma', cantidad: −n })` | `merma` |
| Ajuste manual | `registrarMovimiento({ tipo: 'ajuste', cantidad: ±n, nota })` | `ajuste` |
| Existencias | `vw_stock_almacen` (incluye flag `bajo_minimo`) | — |

## Reglas

- `inventario_movimientos` es el kardex: **nunca se edita ni borra**; los
  errores se corrigen con un movimiento `ajuste` compensatorio.
- El stock puede quedar negativo (venta sin captura de inventario previa):
  se permite a propósito para no bloquear ventas; el reporte lo evidencia
  y se corrige con ajuste.
- Las cantidades van en la **unidad del insumo** (g, ml, scoop, pza) — la
  misma unidad de las recetas.

## Proteína: todo en scoops (09/10/26)

La unidad del insumo de proteína es el **scoop**, en los dos almacenes.
`insumos.contenido` = scoops por bote (lo pone Costeos, campo `scoops`).

- **Bodega** tiene botes cerrados; Costeos la enseña y la cuenta en
  **botes**, y la sync (`fn_sync_stock_costos`) manda `invOriginal ×
  scoops`. El conteo de botes en Costeos se manda × scoops por bote.
- **Kiosko** tiene scoops sueltos: la sync lee `invScoops` (antes leía
  `invIndividual`, que en proteína no existe, y por eso el kiosko solo
  bajaba).
- **«¿Llegó mercancía?»** en el kiosko: «+1 bote (N scoops)» y «+1 scoop».
  Antes la caja salía del primer número de `presentacion` — en proteína son
  gramos: «+1 caja» metía 1,224 scoops.
- **La venta descuenta la proteína que eligió el cliente**
  (`fn_descontar_inventario_por_orden`): el extra «Proteína MARCA - sabor»
  trae receta de 1 scoop de su bote; si el shake tiene proteína elegida, se
  saltan las líneas de proteína de su propia receta; «Doble scoop» suma un
  scoop más de la elegida. Sin elección, todo igual que antes. Las recetas
  de los extras no las pisa Costeos (su sync filtra `not es_extra`).
- **Admin → Inventario → Proteína** (`fn_proteinas_elegidas_admin`,
  `fn_proteina_elegida_guardar`, solo gerencia): de qué bote sale cada una,
  las que no tienen bote, los botes cuya receta descuenta otro sabor y los
  nombres rotos de Costeos. Ligar no borra: la receta anterior queda en 0.
- Se mostró en botes + scoops con `botesYScoops` (`@shake/utils`).
- **Botes de venta y proteína de barra son dos inventarios** (10/10). Los
  de venta («Chai 960gr»: precio de bote, sin precio de scoop) se cuentan en
  **botes** también en el kiosko de Costeos; la de barra («Chai»: precio de
  scoop) en scoops. El sistema guarda los dos en scoops.
- **«¿Abriste un bote de venta para la barra?»** (kiosko → Caja y turno):
  `fn_inventario_abrir_bote` resta los scoops del bote de venta y los suma a
  la proteína de barra, con un mismo `referencia_id`. El destino lo sugiere
  `fn_inventario_botes_abribles` por marca + sabor sin gramaje.
- **Cada bote y cada scoop descuenta el insumo de SU fila de Costeos**
  (10/10, `fn_proteina_recetas_alinear`). El sync crea la receta solo la
  primera vez y nunca la reapunta: al renombrar la fila (el legado - R/- B)
  el producto seguía descontando el insumo viejo. Eran 70 botes, 55 scoops y
  22 proteínas elegidas. Corre después de cada guardado de Costeos (trigger
  `app_data_sync_proteinas`) y no borra: lo viejo queda en cantidad 0.
- Se aplicó con toda la proteína en 0 (el reinicio del 07/10): el cambio de
  unidad no tuvo números viejos que convertir.

## Combos: cada parte descuenta su producto real (16/10/26)

La opción elegida (muffin, té, café, galleta) descuenta la receta de su
producto real vía `inventario_como`, y lo que el combo trae siempre (la
chapata) sale de `combo_fijos`. Se arma en Admin → Combos, con semáforo.
Detalle en `docs/combos-promociones.md`.

## Kardex en Costeos y conteo por peso (17/10/26)

- El 📜 de Costeos → Inventario lee el sistema (`fn_costos_kardex` →
  `fn_kardex`): ventas con ticket, hora, quién cobró, existencia antes y
  después de cada movimiento. Mismo cálculo que el Kardex de Admin.
- ⚖ en el conteo del kiosko: gramos netos ÷ (presentación ÷ scoops por
  bote). Varios botes abiertos se suman; los cerrados cuentan bote × scoops.
  Ingredientes por porción: gramos ÷ porción.
- Cancelar una venta no regresa nada solo. Con «Regresar al inventario»
  (Admin) se escribe un movimiento `ajuste` con nota «Cancelacion folio N»
  y `referencia_id` = la orden; el Kardex lo enseña como «Cancelación».

## Pendiente

- UI de compras/transferencias/mermas (fase 7, en `apps/admin` o
  `apps/costos`).
- Concurrencia: el descuento de venta lo hace el trigger en la
  transacción del UPDATE (seguro); `registrarMovimiento` del cliente hace
  read-modify-write — si dos dispositivos capturan a la vez puede perderse
  un delta. Fase 9: mover a RPC con `update ... set stock = stock + n`.

## Entradas de compra sin doble conteo (18/10/26)

Hasta el 17/10, cada entrada de Costeos (bebidas, snacks, proteína) se sumaba
dos veces en bodega: una en `fn_entrada_confirmar` y otra cuando Costeos
guardaba su documento con la misma entrada y la sincronización copiaba la
diferencia. Al traspasar al kiosko quedaba un paquete «fantasma» en bodega.

Ahora:

1. `fn_entrada_confirmar` suma la existencia **y** sube
   `costos_stock_sync.ultimo_valor` en la misma cantidad. Cuando Costeos
   guarda, la diferencia es cero.
2. La proteína entra en **scoops** (botes × scoops por bote del documento de
   Costeos), igual que la sincronización.
3. Una línea con `"almacen":"kiosko"` entra **por pieza** al kiosko. Costeos
   lo ofrece en bebidas y snacks («Por pieza»). El costo de compra del insumo
   se guarda por caja (`piezas_por_caja`).
4. `entrada_lineas.almacen_id` y `factor_stock` dicen a dónde y cómo entró
   cada línea; `fn_entrada_cancelar` regresa exactamente eso y **no** toca el
   último valor de Costeos.

Comprobado en producción dentro de una transacción que se deshizo: entrada
de 1 paquete → bodega +1; guardar Costeos → sigue +1; traspaso → bodega 0,
kiosko +4; 1 pieza suelta → kiosko +1; cancelar → regresa. Proteína: 2 botes
de 65 scoops → +130.
