# Pendientes

## Datos (bloquean fase 4 completa)

- [ ] Ejecutar `pnpm etl:dry`, conciliar duplicados, `pnpm etl:aplicar`
- [ ] Capturar 16 precios de shakes + 4 de alimentos (productos inactivos)
- [ ] Capturar 106 cantidades de receta (`PENDIENTE-CANTIDAD`)
- [ ] Capturar costos de 38 ingredientes sin costo
- [ ] Validar costeo de 2–3 productos contra el tablero legacy
- [ ] Congelar edición en la app legacy (solo lectura) tras el corte

## Producto / fases

- [ ] Fase 5: migrar UI del POS demo a `apps/pos` (necesita acceso al repo
      `puntodeventa` en la sesión, o copiar el código aquí)
- [ ] Fase 6: KDS ×2 + cliente-display + sincronizar `ordenes.estado`
      cuando todas las estaciones terminen; modificador "proteína elegida"
      que descuente el scoop correcto
- [ ] Fase 7: UI de compras/transferencias/mermas; reporte de ventas por
      día; política de cortesías; flujo de cancelación post-pago con
      ajuste automático
- [ ] Fase 8: edge functions `clip-crear-cobro` y `clip-webhook`

## Seguridad (fase 9 — hardening) ⚠️

- [ ] `app_users` es legible por `anon` (expone hashes) — postura legacy
      heredada, cerrar al retirar el login propio
- [ ] `app_data` escribible por `anon` — cerrar tras congelar el legacy
- [ ] Policies `using (true)` en todo el catálogo: cualquiera con la anon
      key puede escribir. Sustituir por Supabase Auth + rol en JWT
- [ ] `parametros.clave_traspaso/clave_compras` legibles ("1234"): mover
      validación a RPC y rotar claves
- [ ] `registrarMovimiento` cliente: read-modify-write → RPC atómica
- [ ] Backups: activar PITR o respaldo programado antes de operar en vivo
- [ ] Revisar advisors de Supabase (`get_advisors`) tras cada migración
