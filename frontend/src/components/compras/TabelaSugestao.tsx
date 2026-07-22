import { brlExato } from '../../lib/format'
import { dias, Nota, SeloClasse, SeloStatus, taxa, un, Vazio } from './formatos'
import type { LinhaSugestao } from './tipos'

/**
 * Sugestão de compra — a folha de papel do comprador virando tabela.
 *
 *     sugestão = max(0, demanda diária × meta de dias − disponível − pendente de compra)
 *
 * ★ `disponível` é o que o app Ion Vendas enxerga: o TRANCADO não entra. Quando o
 *   item está trancado a linha traz também "se destrancar" — sem isso o comprador
 *   pede 330 caixas de toalha rolo tendo 52 no galpão, reservadas de propósito.
 *
 * ★ Cobertura de produto sem demanda no mês fechado é vazia, nunca zero: com zero
 *   ele lideraria o ranking de ruptura e esconderia o que falta de verdade.
 */
export default function TabelaSugestao({ dados }: { dados: LinhaSugestao[] }) {
  if (!dados.length) return <Vazio>nenhum produto na seleção de classes e departamentos</Vazio>

  return (
    <>
      <div className="overflow-x-auto max-h-[32rem] overflow-y-auto">
        <table className="w-full text-sm min-w-[940px]">
          <thead className="sticky top-0 bg-card z-10">
            <tr>
              <th className="font-display text-left text-ink font-semibold px-3 py-2 border-b border-line-strong">
                Produto
              </th>
              <th className="font-display text-center text-ink font-semibold px-2 py-2 border-b border-line-strong">
                ABC
              </th>
              <th className="font-display text-right text-ink font-semibold px-3 py-2 border-b border-line-strong">
                Demanda/dia
              </th>
              <th className="font-display text-right text-ink font-semibold px-3 py-2 border-b border-line-strong">
                Disponível
              </th>
              <th className="font-display text-right text-ink font-semibold px-3 py-2 border-b border-line-strong">
                Cobertura
              </th>
              <th className="font-display text-right text-ink font-semibold px-3 py-2 border-b border-line-strong">
                Lead time
              </th>
              <th className="font-display text-right text-ink font-semibold px-3 py-2 border-b border-line-strong">
                Comprar
              </th>
              <th className="font-display text-right text-ink font-semibold px-3 py-2 border-b border-line-strong">
                Custo
              </th>
              <th className="font-display text-left text-ink font-semibold px-3 py-2 border-b border-line-strong">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {dados.map((r) => {
              const urgente = r.status === 'ruptura' || r.status === 'comprar agora'
              const abaixo = r.cobertura_dias != null && r.cobertura_dias < r.meta_dias
              return (
                <tr key={r.codprod} className="hover:bg-primary-wash transition-colors align-top">
                  <td className="px-3 py-2 border-b border-line">
                    <span className="text-ink-soft">{r.descricao}</span>
                    <span className="block text-muted text-[11px] font-mono mt-0.5">
                      {r.codprod} · {r.secao ?? r.departamento ?? 'sem seção'}
                      {r.fornecedor ? ` · ${r.fornecedor}` : ''}
                    </span>
                  </td>
                  <td className="px-2 py-2 border-b border-line text-center">
                    <SeloClasse classe={r.classe_abc} />
                  </td>
                  <td className="px-3 py-2 border-b border-line text-right font-mono text-muted whitespace-nowrap">
                    {taxa(r.demanda_diaria)}
                  </td>
                  <td className="px-3 py-2 border-b border-line text-right font-mono whitespace-nowrap">
                    <span className={r.disponivel <= 0 ? 'text-danger font-semibold' : 'text-ink-soft'}>
                      {un(r.disponivel)}
                    </span>
                    {r.trancado > 0 && (
                      <span className="block text-muted text-[11px]" title="reserva de gestão — o Ion Vendas vê zero">
                        +{un(r.trancado)} trancado
                      </span>
                    )}
                  </td>
                  <td
                    className={`px-3 py-2 border-b border-line text-right font-mono whitespace-nowrap ${
                      abaixo ? 'text-amber font-semibold' : 'text-ink-soft'
                    }`}
                  >
                    {dias(r.cobertura_dias)}
                    <span className="block text-muted text-[11px]">meta {r.meta_dias} d</span>
                  </td>
                  <td className="px-3 py-2 border-b border-line text-right font-mono text-muted whitespace-nowrap">
                    {r.lead_time_dias == null ? (
                      <span title="lead time não parametrizado para este fornecedor/seção">—</span>
                    ) : (
                      <span title={r.lead_time_status}>{r.lead_time_dias} d</span>
                    )}
                  </td>
                  <td className="px-3 py-2 border-b border-line text-right font-mono whitespace-nowrap">
                    <span className={r.sugestao_qt > 0 ? 'text-ink font-semibold' : 'text-muted'}>
                      {un(r.sugestao_qt)}
                    </span>
                    {r.sugestao_se_destrancar != null && r.sugestao_se_destrancar !== r.sugestao_qt && (
                      <span
                        className="block text-muted text-[11px]"
                        title="quantidade necessária caso a gestão libere o estoque trancado"
                      >
                        {un(r.sugestao_se_destrancar)} se destrancar
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 border-b border-line text-right font-mono whitespace-nowrap text-ink-soft">
                    {r.sugestao_valor > 0 ? brlExato.format(r.sugestao_valor) : '—'}
                    {r.sugestao_qt > 0 && r.custo_unitario <= 0 && (
                      <span className="block text-amber text-[11px]" title="produto sem custo no cadastro">
                        sem custo
                      </span>
                    )}
                  </td>
                  <td className={`px-3 py-2 border-b border-line ${urgente ? 'font-semibold' : ''}`}>
                    <SeloStatus status={r.status} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Nota>
        Comprar = demanda diária × dias de meta − disponível − pedidos de compra pendentes, arredondado para
        cima. A demanda diária divide a quantidade líquida do mês fechado pelos dias úteis do mês, nunca por
        dias corridos.
      </Nota>
    </>
  )
}
