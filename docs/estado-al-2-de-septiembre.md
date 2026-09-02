# Estado del sistema al 2 de septiembre de 2026

Esto es una entrega. Si retomas Shakeaholic y no estuviste en las
sesiones anteriores, lee **esto** y luego `CLAUDE.md`. Aquí está lo que
quedó vivo, lo que quedó abierto y lo que hay que hacer primero.

La tienda vende todos los días de 6 de la mañana a 10 y media de la
noche, unas 130 ordenes diarias. Un error aquí no es un test que falla.

---

## 1. Lo primero: hay un hueco de seguridad ABIERTO a propósito

**No lo cierres sin leer `docs/pendiente-blindaje-cobro.md` completo.**

Todas las funciones del cobro (`fn_cobrar_orden`,
`fn_cobrar_orden_dividido`, las dos del mixto, y los dos canjes de
Rewards) estan abiertas a `anon` sin comprobar quien llama. Con la llave
publicable se puede marcar pagada una orden que uno mismo creo.

Se cerro el 02/09 a las 02:18 y **hubo que revertirlo a las 07:35**,
porque la caja dejo de poder cobrar en efectivo a los ocho minutos de
abrir. La causa: **el kiosko en modo cajero cobra como `anon`**. El PIN
si abre una sesion de Supabase Auth, pero esa pantalla lleva dias
encendida y la sesion caduca sin que nadie lo note, porque hasta ahora
nada la necesitaba.

**El orden correcto es:**

1. Que el kiosko compruebe que su sesion sigue viva antes de cobrar y,
   si no, vuelva a pedir el PIN en silencio en vez de fallar.
2. Recien entonces, el candado.
3. Y la prueba valida **no** es una sesion nueva sacada por HTTP: es
   cobrar desde la caja real, con lo que ya tenga cargado. Esa
   distincion es la que me costo el incidente.

Lo que si protege el dinero mientras tanto, y no se toco: **el cliente
nunca manda precios**. El servidor los recalcula desde el catalogo,
valida que los totales cuadren y rechaza el doble cobro. Un atacante
puede regalarse un shake; no puede cambiar lo que cuestan las cosas ni
sacar dinero.

---

## 2. Lo que se construyo en estos dias

| Que | Donde vive |
|---|---|
| **Venta en espera** — apartar una cuenta y atender al siguiente | `apps/kiosko/src/store/espera.ts`, `components/VentasEnEspera.tsx`, y el refresco de precios en `packages/utils/src/espera.ts` (10 pruebas) |
| **Tres conceptos de cobro** — Efectivo / Terminal / Mixto, mas la terminal del banco | `apps/kiosko/src/pages/Pago.tsx`, `components/CobroMixto.tsx` |
| **Cobro mixto** con las dos terminales | `fn_cobrar_mixto_iniciar`, `clip-crear-cobro` v4, `fn_cobrar_orden_dividido` |
| **Corte de caja por denominaciones**, al abrir y al cerrar | `components/CorteMilo.tsx`, columnas `desglose_apertura` / `desglose_cierre` |
| **Cortes de caja en Admin** — el arqueo dejo de perderse | `apps/admin/src/pages/Cortes.tsx`, `listarCortes` |
| **Costeos vuelve a guardar** | `alter function fn_costos_guardar set statement_timeout to '20s'` |

---

## 3. Lo que quedo pendiente, en orden de importancia

### 3.1 Que el kiosko sostenga su sesion

Es el que desbloquea todo lo demas de seguridad. Ver el punto 1.

### 3.2 `fn_sync_app_data` tarda demasiado

El guardado de Costeos tardaba 3.4 s contra un limite de 3 s, y fallaba
segun la carga. Esta tapado dandole 20 s a esa funcion, pero es una
curita: la sincronizacion crece con el catalogo. La causa esta
identificada — arranca con `drop table if exists _ins` +
`create temp table`, que es justo lo que el `CLAUDE.md` prohibe dentro de
funciones que corren desde la app (ese patron dejo la tienda 50 minutos
sin cobrar el 27/08). Detalle en `docs/pendiente-blindaje-cobro.md`.

### 3.3 Las 3 etiquetas en blanco por comanda

Sin resolver. El agente ya esta en **1.3.0**, que trae el boton
**"Diagnostico (gasta 6)"** en el kiosko: manda la misma etiqueta con
tres cabeceras rotuladas A/B/C y el papel contesta cual sirve. Falta
correrlo y aplicar la que salga derecha. Ver `CLAUDE.md` 2.4.

### 3.4 La Clip Stand se apaga sola

`ERR10_04` = *"the Clip terminal is either offline, powered off, or the
Pinpad application is closed"*. **31 veces entre el 21/08 y el 02/09**, 30
de ellas en horario de venta, y **ninguna de esas ordenes se cobro
despues**. No es del codigo. Cuando reporten "la terminal no responde",
esto es lo primero que hay que mirar.

### 3.5 Limpieza, sin prisa

- **157 ordenes abandonadas** sin pagar (julio a hoy, ~$26,000). Ninguna
  llego a cocina, o sea que nadie preparo nada: son carritos a medias.
  Ensucian el panel de salud. Pasarlas a `cancelada` es un `update`, pero
  son 157 renglones de ventas y no lo decidi yo.
- **`_respaldo_pruebas_28jul` y `_respaldo_pruebas_30jul`**: tablas de
  respaldo de julio que nadie usa.
- **Cuentas `admin` y `Prueba`** en `app_users` (Costeos), de junio, sin
  habilitar y sin que nadie sepa sus contrasenas.
- **`senales_pantallas`** tiene escritura abierta a `anon`. Lo peor que
  permite es tocarle el timbre de recarga a las pantallas, y el kiosko
  solo recarga cuando esta en el menu y sin carrito. **Ojo:** cerrarle la
  LECTURA mataria el canal de Realtime en silencio.
- **Proteccion de contrasenas filtradas** apagada en Auth. Se prende en
  el panel de Supabase, no desde SQL.

---

## 4. Como comprobar que todo sigue bien

```sql
-- ¿La tienda esta cobrando?
select count(*) filter (where pagado) as cobradas,
       count(*) filter (where not pagado) as sin_pagar
from ordenes where created_at > now() - interval '2 hours';

-- ¿Salen las comandas?
select estado, count(*) from trabajos_impresion
where created_at > now() - interval '2 hours' group by 1;

-- ¿Late el agente de impresion?
select nombre, agente_version,
       round(extract(epoch from (now() - ultima_conexion))) as hace_segundos
from impresoras where activa;

-- ¿Quedo efectivo apuntado colgado de un mixto que no cuajo?
select count(*) from pagos
where proveedor = 'mixto_efectivo' and estado = 'pendiente';

-- ¿El corte lleva demasiado abierto?
select round(extract(epoch from (now() - abierto_en))/86400, 1) as dias
from caja_cortes where cerrado_en is null;
```

Si aparecen varias `pagado = false` seguidas en la primera consulta, la
tienda esta parada. Eso es lo unico que justifica tocar produccion en
caliente.

---

## 5. Dos reglas que me costaron caro, y no estan de adorno

**Al tocar el camino del dinero, la verificacion no es un `select`: es
cobrar.** `fn_crear_orden` puede devolver una orden perfecta y el cobro
fallar en el trigger siguiente. Se corre `fn_crear_orden` →
`fn_cobrar_orden` de verdad. Se puede hacer sin ensuciar nada: todo
dentro de un bloque que termina en `raise`, asi se revierte entero y no
queda ni orden, ni cobro, ni etiqueta impresa.

**Probar por la puerta de enfrente no basta si no traes la llave que
trae puesta quien la usa.** Verifique el candado del cobro por HTTP con
una sesion recien creada, dio verde, y rompio la caja igual. La sesion
que importaba era la de la pantalla que lleva dias encendida.
