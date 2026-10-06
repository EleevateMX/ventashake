import milo from '@shake/brand/milo.png'
import { useEffect, useRef, useState } from 'react'
import { guardarMiFoto, guardarMiTelefono } from '@shake/supabase'
import { sb } from './lib/sb'
import { rpc, amable } from './lib/rpc'
import { useEstado } from './Estado'
import { Hoja, Boton, Sheet, Campo, claseInput, tacto } from './ui'
import { IconoCamara } from './Iconos'

interface Perfil { nombre?: string | null; telefono?: string | null; fecha_nacimiento?: string | null; foto?: string | null }

/**
 * «Editar mi perfil»: foto, nombre, teléfono y cumpleaños. La foto se
 * achica a 512 px aquí (una de 12 MP tarda y no se ve) y va al bucket
 * `avatares` en la carpeta del propio usuario; nombre y cumpleaños van por
 * `fn_mi_perfil_guardar`. Igual que en iOS.
 */
export function PerfilSheet({ alCerrar }: { alCerrar: () => void }) {
  const { resumen, sincronizar } = useEstado()
  const c = resumen?.cliente
  const [nombre, setNombre] = useState(c?.nombre ?? '')
  const [telefono, setTelefono] = useState(c?.telefono ?? '')
  const [cumple, setCumple] = useState('')
  const [tieneCumple, setTieneCumple] = useState(false)
  const [foto, setFoto] = useState<string | null>(c?.foto ?? null)
  const [subiendo, setSubiendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const archivo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void rpc<Perfil>(sb, 'fn_mi_perfil').then((p) => {
      if (p?.nombre) setNombre(p.nombre)
      if (p?.telefono) setTelefono(p.telefono)
      if (p?.foto) setFoto(p.foto)
      if (p?.fecha_nacimiento) { setCumple(p.fecha_nacimiento.slice(0, 10)); setTieneCumple(true) }
    }).catch(() => {})
  }, [])

  async function subir(f: File) {
    setSubiendo(true)
    setError(null)
    try {
      const jpeg = await achicar(f, 512)
      const { data: u } = await sb.auth.getUser()
      const uid = u.user?.id
      if (!uid) throw new Error('Entra a tu cuenta.')
      const ruta = `${uid}/${Date.now()}.jpg`
      const { error: e } = await sb.storage.from('avatares').upload(ruta, jpeg, { cacheControl: '3600', upsert: false, contentType: 'image/jpeg' })
      if (e) throw e
      const url = sb.storage.from('avatares').getPublicUrl(ruta).data.publicUrl
      await guardarMiFoto(sb, url)
      setFoto(url)
      tacto.exito()
      await sincronizar()
    } catch (e) {
      setError(amable(e))
    } finally {
      setSubiendo(false)
      if (archivo.current) archivo.current.value = ''
    }
  }

  async function guardar() {
    setGuardando(true)
    setError(null)
    setMensaje(null)
    try {
      const limpio = telefono.replace(/\D/g, '')
      if (limpio && limpio !== (c?.telefono ?? '')) {
        if (limpio.length !== 10) throw new Error('Escribe los 10 dígitos del teléfono.')
        await guardarMiTelefono(sb, limpio)
      }
      await rpc(sb, 'fn_mi_perfil_guardar', {
        p_nombre: nombre.trim() || null,
        p_fecha_nacimiento: tieneCumple && cumple ? cumple : null,
        p_borrar_cumple: !tieneCumple,
      })
      await sincronizar()
      tacto.exito()
      setMensaje('Guardado.')
    } catch (e) {
      setError(amable(e))
    } finally {
      setGuardando(false)
    }
  }

  const hoy = new Date().toISOString().slice(0, 10)

  return (
    <Sheet abierta alCerrar={alCerrar} alta>
      <div className="space-y-4 pt-2">
        <h2 className="font-display text-[28px] text-sa-cream">Editar mi perfil</h2>
        <div className="flex items-center gap-4">
          <span className="relative w-[92px] h-[92px] shrink-0 rounded-full bg-sa-cream-warm overflow-hidden flex items-center justify-center">
            {foto ? <img src={foto} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <img src={milo} alt="" className="w-16" />}
            {subiendo && <span className="absolute inset-0 bg-sa-green-ink/40 flex items-center justify-center"><span className="w-6 h-6 rounded-full border-2 border-sa-banana border-t-transparent animate-spin" /></span>}
          </span>
          <div className="space-y-2">
            <button onClick={() => archivo.current?.click()} disabled={subiendo} className="inline-flex items-center gap-2 rounded-full bg-sa-banana text-sa-green-ink text-sm font-semibold px-3.5 py-2.5 disabled:opacity-40">
              <IconoCamara className="w-4 h-4" />Cambiar foto
            </button>
            <p className="text-xs text-sa-cream/55">Se ve en tu tarjeta y en la caja.</p>
          </div>
          <input ref={archivo} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void subir(f) }} />
        </div>

        <Hoja>
          <Campo titulo="Nombre"><input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tu nombre" autoCapitalize="words" className={claseInput} /></Campo>
          <Campo titulo="Teléfono (10 dígitos)"><input value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="numeric" placeholder="9991234567" className={`${claseInput} font-mono`} /></Campo>
          <div>
            <label className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-sa-green-ink/50">Cumpleaños</span>
              <input type="checkbox" checked={tieneCumple} onChange={(e) => setTieneCumple(e.target.checked)} className="w-5 h-5 accent-sa-green" />
            </label>
            {tieneCumple && (
              <>
                <input type="date" value={cumple} max={hoy} onChange={(e) => setCumple(e.target.value)} className={`${claseInput} mt-1.5`} />
                <p className="text-xs text-sa-green-ink/50 mt-1">Para tu cupón de cumpleaños.</p>
              </>
            )}
          </div>
        </Hoja>

        {error && <p className="text-sm font-medium text-sa-strawberry">{error}</p>}
        {mensaje && <p className="text-sm font-medium text-sa-mint">{mensaje}</p>}
        <Boton onClick={() => void guardar()} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Boton>
        <Boton tono="tinta" onClick={alCerrar}>Cerrar</Boton>
      </div>
    </Sheet>
  )
}

/** Reduce la imagen a `lado` px por el lado más largo y la devuelve como JPEG. */
async function achicar(f: File, lado: number): Promise<Blob> {
  const bitmap = await createImageBitmap(f).catch(() => null)
  if (!bitmap) return f
  const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * escala)
  canvas.height = Math.round(bitmap.height * escala)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise((r) => canvas.toBlob((b) => r(b ?? f), 'image/jpeg', 0.85))
}
