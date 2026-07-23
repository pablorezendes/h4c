import { CalendarClock, Truck } from 'lucide-react'
import { brlExato } from '../../lib/format'
import { dias, Nota, taxa, un, Vazio } from './formatos'

/**
 * "Comprar para fechar o mes" — o horizonte CURTO da aba Compras.
 *
 * Enquanto a "Sugestao de compra" de 45 dias dimensiona a reposicao de suprimento, este
 * bloco responde uma pergunta mais imediata do comprador: quanto AINDA falta comprar para
 * nao faltar mercadoria ate o ultimo dia do mes corrente. As duas conversam e ficam lado
 * a lado de proposito — uma cuida do estoque de seguranca, a outra do mes que esta
 * correndo.
 *
 *     comprar = max(0, demanda_diaria x dias_uteis_restantes - disponivel - pendente)
 *
 * ★ A DEMANDA VEM DO ULTIMO MES FECHADO (meta.base_demanda), nunca de janela movel: o mes
 *   corrente parcial faria a demanda parecer despencar todo dia 5. O que muda a cada dia e
 *   so o numero de dias uteis que RESTAM — o horizonte encolhe, a demanda diaria nao.
 *
 * ★ `disponivel` e o que o Ion Vendas enxerga (o trancado NAO entra). E o comodato tambem
 *   nao conta como venda: dispenser/saboneteira sai como REMESSA, nao como faturamento, e
 *   por isso nao entra na demanda que dimensiona a compra.
 */

export interface LinhaSugestaoMes {
  codprod: number
  descricao: string
  departamento: string | null
  secao: string | null
  demanda_diaria: number
  ja_vendido_mes: number
  disponivel: number
  pendente: number
  dias_uteis_restantes: number
  necessidade_restante: number
  cobertura_dias: number | null
  comprar_qt: number
  comprar_valor: number
  custo_unit: number
  status: string
}

export interface RespostaSugestaoMes {
  rows: LinhaSugestaoMes[]
  meta: {
    mes_corrente: { rotulo: string }
    dias_uteis_total: number
    dias_uteis_transcorridos: number
    dias_uteis_restantes: number
    base_demanda: { rotulo: string }
    itens: number
    precisam_comprar: number
    comprar_total: number
    ja_vendido_total: number
    aviso_pendente_zero: string | null
    /** No fim do mes (0 dia util restante) a compra de horizonte curto perde o sentido. */
    aviso_mes_encerrado?: string | null
  }
}

/**
 * Status do fechamento do mes — ruptura > aperto > ok, o ponto acende na mesma escala do
 * resto do BI (dot-erro/dot-aviso/dot-ativo). Vive aqui e nao em formatos.tsx porque os
 * rotulos sao proprios deste bloco (a sugestao de 45 dias tem status diferentes).
 */
const STATUS: Record<string, { classe: string; dot: string; dica: string }> = {
  ruptura: {
    classe: 'text-danger font-semibold',
    dot: 'dot-erro',
    dica: 'o disponivel nao cobre a demanda ate o fim do mes — vai faltar sem compra',
  },
  aperto: {
    classe: 'text-amber font-semibold',
    dot: 'dot-aviso',
    dica: 'cobre o mes raspando — sem folga para atraso de entrega',
  },
  ok: {
    classe: 'text-emerald',
    dot: 'dot-ativo',
    dica: 'o disponivel cobre a demanda ate o fim do mes',
  },
}

function SeloStatusMes({ status }: { status: string }) {
  const e = STATUS[status] ?? { classe: 'text-muted', dot: 'bg-line-strong', dica: status }
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[11px] whitespace-nowrap ${e.classe}`}
      title={e.dica}
    >
      <span className={`dot ${e.dot}`} aria-hidden />
      {status}
    </span>
  )
}

export default function SugestaoMes({ dados }: { dados: RespostaSugestaoMes | null }) {
  if (!dados) return <Vazio>sugestão para fechar o mês indisponível no momento</Vazio>
  const m = dados.meta
  // ordena por dinheiro a comprar mesmo se o backend ja entregar ordenado: a regra da
  // tela e "o maior valor a comprar no topo", e nao pode depender da ordem da resposta
  const rows = [...(dados.rows ?? [])].sort((x, y) => y.comprar_valor - x.comprar_valor)

  return (
    <>
      {/* card de destaque — o total a comprar para fechar o mes corrente */}
      <div className="rounded border border-primary bg-primary-wash p-4 sm:p-5 mb-4">
        <p className="label-caps flex items-center gap-2">
          <CalendarClock className="w-3.5 h-3.5 text-primary-soft" strokeWidth={1.75} aria-hidden />
          Comprar para fechar {m.mes_corrente.rotulo}
        </p>
        <p className="num text-3xl sm:text-4xl font-bold mt-1 text-ink">{brlExato.format(m.comprar_total)}</p>
        <p className="text-muted text-xs font-mono mt-1.5">
          {m.precisam_comprar} {m.precisam_comprar === 1 ? 'item para fechar o mês' : 'itens para fechar o mês'} · de{' '}
          {m.itens} avaliados · base {m.base_demanda.rotulo}
        </p>
        <p className="text-muted text-[11px] font-mono mt-0.5">
          {m.dias_uteis_restantes} de {m.dias_uteis_total} dias úteis restantes ({m.dias_uteis_transcorridos}{' '}
          transcorridos) · {un(m.ja_vendido_total)} un. já vendidas no mês
        </p>
      </div>

      {rows.length === 0 ? (
        <Vazio>nenhum item precisa de compra para fechar {m.mes_corrente.rotulo}</Vazio>
      ) : (
        <div className="overflow-x-auto max-h-[32rem] overflow-y-auto">
          <table className="w-full text-sm min-w-[920px]">
            <thead className="sticky top-0 bg-card z-10">
              <tr>
                <th className="font-display text-left text-ink font-semibold px-3 py-2 border-b border-line-strong">
                  Produto
                </th>
                <th className="font-display text-left text-ink font-semibold px-3 py-2 border-b border-line-strong">
                  Departamento
                </th>
                <th className="font-display text-right text-ink font-semibold px-3 py-2 border-b border-line-strong">
                  Demanda/dia
                </th>
                <th className="font-display text-right text-ink font-semibold px-3 py-2 border-b border-line-strong">
                  Já vendido no mês
                </th>
                <th className="font-display text-right text-ink font-semibold px-3 py-2 border-b border-line-strong">
                  Disponível
                </th>
                <th className="font-display text-right text-ink font-semibold px-3 py-2 border-b border-line-strong">
                  Dias úteis restantes
                </th>
                <th className="font-display text-right text-ink font-semibold px-3 py-2 border-b border-line-strong">
                  Comprar (qt)
                </th>
                <th className="font-display text-right text-ink font-semibold px-3 py-2 border-b border-line-strong">
                  Comprar (R$)
                </th>
                <th className="font-display text-left text-ink font-semibold px-3 py-2 border-b border-line-strong">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.codprod} className="hover:bg-primary-wash transition-colors align-top">
                  <td className="px-3 py-2 border-b border-line">
                    <span className="text-ink-soft">{r.descricao}</span>
                    <span className="block text-muted text-[11px] font-mono mt-0.5">
                      {r.codprod}
                      {r.secao ? ` · ${r.secao}` : ''}
                    </span>
                  </td>
                  <td className="px-3 py-2 border-b border-line text-ink-soft">
                    {r.departamento ?? <span className="text-muted">—</span>}
                  </td>
                  <td className="px-3 py-2 border-b border-line text-right font-mono text-muted whitespace-nowrap">
                    {taxa(r.demanda_diaria)}
                  </td>
                  <td className="px-3 py-2 border-b border-line text-right font-mono text-ink-soft whitespace-nowrap">
                    {un(r.ja_vendido_mes)}
                  </td>
                  <td className="px-3 py-2 border-b border-line text-right font-mono whitespace-nowrap">
                    <span className={r.disponivel <= 0 ? 'text-danger font-semibold' : 'text-ink-soft'}>
                      {un(r.disponivel)}
                    </span>
                    {r.cobertura_dias != null && (
                      <span className="block text-muted text-[11px]" title="cobertura em dias de demanda">
                        cobre {dias(r.cobertura_dias)}
                      </span>
                    )}
                    {r.pendente > 0 && (
                      <span className="block text-muted text-[11px]" title="pedido de compra pendente já descontado">
                        +{un(r.pendente)} pendente
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 border-b border-line text-right font-mono text-muted whitespace-nowrap">
                    {un(r.dias_uteis_restantes)}
                  </td>
                  <td className="px-3 py-2 border-b border-line text-right font-mono whitespace-nowrap">
                    <span className={r.comprar_qt > 0 ? 'text-ink font-semibold' : 'text-muted'}>
                      {un(r.comprar_qt)}
                    </span>
                    {r.necessidade_restante > 0 && (
                      <span className="block text-muted text-[11px]" title="demanda restante estimada até o fim do mês">
                        precisa {un(r.necessidade_restante)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 border-b border-line text-right font-mono whitespace-nowrap text-ink-soft">
                    {r.comprar_valor > 0 ? brlExato.format(r.comprar_valor) : '—'}
                    {r.comprar_qt > 0 && r.custo_unit <= 0 && (
                      <span className="block text-amber text-[11px]" title="produto sem custo no cadastro">
                        sem custo
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 border-b border-line">
                    <SeloStatusMes status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {m.aviso_mes_encerrado && (
        <p className="flex items-start gap-2.5 text-sm text-amber mt-4">
          <CalendarClock className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} aria-hidden />
          <span>
            <strong className="font-semibold">Mês corrente encerrado.</strong> {m.aviso_mes_encerrado}
          </span>
        </p>
      )}

      {m.aviso_pendente_zero && (
        <p className="flex items-start gap-2.5 text-sm text-amber mt-4">
          <Truck className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} aria-hidden />
          <span>
            <strong className="font-semibold">Pedidos de compra pendentes = 0.</strong> {m.aviso_pendente_zero}
          </span>
        </p>
      )}

      <Nota>
        Comprar = demanda diária × dias úteis restantes − disponível − pendente de compra, arredondado para cima. A
        demanda diária é a do último mês fechado ({m.base_demanda.rotulo}), não uma janela móvel — só o horizonte
        (os {m.dias_uteis_restantes} dias úteis que restam) encolhe a cada dia. O comodato fica de fora: dispenser e
        saboneteira saem como remessa, não como venda, então não entram na demanda que dimensiona a compra.
      </Nota>
    </>
  )
}
