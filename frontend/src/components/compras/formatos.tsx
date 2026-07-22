import type { ReactNode } from 'react'
import type { AlertaVariacao, Classe } from './tipos'

/**
 * Formatos e selos das abas Compras e Estoque.
 *
 * A unidade aqui é a caixa/fardo do cadastro, não o real: quem lê estas telas é o
 * comprador, e ele decide em quantidade. O valor entra como consequência.
 */

/** Quantidade com até uma casa — 52 fica "52", 7,25 fica "7,3". */
export function un(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
}

/** Demanda diária tem casas: 0,4 caixa/dia é informação, 0 é ruído. */
export function taxa(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })
}

/** Cobertura em dias. Null = sem demanda no mês fechado, e é diferente de zero. */
export function dias(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} d`
}

export function pct(v: number | null | undefined, casas = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  return `${v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`
}

/** Variação com sinal explícito — o comprador precisa ver a direção antes do número. */
export function variacao(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  const sinal = v > 0 ? '+' : ''
  return `${sinal}${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`
}

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="text-muted text-sm font-mono py-6 text-center">{children}</p>
}

export function Esqueleto({ altura = 'h-24' }: { altura?: string }) {
  return <div className={`skeleton w-full ${altura}`} />
}

export function Nota({ children }: { children: ReactNode }) {
  return <p className="text-muted text-xs mt-3 leading-relaxed">{children}</p>
}

/**
 * Selo da classe ABC. A curva A é a que tem meta de suprimento (45 dias) e por isso
 * é a única com cor cheia — B e C ficam discretas para não competir com ela.
 */
const CLASSE_ESTILO: Record<string, string> = {
  A: 'bg-primary text-white border-primary-strong',
  B: 'bg-primary-wash text-ink-soft border-line',
  C: 'bg-floor text-muted border-line',
}

export function SeloClasse({ classe }: { classe: Classe }) {
  if (!classe) return <span className="text-muted font-mono text-[11px]">—</span>
  return (
    <span
      className={`inline-flex items-center justify-center w-5 h-5 rounded-sm border font-mono text-[11px] font-bold ${CLASSE_ESTILO[classe]}`}
      title={classe === 'A' ? 'Curva A — meta de 45 dias de suprimento' : `Curva ${classe}`}
    >
      {classe}
    </span>
  )
}

/**
 * Selo de variação brusca de demanda.
 * ★ O corte de ±50% só vale para item de curva A ou B: sem esse filtro, jun x mai
 *   acusava 245 alertas em 316 produtos (um item que foi de 1 para 2 unidades vira
 *   "+100%") e o comprador aprendia a ignorar a tela inteira.
 */
const ALERTA_ESTILO: Record<string, { classe: string; texto: string; dica: string }> = {
  salto: {
    classe: 'text-danger',
    texto: 'salto',
    dica: 'demanda subiu mais de 50% contra o mês anterior — risco de ruptura',
  },
  queda: {
    classe: 'text-amber',
    texto: 'queda',
    dica: 'demanda caiu mais de 50% contra o mês anterior — risco de estoque parado',
  },
  novo: { classe: 'text-primary', texto: 'novo', dica: 'não tinha venda no mês anterior' },
  parou: { classe: 'text-amber', texto: 'parou', dica: 'vendia no mês anterior e parou no mês fechado' },
}

export function SeloAlerta({ alerta }: { alerta: AlertaVariacao }) {
  if (!alerta) return null
  const e = ALERTA_ESTILO[alerta]
  if (!e) return null
  return (
    <span className={`chip border border-line font-semibold ${e.classe}`} title={e.dica}>
      {e.texto}
    </span>
  )
}

/**
 * Selo de status da sugestão de compra. A ordem de gravidade é a mesma da ordenação
 * que o backend entrega: ruptura > comprar agora > abaixo da meta > ok.
 */
const STATUS_ESTILO: Record<string, { classe: string; dot: string }> = {
  ruptura: { classe: 'text-danger font-semibold', dot: 'dot-erro' },
  'comprar agora': { classe: 'text-danger font-semibold', dot: 'dot-erro' },
  'abaixo da meta': { classe: 'text-amber font-semibold', dot: 'dot-aviso' },
  ok: { classe: 'text-emerald', dot: 'dot-ativo' },
}

export function SeloStatus({ status }: { status: string }) {
  const e = STATUS_ESTILO[status] ?? { classe: 'text-muted', dot: 'bg-line-strong' }
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-[11px] whitespace-nowrap ${e.classe}`}>
      <span className={`dot ${e.dot}`} aria-hidden />
      {status}
    </span>
  )
}
