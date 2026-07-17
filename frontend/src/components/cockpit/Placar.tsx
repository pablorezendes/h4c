import { TrendingDown, TrendingUp } from 'lucide-react'
import { brl } from '../../lib/format'

export interface ItemPlacar {
  rotulo: string
  valor: string
  detalhe?: string
  variacao_pct?: number | null
  tom?: string
}

/** Placar executivo: os 4 números que resumem o negócio no período. */
export default function Placar({ itens }: { itens: ItemPlacar[] }) {
  return (
    <section className="tile tile-accent-left p-5 sm:p-6 surgir">
      <div className="grid grid-cols-1 min-[480px]:grid-cols-2 xl:grid-cols-4 gap-x-8 gap-y-5">
        {itens.map((it) => {
          const positiva = (it.variacao_pct ?? 0) >= 0
          return (
            <div key={it.rotulo} className="min-w-0">
              <p className="label-caps">{it.rotulo}</p>
              <p className={`num text-3xl sm:text-4xl font-bold mt-1.5 ${it.tom ?? 'text-ink'}`}>{it.valor}</p>
              <p className="flex items-center gap-2 mt-1.5 min-h-4 text-xs">
                {it.variacao_pct !== null && it.variacao_pct !== undefined && (
                  <span className={`inline-flex items-center gap-1 font-mono font-semibold ${positiva ? 'text-emerald' : 'text-danger'}`}>
                    {positiva ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {positiva ? '+' : ''}
                    {it.variacao_pct.toLocaleString('pt-BR')}%
                  </span>
                )}
                {it.detalhe && <span className="text-muted truncate">{it.detalhe}</span>}
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export function moeda(v: number | null | undefined): string {
  return v === null || v === undefined ? '…' : brl.format(v)
}
