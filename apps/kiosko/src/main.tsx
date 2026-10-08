import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import '@shake/brand/tokens.css'
import './index.css'

// Kiosko de tienda: el menú contextual del navegador (clic derecho o dejar
// el dedo puesto — "buscar imagen con Google", "abrir en otra pestaña") no
// tiene nada que hacer frente a un cliente. Se apaga completo.
window.addEventListener('contextmenu', (e) => e.preventDefault())

// Para que una recarga SIN internet no deje la caja en blanco: ver
// public/sw.js (primero la red siempre; la copia solo si no hay red).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').catch(() => { /* sin él, todo sigue igual */ })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
