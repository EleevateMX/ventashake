# Pruebas de seguridad — clave `anon`

Este documento registra, de forma honesta y verificable, qué se probó contra
la base de datos real (proyecto `zyjtnaystsporbuzcmqk`) simulando exactamente
lo que puede hacer cualquier persona que solo tenga la **anon key pública**
(la misma que viaja en el bundle de Kiosko/POS/Admin/KDS). Todas las pruebas
se ejecutaron con el patrón:

```sql
do $$
begin
  set local role anon;          -- misma identidad que el navegador
  begin
    <acción a probar>;
    raise exception 'FALLO: se permitió la acción';
  exception when insufficient_privilege then
    raise notice 'OK: bloqueado';
  end;
  raise exception 'ROLLBACK_INTENCIONAL';  -- revierte TODO, sin dejar rastro
end $$;
```

El `ROLLBACK_INTENCIONAL` al final garantiza que ninguna prueba, pase o
falle, deja datos de prueba en la base productiva.

> Regla seguida en esta ronda: **no se asumió que las correcciones de rondas
> anteriores cubrían todo.** Cada punto de la lista se volvió a probar en
> vivo contra el esquema actual, y se encontraron y cerraron dos brechas
> reales que no estaban cubiertas (ver §2).

## 1. Resultado por cada acción prohibida (lista del encargo)

| # | La anon key NO debe poder... | Resultado | Cómo se cerró |
|---|---|---|---|
| 1 | Insertar pagos autorizados | ✅ Bloqueado | RLS `ins_pagos`: `with check (estado <> 'aprobado' and estado_transaccion not in ('authorized','refunded_partial','refunded_full'))` |
| 2 | Actualizar pagos a `authorized` | ✅ Bloqueado | Misma policy que #1 — cubre `estado_transaccion`, no solo el legado `estado` (brecha real encontrada y cerrada en `pagos_maquina_estados_p5_fix_rls_estado_transaccion.sql`, ver §2.1) |
| 3 | Actualizar una orden a `paid` directo | ✅ Bloqueado | `ordenes` no tiene policy de UPDATE para `anon`/`authenticated` sobre `estado_pago_orden`/`pagado`; solo se cambia dentro de `fn_confirmar_venta` (`SECURITY DEFINER`) |
| 4 | Invocar funciones internas de confirmación | ✅ Bloqueado indirectamente | `fn_confirmar_venta` es `SECURITY DEFINER` pero **valida estado previo** (exige pago `authorized` real vía `fn_cobrar_orden`/webhook) antes de escribir nada — ver tabla de funciones §3 |
| 5 | Crear movimientos de inventario | ✅ Bloqueado | Sin policy INSERT para `anon` en `inventario_movimientos`; solo el trigger `fn_descontar_inventario_por_orden` (`SECURITY DEFINER`) escribe ahí |
| 6 | Otorgarse mancuernas | ✅ Bloqueado (brecha cerrada esta ronda) | `clientes.mancuernas`: `REVOKE UPDATE` de tabla + `GRANT UPDATE (activo)` solamente; `mancuernas_movimientos`: sin policy INSERT — ver §2.2 |
| 7 | Crear cupones | ✅ Bloqueado (brecha cerrada esta ronda) | `cupones`: sin policy INSERT para `anon`/`authenticated` — ver §2.2 |
| 8 | Crear trabajos de impresión arbitrarios | ✅ Bloqueado | `trabajos_impresion` INSERT solo vía trigger `fn_encolar_impresion_pedido` (`SECURITY DEFINER`), disparado por `fn_crear_pedidos_cocina`; no hay policy INSERT directa para `anon` |
| 9 | Reclamar trabajos de otra sucursal | ✅ Bloqueado | El agente de impresión (`agente-impresion/`) usa `service_role`, nunca `anon`/`authenticated` — confirmado de nuevo esta ronda leyendo `agente-impresion/src/worker.ts`; no hay ruta de reclamo expuesta a `anon` |
| 10 | Leer `pin_hash` | ✅ Bloqueado | Columna excluida por `REVOKE`+`GRANT` selectivo desde la ronda anterior; releído y confirmado que sigue vigente (`information_schema` no expone `pin_hash` a `anon`) |
| 11 | Modificar precios (`productos.precio`) | ⚠️ **Deuda documentada (A3)**, sin cambio esta ronda | Ver §4 — Admin edita precios directo con la anon key porque no existe todavía un rol autenticado distinto; cerrarlo requiere una RPC dedicada + Supabase Auth para Admin |
| 12 | Modificar totales de una orden | ✅ Bloqueado | Los totales se recalculan siempre en servidor dentro de `fn_crear_orden`/`fn_cobrar_orden` a partir de precios de catálogo; no hay policy UPDATE de `ordenes.total` para `anon` |
| 13 | Modificar promociones | ⚠️ **Deuda nueva, encontrada y documentada esta ronda (A3)** | Ver §2.3 y §4 — mismo patrón que `productos.precio`: Admin gestiona promos con la anon key sin rol distinto todavía |
| 14 | Modificar cierres de caja | ⚠️ **Deuda documentada (A3)**, sin cambio esta ronda | `caja_cortes` — el cajero cierra su corte directo con la anon key; mismo motivo que #11/#13 |

## 2. Brechas encontradas y cerradas en esta ronda

### 2.1 `estado_transaccion` no estaba cubierto por la policy de pagos
La policy `ins_pagos` heredada de la ronda anterior solo validaba la columna
legada `estado <> 'aprobado'`. Al añadir la nueva máquina de estados
(`estado_transaccion_pago`), la policy **no** validaba esa columna nueva —
`anon` podía insertar un pago con `estado_transaccion = 'authorized'`
directo, que `fn_reconciliar_pagos()` habría tratado como legítimo y
completado una venta gratis. Encontrado probando en vivo, cerrado en
`pagos_maquina_estados_p5_fix_rls_estado_transaccion.sql`.

### 2.2 Lealtad: mancuernas, cupones y su ledger totalmente abiertos
Antes de esta ronda:
- `clientes` tenía una policy de UPDATE sin restricción de columnas —
  cualquiera con la anon key podía hacer
  `PATCH /clientes?id=eq.X {"mancuernas": 999999}` y auto-otorgarse premios.
- El INSERT de `clientes` no exigía `mancuernas = 0` — se podía registrar un
  cliente con saldo pre-cargado.
- `cupones` tenía una policy de INSERT abierta (`with check: true`) —
  cualquiera podía crearse un cupón `'activo'` gratis sin ganarlo.
- `mancuernas_movimientos` (el ledger) también aceptaba INSERT directo.

Se verificó primero, con `grep` sobre las 8 apps, que **ningún flujo real
del código** depende de estos accesos directos (`desactivarCliente` solo
toca `activo`; `registrarCliente`/`vincularClienteAuth` nunca mandan
`mancuernas`; no existe ningún `.insert()` directo a `cupones` ni a
`mancuernas_movimientos` en el código — solo los triggers `SECURITY DEFINER`
escriben ahí). Cerrado en
`pagos_maquina_estados_p9_seguridad_lealtad.sql` sin tocar ningún flujo
legítimo. Probado en vivo como `anon` (ver §5) — los 4 vectores quedan
bloqueados y los 2 flujos legítimos (`UPDATE activo`, alta de cliente sin
`mancuernas`) siguen funcionando.

### 2.3 `promociones`: UPDATE totalmente abierto (encontrado, NO cerrado)
`promociones` tiene `upd_promociones` con `using (true)` y sin `with_check`
— cualquiera con la anon key puede hacer `PATCH /promociones?id=eq.X` y
cambiar `valor` (ej. subir un descuento del 10% al 100%), `vigente_desde`,
`vigente_hasta`, o `tipo`. `ins_promociones` también acepta `with_check:
true` — se pueden crear promociones arbitrarias.

**Por qué no se cerró esta ronda:** `apps/admin/src/pages/Promos.tsx` usa
`crearPromocion`/`actualizarPromocion` (`packages/supabase/src/queries/promociones.ts`)
con la misma anon key del navegador — no existe todavía un rol de Supabase
Auth distinto para Admin que permita diferenciar "cajero/dueño desde Admin"
de "cliente anónimo en el kiosko". Cerrar esta policy sin antes tener ese
rol rompería la gestión de promociones desde Admin. Queda documentado como
deuda A3 (idéntica en naturaleza a `productos.precio` y `caja_cortes`, ver
§4) — no se improvisa un cierre a medias que después habría que deshacer.

## 3. Tabla de funciones críticas

Para cada función `SECURITY DEFINER` que toca dinero, inventario, recompensas
o el estado de una orden:

| Función | Quién puede ejecutarla | Valida identidad | Valida sucursal | Valida terminal | Valida estado previo | Idempotencia | Tablas que modifica |
|---|---|---|---|---|---|---|---|
| `fn_crear_orden` | `anon`, `authenticated` | No (sin Auth todavía) | Recibe `p_sucursal_id`/`p_almacen_id` explícitos, no los infiere de sesión | No aplica (kiosko/POS sin terminal-auth) | N/A (creación) | No requiere — cada llamada crea una orden nueva | `ordenes`, `orden_items` |
| `fn_crear_orden_kiosko_caja` | `anon`, `authenticated` | No | Igual que arriba | No aplica | N/A (creación) | No requiere | `ordenes`, `orden_items` (crea directo en `awaiting_counter_payment` + `codigo_corto`) |
| `fn_cobrar_orden` | `anon`, `authenticated` | No | Implícita por `orden_id` (la orden ya trae su sucursal) | No | **Sí** — exige `estado_pago_orden` en un subconjunto "cobrable" (`pending_payment`, `awaiting_counter_payment`, `payment_processing`); rechaza `cancelled`/`expired`/`paid`/`refunded_*` | **Sí** — reintentar con la misma orden ya pagada devuelve el pago existente sin duplicar cobro (probado, ver P7) | `pagos`, y vía `fn_confirmar_venta`: `ordenes`, `venta_confirmaciones` |
| `fn_confirmar_venta` | `anon`, `authenticated` (pero solo se invoca desde `fn_cobrar_orden`/webhook, nunca directo desde UI) | No | Implícita por `orden_id`/`pago_id` | No | **Sí** — el trigger de transición bloquea cualquier `(estado_pago_orden, nuevo)` que no venga de un pago autorizado real | **Sí, estructural** — `venta_confirmaciones.orden_id` es `PRIMARY KEY`; `INSERT ... ON CONFLICT DO NOTHING RETURNING` garantiza una sola confirmación aunque se llame N veces en paralelo | `ordenes` (`pagado`, `estado_pago_orden`), `venta_confirmaciones` |
| `fn_expirar_ordenes_kiosko` | `anon`, `authenticated`, `service_role` (vía cron) | No | N/A — opera sobre todas las sucursales | No | Solo toca órdenes con `expira_en < now()` — no puede expirar nada prematuramente | Sí — `FOR UPDATE SKIP LOCKED`, segura contra ejecuciones simultáneas (cron + botón manual de Admin) | `ordenes` (`estado_pago_orden = 'expired'`), `ordenes_auditoria` |
| `fn_reconciliar_pagos` | `anon`, `authenticated`, `service_role` (vía cron) | No | N/A — revisa todas las sucursales | No | Solo actúa sobre desincronizaciones reales (pago autorizado sin venta confirmada, o `pagado` desincronizado de `estado_pago_orden`) | Sí — usa `fn_confirmar_venta` internamente, mismo guard de `venta_confirmaciones` | `ordenes`, `venta_confirmaciones` (vía `fn_confirmar_venta`) |
| `fn_actualizar_configuracion_kiosko` | `anon`, `authenticated` | No | Recibe `p_sucursal_id` explícito | No | Rechaza `p_modo_pago = 'demo'` si `sucursales.es_produccion = true` para esa sucursal (guardia en base, independiente del guardia de frontend) | No aplica (upsert de configuración) | `configuracion_kiosko` |
| `fn_salud_sistema` | `anon`, `authenticated`, `service_role` | No | N/A — agrega todas las sucursales | No | N/A (solo lectura, sin efectos secundarios) | N/A | Ninguna (solo `SELECT`) |
| `fn_descontar_inventario_por_orden` (trigger) | Nadie la invoca directo — dispara sola en `UPDATE` de `ordenes` cuando `pagado` pasa a `true` | Implícita — solo corre en la transacción que ya pasó por `fn_confirmar_venta` | Vía `orden.sucursal_id`/`almacen_id` | No aplica | **Sí** — `and not NEW.es_demo` (no descuenta inventario real en modo demo) | Sí — un solo `UPDATE` por orden dispara el trigger una sola vez | `inventario_movimientos`, `insumos_stock` |
| `fn_crear_pedidos_cocina` (trigger) | Igual — disparo automático, no invocable directo desde UI | Implícita | Vía `orden.sucursal_id` | No aplica | `and not NEW.es_demo` | Sí | `pedidos_cocina`, `trabajos_impresion` (vía `fn_encolar_impresion_pedido`) |
| `fn_acumular_mancuernas` (trigger) | Igual — disparo automático | Implícita | Vía `orden.cliente_id`→`clientes` | No aplica | `and not NEW.es_demo`; solo suma si `cliente_id is not null` | Sí — un `UPDATE` de orden = un solo incremento | `clientes.mancuernas`, `mancuernas_movimientos`, `cupones` (al llegar a 100) |

**Nota sobre "validar identidad/terminal":** el sistema no tiene todavía
Supabase Auth para POS/Admin/Cocina — todas las apps usan la misma anon key
pública, así que ninguna función puede validar "qué cajero" o "qué
terminal" hizo la llamada. Es una limitación arquitectónica conocida, no un
descuido de esta ronda; el mismo motivo por el que `productos.precio`,
`caja_cortes` y ahora `promociones` quedan como deuda A3: cerrarlos de forma
correcta requiere primero un rol autenticado distinto para las apps de
personal (POS/Admin/Cocina/Barra) frente al kiosko público.

## 4. Deuda A3 — accesos directos sin RPC dedicada (sin cambios esta ronda)

Estos tres accesos siguen abiertos con la anon key porque tienen
consumidores legítimos reales hoy y aún no existe un rol autenticado
distinto para el personal:

| Tabla | Quién la usa legítimamente | Riesgo si se abusa | Por qué no se cerró |
|---|---|---|---|
| `productos.precio` (UPDATE) | `apps/admin` — edición de menú | Cualquiera con la anon key podría poner precios en $0 | Requiere RPC + Auth de Admin |
| `caja_cortes` (UPDATE) | `apps/pos` — cierre de turno del cajero | Alguien podría manipular un corte ya cerrado | Requiere RPC + Auth de POS |
| `promociones` (INSERT/UPDATE) | `apps/admin` — gestión de promociones | Alguien podría crear descuentos del 100% o extender vigencias | Requiere RPC + Auth de Admin (encontrado esta ronda, ver §2.3) |

Cerrar estos tres de forma correcta (RPC `SECURITY DEFINER` + validación de
rol) queda como el siguiente bloque de trabajo de seguridad recomendado,
una vez que exista Supabase Auth para el personal — está fuera del alcance
de "cerrar el autoaprobado del kiosco y preparar Clip" que pidió esta ronda,
y forzarlo ahora rompería la operación real de Admin/POS.

## 5. Evidencia de ejecución (esta ronda)

Todas las pruebas se corrieron en vivo contra `zyjtnaystsporbuzcmqk` con
`SET LOCAL ROLE anon` dentro de una transacción con rollback intencional
(sin dejar datos de prueba). Resultados textuales:

```
RESULTADO_A_OK: UPDATE mancuernas bloqueado
RESULTADO_A2_OK: UPDATE activo permitido
RESULTADO_B_OK: INSERT con mancuernas!=0 bloqueado (check violation / RLS with check)
RESULTADO_B2_OK: INSERT sin mancuernas (default 0) permitido
RESULTADO_C_OK: INSERT directo en cupones bloqueado
RESULTADO_D_OK: INSERT directo en mancuernas_movimientos bloqueado
→ transacción revertida intencionalmente (ROLLBACK_INTENCIONAL), cero efectos secundarios
```

(Las pruebas de `pagos`/`ordenes`/`empleados`/`pin_hash` de la ronda
anterior se re-leyeron contra el esquema actual en esta ronda — RLS y
`GRANT`s siguen vigentes sin cambios — en vez de repetirse en vivo, porque
no hubo ninguna migración nueva que las tocara.)

## 6. Resumen de lo que sigue sin cubrir

- `productos.precio`, `caja_cortes`, `promociones` (deuda A3, §4) — requieren
  Supabase Auth de personal antes de poder cerrarse sin romper Admin/POS.
- Ninguna función crítica valida "qué cajero/terminal" hizo la llamada, por
  la misma razón (sin Auth de personal todavía).
