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

- [ ] `pagos`: sin policy de UPDATE para anon/authenticated; INSERT solo
      permite `estado <> 'aprobado'` (verificado en `auditoria-produccion.md`)
- [ ] `ordenes`/`orden_items`: sin policy de INSERT directo (solo vía
      `fn_crear_orden`); `ordenes` UPDATE de anon/authenticated limitado a
      la columna `estado`
- [ ] `empleados.pin_hash`: SELECT de anon/authenticated no incluye esa
      columna
- [ ] Revisar `mcp__Supabase__get_advisors` (o el equivalente en el panel
      de Supabase) tras cualquier migración nueva
- [ ] Pendiente conocido: el resto del catálogo sigue con RLS `using(true)`
      (documentado en `docs/pendientes.md` §Seguridad) — aceptable mientras
      no haya Supabase Auth, pero **no exponer la anon key fuera de las
      apps oficiales**

## Pruebas de pago

- [ ] Cobro en efectivo desde POS: aparece en el corte de caja
- [ ] Cobro "Clip" manual desde POS (referencia de voucher): aparece en
      `total_clip` del corte
- [ ] Doble clic en "Confirmar pago": un solo pago aprobado, un solo
      pedido de cocina
- [ ] **Decisión de negocio pendiente**: confirmar cómo se autoriza un
      pago del kiosko mientras no haya Clip conectado (hoy se autoaprueba
      solo — ver `docs/auditoria-produccion.md` hallazgo C4)

## Pruebas de impresora (por sucursal, por impresora)

- [ ] Impresora registrada en Admin → Impresoras con su estación correcta
- [ ] `npm run test-print` desde `agente-impresion/` imprime correctamente
      (acentos/eñes legibles — ajustar `characterSet` si no, ver
      `docs/configuracion-impresoras.md`)
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
