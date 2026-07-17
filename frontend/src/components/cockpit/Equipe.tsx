import { brl } from '../../lib/format'

export interface Vendedor {
  rca?: string
  faturamento?: number
  margem_pct?: number
  clientes_positivados?: number
  clientes_carteira?: number
  [k: string]: unknown
}

/** Raio-X da equipe: quem vende, com que lucro e cobrindo quanto da carteira. */
export default function Equipe({ vendedores }: { vendedores: Vendedor[] }) {
  const dados = vendedores
    .filter((v) => typeof v.faturamento === 'number')
    .sort((a, b) => (b.faturamento ?? 0) - (a.faturamento ?? 0))
  if (!dados.length) return <p className="text-muted text-sm py-6 text-center">Sem dados no período.</p>

  const maxFat = Math.max(...dados.map((v) => v.faturamento ?? 0), 1)
  const margemMedia =
    dados.reduce((s, v) => s + (v.margem_pct ?? 0) * (v.faturamento ?? 0), 0) /
    (dados.reduce((s, v) => s + (v.faturamento ?? 0), 0) || 1)

  return (
    <ul className="flex flex-col gap-1">
      {dados.map((v) => {
        const nome = String(v.rca ?? '—').replace(/^CARTEIRA\s+/i, '')
        const margem = v.margem_pct
        const abaixo = typeof margem === 'number' && margem < margemMedia - 1
        return (
          <li key={nome} className="rounded px-3 py-2.5 hover:bg-primary-wash transition-colors">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold text-ink truncate">{nome}</span>
              <span className="num font-semibold text-sm whitespace-nowrap">{brl.format(v.faturamento ?? 0)}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-3">
              <div className="flex-1 h-1.5 bg-floor border border-line overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${((v.faturamento ?? 0) / maxFat) * 100}%` }} />
              </div>
              <span className={`font-mono text-[11px] whitespace-nowrap ${abaixo ? 'text-amber' : 'text-muted'}`}>
                {typeof margem === 'number' ? `${margem.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% lucro` : ''}
              </span>
              {typeof v.clientes_positivados === 'number' && (
                <span className="font-mono text-[11px] text-muted whitespace-nowrap">
                  {typeof v.clientes_carteira === 'number' && v.clientes_carteira >= v.clientes_positivados
                    ? `${v.clientes_positivados}/${v.clientes_carteira} clientes`
                    : `${v.clientes_positivados} clientes atendidos`}
                </span>
              )}
            </div>
          </li>
        )
      })}
      <li className="px-3 pt-2 text-[11px] font-mono text-muted border-t border-line mt-1">
        lucro médio da empresa: {margemMedia.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% · em âmbar quem está abaixo
      </li>
    </ul>
  )
}
