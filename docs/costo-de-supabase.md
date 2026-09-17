# Por qué llegó el recibo de 850 pesos (y qué se puede bajar)

Revisado el 17/09/26 contra la organización real, no contra la intuición.

## Lo primero: no es Shakeaholic

En la organización `edymedinacabrera25@gmail.com's Org` (plan **Pro**) hay
**tres proyectos activos**, no uno:

| Proyecto | Creado | Tamaño | ¿Alguien lo usa? |
|---|---|---|---|
| **Shakeaholic** | 12/06/26 | 121 MB | Sí — 117 692 peticiones en 24 h |
| **Eleevate Control** | 27/08/26 | 26 MB | **Sí** — 252 peticiones y 42 inicios de sesión en 24 h |
| **Hojaldras Lily** | 26/08/26 | 48 MB (63 tablas) | **No** — 1 petición en 24 h, 0 archivos, último registro el 26/08 |

Los tres corren en **Micro** (224–256 MB de `shared_buffers`, 60 conexiones).

## Cómo cobra Supabase

El Pro **no incluye proyectos ilimitados**: incluye **$10 de crédito de
cómputo al mes**, que alcanza para *un* proyecto en Nano o Micro. Cada
proyecto adicional suma su propio cómputo al recibo, **aunque esté
dormido**, porque cada proyecto es un servidor dedicado.

Documentación: *"Paid plans come with $10 in Compute Credits per month.
This suffices for a single project using a Nano or Micro compute instance.
Every additional project adds compute fees to your monthly invoice."*

## El desglose

| Concepto | USD/mes |
|---|---|
| Suscripción Pro | 25.00 |
| Cómputo Micro × 3 proyectos | 30.00 |
| Crédito de cómputo incluido | −10.00 |
| Dominio propio `api.shakeaholic.mx` | 10.19 |
| **Total** | **≈ 55** |

Unos **1 000 pesos al mes**. El recibo de 850 salió menor porque los dos
proyectos nuevos nacieron el 26 y 27 de agosto: solo corrieron media
facturación. **El mes que entra es el completo**, así que sin tocar nada
el recibo *sube*, no baja.

## Lo que NO está costando (para no perder el tiempo ahí)

- **Disco**: 121 MB de los 8 GB incluidos. No es el disco.
- **Salida de datos (egress)**: ~180 MB al día → ~5.4 GB al mes, contra
  250 GB gratis. Y 179 de esos 180 MB son **fotos de producto** del
  Storage; las 113 807 llamadas a la API del día entero suman menos de
  1 MB. No es el tráfico.
- **Las peticiones no se cobran.** Que el agente de impresión pregunte
  52 347 veces al día por trabajos pendientes se ve escandaloso y no
  cuesta un peso. No hay nada que optimizar ahí.

## Lo que sí se puede bajar

1. **Pausar Hojaldras Lily** → −$10/mes (~185 pesos). Está vacía de uso:
   una petición en 24 horas. **Pausar no borra nada** — los datos y las
   63 tablas quedan, y se reactiva en minutos cuando se arme la panadería
   de verdad. Supabase no cobra cómputo de proyectos pausados.
2. **Soltar el dominio propio** → −$10/mes (~185 pesos). Es un cambio de
   una línea: vaciar el mapa `DOMINIO_PROPIO` en
   `packages/supabase/src/client.ts` y volver a desplegar. No se rompe
   nada: la URL original `zyjtnaystsporbuzcmqk.supabase.co` siempre
   estuvo viva en paralelo (el agente de impresión la usa tal cual).
   **Lo único que se pierde es cosmético**: la pantalla de "Entrar con
   Google" de Rewards dirá el id del proyecto en vez de
   `api.shakeaholic.mx`.
3. **Eleevate Control**: 42 inicios de sesión hoy. Alguien lo está usando.
   Si resulta que ya no hace falta, es otro −$10/mes; si sí hace falta,
   se queda y ya.

Haciendo 1 y 2: de ~$55 a ~$35 al mes (de ~1 000 a ~645 pesos). Los tres:
$25, el plan pelón.

## Y el candado

En **Organization → Billing** hay un **Spend Cap**. Con el tope puesto,
Supabase corta el consumo extra en vez de cobrarlo. Vale la pena dejarlo
encendido aunque hoy no haya excedentes por uso: lo que subió el recibo
fue cómputo de proyectos nuevos, y eso el tope no lo frena, pero sí frena
las sorpresas de tráfico o almacenamiento.

## La trampa que hay que recordar

**Un proyecto de Supabase vacío no es gratis.** Crear uno "para probar" y
dejarlo ahí cuesta $10 al mes para siempre. Al armar la siguiente tienda,
el proyecto se crea **cuando se va a usar**, y el de pruebas se pausa el
mismo día que deja de servir.
