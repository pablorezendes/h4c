import { useEffect, useState } from 'react'
import { CalendarRange, Clock } from 'lucide-react'

export interface Filtro {
  dt_ini: string
  dt_fim: string
  hora_ini: string // 'HH:MM' ou ''
  hora_fim: string
}

export function filtroPadrao(dias = 90): Filtro {
  const fim = new Date()
  const ini = new Date()
  ini.setDate(fim.getDate() - (dias - 1))
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { dt_ini: iso(ini), dt_fim: iso(fim), hora_ini: '', hora_fim: '' }
}

const CHAVE_FILTRO = 'h4c_filtro'

/** Filtro global: o mesmo período/hora vale em todas as páginas e sobrevive ao reload. */
export function useFiltro(): [Filtro, (f: Filtro) => void] {
  const [filtro, setFiltro] = useState<Filtro>(() => {
    try {
      const salvo = localStorage.getItem(CHAVE_FILTRO)
      if (salvo) {
        const f = JSON.parse(salvo) as Filtro
        if (f.dt_ini && f.dt_fim) return f
      }
    } catch { /* filtro corrompido -> padrão */ }
    return filtroPadrao(90)
  })
  useEffect(() => {
    localStorage.setItem(CHAVE_FILTRO, JSON.stringify(filtro))
  }, [filtro])
  return [filtro, setFiltro]
}

export function filtroQuery(f: Filtro): string {
  const p = new URLSearchParams({ dt_ini: f.dt_ini, dt_fim: f.dt_fim })
  if (f.hora_ini) p.set('hora_ini', f.hora_ini)
  if (f.hora_fim) p.set('hora_fim', f.hora_fim)
  return p.toString()
}

const PRESETS = [
  { dias: 7, rotulo: '7d' },
  { dias: 30, rotulo: '30d' },
  { dias: 90, rotulo: '90d' },
  { dias: 180, rotulo: '180d' },
]

export default function FiltroBar({
  filtro,
  onChange,
  mostrarHora = true,
  aviso,
}: {
  filtro: Filtro
  onChange: (f: Filtro) => void
  mostrarHora?: boolean
  aviso?: string
}) {
  return (
    <div className="tile px-4 sm:px-5 py-3.5 sm:py-4 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 sm:gap-x-6">
      <div className="flex items-center gap-2 flex-wrap">
        <CalendarRange className="w-4 h-4 text-primary-soft shrink-0" strokeWidth={1.5} />
        <span className="label-caps">Período</span>
        <input
          type="date"
          value={filtro.dt_ini}
          max={filtro.dt_fim}
          onChange={(e) => onChange({ ...filtro, dt_ini: e.target.value })}
          className="input-dark px-3 py-1.5 text-sm flex-1 sm:flex-none min-w-0"
        />
        <span className="text-muted text-sm">até</span>
        <input
          type="date"
          value={filtro.dt_fim}
          min={filtro.dt_ini}
          onChange={(e) => onChange({ ...filtro, dt_fim: e.target.value })}
          className="input-dark px-3 py-1.5 text-sm flex-1 sm:flex-none min-w-0"
        />
      </div>

      {mostrarHora && (
      <div className="flex items-center gap-2 flex-wrap">
        <Clock className="w-4 h-4 text-primary-soft shrink-0" strokeWidth={1.5} />
        <span className="label-caps">Hora</span>
        <input
          type="time"
          value={filtro.hora_ini}
          onChange={(e) => onChange({ ...filtro, hora_ini: e.target.value })}
          className="input-dark px-3 py-1.5 text-sm flex-1 sm:flex-none min-w-0"
          title="Hora inicial (opcional) — aplica às análises intradia"
        />
        <span className="text-muted text-sm">até</span>
        <input
          type="time"
          value={filtro.hora_fim}
          onChange={(e) => onChange({ ...filtro, hora_fim: e.target.value })}
          className="input-dark px-3 py-1.5 text-sm flex-1 sm:flex-none min-w-0"
          title="Hora final (opcional)"
        />
        {(filtro.hora_ini || filtro.hora_fim) && (
          <button
            onClick={() => onChange({ ...filtro, hora_ini: '', hora_fim: '' })}
            className="text-muted text-xs hover:text-ink-soft underline"
          >
            limpar
          </button>
        )}
      </div>
      )}

      <div className="flex rounded border border-line bg-floor p-1 sm:ml-auto self-start">
        {PRESETS.map((p) => (
          <button
            key={p.dias}
            onClick={() => onChange({ ...filtroPadrao(p.dias), hora_ini: filtro.hora_ini, hora_fim: filtro.hora_fim })}
            className="px-3 py-1 rounded-sm text-xs font-mono font-semibold text-muted hover:text-ink hover:bg-primary-wash transition-colors"
          >
            {p.rotulo}
          </button>
        ))}
      </div>

      {aviso && (filtro.hora_ini || filtro.hora_fim) && (
        <p className="w-full text-muted text-[11px] font-mono -mt-1">{aviso}</p>
      )}
    </div>
  )
}
