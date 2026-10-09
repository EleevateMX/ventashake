# Corte, fondo fijo y cambio de turno

Nació el 09/10/26, cuando gerencia formalizó el cambio de turno (Regina
entrega a Andrés a las 2:30 p. m.). Hasta ese día cada turno arrancaba con un
fondo distinto —en los últimos 14 turnos entre $2,018 y $2,776, nunca el
mismo—, porque el retiro se calculaba de cabeza. El fondo establecido de
Admin existía pero estaba vacío, y la apertura del turno siguiente quedaba a
nombre de quien acababa de cerrar.

**No hay cortes parciales ni pantallas nuevas.** Es el mismo corte de
siempre con cuatro datos más.

## Cómo se usa (lo que se le dice al personal)

| Quién | Qué hace |
|---|---|
| Quien cierra (Regina) | Kiosko → **Caja y turno** → cuenta el cajón como siempre. A la derecha sale el resumen, **cuánto retirar** y **qué billetes y monedas se quedan** de fondo (sugerido; «Ajustar» para cambiarlos). **Cerrar turno · retirar $X** |
| Si no alcanza para el fondo | Sale en rojo cuánto falta. Se toca **Registrar reposición** (alguien la pone de la caja fuerte). La autoriza quien puede hacer cortes |
| Para entregar | **Entregar a quien sigue** → quien recibe pone **su PIN** (es su firma) |
| Quien recibe (Andrés) | Ve **Fondo esperado: $3,000**, quién lo dejó y con qué billetes. Cuenta. Si cuadra, **Iniciar turno**. Si no, sale en rojo y queda anotado solo (puede escribir qué pasó) |
| Gerencia | Admin → **Comprobantes**: todos los comprobantes por fecha y persona, con las diferencias en rojo; tocar uno lo abre. También Admin → **Cortes de caja** → **Comprobante** de cada corte: verlo, imprimirlo o guardarlo en PDF, y mandarlo otra vez por correo. Arriba: el **fondo fijo** y los **correos** que reciben cada comprobante |

## Reglas (y por qué)

- **El retiro sale de lo CONTADO**, no de lo esperado. Si faltan $20, el
  turno que cierra registra −$20, se retira lo que hay menos el fondo, y el
  siguiente recibe su fondo completo. La diferencia no viaja.
- **La sugerencia retira los billetes grandes y deja el cambio**
  (`sugerirFondo` en `packages/utils/src/efectivo.ts`, con pruebas). Es una
  búsqueda exacta: retirar $60 con un billete de $50 y tres de $20 solo sale
  con los tres de $20. Si no se puede exacto, el fondo queda un poco
  **arriba** y lo dice.
- **No se puede dejar un billete que no se contó.** La pantalla lo impide y
  el servidor (`fn_cerrar_corte_con_fondo`) lo vuelve a revisar pieza por
  pieza.
- **El fondo esperado lo pone la base** (`trg_corte_fondo_sugerido`), no la
  pantalla: lo que dejó el corte anterior más su reposición.
- **Las firmas son los PINes.** Quien entrega firma al cerrar y quien recibe
  al abrir, con la hora del servidor. Vale más que una firma en papel: no se
  firma por otro ni después. El comprobante impreso trae además las líneas
  para firmar a mano.
- **La diferencia al recibir es de la ENTREGA**, no de ninguno de los dos
  turnos, y se avisa por correo aparte.

## Cómo está armado

| Pieza | Dónde |
|---|---|
| Columnas nuevas de `caja_cortes` | `folio`, `fondo_dejado`, `desglose_fondo`, `retiro`, `reposicion`, `reposicion_autorizada_por`, `fondo_esperado`, `corte_anterior_id`, `notas_apertura` |
| Cerrar con fondo | `fn_cerrar_corte_con_fondo` **envuelve** a `fn_cerrar_corte` (no la toca: el candado del corte sigue en un solo lugar y el POS sigue llamando a la de siempre). Valida el fondo, cierra, anota. Una transacción |
| Lo que dejó el turno anterior | `fn_fondo_esperado(caja)` (para enseñarlo) y el trigger (para guardarlo) |
| El comprobante | `fn_corte_comprobante` arma los datos; `packages/utils/src/comprobanteCorte.ts` el HTML (una sola versión para Admin, impresión y correo) |
| Correo | Trigger → `correos_cola` → cron cada minuto → Edge Function `correo-cola` → Resend. Destinatarios en `correos_cortes` (solo gerencia la lee; `parametros` es pública) |
| Pantalla | `apps/kiosko/src/components/CorteMilo.tsx` (`ResumenYFondo`, fase `pinRecibe`) |
| Admin | `apps/admin/src/pages/Cortes.tsx` + `components/ComprobanteCorte.tsx` |

Sin fondo fijo establecido (Admin → Cortes vacío), el kiosko cierra como
antes. El POS no cambió: un corte cerrado desde el POS no deja fondo y el
siguiente turno abre sin fondo esperado.

## Lo que falta configurar (una sola vez)

El correo **no sale** hasta que exista la cuenta del servicio de envío:

1. Crear cuenta gratis en **resend.com** (3,000 correos al mes; aquí se mandan ~3 al día).
2. En Resend → *Domains* → agregar `shakeaholic.mx` y copiar los registros DNS
   que pide (TXT/MX) en **Cloudflare → DNS**. Esperar a que diga *Verified*.
3. En Resend → *API Keys* → crear una con permiso de **enviar**.
4. Ponerla en **Supabase → Edge Functions → Secrets**:
   - `RESEND_API_KEY` = la llave
   - `CORREO_REMITENTE` = `Shakeaholic <cortes@shakeaholic.mx>`

   **La llave va solo ahí: nunca en el repo ni en el chat.**
5. Admin → Cortes → **Comprobantes por correo** → poner los correos.

Mientras no esté la llave, la cola guarda los comprobantes y Admin enseña
«Falta configurar el servicio de correo». En cuanto se ponga, salen solos
(los atrasados también, hasta 6 intentos).

## Probado (09/10/26)

- En producción, dentro de transacciones que se deshicieron: cerrar con fondo
  (retiro y fondo correctos), rechazo de un billete que no se contó y de
  basura, reposición cuando no alcanza (fondo esperado = $3,000), fondo
  esperado puesto por el trigger aunque la pantalla mande otro, comprobante
  con quién entrega y quién recibe, correos encolados al cerrar y al recibir
  con diferencia.
- Por la puerta de enfrente (HTTP con la llave publicable): las seis
  funciones nuevas contestan **401 permission denied**.
- La Edge Function contesta `sin_llave` (503) mientras no hay llave.
- El kiosko compilado en un navegador real: Regina cuenta $5,534, el sistema
  sugiere dejar $3,000 en billetes chicos y monedas, retira $2,534; Andrés
  entra con su PIN, ve $3,000 esperados, cuenta $50 menos y la nota se
  escribe sola; la pantalla queda a su nombre.
