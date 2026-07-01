# Integración Clip

Arquitectura objetivo: el POS corre en tablet/laptop/mini-PC; el **Clip
Stand 2 es solo la terminal de cobro**. El POS nunca asume que corre
dentro del Stand. El diseño funciona en tres niveles progresivos — los
tres terminan igual: `pagos.estado = 'aprobado'` → la base dispara
cocina + inventario.

## Nivel 1 — Ruta manual (disponible HOY)

1. Cajero crea la orden y elige método **clip**.
2. Teclea el monto en el Stand y cobra normal.
3. En el POS confirma con la referencia del voucher:
   ```ts
   cobrarOrden(sb, ordenId, 'clip', monto, { referencia: 'folio-voucher' })
   ```
4. El pago nace `aprobado` → triggers hacen el resto.

Riesgo: captura manual (monto/referencia). Mitigación: el corte cruza
`total_clip` contra el reporte del portal de Clip.

## Nivel 2 — Ruta con API (payment intent)

Cuando se contrate acceso a la API de terminales de Clip:

1. POS crea el pago **pendiente**:
   `registrarPago(sb, { orden_id, metodo: 'clip', monto, estado: 'pendiente' })`
2. Una **edge function** `clip-crear-cobro` (server-side, con
   `CLIP_API_KEY`) pide a Clip iniciar el cobro en la terminal
   (`CLIP_TERMINAL_SERIAL`) y guarda `clip_payment_id` en el pago.
3. El Stand muestra el monto; el cliente paga.
4. Confirmación por webhook (nivel 3) o por polling del estado del pago.

La API key **jamás** va al frontend: vive como secret de la edge function.

## Nivel 3 — Webhook

Edge function `clip-webhook` (en `supabase/functions/`):

1. Clip hace POST con el resultado del cobro.
2. La función valida la firma con `CLIP_WEBHOOK_SECRET` (rechaza si no
   coincide).
3. Busca el pago por `clip_payment_id` y lo pasa a `aprobado` (o
   `rechazado`), guardando el payload crudo en `clip_payload`.
4. `trg_pago_aprobado` marca la orden pagada → cocina + inventario.

Idempotente: si el webhook llega dos veces, el pago ya está `aprobado` y
el trigger no re-dispara (la orden ya tiene `pagado = true`).

## Variables de entorno

| Variable | Dónde | Uso |
|---|---|---|
| `CLIP_API_KEY` | Secret de edge function | crear cobros (nivel 2) |
| `CLIP_WEBHOOK_SECRET` | Secret de edge function | validar firma del webhook (nivel 3) |
| `CLIP_TERMINAL_SERIAL` | Config por caja | a qué Stand mandar el cobro |

## Campos de `pagos` para Clip (ya creados)

| Campo | Tipo | Uso |
|---|---|---|
| `metodo` | enum (`clip`, …) | método de pago |
| `estado` | enum `pendiente/aprobado/rechazado/cancelado` | ciclo de vida |
| `referencia` | text | folio de voucher en ruta manual |
| `clip_payment_id` | text (indexado) | id del cobro en Clip (API/webhook) |
| `clip_terminal_id` | text | terminal que cobró |
| `clip_payload` | jsonb | respuesta/webhook crudo para auditoría |
