import type { ProdutoTop } from '../lib/api'
import { brl, inteiro } from '../lib/format'

export default function TopProdutos({ dados }: { dados: ProdutoTop[] }) {
  const max = Math.max(...dados.map((d) => d.valor), 1)
  return (
    <ul className="flex flex-col gap-1">
      {dados.map((p, i) => (
        <li key={p.codprod} className="rounded px-3 py-2.5 hover:bg-primary-wash transition-colors cursor-default">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-ink-soft truncate">
              <span className="font-mono text-xs text-muted mr-2">{String(i + 1).padStart(2, '0')}</span>
              {p.descricao}
            </span>
            <span className="font-display font-semibold text-sm text-ink whitespace-nowrap">{brl.format(p.valor)}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-floor border border-line overflow-hidden">
              <div
                className="h-full bg-primary"
                style={{ width: `${(p.valor / max) * 100}%` }}
              />
            </div>
            <span className="font-mono text-[11px] text-muted whitespace-nowrap">{inteiro.format(p.quantidade)} un</span>
          </div>
        </li>
      ))}
    </ul>
  )
}
