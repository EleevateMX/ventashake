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

**Primero, la trampa que me comí yo:** un proyecto de una organización de
paga **NO se puede pausar**. Supabase contesta *"Project is not free-tier.
Please downgrade it to free-tier first"*, y su documentación lo dice
igual: *"Projects under a paid plan cannot be paused. To pause a project
currently under a paid plan, first transfer the project to an
organization on the Free plan."* Así que el botón de pausa que uno
imagina no existe aquí. Las salidas reales son dos: **mudar el proyecto a
una organización gratis**, o **borrarlo**.

Y mudar es la buena, porque el plan Free da **dos proyectos activos
gratis** — que es exactamente lo que sobra aquí — con el único requisito
de que el proyecto pese menos de 500 MB. Hojaldras Lily pesa 48 MB y
Eleevate Control 26 MB. **Los dos caben de sobra.** La propia
documentación de Supabase lista *"Transfer projects to a Free Plan
organization to reduce Compute usage"* como la forma de bajar el gasto.

### El plan

1. Crear una **organización nueva en plan Free** (por ejemplo
   "Eleevate — pruebas").
2. Mudar ahí **Hojaldras Lily** y **Eleevate Control**. Se hace desde
   *Project Settings → General → Transfer project*.
3. Ya en la organización gratis:
   - **Hojaldras Lily** se pausa (y si no, se pausa sola a los 7 días sin
     uso). Pausada no cuenta ni siquiera contra el límite de dos.
   - **Eleevate Control sigue encendido y funcionando, pero gratis.**
     Con 26 MB y el tráfico que tiene, el plan Free le sobra.
4. La organización Pro se queda **solo con Shakeaholic**.

Resultado: de ~$55 a **$35 al mes** (~645 pesos). Y si algún día se suelta
también el dominio propio, $25 pelados.

### Lo que hay que saber antes de mudar

- **Requisito que sí puede frenar la mudanza**: el proyecto no debe tener
  la **integración de GitHub conectada** ni *log drains*. Si la tiene, se
  desconecta primero.
- **Hay 1–2 minutos de interrupción** al pasar de paga a gratis. Para
  Eleevate Control eso es un parpadeo; para Shakeaholic sería la caja
  parada, y por eso **Shakeaholic no se muda nunca**.
- En plan Free se pierden cosas que esos dos no necesitan: respaldos
  diarios automáticos, 500 MB de base en vez de 8 GB, 5 GB de salida de
  datos en vez de 250 GB.
- **Eleevate Control se dormirá solo si pasa una semana sin que nadie lo
  abra**, porque el plan Free pausa por inactividad. Se despierta en
  minutos desde el tablero, sin perder nada — pero hay que saberlo para
  no pensar que se rompió.
- La mudanza **no cambia la URL ni las llaves** del proyecto: solo cambia
  quién lo factura.

### Soltar el dominio propio (aparte, cuando quieras)

−$10/mes más. Es un cambio de una línea: vaciar el mapa `DOMINIO_PROPIO`
en `packages/supabase/src/client.ts` y volver a desplegar. No se rompe
nada — la URL original `zyjtnaystsporbuzcmqk.supabase.co` siempre estuvo
viva en paralelo, y el agente de impresión ya la usa tal cual. **Lo único
que se pierde es cosmético**: la pantalla de "Entrar con Google" de
Rewards dirá el id del proyecto en vez de `api.shakeaholic.mx`.

## El candado que NO sirve para esto

En **Organization → Billing** hay un **Spend Cap**, y es lo primero que
uno piensa al ver un recibo alto. **No habría servido.** La
documentación es explícita: *"Compute Hours are **not** covered by the
Spend Cap."* El tope frena excedentes de tráfico, almacenamiento o
usuarios; **no frena el cómputo de un proyecto nuevo**, que es justo lo
que subió este recibo. Vale la pena dejarlo encendido de todos modos,
pero sin creer que protege de esto.

## La trampa que hay que recordar

**Un proyecto de Supabase vacío no es gratis.** Crear uno "para probar" y
dejarlo ahí cuesta $10 al mes para siempre. Al armar la siguiente tienda,
el proyecto se crea **cuando se va a usar**, y el de pruebas nace en una
organización Free desde el principio — no en la de paga, de donde luego
hay que mudarlo con interrupción y todo.
