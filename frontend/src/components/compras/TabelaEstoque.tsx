import { Lock } from 'lucide-react'
import { brlExato } from '../../lib/format'
import { dias, Nota, taxa, un, Vazio } from './formatos'
import type { LinhaEstoque } from './tipos'

/**
 * As quatro quantidades do estoque lado a lado, mais o TRANCADO em dias de demanda.
 *
 * O trancado é a reserva que a gestão cria para não romper contrato com SLA e multa:
 * no app de vendas o item aparece ZERADO e o vendedor não consegue vendê-lo para
 * cliente pequeno. Este BI existe justamente para o dono ver o que o time de vendas
 * não vê — então o trancado nunca entra no disponível e nunca some da tela.
 *
 * ★ AVARIA ESTÁ CONTIDA NO BLOQUEADO no WinThor (QTINDENIZ dentro de QTBLOQUEADA).
 *   Somar as duas colunas contaria a avaria duas vezes; aqui "trancado" já vem
 *   líquido da avaria e as duas aparecem em colunas separadas.
 *
 * ★ O TRANCADO EM DIAS é a coluna que fecha a conta: o padrão do dono é reservar o
 *   equivalente a ~1 semana de demanda. Caso real na base: toalha rolo (cód. 197) com
 *   52 caixas físicas, 52 trancadas, disponível ZERO e ~7 dias de demanda parados.
 */
export default function TabelaEstoque({ dados }: { dados: LinhaEstoque[] }) {
  if (!dados.length) return <Vazio>nenhum produto no recorte selecionado</Vazio>

  return (
    <>
      <div className="overflow-x-auto max-h-[34rem] overflow-y-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="sticky top-0 bg-card z-10">
            <tr>
              <th className="font-display text-left text-ink font-semibold px-3 py-2 border-b border-line-strong">
                Produto
              </th>
              <th className="font-display text-right text-ink font-semibold px-3 py-2 border-b border-line-strong">
                Físico
              </th>
              <th className="font-display text-right text-ink font-semibold px-3 py-2 border-b border-line-strong">
                Reservado
              </th>
              <th className="font-display text-right text-ink font-semibold px-3 py-2 border-b border-line-strong">
                Trancado
              </th>
              <th className="font-display text-right text-ink font-semibold px-3 py-2 border-b border-line-strong">
                Avaria
              </th>
              <th className="font-display text-right text-ink font-semibold px-3 py-2 border-b border-line-strong">
                Disponível
              </th>
              <th className="font-display text-right text-ink font-semibold px-3 py-2 border-b border-line-strong">
                Demanda/dia
              </th>
              <th className="font-display text-right text-ink font-semibold px-3 py-2 border-b border-line-strong">
                Cobertura
              </th>
            </tr>
          </thead>
          <tbody>
            {dados.map((r) => {
              // o caso que o dono quer enxergar: mercadoria no galpão, venda bloqueada
              const invisivel = r.trancado > 0 && r.disponivel <= 0
              return (
                <tr key={r.codprod} className="hover:bg-primary-wash transition-colors align-top">
                  <td className="px-3 py-2 border-b border-line">
                    <span className="text-ink-soft">{r.descricao}</span>
                    <span className="block text-muted text-[11px] font-mono mt-0.5">
                      {r.codprod} · {r.secao ?? r.departamento ?? 'sem seção'}
                    </span>
                    {invisivel && (
                      <span className="inline-flex items-center gap-1.5 mt-1 chip border border-line text-danger font-semibold">
                        <Lock className="w-3 h-3" strokeWidth={2} aria-hidden />
                        o time de vendas vê zero
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 border-b border-line text-right font-mono text-ink whitespace-nowrap">
                    {un(r.fisico)}
                  </td>
                  <td className="px-3 py-2 border-b border-line text-right font-mono text-muted whitespace-nowrap">
                    {r.reservado ? un(r.reservado) : '—'}
                  </td>
                  <td className="px-3 py-2 border-b border-line text-right font-mono whitespace-nowrap">
                    <span className={r.trancado > 0 ? 'text-amber font-semibold' : 'text-muted'}>
                      {r.trancado ? un(r.trancado) : '—'}
                    </span>
                    {r.dias_trancados != null && (
                      <span
                        className="block text-muted text-[11px]"
                        title="reserva medida em dias de demanda — o padrão da gestão é ~1 semana"
                      >
                        {dias(r.dias_trancados)} de demanda
                      </span>
                    )}
                    {r.trancado_valor > 0 && (
                      <span className="block text-muted text-[11px]">{brlExato.format(r.trancado_valor)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 border-b border-line text-right font-mono text-muted whitespace-nowrap">
                    {r.avaria ? un(r.avaria) : '—'}
                  </td>
                  <td className="px-3 py-2 border-b border-line text-right font-mono whitespace-nowrap">
                    <span className={r.disponivel <= 0 ? 'text-danger font-bold' : 'text-ink font-semibold'}>
                      {un(r.disponivel)}
                    </span>
                  </td>
                  <td className="px-3 py-2 border-b border-line text-right font-mono text-muted whitespace-nowrap">
                    {r.demanda_diaria > 0 ? taxa(r.demanda_diaria) : '—'}
                  </td>
                  <td className="px-3 py-2 border-b border-line text-right font-mono whitespace-nowrap text-ink-soft">
                    {dias(r.cobertura_dias)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Nota>
        Disponível = físico − reservado − trancado − pendente. É exatamente o número que o app de vendas enxerga:
        somar o trancado aqui faria o BI prometer mercadoria que o vendedor não consegue faturar.
      </Nota>
    </>
  )
}
