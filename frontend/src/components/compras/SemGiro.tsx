import { brl, brlExato } from '../../lib/format'
import { Nota, un, Vazio } from './formatos'

/**
 * Itens sem giro — "o dinheiro dormindo na prateleira".
 *
 * Produto com estoque e sem venda há mais de N dias (corte de 30/60/90 escolhido na
 * seção). É análise de SANEAMENTO, não de reposição: mostra capital imobilizado, não
 * o que comprar.
 *
 * ★ A CLASSIFICAÇÃO É O CORAÇÃO DA TELA. O backend separa dois mundos que NÃO podem
 *   virar um total só:
 *     - parado_real: consumível encalhado de verdade — é o capital A RECUPERAR, e vem
 *       em destaque;
 *     - so_comodato: dispenser/saboneteira que não é vendido, sai como comodato e está
 *       girando na rua (no cliente). Aparece à parte, rotulado como frota de comodato,
 *       SEM alarme — senão o comprador tentaria liquidar equipamento que está com o
 *       cliente.
 *   Por isso os dois subtotais aparecem lado a lado, com o parado_real realçado, e a
 *   soma dos dois NUNCA é apresentada como "capital a recuperar".
 *
 * O contrato deste relatório é consumido só por esta tela, então mora aqui (mesma
 * convenção de api.ts: contrato de uma tela não sobe para o módulo compartilhado).
 */

export type ClassificacaoSemGiro = 'parado_real' | 'so_comodato' | (string & {})

export interface LinhaSemGiro {
  codprod: number
  descricao: string
  departamento: string | null
  secao: string | null
  qtest: number
  disponivel: number
  /** Dias desde a última venda. null = nunca vendeu. */
  dias_sem_venda: number | null
  /** Data da última venda (ISO). null = nunca vendeu. */
  ult_venda: string | null
  custo_unit: number
  capital_parado: number
  classificacao: ClassificacaoSemGiro
}

export interface RespostaSemGiro {
  rows: LinhaSemGiro[]
  meta: {
    corte_dias: number
    parados: number
    capital_parado_total: number
    /** Frota de comodato: equipamento no cliente, girando — não é capital a recuperar. */
    so_comodato: { skus: number; capital: number }
    /** Consumível encalhado de verdade: o capital que o comprador tem que recuperar. */
    parado_real: { skus: number; capital: number }
    nunca_vendeu: number
  }
}

/** Selo por classificação — dot + rótulo. O parado_real é o único que "acende". */
const CLASSIF: Record<string, { rotulo: string; classe: string; dot: string; dica: string }> = {
  parado_real: {
    rotulo: 'parado real',
    classe: 'text-amber',
    dot: 'dot-aviso',
    dica: 'consumível encalhado — capital a recuperar (queima, promoção ou devolução ao fornecedor)',
  },
  so_comodato: {
    rotulo: 'comodato',
    classe: 'text-muted',
    dot: 'bg-line-strong',
    dica: 'dispenser/saboneteira que sai como comodato e está no cliente — não liquidar, está girando na rua',
  },
}

function SeloClassif({ valor }: { valor: string }) {
  const e = CLASSIF[valor] ?? {
    rotulo: (valor ?? '—').replace(/_/g, ' '),
    classe: 'text-muted',
    dot: 'bg-line-strong',
    dica: valor ?? '',
  }
  return (
    <span className={`chip border border-line font-semibold ${e.classe}`} title={e.dica}>
      <span className={`dot ${e.dot}`} aria-hidden />
      {e.rotulo}
    </span>
  )
}

/** Data ISO -> dd/mm/aaaa sem passar por Date (evita o pulo de fuso do toISOString). */
function dataBr(iso: string | null): string {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return a && m && d ? `${d}/${m}/${a}` : iso
}

export default function SemGiro({ dados }: { dados: RespostaSemGiro | null }) {
  if (!dados) return <Vazio>análise de itens sem giro indisponível no momento</Vazio>
  const m = dados.meta
  // Ordena por capital desc mesmo que o backend já entregue ordenado: a regra da tela
  // é "o maior capital parado no topo", e ela não pode depender da ordem da resposta.
  const rows = [...(dados.rows ?? [])].sort((x, y) => y.capital_parado - x.capital_parado)

  return (
    <>
      {/* dois mundos lado a lado — o parado_real em destaque, o comodato à parte e sem alarme */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div className="rounded border border-primary bg-primary-wash p-4">
          <p className="label-caps flex items-center gap-2">
            <span className="dot dot-aviso" aria-hidden />
            Parado real · capital a recuperar
          </p>
          <p className="num text-2xl sm:text-3xl font-bold mt-1 text-amber">{brl.format(m.parado_real.capital)}</p>
          <p className="text-muted text-[11px] font-mono mt-0.5">
            {m.parado_real.skus} {m.parado_real.skus === 1 ? 'produto encalhado' : 'produtos encalhados'} · consumível
            no galpão
          </p>
        </div>

        <div className="rounded border border-line bg-floor p-4">
          <p className="label-caps flex items-center gap-2">
            <span className="dot bg-line-strong" aria-hidden />
            Frota de comodato · sem alarme
          </p>
          <p className="num text-2xl sm:text-3xl font-bold mt-1 text-ink-soft">{brl.format(m.so_comodato.capital)}</p>
          <p className="text-muted text-[11px] font-mono mt-0.5">
            {m.so_comodato.skus} {m.so_comodato.skus === 1 ? 'equipamento' : 'equipamentos'} · no cliente, girando —
            não liquidar
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <Vazio>nenhum item com estoque parado há mais de {m.corte_dias} dias</Vazio>
      ) : (
        <div className="overflow-x-auto max-h-[32rem] overflow-y-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead className="sticky top-0 bg-card z-10">
              <tr>
                <th className="font-display text-left text-ink font-semibold px-3 py-2 border-b border-line-strong">
                  Produto
                </th>
                <th className="font-display text-left text-ink font-semibold px-3 py-2 border-b border-line-strong">
                  Departamento
                </th>
                <th className="font-display text-right text-ink font-semibold px-3 py-2 border-b border-line-strong">
                  Dias parado
                </th>
                <th className="font-display text-right text-ink font-semibold px-3 py-2 border-b border-line-strong">
                  Disponível
                </th>
                <th className="font-display text-right text-ink font-semibold px-3 py-2 border-b border-line-strong">
                  Capital parado
                </th>
                <th className="font-display text-left text-ink font-semibold px-3 py-2 border-b border-line-strong">
                  Classificação
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const nuncaVendeu = r.dias_sem_venda == null
                const comodato = r.classificacao === 'so_comodato'
                return (
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
                    <td className="px-3 py-2 border-b border-line text-right font-mono whitespace-nowrap">
                      {nuncaVendeu ? (
                        <span className="text-amber font-semibold" title="produto sem nenhuma venda registrada">
                          nunca vendeu
                        </span>
                      ) : (
                        <>
                          <span className={comodato ? 'text-muted' : 'text-ink-soft'}>{un(r.dias_sem_venda)} d</span>
                          <span className="block text-muted text-[11px]">últ. {dataBr(r.ult_venda)}</span>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2 border-b border-line text-right font-mono whitespace-nowrap text-ink-soft">
                      {un(r.disponivel)}
                      {r.qtest !== r.disponivel && (
                        <span className="block text-muted text-[11px]" title="estoque físico total (inclui reservado/trancado)">
                          {un(r.qtest)} em estoque
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 border-b border-line text-right font-mono whitespace-nowrap">
                      <span className={comodato ? 'text-ink-soft' : 'text-amber font-semibold'}>
                        {brlExato.format(r.capital_parado)}
                      </span>
                      {r.custo_unit > 0 && (
                        <span className="block text-muted text-[11px]">{brlExato.format(r.custo_unit)}/un</span>
                      )}
                    </td>
                    <td className="px-3 py-2 border-b border-line">
                      <SeloClassif valor={r.classificacao} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Nota>
        Estoque sem venda há mais de {m.corte_dias} dias, valorizado ao custo — {m.parados}{' '}
        {m.parados === 1 ? 'item parado' : 'itens parados'} no total. <strong className="font-semibold">Parado real</strong>{' '}
        é consumível encalhado, o capital a recuperar (queima, promoção ou devolução ao fornecedor).{' '}
        <strong className="font-semibold">Comodato</strong> é dispenser/saboneteira que sai como comodato e está no
        cliente: entra à parte, sem alarme, para não se liquidar equipamento que está girando na rua.
        {m.nunca_vendeu > 0 && ` ${m.nunca_vendeu} ${m.nunca_vendeu === 1 ? 'item nunca teve' : 'itens nunca tiveram'} venda registrada.`}
      </Nota>
    </>
  )
}
