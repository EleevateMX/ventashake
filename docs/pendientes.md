# Pendientes

## Datos (bloquean fase 4 completa)

- [ ] Ejecutar `pnpm etl:dry`, conciliar duplicados, `pnpm etl:aplicar`
- [ ] Capturar 16 precios de shakes + 4 de alimentos (productos inactivos)
- [ ] Capturar 106 cantidades de receta (`PENDIENTE-CANTIDAD`)
- [ ] Capturar costos de 38 ingredientes sin costo
- [ ] Validar costeo de 2–3 productos contra el tablero legacy
- [ ] Congelar edición en la app legacy (solo lectura) tras el corte

## Producto / fases

- [x] Fase 5: `apps/pos` + `apps/kiosko` conectadas a datos reales
- [x] Fase 6: KDS ×2 + `cliente-display` sobre `pedidos_cocina` (realtime),
      flujo orden pagada → inventario → cocina verificado e2e
- [x] Fase 7: corte de caja (POS) + `apps/admin` (menú/ventas/inventario)
- [ ] Fase 6 (pulido): sincronizar `ordenes.estado` global cuando todas las
      estaciones terminen; modificador "proteína elegida" que descuente el
      scoop correcto (hoy la proteína se fija en la receta si viene en el JSON)
- [ ] Fase 7 (pulido): UI de compras/transferencias/mermas en admin;
      política de cortesías; cancelación post-pago con ajuste automático de
      inventario
- [ ] Fase 8: edge functions `clip-crear-cobro` y `clip-webhook` (cuando haya
      credenciales de Clip; hoy corre en ruta manual con el Stand 2)
- [x] Lealtad "Shakeaholic Rewards" núcleo: mancuernas (1 x $10, tope 100),
      cupones a 100 (vigencia 1 año, máx 5), cupón cumpleaños, identificación
      teléfono+QR, canje. Conectado al POS. Ver `docs/flujo-lealtad.md`
- [x] Lealtad: crons con pg_cron (cumpleaños/vencimientos/reactivación),
      PWA del cliente (login Google + QR/saldo/cupones), canje de cupón en el
      cobro (POS y kiosko)
- [x] Promociones personalizadas: segmentación por sabor/día/hora/frecuencia,
      tope 15 días, tipos %/$/producto gratis; CRUD en admin y aplicación en POS
- [ ] Lealtad pendientes: definir valor del cupón de 100 mancuernas si no será
      "ítem gratis"; envío de notificaciones (email/push vía edge function +
      pg_net); promos también aplicables en kiosko (hoy en POS)
- [ ] Balizas de proximidad (beacons BLE): requieren app móvil nativa +
      hardware; fuera del POS web
- [ ] Otras Fase 2 del demo (aplazadas): wallet/monedero, gift cards, delivery,
      RRHH — tablas aditivas cuando el negocio las pida

## Cómo operar hoy (checklist de arranque)

- [ ] Poner la anon key en el `.env` de cada app (`.env.example` incluido)
- [ ] Correr el ETL de costos (`pnpm etl:dry` → conciliar → `pnpm etl:aplicar`)
      para poblar `productos`/`recetas`; sin catálogo el POS/kiosko no tienen
      qué vender
- [ ] Cargar stock inicial en Kiosko (entrada de inventario) para que el
      descuento por venta no deje negativos

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
