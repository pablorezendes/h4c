import type { ReactNode } from 'react'

/**
 * Formatos e peças pequenas da aba Financeiro.
 *
 * Prazo aqui é sempre média PONDERADA pelo valor — nunca contagem de dias inteira.
 * Arredondar para inteiro apagaria justamente o que o dono quer ver: prometer 22,6 e
 * receber em 29,8 vira "23 contra 30" e o descompasso perde a precisão da conversa.
 */
export function dias(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  return `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} d`
}

/** Só o número de dias, sem unidade — para frases corridas. */
export function diasNum(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

export function pct(v: number | null | undefined, casas = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  return `${v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`
}

const MESES = ['', 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** '2026-06' -> 'jun/26'. Eixo de série mensal não comporta o mês por extenso. */
export function mesCurto(mes: string): string {
  const [ano, m] = String(mes).split('-')
  const n = Number(m)
  if (!ano || !n) return String(mes)
  return `${MESES[n]}/${ano.slice(2)}`
}

/** Data ISO -> dd/mm/aaaa, sem passar por Date (que desloca fuso). */
export function dataBr(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [a, m, d] = String(iso).slice(0, 10).split('-')
  return d ? `${d}/${m}/${a}` : String(iso)
}

/**
 * Estado vazio/erro de uma seção.
 * ★ O padrão da tela é nunca sumir sem explicação: endpoint fora do ar vira aviso
 *   discreto no lugar do conteúdo, e o resto da página continua de pé.
 */
export function Vazio({ children }: { children: ReactNode }) {
  return <p className="text-muted text-sm font-mono py-6 text-center">{children}</p>
}

/** Bloco de carregamento com a mesma altura do conteúdo que vai substituí-lo. */
export function Esqueleto({ altura = 'h-24' }: { altura?: string }) {
  return <div className={`skeleton w-full ${altura}`} />
}

/** Nota de rodapé — a explicação que impede o número de ser lido errado. */
export function Nota({ children }: { children: ReactNode }) {
  return <p className="text-muted text-xs mt-3 leading-relaxed">{children}</p>
}
