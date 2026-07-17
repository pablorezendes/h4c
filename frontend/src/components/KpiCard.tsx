import { TrendingUp, TrendingDown, Banknote, ShoppingCart, Receipt, Wallet } from 'lucide-react'
import type { Card } from '../lib/api'
import { brl, brlExato, inteiro } from '../lib/format'

const ICONES: Record<string, typeof Banknote> = {
  faturamento: Banknote,
  pedidos: ShoppingCart,
  ticket_medio: Receipt,
  cr_aberto: Wallet,
}

export default function KpiCard({ card, indice = 0 }: { card: Card; indice?: number }) {
  const Icone = ICONES[card.id] ?? Banknote
  const valor =
    card.formato === 'moeda'
      ? Math.abs(card.valor) < 10000
        ? brlExato.format(card.valor)
        : brl.format(card.valor)
      : inteiro.format(card.valor)
  const positiva = (card.variacao_pct ?? 0) >= 0

  return (
    <div className={`tile tile-hover p-5 sm:p-6 flex flex-col gap-3 sm:gap-4 surgir surgir-${(indice % 4) + 1}`}>
      <div className="flex items-center gap-3">
        <div className="icon-badge w-10 h-10">
          <Icone className="w-5 h-5 text-primary-soft" strokeWidth={1.5} />
        </div>
        <span className="label-caps">{card.label}</span>
      </div>

      <div className={`num text-3xl sm:text-4xl font-bold ${card.id === 'faturamento' ? 'text-primary' : 'text-ink'}`}>
        {valor}
      </div>

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
        {card.extra?.vencido !== undefined && (
          <span className="inline-flex items-center gap-1.5 text-amber font-mono text-xs">
            <span className="dot dot-aviso" /> {brl.format(card.extra.vencido)} vencido
          </span>
        )}
      </div>
    </div>
  )
}
