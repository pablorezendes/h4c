import {
  AlertCircle, Banknote, Info, Package, Percent, TrendingDown, TrendingUp,
  UserCheck, UserPlus, Users, UsersRound, Wallet,
} from 'lucide-react'
import { brl, brlExato, inteiro } from '../lib/format'

export interface Indicador {
  id: string
  nome: string
  definicao?: string
  formato: 'moeda' | 'inteiro' | 'decimal' | 'percentual'
  valor: number | null
  valor_anterior: number | null
  variacao_pct: number | null
  depende_do_periodo: boolean
  auxiliares?: Record<string, unknown>
  status?: string
  obs?: string
  erro?: string
}

const ICONES: Record<string, typeof Banknote> = {
  'IND-01': Banknote,
  'IND-02': Package,
  'IND-03': Wallet,
  'IND-04': Users,
  'IND-05': UserPlus,
  'IND-06': UsersRound,
  'IND-07': UserCheck,
  'IND-08': Percent,
  'IND-09': Percent,
}

function formatar(valor: number | null, formato: Indicador['formato']): string {
  if (valor === null || valor === undefined) return '—'
  switch (formato) {
    case 'moeda':
      return Math.abs(valor) < 10000 ? brlExato.format(valor) : brl.format(valor)
    case 'percentual':
      return `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
    case 'inteiro':
      return inteiro.format(valor)
    default:
      return valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
  }
}

export default function IndicadorCard({ ind, indice = 0 }: { ind: Indicador; indice?: number }) {
  const Icone = ICONES[ind.id] ?? Banknote
  const positiva = (ind.variacao_pct ?? 0) >= 0
  const destaque = ind.id === 'IND-01'

  if (ind.erro) {
    return (
      <div className="tile p-5 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="icon-badge w-9 h-9 opacity-60">
            <AlertCircle className="w-4 h-4 text-danger" strokeWidth={1.5} />
          </div>
          <span className="label-caps">{ind.nome}</span>
        </div>
        <p className="text-danger text-xs font-mono break-words">{ind.erro}</p>
      </div>
    )
  }

  return (
    <div className={`tile tile-hover p-6 flex flex-col gap-3 surgir surgir-${(indice % 4) + 1}`}>
      <div className="flex items-center gap-3">
        <div className="icon-badge w-8 h-8 shrink-0">
          <Icone className="w-4 h-4 text-primary-soft" strokeWidth={1.75} />
        </div>
        <span className="label-caps leading-tight">{ind.nome}</span>
        {ind.definicao && (
          <span className="ml-auto shrink-0 text-muted hover:text-ink transition-colors cursor-help" title={ind.definicao}>
            <Info className="w-3.5 h-3.5" strokeWidth={1.75} />
          </span>
        )}
      </div>

      <div className={`num text-3xl sm:text-4xl font-bold ${destaque ? 'text-primary' : 'text-ink'}`}>
        {formatar(ind.valor, ind.formato)}
      </div>

      <div className="flex flex-wrap items-center gap-2 min-h-5 text-xs">
        {ind.variacao_pct !== null && ind.variacao_pct !== undefined ? (
          <>
            <span className={`inline-flex items-center gap-1 font-mono font-semibold ${positiva ? 'text-emerald' : 'text-danger'}`}>
              {positiva ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {positiva ? '+' : ''}
              {ind.variacao_pct.toLocaleString('pt-BR')}%
            </span>
            <span className="text-muted">
              vs {formatar(ind.valor_anterior, ind.formato)} anterior
            </span>
          </>
        ) : !ind.depende_do_periodo ? (
          <span className="text-muted font-mono">posição atual</span>
        ) : null}
        {ind.status && ind.status !== 'validado' && (
          <span className="inline-flex items-center gap-1.5 text-amber font-mono">
            <span className="dot dot-aviso" /> a validar
          </span>
        )}
      </div>
    </div>
  )
}
