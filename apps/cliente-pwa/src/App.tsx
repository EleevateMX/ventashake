import milo from '@shake/brand/milo.png'
import { useEffect, useRef, useState, type ComponentType } from 'react'
import { iniciarSesionGoogle } from '@shake/supabase'
import { sb } from './lib/sb'
import { amable } from './lib/rpc'
import { esNativo, iniciarSesionGoogleNativa } from './nativo'
import { EstadoProvider, useEstado } from './Estado'
import { PersonalProvider, usePersonal } from './Personal'
import { TarjetaTab } from './Tarjeta'
import { MenuTab } from './Menu'
import { AliadosTab } from './Aliados'
import { CuentaTab } from './Cuenta'
import { PersonalTab, PersonalView, EntrarPersonal } from './PersonalView'
import { VueltaDePago } from './VueltaDePago'
import { IconoTarjeta, IconoVaso, IconoEtiqueta, IconoPersona, IconoTienda } from './Iconos'
import { Boton, tacto } from './ui'

/** Las secciones de la app, como pestañas de abajo. Las mismas que en iOS. */
type Pestana = 'inicio' | 'menu' | 'aliados' | 'cuenta' | 'personal'
type Icono = ComponentType<{ className?: string }>
const PESTANAS: { id: Pestana; label: string; Icono: Icono }[] = [
  { id: 'inicio', label: 'Tarjeta', Icono: IconoTarjeta },
  { id: 'menu', label: 'Menú', Icono: IconoVaso },
  { id: 'aliados', label: 'Aliados', Icono: IconoEtiqueta },
  { id: 'cuenta', label: 'Cuenta', Icono: IconoPersona },
]

export default function App() {
  return (
    <EstadoProvider>
      <PersonalProvider>
        <Raiz />
      </PersonalProvider>
    </EstadoProvider>
  )
}

/** Arranque → Entrar → La app, según haya sesión. */
function Raiz() {
  const { fase } = useEstado()
  const personal = usePersonal()
  // Clip devuelve a /pago-app?r=ok; Cloudflare Pages lo deja en /?r=ok.
  // Las dos formas son la vuelta del pago.
  if (window.location.pathname === '/pago-app' || new URLSearchParams(window.location.search).has('r')) return <VueltaDePago />
  if (fase === 'arrancando' || fase === 'cargando') return <Arranque />
  if (fase === 'sinSesion') {
    // Alguien del personal puede entrar solo con su PIN, sin cuenta de
    // cliente: ve únicamente su pantalla.
    return personal.activo ? <SoloPersonal /> : <Bienvenida />
  }
  return <Pestanas />
}

/** La pantalla de carga: Milo llega con un rebote y «camina» mientras se trae la tarjeta. */
function Arranque() {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-6 bg-sa-green-deep">
      <div className="sa-milo-llega"><img src={milo} alt="" className="w-[140px] sa-milo-camina" /></div>
      <div className="flex items-center gap-2.5" aria-label="Cargando">
        <span className="sa-punto" /><span className="sa-punto" /><span className="sa-punto" />
      </div>
    </div>
  )
}

/**
 * Entrar. En Android y en la web, con Google: la cuenta es la misma de la
 * app de iPhone (mismo Supabase), así que quien ya entró allá encuentra
 * aquí su tarjeta tal cual. Cinco toques a Milo abren el PIN del equipo,
 * igual que en el kiosko y en iOS.
 */
function Bienvenida() {
  const { error } = useEstado()
  const [fallo, setFallo] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [pidiendoPin, setPidiendoPin] = useState(false)
  const toques = useRef<number[]>([])

  async function entrar() {
    setTrabajando(true)
    setFallo(null)
    try {
      if (esNativo()) await iniciarSesionGoogleNativa(sb)
      else await iniciarSesionGoogle(sb, window.location.origin)
    } catch (e) {
      setFallo(amable(e))
      setTrabajando(false)
    }
  }

  function tocarMilo() {
    const ahora = Date.now()
    toques.current = [...toques.current.filter((t) => ahora - t < 1500), ahora]
    if (toques.current.length >= 5) {
      toques.current = []
      tacto.ligero()
      setPidiendoPin(true)
    }
  }

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-between px-6 pt-[max(3rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] bg-sa-green-deep">
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-5">
        <button onClick={tocarMilo} className="sa-entra select-none" aria-label="Milo, la mascota de Shakeaholic">
          <img src={milo} alt="" className="w-[150px] pointer-events-none" draggable={false} />
        </button>
        <div className="sa-entra-2">
          <h1 className="font-display text-[32px] leading-tight text-sa-cream">Shakeaholic Rewards</h1>
          <p className="text-base text-sa-cream/75 mt-2 max-w-[320px]">Junta mancuernas en cada compra y cámbialas por tus favoritos.</p>
        </div>
      </div>
      <div className="w-full max-w-[360px] space-y-3 sa-entra-3">
        {(fallo ?? error) && <p className="text-sm font-medium text-sa-strawberry text-center">{fallo ?? error}</p>}
        <Boton onClick={() => void entrar()} disabled={trabajando} className="!font-body !font-semibold !text-lg !py-4">
          <span className="inline-flex items-center gap-2.5"><span className="font-bold text-xl">G</span>Continuar con Google</span>
        </Boton>
        <p className="text-xs text-sa-cream/45 text-center">Tu nombre y tus compras se usan solo para darte tus recompensas.</p>
      </div>
      <EntrarPersonal abierta={pidiendoPin} alCerrar={() => setPidiendoPin(false)} />
    </div>
  )
}

/** Personal sin cuenta de cliente: solo su pantalla. */
function SoloPersonal() {
  return (
    <div className="min-h-[100dvh] bg-sa-green-deep">
      <main className="px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))] max-w-lg mx-auto"><PersonalView /></main>
    </div>
  )
}

function Pestanas() {
  const { soyPersonal } = useEstado()
  const personal = usePersonal()
  // Los atajos del ícono y los avisos abren directo en una pestaña: /?ir=menu.
  const [pestana, setPestana] = useState<Pestana>(() => {
    const ir = new URLSearchParams(window.location.search).get('ir')
    return (['inicio', 'menu', 'aliados', 'cuenta', 'personal'] as const).includes(ir as Pestana) ? (ir as Pestana) : 'inicio'
  })
  const conPersonal = personal.activo || soyPersonal?.es_personal === true
  const pestanas = conPersonal ? [...PESTANAS, { id: 'personal' as Pestana, label: 'Personal', Icono: IconoTienda }] : PESTANAS

  useEffect(() => {
    if (pestana === 'personal' && !conPersonal) setPestana('inicio')
  }, [pestana, conPersonal])
  useEffect(() => {
    // Cada pestaña empieza arriba; la ventana es la que se desplaza.
    window.scrollTo({ top: 0 })
    document.querySelector('main')?.scrollTo({ top: 0 })
  }, [pestana])

  return (
    <div className="min-h-[100dvh] bg-sa-green-deep font-body flex flex-col">
      <main className="flex-1 min-h-0 overflow-y-auto px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[calc(5.5rem+env(safe-area-inset-bottom))] max-w-lg w-full mx-auto">
        {pestana === 'inicio' && <TarjetaTab />}
        {pestana === 'menu' && <MenuTab />}
        {pestana === 'aliados' && <AliadosTab />}
        {pestana === 'cuenta' && <CuentaTab />}
        {pestana === 'personal' && <PersonalTab />}
      </main>
      {/* Fondo sólido: a 95 % + desenfoque el teléfono recompone la capa en cada scroll. */}
      <nav className="fixed bottom-0 inset-x-0 bg-sa-green-ink border-t border-sa-cream/10 px-2 pb-[env(safe-area-inset-bottom)]">
        <div className="flex max-w-lg mx-auto">
          {pestanas.map((p) => (
            <button
              key={p.id}
              onClick={() => { tacto.ligero(); setPestana(p.id) }}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors ${pestana === p.id ? 'text-sa-banana' : 'text-sa-cream/45'}`}
            >
              <p.Icono className="w-6 h-6" />
              <span className="font-mono text-[10px] uppercase tracking-wide">{p.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
