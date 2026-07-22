import { brl, brlExato } from '../../lib/format'
import { Nota, pct, Vazio } from './formatos'
import type { RespostaPorPrazo } from './tipos'

/**
 * Faturamento por prazo — relatório 14 da rotina 1464, que mora nesta aba.
 *
 * É o outro lado do PMR: o PMR mede o que o cliente PAGOU, esta tabela mede em que
 * prazo a empresa está VENDENDO. Se o líquido migra para os planos longos, o PMR de
 * dois meses à frente já está contratado.
 *
 * ★ SEMPRE LÍQUIDO (regra de ouro). A devolução não tem plano de pagamento próprio
 *   no ERP — o backend a re-vincula ao plano do pedido de origem. O que não achou
 *   vínculo NÃO é rateado: aparece embaixo como "devolução sem vínculo", explícito,
 *   em vez de inventar precisão que o dado não tem.
 */
export default function TabelaPrazo({ dados }: { dados: RespostaPorPrazo | null }) {
  if (!dados) return <Vazio>relatório por prazo indisponível no momento</Vazio>
  const rows = dados.rows ?? []
  if (!rows.length) return <Vazio>sem faturamento no período selecionado</Vazio>

  const m = dados.meta ?? {}
  const max = Math.max(...rows.map((r) => r.liquido), 1)

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[620px]">
          <thead>
            <tr>
              <th className="font-display text-left text-ink font-semibold px-3 py-2 border-b border-line-strong">
                Plano de pagamento
              </th>
              <th className="font-display text-right text-ink font-semibold px-3 py-2 border-b border-line-strong">
                Prazo
              </th>
              <th className="font-display text-right text-ink font-semibold px-3 py-2 border-b border-line-strong">
                Bruto
              </th>
              <th className="font-display text-right text-ink font-semibold px-3 py-2 border-b border-line-strong">
                Devolução
              </th>
              <th className="font-display text-right text-ink font-semibold px-3 py-2 border-b border-line-strong">
                Líquido
              </th>
              <th className="font-display text-left text-ink font-semibold px-3 py-2 border-b border-line-strong w-[26%]">
                Participação
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.codplpag} className="hover:bg-primary-wash transition-colors">
                <td className="px-3 py-2 border-b border-line text-ink-soft">{r.descricao}</td>
                <td className="px-3 py-2 border-b border-line text-right font-mono text-muted whitespace-nowrap">
                  {r.numdias == null ? '—' : `${r.numdias} d`}
                </td>
                <td className="px-3 py-2 border-b border-line text-right font-mono text-muted whitespace-nowrap">
                  {brlExato.format(r.bruto)}
                </td>
                <td
                  className={`px-3 py-2 border-b border-line text-right font-mono whitespace-nowrap ${
                    r.devolucao > 0 ? 'text-danger' : 'text-muted'
                  }`}
                >
                  {r.devolucao > 0 ? `−${brlExato.format(r.devolucao)}` : '—'}
                </td>
                <td className="px-3 py-2 border-b border-line text-right font-mono font-semibold text-ink whitespace-nowrap">
                  {brlExato.format(r.liquido)}
                </td>
                <td className="px-3 py-2 border-b border-line">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-floor border border-line overflow-hidden min-w-[48px]">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${Math.max(1, (r.liquido / max) * 100)}%` }}
                      />
                    </div>
                    <span className="font-mono text-[11px] text-muted w-12 text-right">
                      {pct(r.participacao_pct)}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1.5 mt-4 pt-3 border-t border-line text-[11px] font-mono text-muted">
        <span>
          líquido do período: <span className="text-ink-soft font-semibold">{brl.format(m.total_liquido ?? 0)}</span>
        </span>
        {m.prazo_medio_praticado != null && (
          <span>
            prazo médio praticado:{' '}
            <span className="text-ink-soft font-semibold">
              {m.prazo_medio_praticado.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} d
            </span>
          </span>
        )}
        <span>
          planos com venda: <span className="text-ink-soft font-semibold">{m.planos ?? rows.length}</span>
        </span>
        {!!m.devolucao_sem_vinculo && (
          <span>
            devolução sem vínculo de plano:{' '}
            <span className="text-ink-soft font-semibold">{brlExato.format(m.devolucao_sem_vinculo)}</span>
          </span>
        )}
      </div>

      <Nota>
        Valores do item da nota (PCMOV), não da capa: a capa carrega as remessas de comodato, que não são venda e
        cairiam todas no plano "A VISTA" — no semestre isso inflaria esse plano em R$ 228,6 mil.
      </Nota>
    </>
  )
}
