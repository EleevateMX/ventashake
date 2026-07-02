import { useEffect, useState } from 'react'
import { sb } from './lib/sb'
import {
  iniciarSesionGoogle,
  sesionActual,
  usuarioActual,
  cerrarSesion,
  onCambioSesion,
  vincularClienteAuth,
} from '@shake/supabase'
import type { ClienteConLealtad } from '@shake/supabase'
import QR from './QR'

export default function App() {
  const [cargando, setCargando] = useState(true)
  const [logueado, setLogueado] = useState(false)
  const [cliente, setCliente] = useState<ClienteConLealtad | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function sincronizar() {
    try {
      const sesion = await sesionActual(sb)
      if (!sesion) {
        setLogueado(false)
        setCliente(null)
        return
      }
      setLogueado(true)
      const user = await usuarioActual(sb)
      if (!user) return
      const nombre =
        (user.user_metadata?.full_name as string) ||
        (user.user_metadata?.name as string) ||
        user.email ||
        'Cliente'
      const cli = await vincularClienteAuth(sb, {
        authUserId: user.id,
        nombre,
        email: user.email ?? null,
      })
      setCliente(cli)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    void sincronizar()
    const off = onCambioSesion(sb, () => void sincronizar())
    return off
  }, [])

  async function entrar() {
    try {
      await iniciarSesionGoogle(sb, window.location.origin)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (cargando) return <div className="centro">Cargando…</div>

  if (!logueado) {
    return (
      <div className="centro">
        <div className="hero">
          <div className="logo">🥤</div>
          <h1>Shakeaholic Rewards</h1>
          <p>Acumula <b>mancuernas</b> con cada compra y gana shakes gratis.</p>
          {error && <div className="error-msg">{error}</div>}
          <button className="google" onClick={() => void entrar()}>
            Continuar con Google
          </button>
          <p className="fine">Regístrate en segundos. 1 mancuerna por cada $10.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="top">
        <span>🥤 Rewards</span>
        <button className="liga" onClick={() => void cerrarSesion(sb)}>Salir</button>
      </header>

      {error && <div className="error-msg">{error}</div>}

      {cliente && (
        <>
          <section className="card saldo">
            <div className="hola">Hola, {cliente.nombre.split(' ')[0]}</div>
            <div className="mancuernas">🏋️ {cliente.mancuernas}</div>
            <div className="lbl">mancuernas</div>
            <div className="barra"><div style={{ width: `${Math.min(100, cliente.mancuernas)}%` }} /></div>
            <div className="fine">{Math.max(0, 100 - (cliente.mancuernas % 100 || 0))} para tu próximo cupón</div>
          </section>

          <section className="card">
            <h2>Tu código</h2>
            <p className="fine">Muéstralo en caja o en el kiosko para identificarte.</p>
            <div className="qrbox">
              {cliente.codigo ? <QR value={cliente.codigo} /> : <span className="fine">—</span>}
            </div>
            <div className="codigo">{cliente.codigo}</div>
          </section>

          <section className="card">
            <h2>Cupones activos ({cliente.cupones.length})</h2>
            {cliente.cupones.length === 0 && (
              <p className="fine">Aún no tienes cupones. ¡Junta 100 mancuernas!</p>
            )}
            {cliente.cupones.map((c) => (
              <div key={c.id} className="cupon">
                <div>
                  <b>{c.tipo === 'cumpleanos' ? '🎂 Cumpleaños' : '🎁 Recompensa'}</b>
                  <div className="fine">{c.beneficio}</div>
                  <div className="fine">Vence: {new Date(c.vence_en).toLocaleDateString('es-MX')}</div>
                </div>
                <div className="cupon-qr"><QR value={c.codigo} size={72} /></div>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  )
}
