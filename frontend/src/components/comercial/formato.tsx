import { brl, brlExato, inteiro } from '../../lib/format'

/**
 * Formatadores da aba Comercial.
 *
 * Um lugar só para as regras de escrita do número — mês, moeda, percentual e
 * variação. Espalhá-las pelos componentes é como o mesmo faturamento acaba
 * aparecendo "R$ 416.379" num card e "416378,65" no outro.
 */

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

const MESES_LONGOS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

/** '2026-06' -> 'jun/26'. Rótulo de eixo: precisa caber em ~40px. */
export function mesCurto(mes: string): string {
  const [ano, m] = (mes ?? '').split('-')
  const i = Number(m) - 1
  if (!ano || !MESES[i]) return mes ?? ''
  return `${MESES[i]}/${ano.slice(2)}`
}

/** '2026-06' -> 'junho/2026'. Rótulo de título e tooltip. */
export function mesLongo(mes: string): string {
  const [ano, m] = (mes ?? '').split('-')
  const i = Number(m) - 1
  if (!ano || !MESES_LONGOS[i]) return mes ?? ''
  return `${MESES_LONGOS[i]}/${ano}`
}

/** Mês corrente no fuso LOCAL — nunca via toISOString(), que vira o dia à noite. */
export function mesDeHoje(): string {
  const h = new Date()
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}`
}

export function moeda(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? '—' : brl.format(v)
}

export function moedaExata(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? '—' : brlExato.format(v)
}

/** Milhares sem o prefixo — para célula de matriz, onde "R$" repetido 96 vezes é ruído. */
export function milCurto(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v) || v === 0) return '—'
  if (Math.abs(v) >= 1000) return `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}

export function pct(v: number | null | undefined, casas = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  return `${v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`
}

export function numero(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? '—' : inteiro.format(v)
}

/** Variação com sinal explícito: '+12,3%'. O '−' é o traço de menos, não hífen. */
export function variacao(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  const n = Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
  return `${v >= 0 ? '+' : '−'}${n}%`
}

/** Data ISO -> dd/mm/aaaa, sem passar por Date (que aplica fuso e volta um dia). */
export function dataBr(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return a && m && d ? `${d}/${m}/${a}` : iso
}

/** Plural simples: 1 cliente / 2 clientes. */
export function plural(n: number, um: string, muitos: string): string {
  return `${inteiro.format(n)} ${n === 1 ? um : muitos}`
}
