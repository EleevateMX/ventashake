# Shakeaholic · Tablero de Costos e Inventario

Herramienta interna para costear shakes, alimentos, bebidas y snacks (merma, empaque,
IVA, food cost %, precio de referencia) y controlar inventario en dos ubicaciones
(**bodega** y **kiosko**) con traspasos por clave. Ahora **sincroniza en la nube**: lo que
capturas en la compu aparece en el cel y viceversa.

## Sincronización en la nube (Supabase)
- Los datos y los usuarios viven en un proyecto de Supabase (base de datos central).
- Funciona en vivo: si cambias algo en un dispositivo, los demás se actualizan solos.
- El indicador arriba a la derecha muestra el estado (Sincronizado ✓ / Guardando…).
- Si te quedas sin internet, sigue funcionando con una copia local y se reintenta luego.
- El proyecto Supabase: `Shakeaholic` (URL ya configurada dentro de `index.html`).

## Desplegar en GitHub Pages
1. Sube `index.html` y `README.md` a la raíz del repositorio.
2. **Settings → Pages → Source: "Deploy from a branch" → `main` → `/ (root)`**.
3. En 1–2 min: `https://<tu-usuario>.github.io/<tu-repo>/`
4. El primer dispositivo que entre crea el usuario inicial y los datos de ejemplo en la nube.

## Acceso
- Usuario inicial: **admin / shakeaholic** (cámbialo en cuanto entres).
- Puedes registrar usuarios nuevos; ahora se guardan en la nube y sirven en todos los dispositivos.

## Inventario y traspasos
- Dos inventarios por producto: presentación original (bodega) y porción/individual (kiosko), con stock mínimo.
- Equivalencia por producto (1 bote = X scoops, 1 caja = X piezas, 1 bolsa = X porciones).
- Botón **⇄ Traspasar** mueve de bodega a kiosko y pide la **clave del encargado** (Parámetros).
- Pestaña **Inventario** con vistas Todos / Bodega / Kiosko, búsqueda, filtro y alertas.

## Precio por porción (ingredientes)
- **Costo por porción** = costo de compra ÷ porciones por presentación (automático).
- **Precio por porción** = costo por porción × (1 + % de ganancia) (automático).

## Seguridad — importante
- La "clave pública" de Supabase va dentro de `index.html`. El acceso a los datos está
  permitido de forma pública (uso interno). Por eso conviene **mantener el repositorio privado**
  y no compartir la URL fuera del negocio.
- El login es un candado de acceso, no seguridad fuerte. Para protección real (login verdadero
  por usuario), el siguiente paso es activar **Supabase Auth**.

## Respaldos
- **Respaldar** descarga un `.json` con todo; **Restaurar** lo vuelve a cargar (y lo sube a la nube).
- **Exportar CSV** para reportes de costeo.

## Notas de costeo
- Costo total = (insumos × (1 + merma)) + empaque + mano de obra.
- Precio sin IVA = precio ÷ (1 + IVA). Food cost % = costo ÷ precio sin IVA. Meta: 28–32%.
- El "precio de referencia" es orientativo; el precio de venta lo defines tú.
