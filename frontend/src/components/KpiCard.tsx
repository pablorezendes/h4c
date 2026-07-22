import {
  TrendingUp, TrendingDown, Banknote, ShoppingCart, Receipt, Wallet, type LucideIcon,
} from 'lucide-react'
import { brl, brlExato, inteiro } from '../lib/format'

/**
 * Card numérico compacto.
 *
 * O tipo é um superconjunto do `Card` do /api/kpis/overview: quem já entrega um Card
 * continua entregando, e quem monta o número na própria tela (contagens de churn, por
 * exemplo) informa só label/valor e, se quiser, ícone, tom e detalhe. Sem isso cada
 * tela acabaria criando o seu próprio cartãozinho e o painel viraria uma colcha.
 */
export interface Kpi {
  id?: string
  label: string
  valor: number
  formato?: 'moeda' | 'inteiro'
  variacao_pct?: number | null
  extra?: Record<string, number>
  /** Linha de apoio, ex.: '14,9% do líquido de 12 meses'. */
  detalhe?: string
  /** Classe de tinta do número (text-danger, text-amber...). Padrão: tinta neutra. */
  tom?: string
  Icone?: LucideIcon
}

const ICONES: Record<string, LucideIcon> = {
  faturamento: Banknote,
  pedidos: ShoppingCart,
  ticket_medio: Receipt,
  cr_aberto: Wallet,
}

export default function KpiCard({ card, indice = 0 }: { card: Kpi; indice?: number }) {
  const Icone = card.Icone ?? ICONES[card.id ?? ''] ?? Banknote
  const valor =
    (card.formato ?? 'moeda') === 'moeda'
      ? Math.abs(card.valor) < 10000
        ? brlExato.format(card.valor)
        : brl.format(card.valor)
      : inteiro.format(card.valor)
  const positiva = (card.variacao_pct ?? 0) >= 0
  const tom = card.tom ?? (card.id === 'faturamento' ? 'text-primary' : 'text-ink')

  return (
    <div className={`tile tile-hover p-5 sm:p-6 flex flex-col gap-3 sm:gap-4 surgir surgir-${(indice % 4) + 1}`}>
      <div className="flex items-center gap-3">
        <div className="icon-badge w-10 h-10">
          <Icone className="w-5 h-5 text-primary-soft" strokeWidth={1.5} />
        </div>
        <span className="label-caps">{card.label}</span>
      </div>

      <div className={`num text-3xl sm:text-4xl font-bold ${tom}`}>{valor}</div>

      <div className="flex flex-wrap items-center gap-2 text-sm min-h-5">
        {card.variacao_pct !== null && card.variacao_pct !== undefined && (
          <>
            <span className={`inline-flex items-center gap-1 font-mono font-semibold text-xs ${positiva ? 'text-emerald' : 'text-danger'}`}>
              {positiva ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {positiva ? '+' : ''}
              {card.variacao_pct.toLocaleString('pt-BR')}%
            </span>
            <span className="text-muted text-xs">vs período anterior</span>
          </>
        )}
        {card.detalhe && <span className="text-muted text-xs font-mono">{card.detalhe}</span>}
        {card.extra?.vencido !== undefined && (
          <span className="inline-flex items-center gap-1.5 text-amber font-mono text-xs">
            <span className="dot dot-aviso" /> {brl.format(card.extra.vencido)} vencido
          </span>
        )}
      </div>
    </div>
  )
}
