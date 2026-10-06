import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@shake/brand/tokens.css'
import './index.css'
// Se importa por su efecto: atrapa `beforeinstallprompt` antes de que
// React monte (ver instalar.ts).
import './lib/instalar'

// El service worker solo recibe avisos push; no guarda nada en caché.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
