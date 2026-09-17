# ¿Se puede correr esto sin Supabase, como un ejecutable de PC?

Respuesta corta: **sí se puede correr sin Supabase; no como un `.exe`
suelto.** Son dos preguntas distintas y conviene separarlas, porque la
segunda choca con la forma del negocio, no con la tecnología.

---

## 1. Por qué un ejecutable suelto no puede con esto

Este no es un programa que usa una persona en una computadora. Son
**cinco pantallas mirando el mismo estado, en vivo**:

```
   kiosko  ──┐
   POS     ──┤
   barra   ──┼──►  un solo estado compartido  ──►  agente de impresión
   cocina  ──┤                                      (PC de la tienda)
   TV      ──┘
```

El cliente pide en el kiosko y la comanda aparece **sola** en barra y en
cocina. Eso no es un detalle de implementación: es el producto. Son 13
suscripciones en vivo repartidas entre las pantallas.

Un `.exe` que corre solo en una PC no puede hacer eso, **salvo que ese
`.exe` sea en realidad un servidor** al que las otras pantallas se
conectan por la red de la tienda. Y en cuanto es un servidor, ya no es
«una aplicación de escritorio»: es la misma arquitectura de hoy, con el
servidor mudado de la nube al mostrador.

Así que la pregunta útil no es «¿ejecutable o nube?» sino **«¿dónde vive
el servidor?»**.

---

## 2. Qué tan pegado está a Supabase (medido, no supuesto)

Bastante menos de lo que parece:

| Pieza | ¿Portable? |
|---|---|
| 62 tablas, 20 enums, 27 triggers | Postgres puro |
| **161 funciones** | Postgres puro |
| 101 políticas RLS | Postgres puro… **salvo 6** que usan `auth.*` |
| Funciones que usan `auth.uid()` | **solo 15** de 161 |
| Extensiones | `pg_cron`, `pg_net`, `pgcrypto`, `uuid-ossp`, `pg_stat_statements` — todas libres |
| URL y llave del backend | **variables de entorno**, no están clavadas en el código |

O sea: **la base de datos es Postgres normal.** Lo específico de Supabase
es el envoltorio:

- **PostgREST** — la API REST que usa todo el frontend (`sb.from(…)`,
  `sb.rpc(…)`). Software libre.
- **GoTrue** — el login del personal. Software libre. Son las 15 funciones
  con `auth.uid()` y 6 políticas.
- **Realtime** — las 13 suscripciones. Software libre.
- **Edge Functions** (7, en Deno) — la pasarela de cobro y `staff-login`.
  Se reescriben en Node en un rato; no son grandes.
- **Storage** — fotos de producto. Se reemplaza con una carpeta.

Las cinco piezas son de código abierto y existe `docker-compose` oficial
para levantarlas. **No hay que reescribir el sistema para salir de
Supabase; hay que hospedarlo.**

---

## 3. Las tres formas reales, con sus costos

### A. Como hoy: Supabase administrado (nube)

Lo que ya funciona. Copia de seguridad, parches, TLS y disponibilidad los
pone otro.

- **A favor:** Admin desde el teléfono. El webhook de la terminal llega.
  Si se quema la PC de la tienda, no se pierde una venta.
- **En contra:** renta mensual, y sin internet la tienda no cobra.

### B. Servidor en la tienda (mini PC + Docker)

Supabase autohospedado en una mini PC en el mostrador. Las pantallas
abren el navegador contra la IP local.

- **A favor:** sin renta. **Sigue vendiendo aunque se caiga el internet**
  — que para una tienda es el argumento fuerte.
- **En contra, y no es poco:**
  - **Esa PC se vuelve el punto único de falla.** Hoy si una pantalla
    muere, las otras cuatro siguen; si muere el servidor, no hay venta.
  - **Las copias de seguridad pasan a ser tuyas.** Un disco que se muere
    se lleva el historial de ventas.
  - **Se pierde el Admin a distancia**, salvo que abras la red — que trae
    su propio problema de seguridad.
  - **El webhook de la terminal deja de llegar** (Clip no puede alcanzar
    una IP detrás del módem). No es fatal: el kiosko sondea 120 s y
    `clip-barrer-pendientes` sale hacia afuera cada 2 minutos, y eso sí
    funciona desde adentro. Se pierde el aviso inmediato, no el cobro.
  - Alguien tiene que actualizar esa PC.

### C. Mixto: servidor en la tienda que sincroniza a la nube

El de arriba, más una réplica en la nube para respaldo y para el Admin
remoto.

- **A favor:** lo mejor de los dos.
- **En contra:** **es el más caro de construir y el más difícil de
  mantener.** Sincronizar dos bases que las dos aceptan escrituras es un
  problema serio — con folios, cortes de caja y dinero de por medio, dos
  copias que se contradicen es peor que quedarse sin internet un rato.
  No lo recomiendo hasta que haya varias tiendas y duela de verdad.

---

## 4. Qué haría yo

**Para la panadería: quédate con la nube (A).** No por pereza — por dónde
está el riesgo real. Una tienda que empieza no tiene a nadie que cuide un
servidor, y el día que ese disco falle nadie va a tener una copia. La
renta de Supabase es más barata que una sola tarde sin poder cobrar.

**El momento de pensar en (B)** es cuando se cumpla alguna de estas:

- el internet de la tienda se cae seguido y ya costó ventas;
- son varias tiendas y la renta empieza a pesar;
- hay alguien que de verdad pueda mantener el servidor.

Y si se hace, **que sea (B) con respaldo automático a la nube**, no (C):
una sola base que escribe, y la nube solo como copia. Eso evita el
problema de las dos verdades.

---

## 5. Si de todas formas quieren el paquete instalable

Lo factible y honesto **no es un `.exe` de escritorio**, es un
**«servidor de tienda»**: un instalador para una mini PC con Windows que
deje corriendo Postgres + PostgREST + GoTrue + Realtime en Docker, más las
apps servidas en local, más el agente de impresión que ya existe. Las
demás pantallas no instalan nada: abren el navegador contra la IP de esa
PC.

Ese instalador es **trabajo real, no un empaquetado**: hay que traducir
las 7 Edge Functions a un servicio Node, mover los 8 trabajos de `pg_cron`,
resolver certificados en red local, y escribir el respaldo automático — que
es la parte que de verdad decide si esto se puede recomendar o no.

No lo estimo aquí sin haber probado el arranque de Postgres embebido en
Windows, que es la pieza que más sorpresas da. Si quieren ir por ahí, el
primer paso es un ensayo: levantar el esquema completo (las 146
migraciones) en un Postgres local y correr la prueba del camino del
dinero. Si eso pasa a la primera, el resto es plomería.
