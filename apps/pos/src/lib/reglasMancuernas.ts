import { useEffect, useState } from 'react'
import { reglasMancuernas } from '@shake/supabase'
import { REGLAS_DE_SIEMPRE, type ReglasMancuernas } from '@shake/utils'
import { sb } from './sb'

/**
 * Las reglas de mancuernas que puso gerencia (Admin → Rewards), para que la
 * pantalla prometa lo mismo que abona el servidor al cobrar.
 *
 * Se piden al montar la pantalla que las usa (como mucho una vez por
 * minuto) y se guardan en el navegador: sin internet, o si la consulta
 * falla, se usan las últimas que se vieron, y si nunca se vieron, las de
 * siempre (1 por cada $14, tope 100). Es solo lo que se PROMETE: lo que se
 * abona lo decide el servidor.
 */
const CLAVE = 'shake_reglas_mancuernas_v1'

function leerGuardadas(): ReglasMancuernas | null {
  try {
    const r = JSON.parse(localStorage.getItem(CLAVE) ?? 'null') as ReglasMancuernas | null
    return r && typeof r.pesos_por_mancuerna === 'number' && Array.isArray(r.no_acumulan) ? r : null
  } catch {
    return null
  }
}

let actuales: ReglasMancuernas = leerGuardadas() ?? REGLAS_DE_SIEMPRE
let ultima = 0
const oyentes = new Set<() => void>()

export function refrescarReglasMancuernas(): void {
  if (Date.now() - ultima < 60_000) return
  ultima = Date.now()
  reglasMancuernas(sb)
    .then((r) => {
      actuales = r
      try { localStorage.setItem(CLAVE, JSON.stringify(r)) } catch { /* sin almacenamiento */ }
      oyentes.forEach((f) => f())
    })
    .catch(() => { ultima = 0 })
}

export function useReglasMancuernas(): ReglasMancuernas {
  const [, repintar] = useState(0)
  useEffect(() => {
    const f = () => repintar((n) => n + 1)
    oyentes.add(f)
    refrescarReglasMancuernas()
    return () => { oyentes.delete(f) }
  }, [])
  return actuales
}
