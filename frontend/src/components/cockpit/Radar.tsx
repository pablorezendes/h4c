import { ArrowRight, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

export interface Alerta {
  icone: LucideIcon
  tom: 'erro' | 'aviso' | 'ok'
  numero: string
  titulo: string
  detalhe?: string
  para: string
}

const TOM = {
  erro: { dot: 'dot-erro', texto: 'text-danger' },
  aviso: { dot: 'dot-aviso', texto: 'text-amber' },
  ok: { dot: 'dot-ativo', texto: 'text-emerald' },
} as const

/** Radar de ação: o que precisa de atenção AGORA, com atalho para a tela certa. */
export default function Radar({ alertas }: { alertas: Alerta[] }) {
  if (!alertas.length) return null
  return (
    <section className="surgir surgir-2">
      <div className="flex items-baseline gap-3 mb-3">
        <h2 className="label-caps">Radar de ação</h2>
        <span className="h-px flex-1 bg-line" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {alertas.map((a) => {
          const t = TOM[a.tom]
          return (
            <Link
              key={a.titulo}
              to={a.para}
              className="tile tile-hover p-4 flex flex-col gap-2 group"
            >
              <div className="flex items-center gap-2">
                <span className={`dot ${t.dot}`} />
                <a.icone className="w-4 h-4 text-muted" strokeWidth={1.75} />
                <span className="label-caps">{a.titulo}</span>
              </div>
              <p className={`num text-2xl font-bold ${t.texto}`}>{a.numero}</p>
              <p className="flex items-center justify-between gap-2 text-xs text-muted min-h-4">
                <span className="truncate">{a.detalhe}</span>
                <span className="inline-flex items-center gap-1 font-mono font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  ver <ArrowRight className="w-3 h-3" />
                </span>
              </p>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
