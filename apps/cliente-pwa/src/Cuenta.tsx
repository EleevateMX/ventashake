import milo from '@shake/brand/milo.png'
import { useState } from 'react'
import { mxn } from '@shake/utils'
import { useEstado } from './Estado'
import { usePersonal } from './Personal'
import { PerfilSheet } from './Perfil'
import { EntrarPersonal } from './PersonalView'
import { Avatar } from './Avatar'
import { Hoja, Boton, Sheet, Cifra, Titulo } from './ui'

export function CuentaTab() {
  const { resumen, salir, eliminarCuenta } = useEstado()
  const personal = usePersonal()
  const [editando, setEditando] = useState(false)
  const [pidiendoPin, setPidiendoPin] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null)
  const c = resumen?.cliente

  async function borrar() {
    setBorrando(true)
    setErrorBorrado(await eliminarCuenta())
    setBorrando(false)
    setConfirmando(false)
  }

  return (
    <>
      <Titulo texto="Cuenta" />
      <Hoja>
        <div className="flex items-center gap-3.5">
          {c?.foto
            ? <Avatar foto={c.foto} nombre={c.nombre} tam={64} />
            : <span className="w-16 h-16 shrink-0 rounded-full bg-sa-cream-warm flex items-center justify-center overflow-hidden"><img src={milo} alt="" className="w-11 h-11" /></span>}
          <div className="min-w-0">
            <p className="font-semibold text-lg leading-tight truncate">{c?.nombre ?? '—'}</p>
            {c?.desde && <p className="text-[13px] text-sa-green-ink/60">Cliente desde {c.desde}</p>}
          </div>
        </div>
        <div className="border-t border-sa-green-ink/10" />
        <Fila etiqueta="Código" valor={c?.codigo ?? '—'} />
        <Fila etiqueta="Teléfono" valor={c?.telefono ?? 'sin registrar'} />
        <Boton tono="verde" onClick={() => setEditando(true)}>Editar mi perfil</Boton>
      </Hoja>

      {c && !c.telefono && (
        <Hoja titulo="Tu teléfono">
          <p className="text-sm text-sa-green-ink/65">Así te encontramos en caja aunque no traigas el celular.</p>
          <Boton tono="verde" onClick={() => setEditando(true)}>Agregarlo</Boton>
        </Hoja>
      )}

      <Actividad />

      <Hoja titulo="Cómo funciona">
        <p className="text-sm text-sa-green-ink/75 leading-snug">
          Cada compra suma mancuernas: 10 mancuernas valen $1. Enseña el QR de tu tarjeta al pagar y se suman solas; para usarlas, pídelo en caja.
        </p>
      </Hoja>

      {personal.activo && (
        <Hoja><p className="text-sm font-medium">Estás en modo personal: tienes la pestaña «Personal».</p></Hoja>
      )}

      <Boton tono="tinta" onClick={() => void salir()} className="mb-3">Cerrar sesión</Boton>

      {/* Quien puede crear la cuenta puede borrarla desde la app, igual que en iOS. */}
      <button onClick={() => setConfirmando(true)} disabled={borrando} className="w-full text-[13px] text-sa-strawberry/85 py-1">
        {borrando ? 'Borrando…' : 'Eliminar mi cuenta'}
      </button>
      {errorBorrado && <p className="text-[13px] font-medium text-sa-strawberry text-center mt-1">{errorBorrado}</p>}

      {/* Discreto a propósito: la pantalla es del cliente. El equipo sabe que está aquí. */}
      {!personal.activo && (
        <button onClick={() => setPidiendoPin(true)} className="w-full text-xs text-sa-cream/40 py-2 mt-1">Equipo Shakeaholic</button>
      )}

      <p className="text-center text-sa-cream/35 mt-3 mb-2">
        <span className="font-mono text-[10px] tracking-[0.1em]">Powered by </span>
        <span className="text-xs font-semibold">Nuvora</span>
      </p>

      {editando && <PerfilSheet alCerrar={() => setEditando(false)} />}
      <EntrarPersonal abierta={pidiendoPin} alCerrar={() => setPidiendoPin(false)} />
      <Sheet abierta={confirmando} alCerrar={() => setConfirmando(false)}>
        <div className="space-y-4 pt-3">
          <h2 className="font-display text-2xl text-sa-cream">¿Borrar tu cuenta?</h2>
          <p className="text-[15px] text-sa-cream/80 leading-snug">Se borran tu cuenta y tus mancuernas, y no se pueden recuperar. Si solo quieres salir, usa «Cerrar sesión».</p>
          <button onClick={() => void borrar()} disabled={borrando} className="w-full rounded-sa-lg bg-sa-strawberry text-white font-display text-xl py-3.5 disabled:opacity-40">
            {borrando ? 'Borrando…' : 'Sí, borrar mi cuenta y mis mancuernas'}
          </button>
          <Boton tono="tinta" onClick={() => setConfirmando(false)}>Cancelar</Boton>
        </div>
      </Sheet>
    </>
  )
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-sa-green-ink/50">{etiqueta}</span>
      <span className="font-mono text-sm text-right min-w-0 truncate">{valor}</span>
    </div>
  )
}

/** Las compras, los favoritos y los movimientos. Visitas y mancuernas, nada de dinero gastado. */
function Actividad() {
  const { resumen: r } = useEstado()
  const historial = r?.historial ?? []
  const movimientos = r?.movimientos ?? []
  const favoritos = r?.favoritos ?? []
  return (
    <>
      {r?.vida && r.vida.visitas > 0 && (
        <Hoja>
          <div className="flex gap-6">
            <Cifra valor={String(r.vida.visitas)} pie="visitas" />
            <Cifra valor={String(Math.round(r.ganadas_total ?? 0))} pie="mancuernas ganadas" />
          </div>
        </Hoja>
      )}
      {historial.length === 0 && movimientos.length === 0 && (
        <Hoja>
          <p className="font-semibold text-base">Aún no hay compras ligadas a tu cuenta.</p>
          <p className="text-sm text-sa-green-ink/65">En la barra, enseña el QR de tu tarjeta al pagar y tus mancuernas se suman solas.</p>
        </Hoja>
      )}
      {favoritos.length > 0 && (
        <Hoja titulo="Lo que más pides">
          {favoritos.map((f) => (
            <div key={f.nombre} className="flex items-center justify-between gap-3">
              <span className="text-[15px] min-w-0 truncate">{f.nombre}</span>
              <span className="font-mono text-[13px] text-sa-green">{f.veces}×</span>
            </div>
          ))}
        </Hoja>
      )}
      {historial.length > 0 && (
        <Hoja titulo="Tus compras">
          {historial.map((h) => (
            <div key={h.orden_id ?? h.folio} className="py-0.5">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-sm font-medium">#{h.folio}</span>
                <span className="font-mono text-xs text-sa-green-ink/50">{h.fecha}</span>
                <span className="flex-1" />
                <span className="font-mono text-sm">{mxn(h.total)}</span>
              </div>
              {h.items && <p className="text-[13px] text-sa-green-ink/65 leading-snug">{h.items}</p>}
              {h.mancuernas > 0 && <p className="font-mono text-xs text-sa-green">+{h.mancuernas} mancuernas</p>}
            </div>
          ))}
        </Hoja>
      )}
      {movimientos.length > 0 && (
        <Hoja titulo="Movimientos">
          {movimientos.map((m, i) => (
            <div key={i} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm leading-snug">{m.descripcion}</p>
                <p className="font-mono text-[11px] text-sa-green-ink/50">{m.fecha}</p>
              </div>
              <span className={`font-mono text-sm font-medium shrink-0 ${m.puntos >= 0 ? 'text-sa-green' : 'text-sa-strawberry'}`}>{m.puntos >= 0 ? '+' : ''}{m.puntos}</span>
            </div>
          ))}
        </Hoja>
      )}
    </>
  )
}
