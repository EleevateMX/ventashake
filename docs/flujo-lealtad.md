# Flujo de lealtad — Shakeaholic Rewards

Basado en el fundamento del cliente. Implementado de forma **aditiva** sobre
el mismo Supabase (no toca `app_data`/`app_users`).

## ¿Ocupamos QR? — Configuración decidida

**Identificador real = teléfono. El QR es una comodidad, no un requisito.**
No hace falta tarjeta física ni hardware especial.

- Cada cliente tiene un **código estable** `SHK-XXXXXX` (columna `clientes.codigo`,
  autogenerado en la base). Ese código se muestra como **QR** en la PWA del
  cliente (fase posterior) y/o se puede imprimir en un ticket/sticker.
- En caja, el cajero **teclea el teléfono** o **escanea el QR**. Un lector QR
  USB (o la cámara de la tablet) actúa como teclado y "escribe" el código:
  `identificarCliente(sb, telefonoOCodigo)` resuelve ambos casos (detecta
  el prefijo `SHK-`).
- Cada **cupón** tiene su propio código `CUP-XXXXXXXX` (también QR): en caja
  se escanea/teclea y `canjearCupon()` valida vigencia y lo marca usado.

**Hardware mínimo**: nada nuevo obligatorio. Opcional: un lector QR/código de
barras USB (los hay ~$300–600 MXN) para agilizar; sin él, se teclea el teléfono.

## Modelo de datos (aditivo)

- `clientes` + `codigo` (QR), `fecha_nacimiento`, `sabor_favorito`, `mancuernas` (saldo).
- `mancuernas_movimientos` — ledger: cada ganancia/canje/ajuste/promo.
- `cupones` — `tipo` (mancuernas | cumpleanos), `codigo`, `estado`
  (activo/usado/expirado/cancelado), `beneficio`, `vence_en`, `usado_en`.

## Reglas implementadas (en la base, a prueba de fallos del frontend)

- **Acumulación** (`trg_acumular_mancuernas` al pagar una orden con cliente):
  1 mancuerna por cada $10, **tope 100 por transacción**.
- **Cupón a 100**: al acumular ≥100, se genera cupón (vigencia **1 año**) y se
  descuentan 100 mancuernas. Respeta **máx 5 cupones activos** (sin contar
  cumpleaños). Verificado e2e: $1200 → 100 mancuernas → 1 cupón → saldo 0.
- **Cupón de cumpleaños** (`fn_generar_cupones_cumpleanos()`): shake gratis
  (proteína a elegir, sin galletas), vence el último día del mes,
  condicionado a compra el mes anterior, 1 por año. **Requiere programar** el
  día 1 de cada mes (ver abajo).
- **Canje** (`canjearCupon`): valida activo + vigente + lo liga a la orden.

## Uso desde el POS (ya conectado)

En el cobro del POS hay un panel "Cliente": teclea teléfono o escanea QR →
muestra nombre, mancuernas y cupones activos. Al cobrar, la orden se liga al
cliente y la base acumula las mancuernas automáticamente (el ticket confirma
cuántas ganó).

## Pendiente / fases siguientes

- **Programar cumpleaños y vencimientos**: `fn_generar_cupones_cumpleanos()`
  el día 1 de cada mes vía `pg_cron` (extensión de Supabase) o una edge
  function con schedule. Recordatorio "3 días antes de vencer" y
  reactivación "30 días sin compra" = jobs similares.
- **PWA del cliente**: consulta de saldo/cupones/historial + render del QR.
  App nueva (`apps/cliente-pwa`), consume `@shake/supabase`.
- **Promociones personalizadas** (por sabor/frecuencia/horario): motor de
  segmentación + tabla `promociones`. Aditivo.
- **Balizas de proximidad (beacons BLE / Google Nearby)**: **requieren una app
  móvil nativa + hardware de balizas**; fuera del alcance del POS web. Se
  integra cuando exista la app móvil; el backend de ofertas es aditivo.
- **Canje de cupón en el cobro del POS**: UI para escanear `CUP-…` y aplicar
  el beneficio al ticket (hoy `canjearCupon()` ya existe en la capa de datos).
