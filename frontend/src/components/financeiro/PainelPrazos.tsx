import { ArrowDownToLine, ArrowUpFromLine, FileSignature } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { brl } from '../../lib/format'
import { dias, diasNum, Esqueleto, Vazio } from './formatos'
import type { RespostaPrazos } from './tipos'

/**
 * Os TRÊS prazos lado a lado — o painel central da aba.
 *
 * O dono não quer "contas vencidas": quer ver o descompasso entre o prazo que o
 * comercial concede no boleto (~22 d), o prazo em que o cliente efetivamente paga
 * (~28-30 d) e o prazo em que a empresa paga o fornecedor (45-63 d). É desse
 * descompasso que nasce a quebra de caixa que obriga a adiantar boleto com juros.
 *
 * ★ SÃO TRÊS CARTEIRAS DIFERENTES. Concedido olha títulos EMITIDOS no período; PMR
 *   olha títulos PAGOS; PMP olha lançamentos LIQUIDADOS. O título emitido em junho
 *   só é pago em julho — comparar, jamais somar. Cada coluna traz a própria janela
 *   escrita embaixo do número justamente para ninguém somar por engano.
 *
 * ★ "ATRASOU QUANTOS DIAS?" tem que sair da MESMA carteira. `atraso_medio` do
 *   contrato (PMR − concedido do mês) mistura duas carteiras; o número honesto é o
 *   `atraso_carteira_paga`, que compara o prazo concedido NOS TÍTULOS QUE FORAM
 *   PAGOS com o prazo em que foram pagos. Em jun/2026: prometido 24,05 → pago
 *   29,80 → 5,75 dias de atraso (e não os 7,2 da conta entre carteiras).
 */

interface Coluna {
  chave: string
  rotulo: string
  janela: string
  Icone: LucideIcon
  valor: number | null
  apoio: string
  tom: string
}

export default function PainelPrazos({
  dados,
  carregando,
}: {
  dados: RespostaPrazos | null
  carregando: boolean
}) {
  if (carregando && !dados) {
    return (
      <section className="tile p-4 sm:p-6">
        <Esqueleto altura="h-32" />
      </section>
    )
  }
  if (!dados) {
    return (
      <section className="tile p-4 sm:p-6">
        <h2 className="font-display text-lg font-semibold text-ink">Prazos de caixa</h2>
        <Vazio>prazos indisponíveis no momento</Vazio>
      </section>
    )
  }

  const m = dados.meta ?? {}
  const concedidoPago = (m.concedido_carteira_paga ?? null) as number | null
  const atrasoPago = (m.atraso_carteira_paga ?? null) as number | null

  // PMR maior que o concedido = o cliente estica o prazo; é o sinal que antecede a
  // quebra de caixa, então ganha cor de atenção em vez de ficar em tinta neutra.
  const tomPmr =
    dados.pmr != null && concedidoPago != null && dados.pmr > concedidoPago + 0.05
      ? 'text-amber'
      : 'text-ink'

  const colunas: Coluna[] = [
    {
      chave: 'concedido',
      rotulo: 'Prazo concedido no boleto',
      janela: 'títulos emitidos no período',
      Icone: FileSignature,
      valor: dados.prazo_concedido,
      apoio:
        m.titulos_emitidos != null
          ? `${m.titulos_emitidos} títulos · ${brl.format(m.valor_emitido ?? 0)}`
          : '',
      tom: 'text-ink',
    },
    {
      chave: 'pmr',
      rotulo: 'PMR — o dinheiro entra em',
      janela: 'títulos pagos no período',
      Icone: ArrowDownToLine,
      valor: dados.pmr,
      apoio:
        m.titulos_recebidos != null
          ? `${m.titulos_recebidos} títulos · ${brl.format(m.valor_recebido ?? 0)}`
          : '',
      tom: tomPmr,
    },
    {
      chave: 'pmp',
      rotulo: 'PMP — o dinheiro sai em',
      janela: 'compra de mercadoria liquidada',
      Icone: ArrowUpFromLine,
      valor: dados.pmp,
      apoio: m.valor_pago_mercadoria != null ? `${brl.format(m.valor_pago_mercadoria)} pagos` : '',
      tom: 'text-emerald',
    },
  ]

  const gap = dados.gap_caixa
  const folga = gap != null && gap >= 0

  return (
    <section className="tile p-4 sm:p-6 surgir surgir-1">
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-display text-lg font-semibold text-ink">Em quantos dias o dinheiro entra e sai</h2>
        <span className="text-muted text-xs font-mono">
          {dados.referencia.rotulo}
          {!dados.referencia.fechado && ' · mês em andamento'}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-5">
        {colunas.map((c) => (
          <div key={c.chave} className="min-w-0">
            <p className="label-caps flex items-center gap-2 leading-tight">
              <c.Icone className="w-3.5 h-3.5 text-primary-soft shrink-0" strokeWidth={1.75} aria-hidden />
              <span className="min-w-0">{c.rotulo}</span>
            </p>
            <p className={`num text-3xl sm:text-4xl font-bold mt-1.5 ${c.tom}`}>{dias(c.valor)}</p>
            <p className="text-muted text-[11px] font-mono mt-1">{c.janela}</p>
            {c.apoio && <p className="text-muted text-[11px] font-mono mt-0.5">{c.apoio}</p>}
          </div>
        ))}
      </div>

      {/* A frase é o produto desta seção: o gestor lê uma linha e entende o caixa. */}
      <div className="mt-5 pt-4 border-t border-line flex flex-col gap-2">
        {gap != null ? (
          <p className="text-ink-soft text-sm sm:text-base leading-relaxed">
            Você recebe em <strong className="font-semibold">{diasNum(dados.pmr)} dias</strong> e paga em{' '}
            <strong className="font-semibold">{diasNum(dados.pmp)}</strong> —{' '}
            {folga ? (
              <>
                <span className="text-emerald font-semibold">{diasNum(Math.abs(gap))} dias de fôlego</span>: o
                fornecedor financia a operação nesse intervalo.
              </>
            ) : (
              <>
                <span className="text-danger font-semibold">faltam {diasNum(Math.abs(gap))} dias</span>: a empresa
                financia o cliente e precisa cobrir o vão com caixa próprio ou antecipação.
              </>
            )}
          </p>
        ) : (
          <p className="text-muted text-sm">Sem títulos suficientes no período para medir o gap de caixa.</p>
        )}

        {atrasoPago != null && concedidoPago != null && (
          <p className="text-muted text-sm leading-relaxed">
            Nos títulos que foram pagos no período, o boleto concedia{' '}
            <span className="font-mono text-ink-soft">{diasNum(concedidoPago)} dias</span> e o cliente levou{' '}
            <span className="font-mono text-ink-soft">{diasNum(dados.pmr)}</span> —{' '}
            {atrasoPago > 0.05 ? (
              <span className="text-amber font-semibold">{diasNum(atrasoPago)} dias de atraso</span>
            ) : atrasoPago < -0.05 ? (
              <span className="text-emerald font-semibold">
                {diasNum(Math.abs(atrasoPago))} dias antes do combinado
              </span>
            ) : (
              <span>em dia</span>
            )}
            .
          </p>
        )}

        <p className="text-muted text-[11px] leading-relaxed">
          As três janelas cobrem carteiras diferentes — o título emitido no mês só será pago meses depois.
          Compare os prazos, nunca some. PMP é da empresa inteira (duplicata de fornecedor não tem vendedor).
        </p>
      </div>
    </section>
  )
}
