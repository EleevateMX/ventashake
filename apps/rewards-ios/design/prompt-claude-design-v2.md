# Shakeaholic Rewards — brief v2 para Claude Design

Pega esto tal cual como primer mensaje y adjunta esta carpeta completa
(`capturas/`, `marca/`, `fuentes/`). Es la **segunda vuelta**: la app
cambió desde las piezas que ya hiciste, y faltan dos tamaños.

---

Eres el diseñador de **Shakeaholic**, una protein bar en Mérida, Yucatán
(The Harbor). Ya diseñaste las capturas de la App Store y las piezas de
lanzamiento de **Shakeaholic Rewards** (la app nativa de iOS de
recompensas) y quedaron bien: mantén ese mismo sistema. Lo que cambia es
que **la app ya no se ve igual** y te paso las pantallas nuevas. **No
inventes una marca nueva: aplica esta.**

## Qué es la app

Tarjeta de lealtad del cliente: cada compra suma **mancuernas** (10
mancuernas = $1); se enseña un QR en la barra; hay metas, cupones,
recargas, Apple Wallet, un menú con fotos y ficha de cada producto, pedidos
desde la app, una sección de **Aliados** (marcas amigas con promo) y un
perfil editable con foto. El personal entra con PIN y tiene su propio
beneficio. Público: gente de 20 a 40 que va al gym, Mérida.

## Qué cambió desde la vuelta anterior (usa SOLO estas capturas)

Las 12 capturas de `capturas/` son reales, a 1320 × 2868 (iPhone 6.9"),
con datos de muestra (Alejandro, 763 mancuernas, código SHK-A7K2M9):

| Archivo | Qué es |
|---|---|
| `00-arranque.png` | Pantalla de arranque: Milo solo sobre verde profundo |
| `01-tarjeta.png` | Tu tarjeta: saldo, QR, metas, Apple Wallet, aliados |
| `02-menu.png` | Menú por familias (Shakes · Alimentos · Bebidas · De temporada · Snacks), con fotos, «Novedades» y «Los más pedidos» |
| `03-menu-alimentos.png` | La familia Alimentos abierta |
| `04-ficha-producto.png` | Ficha del producto: foto, precio, «Con qué va» en pastillas y mosaico |
| `05-pedido.png` | Pedido desde la app: elegir, pagar y pasar a recoger |
| `06-aliados.png` | Pestaña Aliados (catálogo de marcas amigas) |
| `07-aliado-detalle.png` | Un aliado abierto: logo, promo, contacto |
| `08-cuenta.png` | Cuenta: perfil, visitas, lo que más pides, compras |
| `09-personal.png` | Modo personal (equipo): su beneficio del día |
| `10-codigo-personal.png` | QR de personal para cobrar con descuento |
| `11-editar-perfil.png` | Editar mi perfil: foto, nombre, teléfono, cumpleaños |

Cambios concretos respecto a lo que ya hiciste: las pestañas ahora son
**Tarjeta · Menú · Aliados · Cuenta** (la actividad vive dentro de
Cuenta, ya no es pestaña); el menú tiene **familias y fotos**; hay
**ficha de producto** y **pedido desde la app**; hay **editar perfil con
foto**. La tarjeta de Wallet **no muestra saldo** a propósito.

## Identidad (de `marca/tokens.css`, no la cambies)

- **Verde** `#2C4A3E` (superficies), **verde profundo** `#1A2E26` (fondo
  de la app), **tinta** `#14241D` (texto sobre crema).
- **Crema** `#E8E6CC` (texto sobre verde), **crema papel** `#EDE9D0`
  (tarjetas), crema suave `#F2EFD9`, crema cálida `#DDD9B8`.
- Acentos de sabor, **uno por pieza, nunca varios**: **plátano** `#F0C649`
  (el acento principal, botones y títulos de énfasis), fresa `#E04E5C`
  (solo errores y alertas), menta `#88C0A0`, mango `#E58037`, chocolate
  `#5C3825`, blueberry `#6C4A9E`.
- **No existe versión oscura ni clara alternativa**: la app es verde
  profundo con tarjetas crema. Punto.

## Tipografía (archivos en `fuentes/`)

- **Bagel Fat One** — display, **solo de 18 px para arriba** y en **un
  solo peso**: títulos y cifras grandes («763»). Nunca como texto corrido
  ni en chico; nunca forzada a bold.
- **DM Sans** — cuerpo, todo lo que se lee.
- **DM Mono** — cifras, códigos (`SHK-A7K2M9`), etiquetas en versalitas
  con tracking amplio (`MANCUERNAS`, `CLIENTE`).

## Milo, la mascota (`marca/milo.png`, `marca/milo-transparent.png`)

Un vaso shaker con cara, caminando con dos mancuernas. Es la voz visual
de la marca: aparece en el arranque, en la tarjeta de Wallet, cuando un
producto no tiene foto («Milo se lo comió») y en los huecos vacíos.
Siempre en línea crema/verde claro sobre verde; nunca recoloreado a otros
tonos, nunca estirado, nunca con sombras duras. Puede tener gestos y
accesorios (lentes de sol, gorra) si la pieza lo pide, dibujados en el
mismo trazo.

## Tono

Cercano, corto, en español de México, de tú. Sin signos de exclamación
en cadena, sin «¡Increíble!». Ejemplos reales de la app: «Junta mancuernas
en cada compra y cámbialas por tus favoritos», «Lo que hay hoy en la
barra», «Milo se lo comió», «Con qué va». La sorpresa del 13+1 **no se
anuncia nunca** con números: solo «quizá te llegue una sorpresa».

## Lo que necesito en esta vuelta

1. **Capturas para la App Store, de nuevo** (iPhone 6.9", 1320 × 2868 px,
   **8 piezas**), con el mismo sistema que ya hiciste (marco de iPhone
   sobre verde profundo, titular corto en Bagel Fat One crema o plátano,
   máximo 5 palabras, subtítulo en DM Sans), pero con las capturas nuevas.
   Orden: 1 Tarjeta (`01`) · 2 Menú con fotos (`02`) · 3 Ficha «Con qué
   va» (`04`) · 4 Pide y pasa a recoger (`05`) · 5 Apple Wallet y Apple
   Watch (usa `01` y `marca/wallet-strip.png`) · 6 Aliados (`06`) · 7
   Cuenta y perfil (`08` u `11`) · 8 Metas y cupones (`01`, la parte de
   metas). Milo puede asomarse en una o dos, no en todas. Entrégalas
   nombradas `1_tarjeta.png` … `8_metas.png`.
2. **Dos piezas que faltaron la vez pasada**, para la ficha de la App
   Store:
   - **Header de la página del producto** (lo que Apple llama *App
     Store Header*): **5244 × 2950 px** y una segunda versión **3840 ×
     1646 px**. Verde profundo, Milo grande a un lado, el nombre
     «Shakeaholic Rewards» en Bagel Fat One crema y una línea en DM Sans
     («Tu tarjeta de mancuernas»). Sin marco de iPhone, sin texto chico:
     se ve recortado en distintos tamaños, así que lo importante va al
     centro.
   - **Search Results** (la imagen que sale al buscar en la App Store):
     misma composición que la primera captura, pero más limpia: solo la
     tarjeta con el saldo y un titular de 3 palabras. 1320 × 2868 px.
3. **Pase de Wallet**: la franja que hiciste (`11-franja-wallet`) ya está
   en uso; no hace falta repetirla salvo que quieras una variante.
4. **Si te sobra tiempo**: una historia de Instagram para anunciar
   «Ya puedes pedir desde la app» usando `05-pedido.png`.

Entrega en PNG a tamaño real y, si puedes, el archivo editable. Antes de
proponer algo fuera de estos colores o fuentes, pregunta.
