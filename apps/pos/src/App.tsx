import { useEffect, useState } from 'react'
import { sb } from './lib/sb'
import { listarAlmacenes, corteAbierto, abrirCaja, listarCajas } from '@shake/supabase'
import type { Almacen, Caja, CajaCorte } from '@shake/types'
import Venta from './pages/Venta'
import Corte from './pages/Corte'

export interface Contexto {
  sucursalId: string
  almacenKioskoId: string
  caja: Caja
  corte: CajaCorte
}

export default function App() {
  const [almacen, setAlmacen] = useState<Almacen | null>(null)
  const [caja, setCaja] = useState<Caja | null>(null)
  const [corte, setCorte] = useState<CajaCorte | null>(null)
  const [fondo, setFondo] = useState('0')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'venta' | 'corte'>('venta')

  async function bootstrap() {
    try {
      const almacenes = await listarAlmacenes(sb)
      const kiosko = almacenes.find((a) => a.tipo === 'kiosko') ?? almacenes[0]
      if (!kiosko) throw new Error('No hay almacenes configurados.')
      setAlmacen(kiosko)
      const cajas = await listarCajas(sb)
      const c = cajas.find((x) => x.sucursal_id === kiosko.sucursal_id) ?? cajas[0]
      if (!c) throw new Error('No hay cajas configuradas.')
      setCaja(c)
      setCorte(await corteAbierto(sb, c.id))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    void bootstrap()
  }, [])

  async function handleAbrir() {
    if (!caja) return
    try {
      setCorte(await abrirCaja(sb, caja.id, Number(fondo) || 0))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (cargando) return <div className="cargando">Cargando caja…</div>

  return (
    <div className="app">
      <header className="header">
        <h1>🥤 Shakeaholic · Caja POS</h1>
        {corte && (
          <nav>
            <button className={tab === 'venta' ? 'tab activo' : 'tab'} onClick={() => setTab('venta')}>Venta</button>
            <button className={tab === 'corte' ? 'tab activo' : 'tab'} onClick={() => setTab('corte')}>Corte</button>
          </nav>
        )}
      </header>

      {error && <div className="error-msg">{error}</div>}

      {!corte && caja && almacen && (
        <div className="panel" style={{ maxWidth: 420 }}>
          <h2>Abrir caja — {caja.nombre}</h2>
          <p className="muted">No hay un corte abierto. Ingresa el fondo inicial para comenzar a vender.</p>
          <div className="campo">
            <label>Fondo inicial en efectivo ($)</label>
            <input type="number" value={fondo} onChange={(e) => setFondo(e.target.value)} />
          </div>
          <button className="primario" onClick={() => void handleAbrir()}>Abrir caja</button>
        </div>
      )}

      {corte && almacen && caja && tab === 'venta' && (
        <Venta
          ctx={{ sucursalId: almacen.sucursal_id, almacenKioskoId: almacen.id, caja, corte }}
        />
      )}
      {corte && caja && tab === 'corte' && (
        <Corte corte={corte} onCerrado={() => { setCorte(null); setTab('venta') }} />
      )}
    </div>
  )
}
