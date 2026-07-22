import type { ProdutoTop } from '../lib/api'
import { brl, inteiro } from '../lib/format'

/**
 * Ranking compacto de produtos: rótulo, valor e barra proporcional.
 *
 * Serve a qualquer leitura "produto x valor" — faturamento líquido, capital parado em
 * estoque trancado, sugestão de compra. Por isso a unidade da segunda linha é
 * parametrizável: "un" numa tela de venda e "trancadas" numa de estoque significam
 * coisas diferentes e não podem sair com o mesmo rótulo.
 *
 * ★ A BARRA USA O MÓDULO DO VALOR. Faturamento líquido pode ser NEGATIVO quando a
 *   devolução do período supera a venda; com a razão crua a largura vira negativa, o
 *   navegador ignora o style e a linha aparece sem barra nenhuma, como se o produto
 *   não tivesse peso. Com o módulo a barra existe e o número ao lado mostra o sinal.
 */
export default function TopProdutos({
  dados,
  unidade = 'un',
  vazio = 'sem produto no período',
}: {
  dados: ProdutoTop[]
  /** Rótulo da quantidade, ex.: 'un', 'trancadas', 'a comprar'. */
  unidade?: string
  vazio?: string
}) {
  if (!dados.length) return <p className="text-muted text-sm font-mono py-6 text-center">{vazio}</p>

  const max = Math.max(...dados.map((d) => Math.abs(d.valor)), 1)
  return (
    <ul className="flex flex-col gap-1">
      {dados.map((p, i) => (
        <li key={p.codprod} className="rounded px-3 py-2.5 hover:bg-primary-wash transition-colors cursor-default">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-ink-soft truncate" title={p.descricao}>
              <span className="font-mono text-xs text-muted mr-2">{String(i + 1).padStart(2, '0')}</span>
              {p.descricao}
            </span>
            <span
              className={`font-display font-semibold text-sm whitespace-nowrap ${
                p.valor < 0 ? 'text-danger' : 'text-ink'
              }`}
            >
              {brl.format(p.valor)}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-floor border border-line overflow-hidden">
              <div
                className={`h-full ${p.valor < 0 ? 'bg-danger' : 'bg-primary'}`}
                style={{ width: `${Math.min(100, (Math.abs(p.valor) / max) * 100)}%` }}
              />
            </div>
            <span className="font-mono text-[11px] text-muted whitespace-nowrap">
              {inteiro.format(p.quantidade)} {unidade}
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}
