import React from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Catalogo } from './pages/Catalogo'
import { Carrito } from './pages/Carrito'
import { LoginLealtad } from './pages/LoginLealtad'
import { AuthCallback } from './pages/AuthCallback'
import { Pago } from './pages/Pago'
import { PagarEnCaja } from './pages/PagarEnCaja'
import { Confirmacion } from './pages/Confirmacion'
import { EstadoPedido } from './pages/EstadoPedido'

export default function App() {
  // El kiosko es una pantalla fija: no debe hacer scroll nunca. Pero
  // /pedido/:codigo la abre el cliente en su CELULAR, donde el contenido sí
  // puede ser más alto que la pantalla — con `overflow-hidden` se le quedaría
  // el total recortado sin poder bajar.
  const esVistaCelular = useLocation().pathname.startsWith('/pedido/')

  return (
    <div
      className={
        esVistaCelular
          ? 'min-h-screen w-full bg-sa-cream-paper font-body text-sa-green-ink'
          : 'h-screen w-screen overflow-hidden bg-sa-cream-paper font-body text-sa-green-ink'
      }
    >
      <Routes>
        <Route path="/" element={<Navigate to="/catalogo" replace />} />
        <Route path="/catalogo" element={<Catalogo />} />
        <Route path="/carrito" element={<Carrito />} />
        <Route path="/lealtad" element={<LoginLealtad />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/pago" element={<Pago />} />
        <Route path="/pagar-en-caja" element={<PagarEnCaja />} />
        <Route path="/confirmacion" element={<Confirmacion />} />
        {/* Vista pública para el celular del cliente (destino del QR). */}
        <Route path="/pedido/:codigo" element={<EstadoPedido />} />
      </Routes>
    </div>
  )
}
