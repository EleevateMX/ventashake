import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@shake/brand/tokens.css'
import './index.css'
import { escucharRecargas } from '@shake/supabase'
import { idDePantalla } from '@shake/utils'
import { sb } from './lib/sb'

// El timbre de "actualizar pantallas" del Admin: esta pantalla es de solo
// lectura, así que recarga al instante — sin nadie caminando a picarle F5.
escucharRecargas(sb, 'pantalla', () => window.location.reload())

// Latido para Admin → Pantallas (18/10/26): la TV de pedidos es el navegador
// de la TV abierto a mano, y nadie se enteraba de que lo habían cerrado. Va
// por el mismo vistazo que el kiosko (pantalla_espejo, 'folios:xxxx'), con el
// tamaño y el navegador para distinguir la TV de una laptop. En silencio.
const idFolios = idDePantalla('folios')
const latir = () => {
  // Promise.resolve: lo que devuelve rpc() solo trae `then`, no `catch`.
  void Promise.resolve((sb.rpc as unknown as (fn: string, a: Record<string, unknown>) => PromiseLike<unknown>)('fn_caja_espejo_publicar', {
    p_pantalla: idFolios,
    p_estado: { ruta: '/folios', ua: navigator.userAgent.slice(0, 160), ancho: window.screen.width, alto: window.screen.height },
    p_eventos: [],
  })).catch(() => {})
}
latir()
setInterval(latir, 60_000)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
