import { ChevronDown, ChevronRight } from 'lucide-react'
import { milCurto, moedaExata, numero } from './formato'

/**
 * Mix de produtos por RCA, mês contra mês anterior (§5.2).
 *
 * Regra do alerta: o mix do mês tem de ser MAIOR OU IGUAL ao do mês anterior. Caiu,
 * acende — e o alerta só serve para alguma coisa acompanhado da LISTA DOS ITENS QUE
 * SAÍRAM: é assim que o gestor descobre que "o RCA parou de vender o borrifador" em
 * vez de ficar olhando um número menor sem saber o que fazer.
 *
 * ★ O mix da EMPRESA vai no topo porque o "230 itens" que o dono cita é o total da
 *   empresa, não o de um vendedor (o maior RCA tem 130). Sem os dois lado a lado a
 *   tela parece errada.
 *
 * ★ Mês corrente não é comparável a mês fechado. Durante o mês a lista de faltantes é
 *   ferramenta de trabalho e encolhe sozinha; a apuração da queda é no fechamento.
 */
export interface LinhaMix {
  codusur: number
  nome: string | null
  mix_mes: number
  mix_anterior: number
  variacao: number
  alerta: boolean
}

export interface MetaMix {
  mes: string
  rotulo?: string
  mes_anterior: string
  rotulo_anterior?: string
  mix_empresa: number
  mix_empresa_anterior: number
  parcial: boolean
  aviso?: string | null
}

export interface ItemForaDoMix {
  codusur: number
  nome: string | null
  codprod: number
  descricao: string | null
  qt_mes_anterior: number
  valor_mes_anterior: number
}

function nomeRca(l: { codusur: number; nome: string | null }): string {
  return (l.nome ?? '').trim() || `RCA ${l.codusur}`
}

/** Delta em tinta de status: queda é o que precisa de ação. */
function Delta({ v }: { v: number }) {
  const cor = v < 0 ? 'text-danger' : v > 0 ? 'text-emerald' : 'text-muted'
  return (
    <span className={`font-mono text-xs font-semibold whitespace-nowrap ${cor}`}>
      {v > 0 ? '+' : v < 0 ? '−' : '±'}
      {numero(Math.abs(v))}
    </span>
  )
}

export default function MixRca({
  rows,
  meta,
  selecionado,
  aoSelecionar,
  perdidos,
  carregandoPerdidos,
  erroPerdidos,
}: {
  rows: LinhaMix[]
  meta: MetaMix
  /** CODUSUR expandido, ou null. */
  selecionado: number | null
  aoSelecionar: (codusur: number | null) => void
  perdidos: ItemForaDoMix[]
  carregandoPerdidos: boolean
  erroPerdidos: string | null
}) {
  const deltaEmpresa = meta.mix_empresa - meta.mix_empresa_anterior
  const rotulo = meta.rotulo ?? meta.mes
  const rotuloAnterior = meta.rotulo_anterior ?? meta.mes_anterior

  return (
    <div className="flex flex-col gap-4">
      {/* mix da empresa — a referência do "230 itens" */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border border-line rounded bg-floor px-4 py-3">
        <span className="label-caps">Mix da empresa</span>
        <span className="num text-2xl font-bold text-ink">{numero(meta.mix_empresa)}</span>
        <span className="text-muted text-xs font-mono">SKUs distintos em {rotulo}</span>
        <span className="ml-auto flex items-center gap-2 text-xs font-mono text-muted">
          era {numero(meta.mix_empresa_anterior)} em {rotuloAnterior}
          <Delta v={deltaEmpresa} />
        </span>
      </div>

      <ul className="flex flex-col divide-y divide-line">
        {rows.map((l) => {
          const aberto = selecionado === l.codusur
          const itens = aberto ? perdidos.filter((p) => p.codusur === l.codusur) : []
          const valorPerdido = itens.reduce((s, p) => s + (p.valor_mes_anterior || 0), 0)
          return (
            <li key={l.codusur}>
              <button
                type="button"
                onClick={() => aoSelecionar(aberto ? null : l.codusur)}
                aria-expanded={aberto}
                className="w-full text-left py-3 px-1 flex items-center gap-3 hover:bg-primary-wash transition-colors rounded-sm"
              >
                {aberto ? (
                  <ChevronDown className="w-4 h-4 text-muted shrink-0" strokeWidth={1.75} />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted shrink-0" strokeWidth={1.75} />
                )}
                {l.alerta && <span className="dot dot-aviso" role="img" aria-label="mix em queda" />}
                <span className="text-sm font-semibold text-ink truncate flex-1">{nomeRca(l)}</span>
                <span className="font-mono text-xs text-muted whitespace-nowrap">
                  {numero(l.mix_anterior)} <span aria-hidden>→</span>{' '}
                  <span className="text-ink font-semibold">{numero(l.mix_mes)}</span>
                </span>
                <Delta v={l.variacao} />
              </button>

              {aberto && (
                <div className="pb-4 pl-7 pr-1">
                  <p className="label-caps text-[10px] mb-2">
                    Itens vendidos em {rotuloAnterior} e ainda sem venda em {rotulo}
                  </p>

                  {erroPerdidos ? (
                    <p className="text-muted text-xs font-mono py-3">
                      Não foi possível carregar a lista. <span className="break-words">{erroPerdidos}</span>
                    </p>
                  ) : carregandoPerdidos ? (
                    <div className="flex flex-col gap-2 py-1" aria-busy="true">
                      <div className="skeleton h-3 w-2/3" />
                      <div className="skeleton h-3 w-1/2" />
                    </div>
                  ) : itens.length === 0 ? (
                    <p className="text-muted text-xs font-mono py-2">
                      Nenhum item saiu do mix deste RCA.
                    </p>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                          <thead>
                            <tr className="text-left">
                              <th className="label-caps text-[10px] font-bold py-1 pr-3">Cód.</th>
                              <th className="label-caps text-[10px] font-bold py-1 pr-3">Produto</th>
                              <th className="label-caps text-[10px] font-bold py-1 pr-3 text-right whitespace-nowrap">
                                Qt. {rotuloAnterior}
                              </th>
                              <th className="label-caps text-[10px] font-bold py-1 text-right whitespace-nowrap">
                                Valor {rotuloAnterior}
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-line">
                            {itens.map((p) => (
                              <tr key={p.codprod}>
                                <td className="py-1.5 pr-3 font-mono text-xs text-muted">{p.codprod}</td>
                                <td className="py-1.5 pr-3 text-xs text-ink">{p.descricao ?? '—'}</td>
                                <td className="py-1.5 pr-3 font-mono text-xs text-right whitespace-nowrap">
                                  {numero(p.qt_mes_anterior)}
                                </td>
                                <td className="py-1.5 font-mono text-xs text-right whitespace-nowrap">
                                  {moedaExata(p.valor_mes_anterior)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="mt-2 text-[11px] font-mono text-muted">
                        {itens.length} {itens.length === 1 ? 'item' : 'itens'} · {milCurto(valorPerdido)} faturados em{' '}
                        {rotuloAnterior} e ainda não repetidos
                      </p>
                    </>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <p className="text-[11px] font-mono text-muted leading-relaxed">
        Mix = produtos distintos com quantidade líquida vendida maior que zero no mês (devolução já
        abatida). Alerta quando o mix do mês fica abaixo do mês anterior. Clique no RCA para ver o que
        saiu do mix.
      </p>
    </div>
  )
}
