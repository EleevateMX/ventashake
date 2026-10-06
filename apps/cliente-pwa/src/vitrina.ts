import type { ResumenLealtad, Aliado } from '@shake/supabase'

/**
 * Modo vitrina, SOLO en desarrollo (`pnpm dev` con `?vitrina` en la URL):
 * pinta a Alejandro con 763 mancuernas para capturas y pruebas sin cuenta.
 * El menú y los aliados sí son los reales. En la versión publicada no
 * existe: `import.meta.env.DEV` es falso y Vite lo tira del paquete.
 */
export const vitrinaActiva = import.meta.env.DEV && new URLSearchParams(window.location.search).has('vitrina')

export const resumenVitrina: ResumenLealtad = {
  registrado: true,
  tasa: 10,
  cliente: {
    id: 'vitrina', nombre: 'Alejandro', codigo: 'SHK-A7K2M9', telefono: '9991234567',
    foto: null, foto_propia: false, mancuernas: 613, saldo: 150, total_canjeable: 763, vale_pesos: 76.3, desde: 'marzo 2026',
  },
  progreso: { meta: 1000, faltan: 237, pct: 76 },
  sorpresa: [{ tipo: 'bebida', nombre: 'Tarjeta de bebidas', estado: 'cerca', texto: 'Con un par de visitas más, quizá te llegue una sorpresa.' }],
  paquetes: [
    { nombre: 'Recarga $200', precio: 200, mancuernas: 2200, vale: 220, bono_pct: 10 },
    { nombre: 'Recarga $500', precio: 500, mancuernas: 5750, vale: 575, bono_pct: 15 },
    { nombre: 'Recarga $1000', precio: 1000, mancuernas: 12000, vale: 1200, bono_pct: 20 },
  ],
  vida: { visitas: 47, gastado: 6120, ticket: 130, ultima: '1 oct' },
  ganadas_total: 1890,
  cupones: [{ codigo: 'SHKC-7F3K2M', beneficio: 'Un shake de $125 por tu cuenta', vence: '30 oct', dias_restantes: 24 }],
  favoritos: [{ nombre: 'Chocokiller', veces: 14 }, { nombre: 'Fresas con crema', veces: 9 }, { nombre: 'Wrap de pollo', veces: 6 }],
  historial: [
    { folio: 2316, orden_id: 'o1', fecha: '1 oct', total: 135, items: 'Chocokiller · Doble scoop', mancuernas: 13 },
    { folio: 2290, orden_id: 'o2', fecha: '29 sep', total: 184, items: 'Wrap de pollo, Americano frío', mancuernas: 18 },
    { folio: 2251, orden_id: 'o3', fecha: '27 sep', total: 125, items: 'Fresas con crema', mancuernas: 12 },
  ],
  movimientos: [
    { puntos: 13, descripcion: 'Compra #2316', fecha: '1 oct', bolsa: 'ganadas' },
    { puntos: -100, descripcion: 'Cupón canjeado', fecha: '30 sep', bolsa: 'ganadas' },
    { puntos: 18, descripcion: 'Compra #2290', fecha: '29 sep', bolsa: 'ganadas' },
  ],
}

export const aliadosVitrina: Aliado[] = [
  { id: 'a1', nombre: 'ProDetail Auto Spa', descripcion: 'Detallado automotriz a domicilio en Mérida.', logo_url: null, promo_titulo: '10% en tu primer lavado', promo_texto: 'Enseña tu tarjeta Shakeaholic al agendar.', web: 'prodetail.mx', whatsapp: '9991112233', instagram: '@prodetailmx', telefono: null, direccion: null, orden: 1, activo: true },
  { id: 'a2', nombre: 'Harbor Fit', descripcion: 'Gimnasio boutique en The Harbor.', logo_url: null, promo_titulo: 'Primera clase gratis', promo_texto: null, web: null, whatsapp: null, instagram: '@harborfit', telefono: null, direccion: 'The Harbor, Mérida', orden: 2, activo: true },
]
