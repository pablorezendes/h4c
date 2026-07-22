import type { LucideIcon } from 'lucide-react'
import { Boxes, ChartColumn, FlaskConical, Landmark, ShoppingCart, Table2 } from 'lucide-react'

/**
 * Menu do BI — FONTE DE VERDADE ÚNICA.
 *
 * A estrutura em abas por área (Comercial, Financeiro, Compras > Estoque) é regra de
 * negócio, não decoração: cada métrica pertence a exatamente uma aba e nada é duplicado
 * entre elas. Quem precisar de um item de menu (sidebar, bottom nav, breadcrumb, atalho)
 * lê daqui — nunca redeclara a lista.
 */
export interface Aba {
  para: string
  rotulo: string
  /** Rótulo do bottom nav mobile, onde cada célula tem ~75px. */
  rotuloCurto: string
  Icone: LucideIcon
  filhos?: Aba[]
}

export const ABAS: Aba[] = [
  {
    para: '/comercial',
    rotulo: 'Comercial',
    rotuloCurto: 'Comercial',
    Icone: ChartColumn,
  },
  {
    para: '/financeiro',
    rotulo: 'Financeiro',
    rotuloCurto: 'Financeiro',
    Icone: Landmark,
  },
  {
    para: '/compras',
    rotulo: 'Compras',
    rotuloCurto: 'Compras',
    Icone: ShoppingCart,
    filhos: [
      { para: '/compras/estoque', rotulo: 'Estoque', rotuloCurto: 'Estoque', Icone: Boxes },
    ],
  },
  {
    para: '/apuracao',
    rotulo: 'Apuração',
    rotuloCurto: 'Apuração',
    Icone: Table2,
  },
  {
    para: '/analises',
    rotulo: 'Análises',
    rotuloCurto: 'Análises',
    Icone: FlaskConical,
  },
]

/** Pai + filhos numa lista só — para casar rota com aba. */
export const ABAS_PLANAS: Aba[] = ABAS.flatMap((a) => [a, ...(a.filhos ?? [])])

/** A rota está dentro do ramo da aba? '/compras/estoque' está no ramo '/compras'. */
export function noRamo(pathname: string, para: string): boolean {
  return pathname === para || pathname.startsWith(`${para}/`)
}

/**
 * Aba correspondente à rota. Casa a mais específica primeiro: sem isso
 * '/compras/estoque' cairia em '/compras' e a sub-aba nunca se marcaria ativa.
 */
export function abaAtiva(pathname: string): Aba | undefined {
  return [...ABAS_PLANAS]
    .sort((a, b) => b.para.length - a.para.length)
    .find((a) => noRamo(pathname, a.para))
}
