import milo from '@shake/brand/milo.png'
import { useState } from 'react'
import Dashboard from './pages/Dashboard'
import Menu from './pages/Menu'
import Ventas from './pages/Ventas'
import Inventario from './pages/Inventario'
import Promos from './pages/Promos'

type Tab = 'dashboard' | 'menu' | 'ventas' | 'inventario' | 'promos'

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard')

  return (
    <div className="app">
      <header className="header">
        <h1><img className="milo" src={milo} alt="" />Shake Aholic · Admin</h1>
        <nav>
          <button className={tab === 'dashboard' ? 'tab activo' : 'tab'} onClick={() => setTab('dashboard')}>Dashboard</button>
          <button className={tab === 'menu' ? 'tab activo' : 'tab'} onClick={() => setTab('menu')}>Menú</button>
          <button className={tab === 'ventas' ? 'tab activo' : 'tab'} onClick={() => setTab('ventas')}>Ventas</button>
          <button className={tab === 'inventario' ? 'tab activo' : 'tab'} onClick={() => setTab('inventario')}>Inventario</button>
          <button className={tab === 'promos' ? 'tab activo' : 'tab'} onClick={() => setTab('promos')}>Promos</button>
        </nav>
      </header>

      {tab === 'dashboard' && <Dashboard />}
      {tab === 'menu' && <Menu />}
      {tab === 'ventas' && <Ventas />}
      {tab === 'inventario' && <Inventario />}
      {tab === 'promos' && <Promos />}
    </div>
  )
}