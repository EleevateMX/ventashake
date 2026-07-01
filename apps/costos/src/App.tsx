import { useState } from 'react'
import InsumosPage from './pages/InsumosPage'
import ProductosPage from './pages/ProductosPage'
import ParametrosPage from './pages/ParametrosPage'

const TABS = [
  { id: 'productos', label: 'Productos y Costeo' },
  { id: 'insumos', label: 'Insumos' },
  { id: 'parametros', label: 'Parámetros' },
] as const

type TabId = (typeof TABS)[number]['id']

export default function App() {
  const [tab, setTab] = useState<TabId>('productos')

  return (
    <div className="app">
      <header className="header">
        <h1>🥤 Shakeaholic · Costos</h1>
        <nav>
          {TABS.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? 'tab activo' : 'tab'}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main>
        {tab === 'productos' && <ProductosPage />}
        {tab === 'insumos' && <InsumosPage />}
        {tab === 'parametros' && <ParametrosPage />}
      </main>
    </div>
  )
}
