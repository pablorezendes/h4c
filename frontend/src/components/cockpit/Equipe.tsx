import { SemaforoPonto, avaliarMeta, corFarol } from '../Semaforo'
import { milCurto, moeda, numero, pct, variacao } from '../comercial/formato'

/**
 * Ranking de desempenho por RCA (§5.1).
 *
 * ★ A comparação é com a META, não com a média da empresa. Comparar o vendedor com a
 *   média move o alvo sozinho: numa equipe inteira abaixo de 33% de margem, quem está
 *   em 30% aparece "acima da média" e ninguém é cobrado. Margem tem meta de 33% e
 *   positivação de 80% — é contra esses números que cada linha acende.
 *
 * ★ A devolução por RCA é INFORMATIVA (§5.4): aparece em tinta neutra, sem meta e sem
 *   semáforo. A meta individual de devolução por vendedor é decisão que o cliente
 *   ainda não tomou; pintar de vermelho seria cobrar uma regra que não existe.
 *
 * Os campos são todos opcionais porque o mesmo componente atende recortes diferentes
 * do endpoint de RCA — quem não vier some da linha em vez de virar 'NaN'.
 */
export interface Vendedor {
  codusur?: number
  nome?: string | null
  /** Faturamento LÍQUIDO de devolução — é o único número de venda exibido. */
  liquido?: number
  liquido_anterior?: number
  variacao_pct?: number | null
  margem_pct?: number | null
  positivacao_pct?: number | null
  positivados?: number
  carteira?: number
  clientes?: number
  mix?: number
  devolucao?: number
  devolucao_pct?: number | null
  [k: string]: unknown
}

function rotuloRca(v: Vendedor): string {
  const nome = (v.nome ?? '').toString().trim()
  if (nome) return nome
  return v.codusur !== undefined ? `RCA ${v.codusur}` : '—'
}

/** Bloco meta + farol usado nas colunas de margem e positivação. */
function Meta({
  rotulo,
  valor,
  meta,
  detalhe,
}: {
  rotulo: string
  valor: number | null | undefined
  meta: number
  detalhe?: string
}) {
  const v = valor === undefined ? null : valor
  const farol = avaliarMeta(v, meta)
  return (
    <div className="min-w-0">
      <p className="label-caps text-[10px] leading-tight">{rotulo}</p>
      <p className={`font-mono text-sm font-semibold flex items-center gap-1.5 ${corFarol(farol)}`}>
        <SemaforoPonto farol={farol} />
        {pct(v)}
      </p>
      {detalhe && <p className="text-[10px] font-mono text-muted truncate">{detalhe}</p>}
    </div>
  )
}

export default function Equipe({
  vendedores,
  metaMargem = 33,
  metaPositivacao = 80,
  rotuloAnterior,
}: {
  vendedores: Vendedor[]
  metaMargem?: number
  metaPositivacao?: number
  /** Nome do período de comparação, ex.: 'maio/2026'. */
  rotuloAnterior?: string
}) {
  const dados = [...vendedores]
    .filter((v) => typeof v.liquido === 'number')
    .sort((a, b) => (b.liquido ?? 0) - (a.liquido ?? 0))

  if (!dados.length) return <p className="text-muted text-sm py-6 text-center">Sem venda no período.</p>

  const maior = Math.max(...dados.map((v) => v.liquido ?? 0), 1)

  return (
    <ul className="flex flex-col divide-y divide-line">
      {dados.map((v, i) => {
        const liquido = v.liquido ?? 0
        const cresceu = (v.variacao_pct ?? 0) >= 0
        return (
          <li key={v.codusur ?? rotuloRca(v)} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold text-ink truncate">
                <span className="font-mono text-muted text-xs mr-1.5">{i + 1}º</span>
                {rotuloRca(v)}
              </span>
              <span className="num font-semibold text-sm whitespace-nowrap">{moeda(liquido)}</span>
            </div>

            <div className="mt-1.5 flex items-center gap-3">
              <div className="flex-1 h-1.5 bg-floor border border-line overflow-hidden rounded-sm">
                <div className="h-full bg-primary" style={{ width: `${(liquido / maior) * 100}%` }} />
              </div>
              {v.variacao_pct !== null && v.variacao_pct !== undefined && (
                <span
                  className={`font-mono text-[11px] whitespace-nowrap font-semibold ${cresceu ? 'text-emerald' : 'text-danger'}`}
                >
                  {variacao(v.variacao_pct)}
                </span>
              )}
              {v.liquido_anterior !== undefined && (
                <span className="font-mono text-[11px] text-muted whitespace-nowrap hidden sm:inline">
                  {rotuloAnterior ? `${rotuloAnterior}: ` : 'anterior: '}
                  {milCurto(v.liquido_anterior)}
                </span>
              )}
            </div>

            <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
              <Meta rotulo="Margem" valor={v.margem_pct} meta={metaMargem} detalhe={`meta ${pct(metaMargem, 0)}`} />
              <Meta
                rotulo="Positivação"
                valor={v.positivacao_pct}
                meta={metaPositivacao}
                detalhe={
                  v.carteira !== undefined
                    ? `${numero(v.positivados ?? 0)}/${numero(v.carteira)} da carteira`
                    : `meta ${pct(metaPositivacao, 0)}`
                }
              />
              <div className="min-w-0">
                <p className="label-caps text-[10px] leading-tight">Mix de produtos</p>
                <p className="font-mono text-sm font-semibold text-ink">{numero(v.mix ?? 0)}</p>
                <p className="text-[10px] font-mono text-muted truncate">SKUs distintos</p>
              </div>
              {/* §5.4 — sem meta, sem semáforo, sem cor de alarme */}
              <div className="min-w-0">
                <p className="label-caps text-[10px] leading-tight">Devolução</p>
                <p className="font-mono text-sm font-semibold text-muted">{pct(v.devolucao_pct, 2)}</p>
                <p className="text-[10px] font-mono text-muted truncate">
                  {v.devolucao ? `${milCurto(v.devolucao)} · informativo` : 'informativo'}
                </p>
              </div>
            </div>
          </li>
        )
      })}

      <li className="pt-3 text-[11px] font-mono text-muted leading-relaxed">
        Faturamento sempre líquido de devolução. Metas: margem de contribuição {pct(metaMargem, 0)} ·
        positivação {pct(metaPositivacao, 0)} — verde na meta, âmbar de 90% a 100%, vermelho abaixo de 90%.
        A devolução é exibida sem meta e sem semáforo enquanto o controle por vendedor não for definido.
      </li>
    </ul>
  )
}
