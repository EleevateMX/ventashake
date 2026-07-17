# Checklist de producción

Antes de operar en vivo en una sucursal. Basado en la auditoría de
producción (`docs/auditoria-produccion.md`) y en todo lo construido en
esa ronda.

## Variables de entorno

- [ ] Cada app (`apps/*`) tiene su `.env` con `VITE_SUPABASE_URL` y
      `VITE_SUPABASE_ANON_KEY` (públicas por diseño; ver `.env.example`
      de cada app)
- [ ] `agente-impresion/.env` configurado por cada equipo que corre el
      agente de impresión
- [ ] GitHub Secrets `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`
      configurados (ya lo están — CI en verde)
- [ ] Ningún `service_role` ni credencial privada en el frontend
      (verificado: solo anon key, pública por diseño)

## Migraciones

- [ ] Todas las migraciones en `supabase/migrations/` aplicadas al
      proyecto de producción (`zyjtnaystsporbuzcmqk` u otro si se clona
      para una sucursal nueva)
- [ ] `pnpm --filter @shake/types typecheck` en verde tras cualquier
      migración nueva (regenerar `packages/types/src/database.ts` con
      `npx supabase gen types typescript --project-id <id> --schema public`)

## RLS y seguridad

- [x] `pagos`: sin policy de UPDATE para anon/authenticated; INSERT
      bloquea `estado='aprobado'` Y `estado_transaccion in
      ('authorized','refunded_partial','refunded_full')` (brecha en la
      segunda columna encontrada y cerrada esta ronda, ver
      `docs/pruebas-seguridad.md` §2.1)
- [x] `ordenes`/`orden_items`: sin policy de INSERT directo (solo vía
      `fn_crear_orden`/`fn_crear_orden_kiosko_caja`); ninguna transición de
      `estado_pago_orden` posible fuera de las funciones `SECURITY DEFINER`
      (máquina de estados con triggers, ver `docs/maquina-estados.md`)
- [x] `empleados.pin_hash`: cero acceso directo de tabla, solo RPCs
- [x] `clientes.mancuernas`: cero UPDATE directo (solo columna `activo`);
      `cupones`/`mancuernas_movimientos`: cero INSERT directo (encontrado y
      cerrado esta ronda, ver `docs/pruebas-seguridad.md` §2.2)
- [x] `impresoras.agente_token`: cero acceso directo de tabla — **brecha
      crítica encontrada y cerrada esta ronda**, ver
      `docs/pruebas-seguridad.md` §2.4
      - [ ] **Acción pendiente de operación, no de código:** rotar el
            `agente_token` de cada impresora ya desplegada (botón "Rotar
            token" en Admin → Impresoras) y actualizar
            `printers.config.json` en cada agente local — los tokens
            actuales estuvieron expuestos antes de este cierre
- [ ] Revisar `mcp__Supabase__get_advisors` (o el equivalente en el panel
      de Supabase) tras cualquier migración nueva
- [ ] Pendiente conocido (deuda A3, ver `docs/pruebas-seguridad.md` §4):
      `productos.precio`, `caja_cortes`, `promociones` siguen con acceso
      directo de tabla para anon/authenticated — requieren Supabase Auth de
      personal antes de poder cerrarse sin romper Admin/POS. No exponer la
      anon key fuera de las apps oficiales.

## Pruebas de pago del kiosko (máquina de estados)

- [x] Ver `docs/maquina-estados.md`, `docs/flujo-pagos.md`,
      `docs/pruebas-seguridad.md` — **el autoaprobado del kiosko fue
      eliminado de producción esta ronda.** Ninguna orden del kiosko puede
      convertirse en venta pagada sin un pago con `estado_transaccion =
      'authorized'` real, verificado por `fn_confirmar_venta()`.
- [x] Modo `pagar_en_caja` (default, sembrado para todas las sucursales):
      orden nace en `awaiting_counter_payment`, sin efectos, hasta que el
      cajero la cobra desde POS → `/pendientes` — probado en vivo
      (rollback intencional), incluida la doble-cobro-simultáneo
- [x] Modo `demo`: bloqueado en producción por dos capas independientes
      (build `import.meta.env.PROD` + `sucursales.es_produccion` en base) —
      probado que ninguna de las dos por sí sola alcanza si la otra falla
- [ ] Modo `clip`: Edge Functions escritas pero SIN credenciales ni
      desplegar — ver `docs/integracion-clip.md` sección "Pasos exactos
      para activar Clip" antes de usarlo en una sucursal real
- [ ] Cobro en efectivo desde POS: aparece en el corte de caja
- [ ] Cobro "Clip" manual desde POS (referencia de voucher, Stand 2):
      aparece en `total_clip` del corte — este flujo NO cambió esta ronda
- [ ] Doble clic en "Confirmar pago": un solo pago aprobado, un solo
      pedido de cocina
- [ ] Simular `payment_unknown` (cortar red a medio cobro) y confirmar que
      `fn_reconciliar_pagos()` lo resuelve solo, sin duplicar nada — ver
      `docs/reconciliacion-pagos.md`

## Pruebas de impresora (por sucursal, por impresora)

- [ ] Impresora registrada en Admin → Impresoras con su estación correcta
- [ ] `npm run diagnose -- --imprimir` desde `agente-impresion/` sin
      ningún ✘ — cubre conexión a Supabase, autenticación, sucursal/estación,
      coherencia de config, cola de impresión Y la prueba física de
      hardware en un solo comando (ver `docs/diagnostico-impresion.md` para
      qué se validó automatizado en esta ronda vs. qué sigue pendiente de
      hardware real por sucursal)
- [ ] Agente corriendo (`npm run start` o como servicio) y
      `http://localhost:7777/status` muestra la impresora conectada
- [ ] Venta real de prueba con un producto de esa estación imprime la
      comanda sola, sin abrir ningún diálogo del navegador
- [ ] Apagar la impresora a medio proceso y confirmar que el pedido sigue
      viéndose normal en el KDS (no se pierde, no se cancela nada)
- [ ] Reimprimir manualmente desde Admin y desde el KDS

## Prueba Cocina

- [ ] Pedido con solo alimentos llega únicamente a Cocina
- [ ] Estados avanzan correctamente (Pendiente → Preparando → Listo → Entregar)
- [ ] Indicador de impresión visible en cada tarjeta

## Prueba Barra

- [ ] Pedido con solo bebidas llega únicamente a Barra
- [ ] "Entregar ya" funciona sin esperar a "Listo"
- [ ] Indicador de impresión visible en cada tarjeta

## Inventario

- [ ] Venta real descuenta el insumo correcto según receta
- [ ] costosshake sigue alimentando catálogo/precios/recetas sin romper
      el stock ya vendido (modelo de deltas, ver `docs/pendientes.md`)
- [ ] Revisar `vw_stock_almacen` por productos activos sin receta o con
      stock en negativo antes de abrir

## Cierre de caja

- [ ] Corte calcula desde `pagos`/`inventario_movimientos` reales, no
      desde un total capturado a mano
- [ ] Diferencia (efectivo esperado vs. contado) se ve clara al cerrar

## Rewards

- [ ] Google habilitado en Supabase Auth (mientras tanto, la PWA muestra
      un aviso amable en vez de error técnico)
- [ ] Identificación por QR funciona en POS y kiosko
- [ ] Mancuernas y cupones se otorgan correctamente en una venta real

## Monitoreo (día a día)

- [ ] Revisar Admin → **Sistema** (nuevo esta ronda): pagos pendientes/
      desconocidos, órdenes esperando caja, órdenes expiradas, impresoras
      conectadas, comandas fallidas, pedidos sin comanda, ventas sin
      movimiento de inventario — un solo lugar para ver si algo se
      atoró (ver `docs/reconciliacion-pagos.md`)
- [ ] Revisar Admin → Impresoras: comandas `failed`, impresoras
      desconectadas
- [ ] Revisar el corte de caja por diferencias inusuales
- [ ] `docs/recuperacion-fallas.md` a la mano para el staff

## Rollback

- [ ] Todas las migraciones de esta ronda son aditivas (no borran tablas
      ni datos existentes) — un rollback significa dejar de usar las
      nuevas RPCs/columnas, no requiere revertir SQL destructivamente
- [ ] Si `fn_crear_orden`/`fn_cobrar_orden` tuvieran un problema en vivo,
      el fallback manual es operar el corte/pagos directo en Supabase
      mientras se corrige — no hay pérdida de datos históricos

## Responsables / soporte

- [ ] Definir quién resuelve una impresora caída durante el turno
      (reimprimir manual mientras tanto)
- [ ] Definir quién tiene acceso a Admin → Impresoras para reconfigurar
- [ ] Definir el contacto técnico para revisar logs
      (`agente-impresion/logs/`, panel de Supabase) si algo se ve raro
