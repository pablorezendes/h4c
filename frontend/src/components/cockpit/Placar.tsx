import { TrendingDown, TrendingUp } from 'lucide-react'
import { ROTULO_FAROL, SemaforoPonto, corFarol, type Farol } from '../Semaforo'

/**
 * Placar executivo: os 4 números que o dono olha primeiro.
 *
 * ★ Dois modos de leitura, e só um por item:
 *   - com META (farol/meta/atingimento): a cor do número vem do semáforo e o rodapé
 *     diz "Na meta · 90% da meta de 33,0%". É o caso de margem e positivação.
 *   - sem meta: o rodapé mostra a variação contra o período anterior.
 *   Misturar os dois (seta verde + farol vermelho) faz o card se contradizer.
 *
 * ★ `informativo` existe para o número que NÃO tem meta definida pelo cliente
 *   (devolução, §5.4): a variação sai em tinta neutra, sem seta e sem verde/vermelho.
 *   Pintar "devolução caiu" de verde já é cobrar uma meta que ninguém combinou.
 *
 * ★ `linhas` carrega o detalhe secundário — o bruto e a devolução embaixo do
 *   faturamento líquido, os dias úteis embaixo da projeção. O número grande é sempre
 *   o líquido; o bruto nunca sobe para o lugar de destaque.
 */
export interface ItemPlacar {
  rotulo: string
  valor: string
  detalhe?: string
  variacao_pct?: number | null
  tom?: string
  /** Semáforo da meta. Quando presente manda na cor do número. */
  farol?: Farol
  /** Meta já formatada para leitura, ex.: '33,0%'. */
  meta?: string
  atingimento_pct?: number | null
  /** Detalhe secundário, uma linha por item. */
  linhas?: string[]
  /** Variação sem cor e sem seta — número sem meta acordada. */
  informativo?: boolean
  /** 'sm' para valor em texto ('aguardando dados'), que não cabe no corpo de número. */
  tamanho?: 'md' | 'sm'
}

const TAMANHO = {
  md: 'text-3xl sm:text-4xl',
  sm: 'text-lg sm:text-xl',
} as const

export default function Placar({ itens }: { itens: ItemPlacar[] }) {
  return (
    <section className="tile tile-accent-left p-5 sm:p-6 surgir">
      <div className="grid grid-cols-1 min-[480px]:grid-cols-2 xl:grid-cols-4 gap-x-8 gap-y-5">
        {itens.map((it) => {
          const positiva = (it.variacao_pct ?? 0) >= 0
          const cor = it.farol ? corFarol(it.farol) : (it.tom ?? 'text-ink')
          return (
            <div key={it.rotulo} className="min-w-0">
              <p className="label-caps leading-tight">{it.rotulo}</p>
              <p className={`num ${TAMANHO[it.tamanho ?? 'md']} font-bold mt-1.5 ${cor}`}>{it.valor}</p>

              {it.farol ? (
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 min-h-4 text-xs font-mono">
                  <span className="inline-flex items-center gap-1.5">
                    <SemaforoPonto farol={it.farol} />
                    <span className={`font-semibold ${cor}`}>{ROTULO_FAROL[it.farol]}</span>
                  </span>
                  <span className="text-muted">
                    {it.atingimento_pct === null || it.atingimento_pct === undefined
                      ? `meta ${it.meta ?? '—'} — sem apuração no período`
                      : `${Math.round(it.atingimento_pct)}% da meta de ${it.meta ?? '—'}`}
                  </span>
                </p>
              ) : (
                <p className="flex items-center gap-2 mt-1.5 min-h-4 text-xs">
                  {it.variacao_pct !== null && it.variacao_pct !== undefined &&
                    (it.informativo ? (
                      <span className="font-mono text-muted">
                        {positiva ? '+' : ''}
                        {it.variacao_pct.toLocaleString('pt-BR')}%
                      </span>
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1 font-mono font-semibold ${positiva ? 'text-emerald' : 'text-danger'}`}
                      >
                        {positiva ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {positiva ? '+' : ''}
                        {it.variacao_pct.toLocaleString('pt-BR')}%
                      </span>
                    ))}
                  {it.detalhe && <span className="text-muted truncate">{it.detalhe}</span>}
                </p>
              )}

              {it.linhas?.map((linha) => (
                <p key={linha} className="text-[11px] font-mono text-muted mt-0.5 truncate" title={linha}>
                  {linha}
                </p>
              ))}
            </div>
          )
        })}
      </div>
    </section>
  )
}
