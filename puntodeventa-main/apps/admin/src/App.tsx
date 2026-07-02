import React, { useState } from 'react'
import { Routes, Route, Navigate, NavLink } from 'react-router-dom'
import { isSupabaseConfigured } from '@pos/supabase'
import { Dashboard } from './pages/Dashboard'
import { Menu } from './pages/Menu'
import { Inventario } from './pages/Inventario'
import { Ventas } from './pages/Ventas'
import { Roles } from './pages/Roles'
import { Promociones } from './pages/Promociones'
import { Lealtad } from './pages/Lealtad'

// ── SVG icons ──────────────────────────────────────────────────────────────────

const w = 18

const IconDashboard = () => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="13" width="4" height="8" rx="1"/>
    <rect x="10" y="8" width="4" height="13" rx="1"/>
    <rect x="17" y="3" width="4" height="18" rx="1"/>
  </svg>
)

const IconMenu = () => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/>
    <line x1="7" y1="2" x2="7" y2="22"/>
    <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Z"/>
    <line x1="21" y1="15" x2="21" y2="22"/>
  </svg>
)

const IconInventario = () => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
    <path d="m3.3 7 8.7 5 8.7-5"/>
    <line x1="12" y1="22" x2="12" y2="12"/>
  </svg>
)

const IconPromociones = () => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/>
    <circle cx="7" cy="7" r="1" fill="currentColor" stroke="none"/>
  </svg>
)

const IconLealtad = () => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
)

const IconVentas = () => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
    <polyline points="16 7 22 7 22 13"/>
  </svg>
)

const IconEmpleados = () => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
)

// ── Nav config ─────────────────────────────────────────────────────────────────

const navItems = [
  { to: '/dashboard',   label: 'Dashboard',   Icon: IconDashboard },
  { to: '/menu',        label: 'Menú',        Icon: IconMenu },
  { to: '/inventario',  label: 'Inventario',  Icon: IconInventario },
  { to: '/promociones', label: 'Promociones', Icon: IconPromociones },
  { to: '/lealtad',     label: 'Lealtad',     Icon: IconLealtad },
  { to: '/ventas',      label: 'Ventas',      Icon: IconVentas },
  { to: '/roles',       label: 'Empleados',   Icon: IconEmpleados },
]

const DEMO_KEY = 'shake-demo-mode'

function getDemoMode(): boolean {
  return !isSupabaseConfigured || localStorage.getItem(DEMO_KEY) === 'true'
}

export default function App() {
  const [demoMode] = useState(getDemoMode)

  function toggleDemo() {
    if (!isSupabaseConfigured) return
    const next = !demoMode
    localStorage.setItem(DEMO_KEY, String(next))
    // Navigate to the app root so GitHub Pages serves index.html correctly
    window.location.href = import.meta.env.BASE_URL
  }

  return (
    <div className="flex min-h-screen bg-sa-cream-paper">
      {/* Sidebar */}
      <aside className="w-64 bg-sa-green-deep text-sa-cream flex flex-col">
        <div className="px-6 pt-7 pb-6">
          <img
            src="/logo.png"
            alt="Shake Aholic"
            className="w-[140px] h-auto select-none"
            draggable={false}
          />
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {navItems.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-sa-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-sa-cream text-sa-green-ink font-semibold shadow-sa-sm'
                    : 'text-sa-cream/80 hover:text-sa-cream hover:bg-white/5 font-medium'
                }`
              }
            >
              <Icon />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-sa-cream/10 space-y-3">
          {isSupabaseConfigured ? (
            <button
              onClick={toggleDemo}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-sa text-xs font-mono uppercase tracking-wide transition-colors ${
                demoMode
                  ? 'bg-sa-banana/20 text-sa-banana hover:bg-sa-banana/30'
                  : 'bg-sa-cream/10 text-sa-cream/70 hover:bg-sa-cream/20'
              }`}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${demoMode ? 'bg-sa-banana' : 'bg-emerald-400'}`} />
              {demoMode ? 'Modo DEMO · Usar datos reales' : 'Datos reales · Habilitar DEMO'}
            </button>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 rounded-sa bg-sa-banana/20 text-sa-banana text-xs font-mono uppercase tracking-wide">
              <span className="w-2 h-2 rounded-full bg-sa-banana flex-shrink-0" />
              Modo DEMO
            </div>
          )}
          <p className="text-[11px] font-mono uppercase tracking-wider text-sa-cream/40 px-1">
            Shake Aholic · Admin
          </p>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 min-w-0 bg-sa-cream-paper">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/menu" element={<Menu />} />
          <Route path="/inventario" element={<Inventario />} />
          <Route path="/promociones" element={<Promociones />} />
          <Route path="/lealtad" element={<Lealtad />} />
          <Route path="/ventas" element={<Ventas />} />
          <Route path="/roles" element={<Roles />} />
        </Routes>
      </main>
    </div>
  )
}
