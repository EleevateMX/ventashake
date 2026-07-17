import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Catalogo } from './pages/Catalogo'
import { Carrito } from './pages/Carrito'
import { LoginLealtad } from './pages/LoginLealtad'
import { AuthCallback } from './pages/AuthCallback'
import { Pago } from './pages/Pago'
import { PagarEnCaja } from './pages/PagarEnCaja'
import { Confirmacion } from './pages/Confirmacion'

export default function App() {
  return (
    <div className="h-screen w-screen overflow-hidden bg-sa-cream-paper font-body text-sa-green-ink">
      <Routes>
        <Route path="/" element={<Navigate to="/catalogo" replace />} />
        <Route path="/catalogo" element={<Catalogo />} />
        <Route path="/carrito" element={<Carrito />} />
        <Route path="/lealtad" element={<LoginLealtad />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/pago" element={<Pago />} />
        <Route path="/pagar-en-caja" element={<PagarEnCaja />} />
        <Route path="/confirmacion" element={<Confirmacion />} />
      </Routes>
    </div>
  )
}
