import type { LucideIcon } from 'lucide-react'
import { Boxes, ChartColumn, FlaskConical, Landmark, Settings, ShoppingCart, Table2 } from 'lucide-react'

/**
 * Menu do BI — FONTE DE VERDADE ÚNICA.
 *
 * A estrutura em abas por área (Comercial, Financeiro, Compras > Estoque) é regra de
 * negócio, não decoração: cada métrica pertence a exatamente uma aba e nada é duplicado
 * entre elas. Quem precisar de um item de menu (sidebar, bottom nav, breadcrumb, atalho)
 * lê daqui — nunca redeclara a lista.
 *
 * Desde a autorização por usuário, cada aba carrega também o RECURSO que a governa —
 * o mesmo identificador do catálogo em backend/app/permissoes.py. É o que liga o menu
 * à permissão: `filtrarAbas()` mostra só o que a pessoa pode abrir.
 *
 * ★ ROTA E RECURSO SÃO COISAS DIFERENTES e por isso são dois campos. A rota
 *   '/compras/estoque' mora dentro do ramo de Compras no menu, mas o recurso dela é
 *   'estoque', uma aba de primeiro nível no catálogo do backend. Derivar um do outro
 *   ("troca a barra por ponto") funcionaria hoje e quebraria no primeiro relatório que
 *   ganhasse rota própria.
 */
export interface Aba {
  para: string
  rotulo: string
  /** Rótulo do bottom nav mobile, onde cada célula tem ~75px. */
  rotuloCurto: string
  Icone: LucideIcon
  /** Recurso do catálogo (backend/app/permissoes.py) que libera esta aba. */
  recurso: string
  /**
   * Aba de administração: aparece só para quem tem papel 'admin'.
   *
   * ★ Não basta olhar a permissão 'configuracoes'. O catálogo permite marcar aquela
   *   caixinha para um gestor, mas as rotas /api/usuarios/* exigem `requer_admin()` —
   *   ou seja, ele veria o item no menu e tomaria 403 ao clicar. Papel é papel.
   */
  somenteAdmin?: boolean
  filhos?: Aba[]
}

export const ABAS: Aba[] = [
  {
    para: '/comercial',
    rotulo: 'Comercial',
    rotuloCurto: 'Comercial',
    Icone: ChartColumn,
    recurso: 'comercial',
  },
  {
    para: '/financeiro',
    rotulo: 'Financeiro',
    rotuloCurto: 'Financeiro',
    Icone: Landmark,
    recurso: 'financeiro',
  },
  {
    para: '/compras',
    rotulo: 'Compras',
    rotuloCurto: 'Compras',
    Icone: ShoppingCart,
    recurso: 'compras',
    filhos: [
      {
        para: '/compras/estoque',
        rotulo: 'Estoque',
        rotuloCurto: 'Estoque',
        Icone: Boxes,
        recurso: 'estoque',
      },
    ],
  },
  {
    para: '/apuracao',
    rotulo: 'Apuração',
    rotuloCurto: 'Apuração',
    Icone: Table2,
    recurso: 'apuracao',
  },
  {
    para: '/analises',
    rotulo: 'Análises',
    rotuloCurto: 'Análises',
    Icone: FlaskConical,
    recurso: 'analises',
  },
  {
    para: '/configuracoes',
    rotulo: 'Configurações',
    rotuloCurto: 'Config.',
    Icone: Settings,
    recurso: 'configuracoes',
    somenteAdmin: true,
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

/**
 * O menu desta pessoa: só as abas que ela pode abrir.
 *
 * ★ FILHO PERMITIDO COM PAI PROIBIDO SOBE PARA O PRIMEIRO NÍVEL. Estoque é filho de
 *   Compras no menu, mas 'estoque' e 'compras' são recursos independentes no catálogo —
 *   quem cuida do depósito costuma receber Estoque sem Compras. Se o filho só existisse
 *   dentro do pai, essa pessoa entraria no BI e veria um menu vazio, com a permissão
 *   dela marcada na tela do dono. Promover é o que faz a caixinha marcada virar
 *   item clicável.
 */
export function filtrarAbas(pode: (recurso: string) => boolean, admin: boolean): Aba[] {
  const visivel = (aba: Aba) => (aba.somenteAdmin ? admin : pode(aba.recurso))
  const saida: Aba[] = []

  for (const aba of ABAS) {
    const filhos = (aba.filhos ?? []).filter(visivel)
    if (visivel(aba)) {
      // `filhos: undefined` e não `[]`: a sidebar usa `!!aba.filhos` para decidir o
      // `end` do NavLink, e um array vazio é verdadeiro — o pai deixaria de acender
      saida.push({ ...aba, filhos: filhos.length ? filhos : undefined })
    } else {
      saida.push(...filhos.map((f) => ({ ...f })))
    }
  }
  return saida
}

/**
 * Para onde a raiz '/' manda esta pessoa.
 *
 * Segue a ordem do menu, que é a ordem de importância: Comercial é a porta de entrada
 * de quem tem tudo, e quem só tem uma aba cai direto nela (o vendedor restrito à própria
 * carteira entra no BI já no relatório que interessa a ele). `null` = a pessoa não tem
 * nenhuma aba — caso raro, mas real logo depois de criar um usuário sem marcar nada,
 * e a tela precisa dizer isso em vez de piscar entre rotas.
 */
export function rotaInicial(abas: Aba[]): string | null {
  return abas[0]?.para ?? null
}

/**
 * Classe de grid do bottom nav mobile para N abas.
 *
 * Tabela em vez de `grid-cols-${n}`: o Tailwind varre o CÓDIGO-FONTE atrás de nomes de
 * classe e não executa nada, então a classe montada em tempo de execução simplesmente
 * não existiria no CSS gerado — e a barra inferior viraria uma coluna só no celular de
 * quem tem menos abas.
 */
export function colunasDoMenu(quantidade: number): string {
  const tabela: Record<number, string> = {
    1: 'grid-cols-1',
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
    5: 'grid-cols-5',
    6: 'grid-cols-6',
  }
  return tabela[Math.min(Math.max(quantidade, 1), 6)] ?? 'grid-cols-5'
}
