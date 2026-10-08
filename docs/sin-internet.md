# Vender sin internet

Nació el 08/10/26. La noche anterior se fue el internet de **21:07 a 22:00**,
en plena cena, y no entró ni una venta. El kiosko daba errores sueltos y
parecía que el sistema se había descompuesto.

## Qué hace la tienda (lo que se le dice al personal)

| Pasa esto | Qué hacer |
|---|---|
| Arriba sale **«Sin internet desde HH:MM»** en rojo | Seguir vendiendo. Se cobra en **efectivo** o en la **terminal del banco** (primero se cobra allá y luego se toca el botón aquí). Clip no funciona sin internet |
| Al cobrar, el folio es **S-01, S-02…** | Es el folio provisional. Es el que se le dice al cliente y el que sale en la etiqueta |
| Sale en rojo **«La comanda NO salió en …»** | Avisarle de palabra a esa estación con el folio. Revisar que la ventana del agente de impresión esté abierta en la PC |
| Vuelve el internet | Nada. Las ventas se registran solas; arriba sale en amarillo «Registrando N ventas…» hasta que termina |
| Se quiere **cerrar la caja** y hay ventas sin registrar | El kiosko no deja cerrarla todavía: hay que esperar a que vuelva el internet. Si se cerrara antes, ese efectivo no entraría en el corte |
| Alguien recargó la página sin internet | Abre igual, con el último cajero que tuvo turno. El PIN no se puede validar sin internet |

Sin internet **no** funcionan: Clip, el cobro mixto, los canjes de Rewards,
el precio de personal, identificar al cliente por QR, Admin a distancia ni
las pantallas de barra y cocina (trabajan con la etiqueta impresa).

**Lo que más resuelve no es esto: es un segundo internet.** Un módem 4G que
entre solo cuando se cae el principal deja todo funcionando, Clip incluido,
sin tocar el sistema. Esto de aquí es para cuando también falla ese.

## Cómo está armado

```
 kiosko (navegador) ──► guarda la venta en ESTE navegador (localStorage)
        │
        ├──► http://127.0.0.1:7777/local/comanda ──► agente ──► etiquetadoras
        │        (misma PC; la red de la tienda sigue viva)
        │
        └──► al volver el internet: fn_venta_sin_internet (una por una)
```

- **Detectar** (`apps/kiosko/src/lib/conexion.ts`): `navigator.onLine` no
  sirve —la PC tenía red, lo que no había era salida—, así que se le pregunta
  al servidor (`/auth/v1/health` del dominio propio) cada 15 s. Dos fallos
  seguidos = sin internet; uno bueno = de vuelta.
- **Seguir mostrando el menú** (`src/lib/respaldo.ts`): el catálogo, el
  modo, el almacén y el corte guardan su última respuesta buena. Sin
  internet se usa esa, y si una consulta tarda más de 8 s también.
  `contextoDePago()` se precarga al abrir y cada 5 minutos, para que el
  respaldo exista antes de que haga falta.
- **Recargar sin internet** (`public/sw.js`): service worker que pide primero
  la red, siempre; solo si no contesta sirve la última copia. Con internet,
  el kiosko corre la versión nueva como siempre.
- **La venta** (`src/store/sinInternet.ts`): se escribe en localStorage
  **antes** de imprimir y antes de cambiar de pantalla. El id lo pone el
  kiosko; el servidor es idempotente con él.
- **La comanda** (`comandasSinInternet` en `@shake/utils`, con pruebas):
  las mismas reglas que `fn_crear_pedidos_cocina` — cada producto a su
  estación, el extra sigue a su producto salvo el vínculo (`«se prepara
  en»`, ahora en `vw_producto_extras.estacion`), lo que va a otra estación
  sale marcado «COMBO», y lo que su categoría no manda a pantalla no gasta
  etiqueta.
- **El agente** (`agente-impresion/src/statusHttp.ts`, versión **1.4.0**):
  escucha solo en `127.0.0.1` y solo acepta comandas del origen del kiosko.
  Qué impresora es de qué estación lo **aprende** de las comandas que llegan
  con internet (`estaciones-aprendidas.json`); `estacion` en
  `printers.config.json` lo fija a mano. Un reintento con el mismo id no
  imprime dos veces.
- **El registro** (`fn_venta_sin_internet`, `supabase/migrations/ventas_sin_internet.sql`):
  envuelve a `fn_crear_orden` y `fn_cobrar_orden` **sin tocarlas**, en una
  sola transacción. Cobra al precio del servidor; si el de la pantalla no
  coincidía, la diferencia queda en `ventas_sin_internet` con
  `estado = 'revisar'`. Mueve `created_at` de la orden y del pago a la hora
  real (los triggers de inventario, mancuernas y cocina solo actúan en la
  transición a pagado, así que moverla después no los repite). Si la comanda
  ya salió en la tienda —o la venta tiene más de 10 minutos— cancela los
  trabajos de impresión y da por entregado el pedido de cocina: imprimirle a
  barra un pedido de hace una hora es peor que no imprimirlo.

## Lo que hay que saber antes de tocarlo

- **El permiso de red local de Chrome.** Una página pública
  (`kiosko.shakeaholic.mx`) que habla con `127.0.0.1` puede hacer que Chrome
  pregunte una vez si se permite. Por eso el kiosko le pregunta al agente
  también con internet (cada 2 min): si Chrome lo pide, que sea un día
  normal y no en plena falla. Si el aviso dice «la impresora no contesta»
  con el agente abierto, eso es lo primero que hay que revisar.
- **El agente aprende las estaciones con internet.** Después de instalarlo
  (o de actualizarlo), cada estación tiene que imprimir al menos una comanda
  normal antes de que se pueda imprimir sin internet. Se ve en
  `http://localhost:7777/status` → `estaciones`.
- **Un corte de internet justo a media venta** no se puede saber si alcanzó
  a registrarse. El kiosko lo dice así y no reintenta por su cuenta.
- **Cerrar la caja con ventas sin registrar está bloqueado** en el kiosko
  (`CorteMilo`). El POS no tiene ese candado porque no vende sin internet.
- Las diferencias de precio quedan en `ventas_sin_internet`; todavía no hay
  pantalla en Admin para verlas.

Probado el 08/10 con el kiosko compilado en un navegador real: con internet
se cargó el menú y sin internet se vendieron un shake, un wrap y un Monster
en efectivo. El shake salió en la etiquetadora de barra y el wrap en la de
cocina; el Monster no gastó etiqueta. Al volver el internet la venta se mandó
sola. Con el agente apagado sale el aviso rojo, y con el servidor de la
página apagado el kiosko abre desde su copia. La función del servidor se
probó en producción dentro de una transacción que se deshizo: cobra, mueve la
hora, no duplica si llega dos veces y no vuelve a mandar la comanda.
