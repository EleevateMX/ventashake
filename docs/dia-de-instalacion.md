# Día de instalación — 3 pantallas

Guía para el montaje en sucursal: **2 pantallas de cocina** (Alimentos y
Bebidas, cada una con su impresora) y **1 kiosko**. Pensada para
imprimirse y seguirse en orden.

## Antes de empezar: qué se hace desde dónde

| Tarea | Quién / dónde |
|---|---|
| Abrir las apps en cada pantalla | En sitio, en cada equipo |
| Instalar el agente de impresión | En sitio, en cada equipo de cocina |
| Conectar y detectar la impresora | En sitio (USB o red local) |
| Registrar impresoras, empleados, precios | Admin (desde cualquier navegador) |
| Diagnóstico en vivo, tokens, cola de impresión | Se puede hacer en remoto contra la base |

> El agente de impresión **tiene que correr en la máquina que tiene la
> impresora**: es quien habla con el hardware por USB o por la red local.
> Nada externo puede imprimir por él.

## 0. Requisitos por equipo

- **Las 2 de cocina**: navegador + Node.js 20 o superior (para el agente
  de impresión) + la impresora conectada (USB o en la misma red Wi-Fi).
- **Kiosko**: solo navegador. No necesita agente ni impresora.
- Todos en la misma red, con internet.

### 0.1 Escaneo previo (para revisarlo juntos)

En cada equipo, antes de instalar nada, corre el escaneo y pégame el
resultado. Es de solo lectura — no instala ni cambia nada — y me dice qué
hardware hay, si falta Node.js, si la impresora está conectada por USB o en
la red, y si el equipo alcanza Supabase:

| Sistema | Cómo |
|---|---|
| Windows | Clic derecho en `scripts/escanear-equipo.ps1` → *Ejecutar con PowerShell*. Deja `shakeaholic-escaneo.txt` en el Escritorio. |
| Linux / macOS | `bash scripts/escanear-equipo.sh \| tee ~/shakeaholic-escaneo.txt` |

Si Windows bloquea el script, abre PowerShell en esa carpeta y pega:
`Set-ExecutionPolicy -Scope Process Bypass -Force; .\escanear-equipo.ps1`

> Esto hace falta porque el hardware **solo lo ve la máquina que lo tiene
> enchufado**. Desde fuera no hay forma de detectar una impresora USB ni de
> entrar a tu red local: el escaneo es el puente.

## 1. Estado que ya está listo (no hay que tocarlo)

Verificado en la base de producción:

- Sucursal **Shakeaholic Mérida** marcada como producción.
- Estaciones **Alimentos** y **Bebidas** creadas.
- Almacenes **Bodega** y **Kiosko**.
- Caja **Caja Kiosko** activa.
- Kiosko en modo **pagar_en_caja** (el cliente arma su orden y paga en
  caja; el kiosko nunca cobra solo). Expira a los 15 min.
- Empleados: **Cajero 1** y **Gerente** (este último hace falta para
  autorizar descuentos y canjes de cupón).

## 2. Abrir las apps (5 min)

Cada pantalla abre su URL y se deja en pantalla completa (F11):

| Pantalla | URL |
|---|---|
| Cocina Alimentos | `https://shake-cocina-alimentos.pages.dev` |
| Cocina Bebidas (Barra) | `https://shake-cocina-bebidas.pages.dev` |
| Kiosko | `https://shake-kiosko.pages.dev` |
| Caja (POS) | `https://shake-pos.pages.dev` |
| Admin | `https://shake-admin.pages.dev` |

En el POS se entra con PIN. Los PIN temporales se cambian en
**Admin → Empleados** el mismo día (ver §6).

## 3. Impresoras (15 min, lo único con hardware)

Por cada equipo de cocina, en orden:

1. **Conectar la impresora** y encenderla. Si es de red, anotar su IP.
2. **Registrarla** en Admin → Impresoras: nombre, estación (Alimentos o
   Bebidas), tipo de conexión (USB o red) y la IP si aplica. Al guardar,
   la pantalla muestra **el token del agente una sola vez** — cópialo.
3. **Instalar el agente** en ese equipo (detalle completo en
   `docs/instalacion-agente-impresion.md`):
   ```bash
   cd agente-impresion
   npm install
   cp .env.example .env                    # ya trae URL y anon key
   cp printers.config.example.json printers.config.json
   ```
4. Pegar en `printers.config.json` el **id** y el **token** de la
   impresora que acabas de registrar.
5. **Probar antes de seguir**:
   ```bash
   npm run diagnose -- --imprimir
   ```
   Revisa conexión, autenticación, estación, cola e imprime una prueba
   física. No sigas si algo sale con ✘.
6. Dejarlo corriendo: `npm run start` (o como servicio para que arranque
   solo). Verifica `http://localhost:7777/status`.

Repetir para la segunda cocina. **Cada equipo lleva su propio token** — no
se comparte entre máquinas.

## 4. Prueba de punta a punta (10 min)

Con las 3 pantallas abiertas y los 2 agentes corriendo:

1. **Kiosko**: armar una orden con **un alimento y una bebida** y enviarla.
   Anota el folio que muestra.
2. **POS → Pendientes**: aparece la orden. Cóbrala en efectivo.
3. Al cobrar, verifica en cadena:
   - La comanda del alimento **se imprime sola** en la cocina de
     Alimentos y aparece en su pantalla.
   - La de la bebida, en Barra. Cada estación ve **solo lo suyo**.
   - El inventario bajó (Admin → Inventario).
   - La venta aparece en el corte de caja.
4. Avanzar estados en el KDS: Pendiente → Preparando → Listo → Entregar.
5. **Prueba de descuento**: en el POS aplica un descuento — debe pedir el
   PIN del Gerente. Con el PIN del cajero debe rechazarlo.
6. **Prueba de resistencia**: apaga una impresora a media venta. El pedido
   debe seguir viéndose normal en el KDS (no se pierde). Reimprime desde
   Admin cuando la enciendas.

## 5. Qué revisar si algo no sale

| Síntoma | Dónde mirar |
|---|---|
| No imprime | `npm run diagnose` en ese equipo; Admin → Impresoras (¿conectada?) |
| La orden no llega al KDS | Admin → Sistema: pedidos sin comanda, órdenes esperando caja |
| El kiosko no muestra productos | El producto necesita **precio** en costosshake para estar activo |
| Descuento no deja aplicar | Falta el PIN de un empleado con rol Gerente o Administrador |

Admin → **Sistema** es el tablero único: pagos pendientes, órdenes
atoradas, impresoras desconectadas, comandas fallidas y ventas sin
movimiento de inventario.

## 6. Pendientes de captura (sin esto no se ve en pantalla)

Estos no son fallas del sistema: son datos que faltan por capturar en
costosshake y que hacen que el producto no aparezca.

- **Los 17 shakes no tienen precio de venta** → no aparecen en el menú.
  Es lo más importante a capturar antes de vender.
- **Precio de scoop** (pestaña Proteínas): vacío en las 122 proteínas.
- **Precio de bote** (`precioBote`): vacío — sin él no se venden los
  suplementos de reventa.
- **Extras**: en Admin → Extras hay que ponerle precio de venta a cada
  ingrediente que se quiera ofrecer (el sistema ya muestra su costo real).
- **Cambiar los PIN temporales** en Admin → Empleados.

## 7. Google / lealtad

El botón de Google en la app de Rewards está **deshabilitado del lado de
Supabase**, no es un error del código: falta crear las credenciales en
Google Cloud. Hoy la app avisa amablemente en vez de mandar al cliente a
una pantalla de error. Pasos en `docs/configurar-google-auth.md`.

Mientras tanto, la lealtad **sí funciona sin Google**: en caja se
identifica al cliente por teléfono o QR, y desde ahí se dan de alta
clientes nuevos, se acumulan mancuernas y se canjean cupones.
