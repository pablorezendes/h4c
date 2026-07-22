import { brlExato } from '../../lib/format'
import { Nota, SeloAlerta, SeloClasse, taxa, un, variacao, Vazio } from './formatos'
import type { LinhaDemanda } from './tipos'

/**
 * Demanda por produto no mês FECHADO, com a comparação contra o mês anterior.
 *
 * ★ A janela é sempre o mês encerrado inteiro (dia 1 ao último dia), nunca "últimos
 *   30 dias": a janela móvel corta metade de um mês e metade de outro, e a comparação
 *   com o período anterior deixa de significar qualquer coisa.
 *
 * ★ A variação é sinalizada, não projetada. O faturamento já saltou ~72% de fev para
 *   mar/2026 e quebrou a previsão manual do comprador; projetar cegamente a partir de
 *   um mês assim geraria uma sugestão de compra que trava o caixa. O BI aponta o
 *   salto e deixa a decisão com quem negocia.
 */
export default function TabelaDemanda({
  dados,
  rotuloAnterior,
}: {
  dados: LinhaDemanda[]
  rotuloAnterior: string
}) {
  if (!dados.length) return <Vazio>sem movimento de produto no período</Vazio>

  return (
    <>
      <div className="overflow-x-auto max-h-[32rem] overflow-y-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead className="sticky top-0 bg-card z-10">
            <tr>
              <th className="font-display text-left text-ink font-semibold px-3 py-2 border-b border-line-strong">
                Produto
              </th>
              <th className="font-display text-center text-ink font-semibold px-2 py-2 border-b border-line-strong">
                ABC
              </th>
              <th className="font-display text-right text-ink font-semibold px-3 py-2 border-b border-line-strong">
                Qt líquida
              </th>
              <th className="font-display text-right text-ink font-semibold px-3 py-2 border-b border-line-strong whitespace-nowrap">
                {rotuloAnterior}
              </th>
              <th className="font-display text-right text-ink font-semibold px-3 py-2 border-b border-line-strong">
                Variação
              </th>
              <th className="font-display text-right text-ink font-semibold px-3 py-2 border-b border-line-strong">
                Demanda/dia
              </th>
              <th className="font-display text-right text-ink font-semibold px-3 py-2 border-b border-line-strong">
                Líquido
              </th>
            </tr>
          </thead>
          <tbody>
            {dados.map((r) => (
              <tr key={r.codprod} className="hover:bg-primary-wash transition-colors align-top">
                <td className="px-3 py-2 border-b border-line">
                  <span className="text-ink-soft">{r.descricao}</span>
                  <span className="block text-muted text-[11px] font-mono mt-0.5">
                    {r.codprod} · {r.secao ?? r.departamento ?? 'sem seção'}
                  </span>
                </td>
                <td className="px-2 py-2 border-b border-line text-center">
                  <SeloClasse classe={r.classe_abc} />
                </td>
                <td className="px-3 py-2 border-b border-line text-right font-mono text-ink whitespace-nowrap">
                  {un(r.qt_liquida)}
                </td>
                <td className="px-3 py-2 border-b border-line text-right font-mono text-muted whitespace-nowrap">
                  {un(r.qt_liquida_anterior)}
                </td>
                <td className="px-3 py-2 border-b border-line text-right whitespace-nowrap">
                  <span
                    className={`font-mono ${
                      r.variacao_pct == null
                        ? 'text-muted'
                        : r.variacao_pct >= 0
                          ? 'text-ink-soft'
                          : 'text-amber'
                    }`}
                  >
                    {variacao(r.variacao_pct)}
                  </span>
                  {r.alerta_variacao && (
                    <span className="block mt-1">
                      <SeloAlerta alerta={r.alerta_variacao} />
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 border-b border-line text-right font-mono text-muted whitespace-nowrap">
                  {taxa(r.demanda_diaria)}
                </td>
                <td className="px-3 py-2 border-b border-line text-right font-mono text-ink-soft whitespace-nowrap">
                  {brlExato.format(r.valor_liquido)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Nota>
        Quantidade líquida = vendida menos devolvida, na mesma soma. Produto que vendeu só no mês anterior
        aparece com quantidade zero de propósito: é exatamente o item que parou e que o comprador precisa ver.
      </Nota>
    </>
  )
}
