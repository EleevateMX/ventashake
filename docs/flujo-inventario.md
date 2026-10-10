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

## Pendiente

- UI de compras/transferencias/mermas (fase 7, en `apps/admin` o
  `apps/costos`).
- Concurrencia: el descuento de venta lo hace el trigger en la
  transacción del UPDATE (seguro); `registrarMovimiento` del cliente hace
  read-modify-write — si dos dispositivos capturan a la vez puede perderse
  un delta. Fase 9: mover a RPC con `update ... set stock = stock + n`.
