import { useState } from 'react'
import { PageHeader } from '../ui'
import Personas from './personal/Personas'
import Asistencia from './personal/Asistencia'
import Expediente from './personal/Expediente'
import Contratos from './personal/Contratos'
import Descuentos from './personal/Descuentos'
import Permisos from './personal/Permisos'

/**
 * Todo lo del personal en un solo lugar.
 *
 * Estaba repartido —los empleados por un lado, el checador por otro— y
 * eso obliga a gerencia a recordar en qué pestaña vive cada cosa de la
 * misma persona. Aquí adentro: quién trabaja, a qué hora llegó, qué
 * papeles entregó y qué contrato tiene.
 *
 * Las cuatro son de **gerencia**, no del personal de barra: el expediente
 * y el salario de un compañero no son asunto de quien está en la caja.
 * Cada pestaña lo vuelve a verificar en el servidor (`fn_es_jefe()`), no
 * se confía en que la pantalla se haya escondido.
 */

const PESTANAS = [
  { id: 'personas', label: 'Personas', ayuda: 'Altas, roles y PIN' },
  { id: 'asistencia', label: 'Reloj checador', ayuda: 'Horas, comidas y reglas' },
  { id: 'expediente', label: 'Expediente', ayuda: 'Qué papeles tiene cada quien' },
  { id: 'contratos', label: 'Contratos', ayuda: 'Datos laborales y documento' },
  { id: 'descuentos', label: 'Descuentos', ayuda: 'Precio de personal, claves y consumos' },
  { id: 'permisos', label: 'Permisos', ayuda: 'Qué puede hacer cada quien en la caja' },
] as const

type Pestana = (typeof PESTANAS)[number]['id']

export default function Empleados() {
  const [tab, setTab] = useState<Pestana>('personas')
  const actual = PESTANAS.find((p) => p.id === tab)

  return (
    <div>
      <PageHeader
        title="Personal"
        subtitle={actual?.ayuda}
      />

      <div className="flex gap-2 flex-wrap mb-6 border-b border-sa-green-ink/10 pb-3">
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            onClick={() => setTab(p.id)}
            className={`px-5 py-2.5 rounded-full text-sm transition-colors ${
              tab === p.id
                ? 'bg-sa-green text-sa-cream'
                : 'bg-white border border-sa-green-ink/15 text-sa-green-ink hover:border-sa-green/40'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {tab === 'personas' && <Personas />}
      {tab === 'asistencia' && <Asistencia />}
      {tab === 'expediente' && <Expediente />}
      {tab === 'contratos' && <Contratos />}
      {tab === 'descuentos' && <Descuentos />}
      {tab === 'permisos' && <Permisos />}
    </div>
  )
}
