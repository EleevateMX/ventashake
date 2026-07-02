import { useState } from 'react'
import Menu from './pages/Menu'
import Ventas from './pages/Ventas'
import Inventario from './pages/Inventario'
import Promos from './pages/Promos'

type Tab = 'menu' | 'ventas' | 'inventario' | 'promos'

export default function App() {
  const [tab, setTab] = useState<Tab>('menu')

  return (
    <div className="app">
      <header className="header">
        <h1>🥤 Shakeaholic · Admin</h1>
        <nav>
          <button className={tab === 'menu' ? 'tab activo' : 'tab'} onClick={() => setTab('menu')}>Menú</button>
          <button className={tab === 'ventas' ? 'tab activo' : 'tab'} onClick={() => setTab('ventas')}>Ventas</button>
          <button className={tab === 'inventario' ? 'tab activo' : 'tab'} onClick={() => setTab('inventario')}>Inventario</button>
          <button className={tab === 'promos' ? 'tab activo' : 'tab'} onClick={() => setTab('promos')}>Promos</button>
        </nav>
      </header>

      {tab === 'menu' && <Menu />}
      {tab === 'ventas' && <Ventas />}
      {tab === 'inventario' && <Inventario />}
      {tab === 'promos' && <Promos />}
    </div>
  )
}
