import { AlertTriangle, PhoneCall } from 'lucide-react'
import { brl, brlExato } from '../../lib/format'
import { dataBr, Esqueleto, pct, Vazio } from './formatos'
import type { RespostaVencido } from './tipos'

/**
 * Vencido a receber — card de DESTAQUE da aba (§8 das regras do cliente).
 *
 * Saiu da visão Comercial para cá porque é métrica de caixa, não de venda, e foi
 * classificado como fundamental: é o dinheiro que a empresa já faturou, já entregou,
 * e ainda não recebeu — exatamente a conta que obriga a adiantar boleto pagando juros.
 *
 * ★ POSIÇÃO DE HOJE, NÃO PERÍODO. O card ignora o filtro de data de propósito (o
 *   backend também): "quanto já venceu e não entrou?" só tem uma resposta possível,
 *   que é agora. Datar o vencido devolveria um número que já nasce velho.
 *
 * ★ O RECORTE DE 15 DIAS MUDA A AÇÃO. Atraso fresco se resolve com um telefonema;
 *   atraso velho já é problema de crédito. Medido em 21/07/2026: R$ 13.780,09 dos
 *   R$ 26.383,77 vencidos (52,2%) estão nos primeiros 15 dias — e 92% do que a faixa
 *   antiga "1-30 dias" mostrava junto. Por isso as duas faixas vivem separadas.
 */
export default function CardVencido({
  dados,
  carregando,
}: {
  dados: RespostaVencido | null
  carregando: boolean
}) {
  if (carregando && !dados) {
    return (
      <section className="tile tile-accent-left p-5 sm:p-6">
        <Esqueleto altura="h-20" />
      </section>
    )
  }
  if (!dados) {
    return (
      <section className="tile tile-accent-left p-5 sm:p-6">
        <p className="label-caps">Vencido a receber</p>
        <Vazio>contas a receber indisponíveis no momento</Vazio>
      </section>
    )
  }

  const { total, titulos, a_vencer: aVencer, meta } = dados
  const fresco = meta.ate_15_dias ?? 0
  const frescoPct = meta.ate_15_dias_pct ?? null
  const carteira = meta.carteira_aberta ?? total + aVencer
  const semVencido = total <= 0

  return (
    <section className="tile tile-accent-left p-5 sm:p-6 surgir">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-8 gap-y-5">
        <div className="min-w-0">
          <p className="label-caps flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-danger" strokeWidth={2} aria-hidden />
            Vencido a receber
          </p>
          <p className={`num text-4xl sm:text-5xl font-bold mt-1.5 ${semVencido ? 'text-emerald' : 'text-danger'}`}>
            {brl.format(total)}
          </p>
          <p className="text-muted text-xs font-mono mt-1.5">
            {titulos} {titulos === 1 ? 'título em atraso' : 'títulos em atraso'}
            {meta.vencido_sobre_carteira_pct != null && (
              <> · {pct(meta.vencido_sobre_carteira_pct)} da carteira aberta</>
            )}
          </p>
          <p className="text-muted text-[11px] font-mono mt-1">
            posição de {dataBr(meta.posicao)} — não acompanha o filtro de período
          </p>
        </div>

        <div className="min-w-0 lg:border-l lg:border-line lg:pl-8">
          <p className="label-caps flex items-center gap-2">
            <PhoneCall className="w-3.5 h-3.5 text-primary-soft" strokeWidth={1.75} aria-hidden />
            Atraso fresco · 1 a 15 dias
          </p>
          <p className="num text-2xl sm:text-3xl font-bold mt-1.5 text-ink">{brlExato.format(fresco)}</p>
          <p className="text-muted text-xs font-mono mt-1.5">
            {frescoPct != null ? `${pct(frescoPct)} do vencido` : 'sem vencido no momento'}
          </p>
          <p className="text-muted text-[11px] mt-1 leading-snug">
            Cobrança por telefone. O que passa de 30 dias já é decisão de crédito.
          </p>
        </div>

        <div className="min-w-0 lg:border-l lg:border-line lg:pl-8 flex flex-col gap-4">
          <div>
            <p className="label-caps">A vencer</p>
            <p className="num text-xl font-semibold mt-1 text-ink">{brl.format(aVencer)}</p>
          </div>
          <div>
            <p className="label-caps">Carteira aberta</p>
            <p className="num text-xl font-semibold mt-1 text-ink-soft">{brl.format(carteira)}</p>
            <p className="text-muted text-[11px] font-mono mt-1">vencido + a vencer</p>
          </div>
        </div>
      </div>
    </section>
  )
}
