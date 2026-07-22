import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Info,
  Plus,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import BotaoExportar from './BotaoExportar'
import { filtroQuery, type Filtro } from './FiltroBar'
import MultiSelecao from './MultiSelecao'
import { api } from '../lib/api'
import type { Dimensao, Opcao } from '../lib/dimensoes'
import { brlExato } from '../lib/format'
import {
  criterioDaOrdenacao,
  descricaoClasse,
  formatarAcumulado,
  formatarPercentual,
  formatarQuantidade,
  ordenarPor,
  planoDaCurva,
  recalcularCurva,
  resumoClasses,
  rotuloClasse,
  type Direcao,
} from '../lib/abc'

/**
 * Apuração de Faturamento — a tela que substitui a rotina 1464 do Winthor.
 *
 * Não são 29 telas: é UM relatório com dimensões configuráveis. Os tipos da 1464 viram
 * presets nomeados sobre o mesmo motor, e o gestor compõe qualquer drill-down até 5
 * níveis. A meta declarada pelo dono é parar de abrir a 1464, exportar Excel e mandar
 * para uma IA externa — por isso a tela é feita para ser operada rápido (preset em um
 * clique, chip para trocar o nível) e exportada em um clique.
 *
 * ★ NÃO EXISTE BOTÃO PARA DESLIGAR A DEDUÇÃO DE DEVOLUÇÃO. Faturamento aqui é sempre
 *   líquido; o bruto viaja numa coluna secundária, rotulada "sem dedução", e quem
 *   procurar o botão encontra a nota explicando que a dedução é parte da medida.
 *
 * ★ A curva ABC e o acumulado vêm PRONTOS do backend, calculados sobre o conjunto
 *   inteiro. A tela só recalcula quando o próprio usuário reordena por valor ou
 *   quantidade E a resposta veio inteira — com `meta.truncado_em` preenchido a
 *   classificação canônica é preservada e o rodapé por classe não é publicado, porque
 *   ele seria um número de relatório apurado sobre um recorte. Ver lib/abc.ts.
 *
 * ★ FILTROS: RCA e Departamento vêm do FiltroBar global (valem em todas as abas); os
 *   demais recortes da aba F4 da 1464 moram aqui, num bloco recolhível. Onze filtros
 *   empilhados na barra do topo seriam exatamente a poluição que o dono pediu para
 *   evitar — fechado, o bloco mostra só o que está aplicado e quantos são.
 */

// ---------------------------------------------------------------------------
// Contratos do backend
// ---------------------------------------------------------------------------

interface ItemDimensao {
  campo: string
  rotulo: string
  valores_distintos?: number
  so_na_nota?: boolean
}

interface Preset {
  id: string
  rotulo: string
  dimensoes: string[]
  aba?: string
  tipo_1464?: number | null
  prioridade?: number | null
  obs?: string | null
}

interface NaoImplementada {
  tipos_1464?: number[] | null
  rotulo: string
  motivo: string
}

interface Catalogo {
  dimensoes: ItemDimensao[]
  presets: Preset[]
  ordenacoes: { id: string; rotulo: string }[]
  nao_implementadas?: NaoImplementada[]
  regra?: string
}

interface MetaApuracao {
  total_liquido?: number
  total_bruto?: number
  total_devolucao?: number
  total_custo?: number
  devolucao_pct?: number | null
  margem_pct?: number | null
  linhas?: number
  truncado_em?: number | null
  dimensoes?: string[]
  ordenar?: string
  limite?: number
  periodo?: { dt_ini: string; dt_fim: string; fechado: boolean }
  abc?: { criterio?: string; linhas_na_curva?: number; linhas_fora_da_curva?: number; base_curva?: number; nota?: string }
  devolucao_sem_vinculo?: number
  sem_vinculo?: { aplicavel?: boolean; dimensoes?: string[]; liquido?: number; rotulo?: string; nota?: string }
  medida?: string
}

interface LinhaApuracao {
  quantidade: number
  bruto: number
  devolucao: number
  liquido: number
  custo: number
  margem_pct: number | null
  share_pct: number | null
  acumulado_pct: number | null
  classe_abc: string | null
  [campo: string]: unknown
}

interface Resposta {
  colunas: { campo: string; rotulo: string; tipo: string }[]
  rows: LinhaApuracao[]
  meta: MetaApuracao
}

// ---------------------------------------------------------------------------
// Rótulos locais
// ---------------------------------------------------------------------------

/**
 * Rótulos das dimensões em português acentuado. O catálogo do backend manda os mesmos
 * nomes sem acento (convenção dos .py); aqui eles ganham a grafia da tela. Serve
 * também de CATÁLOGO DE EMERGÊNCIA: se /dimensoes cair, o compositor continua de pé.
 */
const ROTULO_DIM: Record<string, string> = {
  rca: 'RCA',
  cliente: 'Cliente',
  produto: 'Produto',
  departamento: 'Departamento',
  secao: 'Seção',
  fornecedor: 'Fornecedor',
  marca: 'Marca',
  ramo: 'Ramo de atividade',
  praca: 'Praça',
  uf: 'UF',
  municipio: 'Município',
  plano_pagamento: 'Plano de pagamento',
  origem_venda: 'Origem da venda',
}

/** Presets prioritários — os que o dono emite hoje. Fallback quando o catálogo falha. */
const PRESETS_MINIMOS: Preset[] = [
  { id: 'cliente_produto', rotulo: 'Cliente / Produto', dimensoes: ['cliente', 'produto'], tipo_1464: 12, prioridade: 1 },
  { id: 'rca', rotulo: 'RCA', dimensoes: ['rca'], tipo_1464: 5, prioridade: 2 },
  { id: 'departamento', rotulo: 'Departamento', dimensoes: ['departamento'], tipo_1464: 10, prioridade: 3 },
  { id: 'fornecedor', rotulo: 'Fornecedor', dimensoes: ['fornecedor'], tipo_1464: 3, prioridade: 4 },
  { id: 'prazo', rotulo: 'Por Prazo (plano de pagamento)', dimensoes: ['plano_pagamento'], tipo_1464: 14, prioridade: 5 },
]

const ORDENACOES_MINIMAS = [
  { id: 'abc_valor', rotulo: 'Curva ABC por valor' },
  { id: 'abc_quantidade', rotulo: 'Curva ABC por quantidade' },
  { id: 'alfabetica', rotulo: 'Alfabética' },
]

const ROTULO_ORDEM_CURTO: Record<string, string> = {
  abc_valor: 'ABC valor',
  abc_quantidade: 'ABC quantidade',
  alfabetica: 'Alfabética',
}

// ---------------------------------------------------------------------------
// Filtros da aba F4 da 1464 que não são globais
// ---------------------------------------------------------------------------

interface FiltroExtra {
  /** Nome do parâmetro na querystring — o MESMO do backend (apuracao.FILTROS). */
  id: string
  rotulo: string
  rotuloTodos: string
  /** Endpoint da lista de valores. */
  caminho: string
  mapear: (l: Record<string, unknown>) => Opcao
}

/**
 * ★ SÓ ENTRA FILTRO COM LISTA DE VALORES PUBLICADA. O backend aceita e valida nove
 *   filtros além de RCA e Departamento, mas as opções precisam vir de algum lugar: Seção,
 *   Fornecedor, Marca, Ramo e Plano de pagamento têm endpoint em /api/meta (42, 70, 31,
 *   41 e 29 opções medidas na produção em 2026-07-21, já restritas a quem teve venda).
 *   Cliente, Praça, UF e Origem da venda não têm — /api/apuracao/dimensoes publica o NOME
 *   do filtro, nunca os valores. Inventar a lista na tela é pior que não oferecer o
 *   filtro: o usuário não teria como saber que o item que procura ficou de fora. As
 *   quatro continuam disponíveis como NÍVEL DE AGRUPAMENTO, que a tela sabe entregar.
 *
 * Rede de clientes, Supervisor, Gerente, Filial, Emitente, Comprador, Distribuição,
 * Produto Principal e Cliente Principal ficam fora por decisão MEDIDA (ver
 * `nao_implementadas` do catálogo e o cabeçalho de routers/meta.py): nesta base cada um
 * tem valor único ou vem vazio, e filtro que não separa nada só ocupa a tela.
 */
const FILTROS_EXTRAS: FiltroExtra[] = [
  {
    id: 'secoes',
    rotulo: 'Seção',
    rotuloTodos: 'Todas as seções',
    caminho: '/api/meta/secoes',
    mapear: (l) => ({ valor: Number(l.codsec), rotulo: String(l.descricao ?? `Seção ${l.codsec}`) }),
  },
  {
    id: 'fornecedores',
    rotulo: 'Fornecedor',
    rotuloTodos: 'Todos os fornecedores',
    caminho: '/api/meta/fornecedores',
    mapear: (l) => ({ valor: Number(l.codfornec), rotulo: String(l.fornecedor ?? `Fornecedor ${l.codfornec}`) }),
  },
  {
    id: 'marcas',
    rotulo: 'Marca',
    rotuloTodos: 'Todas as marcas',
    caminho: '/api/meta/marcas',
    mapear: (l) => ({ valor: Number(l.codmarca), rotulo: String(l.descricao ?? `Marca ${l.codmarca}`) }),
  },
  {
    id: 'ramos',
    rotulo: 'Ramo de atividade',
    rotuloTodos: 'Todos os ramos',
    caminho: '/api/meta/ramos',
    mapear: (l) => ({ valor: Number(l.codativ), rotulo: String(l.descricao ?? `Ramo ${l.codativ}`) }),
  },
  {
    id: 'planos',
    rotulo: 'Plano de pagamento',
    rotuloTodos: 'Todos os planos',
    caminho: '/api/meta/planos-pagamento',
    mapear: (l) => ({ valor: Number(l.codplpag), rotulo: String(l.descricao ?? `Plano ${l.codplpag}`) }),
  },
]

const SEM_OPCOES: Dimensao = { opcoes: [], carregando: false, erro: false }

/** Resolvidas nesta sessão: reabrir o bloco não pisca nem repete as requisições. */
const CACHE_OPCOES = new Map<string, Opcao[]>()

function opcoesIniciais(): Record<string, Dimensao> {
  const out: Record<string, Dimensao> = {}
  for (const f of FILTROS_EXTRAS) {
    const pronto = CACHE_OPCOES.get(f.caminho)
    out[f.id] = pronto ? { opcoes: pronto, carregando: false, erro: false } : SEM_OPCOES
  }
  return out
}

/**
 * Listas de apoio dos filtros extras — mesma disciplina de lib/dimensoes.ts, mas
 * carregadas SÓ quando o bloco "mais filtros" é aberto pela primeira vez: quem só emite
 * o relatório não paga cinco requisições de cadastro.
 *
 * ★ Falha de lista nunca derruba a tela: o MultiSelecao aparece desabilitado como
 *   "indisponível" e a apuração continua respondendo com os filtros que sobraram.
 */
function useOpcoesExtras(ativo: boolean): Record<string, Dimensao> {
  const [estado, setEstado] = useState<Record<string, Dimensao>>(opcoesIniciais)

  useEffect(() => {
    if (!ativo) return
    let vivo = true
    for (const f of FILTROS_EXTRAS) {
      if (CACHE_OPCOES.has(f.caminho)) continue
      setEstado((e) => ({ ...e, [f.id]: { opcoes: [], carregando: true, erro: false } }))
      api<Record<string, unknown>[]>(f.caminho)
        .then((linhas) => {
          const opcoes = (Array.isArray(linhas) ? linhas : [])
            .map(f.mapear)
            .filter((o) => Number.isFinite(o.valor))
          CACHE_OPCOES.set(f.caminho, opcoes)
          if (vivo) setEstado((e) => ({ ...e, [f.id]: { opcoes, carregando: false, erro: false } }))
        })
        .catch(() => {
          // não cacheia falha: reabrir o bloco tenta de novo
          if (vivo) setEstado((e) => ({ ...e, [f.id]: { opcoes: [], carregando: false, erro: true } }))
        })
    }
    return () => {
      vivo = false
    }
  }, [ativo])

  return estado
}

type TipoColuna = 'moeda' | 'numero' | 'percentual' | 'classe'

interface ColunaMedida {
  campo: string
  rotulo: string
  /** Cabeçalho da planilha — explícito, porque o Excel sai do contexto da tela. */
  rotuloLongo: string
  tipo: TipoColuna
  dica: string
  /** Segunda linha do cabeçalho — a ressalva que não pode viver só no tooltip. */
  sub?: string
  /** Zero vira "—": coluna que quase sempre é zero não pode virar ruído visual. */
  zeroVazio?: boolean
}

const MEDIDAS: ColunaMedida[] = [
  {
    campo: 'quantidade',
    rotulo: 'Quantidade',
    rotuloLongo: 'Quantidade líquida',
    tipo: 'numero',
    dica: 'Quantidade vendida menos a devolvida no período',
  },
  {
    campo: 'bruto',
    rotulo: 'Bruto',
    rotuloLongo: 'Bruto (sem dedução de devolução)',
    tipo: 'moeda',
    sub: 'sem dedução',
    dica: 'Venda faturada SEM dedução de devolução. Coluna secundária — o número do BI é o líquido',
  },
  {
    campo: 'devolucao',
    rotulo: 'Devolução',
    rotuloLongo: 'Devolução',
    tipo: 'moeda',
    dica: 'Devolução de cliente atribuída a esta linha',
    zeroVazio: true,
  },
  {
    campo: 'liquido',
    rotulo: 'Líquido',
    rotuloLongo: 'Faturamento líquido',
    tipo: 'moeda',
    dica: 'Faturamento líquido = venda menos devolução. É a medida do BI',
  },
  {
    campo: 'custo',
    rotulo: 'Custo',
    rotuloLongo: 'Custo',
    tipo: 'moeda',
    dica: 'Custo das vendas líquidas — a devolução abate receita e custo',
  },
  {
    campo: 'margem_pct',
    rotulo: 'Margem',
    rotuloLongo: 'Margem %',
    tipo: 'percentual',
    dica: 'Margem de contribuição sobre o líquido, antes de imposto e frete',
  },
  {
    campo: 'share_pct',
    rotulo: 'Particip.',
    rotuloLongo: 'Participação %',
    tipo: 'percentual',
    dica: 'Participação da linha no faturamento líquido total do relatório',
  },
  {
    campo: 'acumulado_pct',
    rotulo: 'Acumulado',
    rotuloLongo: 'Acumulado %',
    tipo: 'percentual',
    dica: 'Acumulado da curva ABC, de cima para baixo — só é lido na ordem da curva',
  },
  {
    campo: 'classe_abc',
    rotulo: 'Curva',
    rotuloLongo: 'Curva ABC',
    tipo: 'classe',
    dica: 'A = primeiros 80% do acumulado · B = até 95% · C = a cauda',
  },
]

const MAX_DIMENSOES = 5
const LIMITE_PADRAO = 2000
const LIMITE_MAX = 20000

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------

/** Sempre com centavos: este relatório é conferido linha a linha contra a 1464. */
function moeda(valor: unknown, zeroVazio = false): string {
  const v = Number(valor)
  if (!Number.isFinite(v)) return '—'
  if (zeroVazio && v === 0) return '—'
  return brlExato.format(v)
}

function numeroSimples(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—'
  return Number(valor).toLocaleString('pt-BR')
}

function rotuloDimensao(campo: string, catalogo: Catalogo | null): string {
  if (ROTULO_DIM[campo]) return ROTULO_DIM[campo]
  return catalogo?.dimensoes.find((d) => d.campo === campo)?.rotulo ?? campo
}

// ---------------------------------------------------------------------------
// Peças da tela
// ---------------------------------------------------------------------------

/** Selo da classe. Cor NUNCA sozinha: a letra é a informação, a cor só reforça. */
function SeloCurva({ valor }: { valor: unknown }) {
  const cor = valor === 'A' ? 'text-primary font-bold' : valor === 'B' ? 'text-ink-soft' : 'text-muted'
  return (
    <span className={`font-mono text-xs ${cor}`} title={descricaoClasse(valor)}>
      {rotuloClasse(valor)}
    </span>
  )
}

function ChipDimensao({
  rotulo,
  posicao,
  total,
  aviso,
  onMover,
  onRemover,
}: {
  rotulo: string
  posicao: number
  total: number
  aviso?: string
  onMover: (delta: number) => void
  onRemover: () => void
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-sm border border-line bg-floor pl-2 pr-1 py-1"
      title={aviso}
    >
      <span className="font-mono text-[10px] text-muted">{posicao + 1}</span>
      <span className="text-sm text-ink-soft whitespace-nowrap">{rotulo}</span>
      {aviso && <Info className="w-3 h-3 text-amber shrink-0" strokeWidth={2} />}
      <button
        type="button"
        onClick={() => onMover(-1)}
        disabled={posicao === 0}
        aria-label={`Subir ${rotulo}`}
        className="p-1 text-muted hover:text-ink disabled:opacity-30 disabled:hover:text-muted"
      >
        <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2} />
      </button>
      <button
        type="button"
        onClick={() => onMover(1)}
        disabled={posicao === total - 1}
        aria-label={`Descer ${rotulo}`}
        className="p-1 text-muted hover:text-ink disabled:opacity-30 disabled:hover:text-muted"
      >
        <ChevronRight className="w-3.5 h-3.5" strokeWidth={2} />
      </button>
      <button
        type="button"
        onClick={onRemover}
        disabled={total <= 1}
        aria-label={`Remover ${rotulo} do agrupamento`}
        title={total <= 1 ? 'O relatório precisa de ao menos um nível' : `Remover ${rotulo}`}
        className="p-1 text-muted hover:text-danger disabled:opacity-30 disabled:hover:text-muted"
      >
        <X className="w-3.5 h-3.5" strokeWidth={2} />
      </button>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export default function ApuracaoFaturamento({ filtro }: { filtro: Filtro }) {
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null)
  const [catalogoFalhou, setCatalogoFalhou] = useState(false)

  const [dims, setDims] = useState<string[]>(['cliente', 'produto'])
  const [ordenar, setOrdenar] = useState('abc_valor')
  const [limite, setLimite] = useState(LIMITE_PADRAO)
  const [ordemLocal, setOrdemLocal] = useState<{ campo: string; direcao: Direcao } | null>(null)

  /** Filtros extras da F4 — código selecionado por dimensão; lista vazia = todos. */
  const [extras, setExtras] = useState<Record<string, number[]>>({})
  const [maisFiltros, setMaisFiltros] = useState(false)
  const opcoesExtras = useOpcoesExtras(maisFiltros)

  const [dados, setDados] = useState<Resposta | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  // catálogo: uma vez por montagem. Se cair, a tela segue com os presets mínimos.
  useEffect(() => {
    let vivo = true
    api<Catalogo>('/api/apuracao/dimensoes')
      .then((c) => {
        if (!vivo) return
        setCatalogo(c)
        setCatalogoFalhou(false)
      })
      .catch(() => {
        if (vivo) setCatalogoFalhou(true)
      })
    return () => {
      vivo = false
    }
  }, [])

  /** Vazio = todos, como no FiltroBar: o parâmetro só sai quando há seleção de verdade. */
  const queryExtras = useMemo(() => {
    const p = new URLSearchParams()
    for (const f of FILTROS_EXTRAS) {
      const valores = extras[f.id]
      if (valores?.length) p.set(f.id, valores.join(','))
    }
    const q = p.toString()
    return q ? `&${q}` : ''
  }, [extras])

  const consulta = useMemo(
    () =>
      `/api/apuracao?${filtroQuery(filtro)}&dimensoes=${encodeURIComponent(dims.join(','))}` +
      `&ordenar=${encodeURIComponent(ordenar)}&limite=${limite}${queryExtras}`,
    [filtro, dims, ordenar, limite, queryExtras],
  )

  useEffect(() => {
    let vivo = true
    const ctrl = new AbortController()
    setCarregando(true)
    api<Resposta>(consulta, { signal: ctrl.signal })
      .then((r) => {
        if (!vivo) return
        setDados(r)
        setErro(null)
      })
      .catch((e: unknown) => {
        // o abort da troca de preset não é erro: a próxima resposta já está a caminho
        if (!vivo || (e instanceof Error && e.name === 'AbortError')) return
        setDados(null)
        setErro(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (vivo) setCarregando(false)
      })
    return () => {
      vivo = false
      ctrl.abort()
    }
  }, [consulta])

  const presets = catalogo?.presets?.length ? catalogo.presets : PRESETS_MINIMOS
  const ordenacoes = catalogo?.ordenacoes?.length ? catalogo.ordenacoes : ORDENACOES_MINIMAS
  const dimensoesDisponiveis: ItemDimensao[] = catalogo?.dimensoes?.length
    ? catalogo.dimensoes
    : Object.keys(ROTULO_DIM).map((campo) => ({ campo, rotulo: ROTULO_DIM[campo] }))

  const destaques = presets.filter((p) => p.prioridade).sort((a, b) => (a.prioridade ?? 99) - (b.prioridade ?? 99))
  const demais = presets.filter((p) => !p.prioridade)

  const meta = dados?.meta ?? {}
  const criterio = criterioDaOrdenacao(ordenar)
  const truncado = meta.truncado_em ?? null

  /**
   * ★ COM RESPOSTA TRUNCADA A TELA NÃO REFAZ A CURVA NEM FECHA O RODAPÉ POR CLASSE.
   *   Os dois números são de nível de relatório e sairiam de um recorte — a decisão mora
   *   em `planoDaCurva`, com os desvios medidos.
   */
  const plano = useMemo(
    () => planoDaCurva(ordenar, ordemLocal, truncado !== null),
    [ordenar, ordemLocal, truncado],
  )

  /**
   * Linhas exibidas. A ordem do servidor é a canônica; a reordenação local por valor ou
   * quantidade refaz a curva (mesmo cálculo do backend) quando a resposta veio inteira, e
   * qualquer outro caso só reordena — a classe continua sendo a da curva canônica.
   */
  const linhas = useMemo(() => {
    const rows = dados?.rows ?? []
    if (!ordemLocal) return rows
    if (plano.recalcular) return recalcularCurva(rows, plano.recalcular)
    return ordenarPor(rows, ordemLocal.campo, ordemLocal.direcao)
  }, [dados, ordemLocal, plano])

  /** null = a tela não tem o relatório inteiro, então não há resumo por classe a publicar. */
  const resumo = useMemo(
    () => (plano.resumoFechaRelatorio ? resumoClasses(linhas) : null),
    [linhas, plano.resumoFechaRelatorio],
  )

  const dimsExibidas = meta.dimensoes?.length ? meta.dimensoes : dims

  /** Planilha com os rótulos longos: fora da tela ninguém lembra o que era "Particip.". */
  const linhasExcel = useMemo(() => {
    return linhas.map((r) => {
      const saida: Record<string, unknown> = {}
      for (const campo of dimsExibidas) {
        const cod = r[`${campo}_cod`]
        if (cod !== undefined && cod !== null) saida[`Cód. ${rotuloDimensao(campo, catalogo)}`] = cod
        saida[rotuloDimensao(campo, catalogo)] = r[campo] ?? ''
      }
      for (const m of MEDIDAS) saida[m.rotuloLongo] = r[m.campo] ?? ''
      return saida
    })
  }, [linhas, dimsExibidas, catalogo])

  /** Filtros extras com seleção — fechado, o bloco mostra só estes. */
  const extrasAtivos = FILTROS_EXTRAS.filter((f) => (extras[f.id]?.length ?? 0) > 0)
  const globaisAtivos = [
    filtro.rcas.length ? 'RCA' : null,
    filtro.deptos.length ? 'Departamento' : null,
  ].filter((r): r is string => r !== null)
  const totalFiltros = extrasAtivos.length + globaisAtivos.length

  // fora da tela ninguém lembra que o relatório saiu filtrado — o nome do arquivo diz
  const nomeArquivo =
    `Apuracao ${dimsExibidas.map((d) => rotuloDimensao(d, catalogo)).join(' x ')} ` +
    `${filtro.dt_ini} a ${filtro.dt_fim}` +
    (totalFiltros ? ` - ${totalFiltros} filtro${totalFiltros === 1 ? '' : 's'}` : '')

  const aplicarPreset = (p: Preset) => {
    setDims(p.dimensoes.slice(0, MAX_DIMENSOES))
    setOrdemLocal(null)
  }

  const presetAtivo = (p: Preset) =>
    p.dimensoes.length === dims.length && p.dimensoes.every((d, i) => d === dims[i])

  const moverDim = (i: number, delta: number) => {
    const destino = i + delta
    if (destino < 0 || destino >= dims.length) return
    const copia = [...dims]
    ;[copia[i], copia[destino]] = [copia[destino], copia[i]]
    setDims(copia)
    setOrdemLocal(null)
  }

  const removerDim = (campo: string) => {
    if (dims.length <= 1) return
    setDims(dims.filter((d) => d !== campo))
    setOrdemLocal(null)
  }

  const adicionarDim = (campo: string) => {
    if (!campo || dims.includes(campo) || dims.length >= MAX_DIMENSOES) return
    setDims([...dims, campo])
    setOrdemLocal(null)
  }

  const alternarOrdemLocal = (campo: string) => {
    setOrdemLocal((atual) => {
      if (!atual || atual.campo !== campo) return { campo, direcao: 'desc' }
      if (atual.direcao === 'desc') return { campo, direcao: 'asc' }
      return null // terceiro clique devolve a ordem do servidor
    })
  }

  const primeiraCarga = carregando && !dados
  const parcial = meta.periodo?.fechado === false
  const semVinculo = Number(meta.devolucao_sem_vinculo ?? 0)

  /**
   * Quantidade é a única medida sem total vindo do backend. Somamos as linhas exibidas
   * — e só quando o relatório NÃO veio truncado, senão o rodapé mostraria um total que
   * não corresponde às demais colunas (que são do relatório inteiro).
   */
  const totalQuantidade = useMemo(() => {
    if (truncado) return null
    return linhas.reduce((s, r) => s + (Number.isFinite(r.quantidade) ? Number(r.quantidade) : 0), 0)
  }, [linhas, truncado])

  return (
    <div className="flex flex-col gap-5">
      {/* ===== Presets: os tipos da 1464 em um clique ===== */}
      <section className="tile p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3">
          <h2 className="font-display text-lg font-semibold text-ink">Visões prontas</h2>
          <p className="text-muted text-xs">
            os relatórios da rotina 1464, sobre o mesmo motor — o número ao lado é o tipo original
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
          {destaques.map((p) => {
            const ativo = presetAtivo(p)
            return (
              <button
                key={p.id}
                onClick={() => aplicarPreset(p)}
                title={p.obs ?? undefined}
                aria-pressed={ativo}
                className={`tile p-3 text-left transition-all ${ativo ? 'tile-active' : 'opacity-70 hover:opacity-100'}`}
              >
                <span className={`font-mono text-[10px] font-semibold ${ativo ? 'text-primary' : 'text-muted'}`}>
                  {p.tipo_1464 ? `1464 · ${p.tipo_1464}` : 'do BI'}
                </span>
                <p className={`font-display font-semibold text-sm leading-tight mt-1 ${ativo ? 'text-ink' : 'text-ink-soft'}`}>
                  {p.rotulo}
                </p>
              </button>
            )
          })}
        </div>

        {demais.length > 0 && (
          <details className="mt-3">
            <summary className="text-muted text-xs font-mono cursor-pointer hover:text-ink w-fit">
              mais {demais.length} visões
            </summary>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {demais.map((p) => {
                const ativo = presetAtivo(p)
                return (
                  <button
                    key={p.id}
                    onClick={() => aplicarPreset(p)}
                    title={p.obs ?? undefined}
                    aria-pressed={ativo}
                    className={`px-2.5 py-1.5 rounded-sm border text-xs transition-colors ${
                      ativo
                        ? 'border-primary bg-primary-wash text-ink font-semibold'
                        : 'border-line bg-floor text-muted hover:text-ink hover:border-line-strong'
                    }`}
                  >
                    {p.tipo_1464 ? <span className="font-mono text-[10px] mr-1.5">{p.tipo_1464}</span> : null}
                    {p.rotulo}
                  </button>
                )
              })}
            </div>
          </details>
        )}

        {catalogoFalhou && (
          <p className="text-muted text-[11px] font-mono mt-3">
            catálogo de dimensões indisponível — as visões principais continuam funcionando
          </p>
        )}
      </section>

      {/* ===== Composição livre + ordenação + exportação ===== */}
      <section className="tile p-4 sm:p-5 flex flex-col gap-3">
        <div className="flex flex-col lg:flex-row lg:items-start gap-3 lg:gap-6">
          <div className="flex-1 min-w-0">
            <span className="label-caps">Agrupamento</span>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {dims.map((campo, i) => {
                const info = dimensoesDisponiveis.find((d) => d.campo === campo)
                return (
                  <ChipDimensao
                    key={campo}
                    rotulo={rotuloDimensao(campo, catalogo)}
                    posicao={i}
                    total={dims.length}
                    aviso={
                      info?.so_na_nota
                        ? 'Esta dimensão só existe na nota/pedido: a devolução herda o vínculo da venda de origem'
                        : undefined
                    }
                    onMover={(delta) => moverDim(i, delta)}
                    onRemover={() => removerDim(campo)}
                  />
                )
              })}

              {dims.length < MAX_DIMENSOES ? (
                <label className="inline-flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-primary-soft shrink-0" strokeWidth={2} />
                  <span className="sr-only">Adicionar nível de agrupamento</span>
                  <select
                    value=""
                    onChange={(e) => {
                      adicionarDim(e.target.value)
                      e.target.value = ''
                    }}
                    aria-label="Adicionar nível de agrupamento"
                    className="input-dark px-2 py-1.5 text-sm"
                  >
                    <option value="">adicionar nível…</option>
                    {dimensoesDisponiveis
                      .filter((d) => !dims.includes(d.campo))
                      .map((d) => (
                        <option key={d.campo} value={d.campo}>
                          {rotuloDimensao(d.campo, catalogo)}
                          {d.valores_distintos ? ` (${d.valores_distintos})` : ''}
                        </option>
                      ))}
                  </select>
                </label>
              ) : (
                <span className="text-muted text-[11px] font-mono">máximo de {MAX_DIMENSOES} níveis</span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:pt-6">
            <div className="flex gap-1 rounded border border-line bg-floor p-1" role="group" aria-label="Ordenação">
              {ordenacoes.map((o) => {
                const ativo = ordenar === o.id
                return (
                  <button
                    key={o.id}
                    onClick={() => {
                      setOrdenar(o.id)
                      setOrdemLocal(null)
                    }}
                    title={o.rotulo}
                    aria-pressed={ativo}
                    className={`px-3 py-1.5 rounded-sm text-xs font-mono font-semibold whitespace-nowrap transition-colors ${
                      ativo ? 'bg-primary-wash text-ink' : 'text-muted hover:text-ink hover:bg-primary-wash'
                    }`}
                  >
                    {ROTULO_ORDEM_CURTO[o.id] ?? o.rotulo}
                  </button>
                )
              })}
            </div>
            <BotaoExportar nome={nomeArquivo} rows={linhasExcel} />
          </div>
        </div>

        {/* ===== Filtros da F4 além de RCA/Departamento — recolhidos por padrão =====
            Fechado, o bloco só desenha o que está aplicado: onze controles sempre
            visíveis seriam a poluição que o cliente pediu para evitar. O contador
            existe para o gestor nunca ler um relatório filtrado achando que é o todo. */}
        <div className="border-t border-line pt-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <button
              type="button"
              onClick={() => setMaisFiltros((v) => !v)}
              aria-expanded={maisFiltros}
              className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
              {maisFiltros ? 'menos filtros' : 'mais filtros'}
              <ChevronDown
                className={`w-3.5 h-3.5 shrink-0 ${maisFiltros ? 'rotate-180' : ''}`}
                strokeWidth={1.75}
              />
            </button>

            <span
              className={`chip border ${totalFiltros ? 'border-primary text-ink' : 'border-line text-muted'}`}
            >
              {totalFiltros === 0
                ? 'nenhum filtro aplicado'
                : `${totalFiltros} ${totalFiltros === 1 ? 'filtro aplicado' : 'filtros aplicados'}`}
            </span>

            {globaisAtivos.length > 0 && (
              <span className="text-[11px] font-mono text-muted">
                {globaisAtivos.join(' e ')} {globaisAtivos.length === 1 ? 'vem' : 'vêm'} do filtro do topo
              </span>
            )}

            {extrasAtivos.length > 0 && (
              <button
                type="button"
                onClick={() => setExtras({})}
                className="text-muted text-xs hover:text-ink-soft underline"
              >
                limpar os daqui
              </button>
            )}
          </div>

          {(maisFiltros || extrasAtivos.length > 0) && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-3">
              {(maisFiltros ? FILTROS_EXTRAS : extrasAtivos).map((f) => {
                const lista = opcoesExtras[f.id] ?? SEM_OPCOES
                return (
                  <div key={f.id} className="flex flex-col gap-1.5 min-w-0">
                    <span className="label-caps">{f.rotulo}</span>
                    <MultiSelecao
                      opcoes={lista.opcoes}
                      selecionados={extras[f.id] ?? []}
                      onChange={(v) => setExtras((e) => ({ ...e, [f.id]: v }))}
                      rotuloTodos={f.rotuloTodos}
                      rotuloFiltro={f.rotulo}
                      carregando={lista.carregando}
                      erro={lista.erro}
                    />
                  </div>
                )
              })}
            </div>
          )}

          {maisFiltros && (
            <p className="text-muted text-[11px] font-mono">
              nada marcado = todos · combinam entre si e com RCA/Departamento do topo · Cliente, Praça,
              UF e Origem da venda ainda não têm lista de valores publicada e entram como nível de
              agrupamento, não como filtro
            </p>
          )}
        </div>

        {/* a nota que responde "onde desligo a dedução de devolução?" */}
        <details className="border-t border-line pt-3">
          <summary className="inline-flex items-center gap-1.5 text-xs text-muted cursor-pointer hover:text-ink w-fit">
            <Info className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
            Faturamento é sempre líquido de devolução — por que não há como desligar
          </summary>
          <div className="text-sm text-ink-soft mt-2.5 flex flex-col gap-2 max-w-3xl">
            <p>
              A dedução não é um filtro: ela faz parte da medida. Faturamento líquido = venda faturada
              (não cancelada) menos a devolução de cliente do período, na mesma soma. Bruto sem dedução
              gera número maquiado e invalida qualquer comparação mês a mês — a devolução caiu de 10,9%
              em janeiro para 1,0% em junho, então o bruto favorece artificialmente os meses recentes.
            </p>
            <p>
              O bruto continua visível na coluna <span className="font-semibold">Bruto</span>, sempre
              rotulada "sem dedução", ao lado da devolução que foi abatida. Margem, participação e curva
              ABC derivam do líquido.
            </p>
            {catalogo?.regra && <p className="text-muted text-xs">{catalogo.regra}</p>}
            {catalogo?.nao_implementadas?.length ? (
              <div className="mt-1">
                <p className="label-caps mb-1.5">Tipos da 1464 fora do BI, e por quê</p>
                <ul className="flex flex-col gap-1">
                  {catalogo.nao_implementadas.map((n) => (
                    <li key={n.rotulo} className="text-xs text-muted">
                      <span className="text-ink-soft font-semibold">{n.rotulo}</span>
                      {n.tipos_1464?.length ? (
                        <span className="font-mono"> ({n.tipos_1464.join(', ')})</span>
                      ) : null}
                      : {n.motivo}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </details>
      </section>

      {/* ===== Avisos de leitura ===== */}
      {(parcial || truncado || semVinculo !== 0) && (
        <div className="flex flex-col gap-1.5">
          {parcial && (
            <p className="text-xs text-amber font-mono">
              período em aberto (mês corrente): parcial, não compare direto com um mês fechado
            </p>
          )}
          {truncado ? (
            /* "as N maiores" seria mentira na ordenação alfabética, onde o corte é por
               nome: o texto diz em que ordem o relatório foi cortado. */
            <p className="text-xs text-muted font-mono flex flex-wrap items-center gap-2">
              mostrando {numeroSimples(truncado)} de {numeroSimples(meta.linhas)} linhas, cortadas na ordem{' '}
              {ROTULO_ORDEM_CURTO[ordenar] ?? ordenar} — os totais do rodapé continuam sendo os do
              relatório inteiro, e a curva ABC segue a do backend: reordenar a tabela não reclassifica
              sobre o recorte
              {limite < LIMITE_MAX && (
                <button
                  onClick={() => setLimite(LIMITE_MAX)}
                  className="underline hover:text-ink"
                >
                  carregar até {numeroSimples(LIMITE_MAX)}
                </button>
              )}
            </p>
          ) : null}
          {semVinculo !== 0 && (
            <p className="text-xs text-amber font-mono" title={meta.sem_vinculo?.nota}>
              {moeda(semVinculo)} de devolução sem vínculo com a nota de origem — aparece na linha
              "{meta.sem_vinculo?.rotulo ?? 'Devolução sem vínculo'}", nunca é escondida do total
            </p>
          )}
        </div>
      )}

      {/* ===== Tabela ===== */}
      <section className="tile overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 sm:px-5 py-3 border-b border-line">
          <h2 className="font-display text-lg font-semibold text-ink">
            {dimsExibidas.map((d) => rotuloDimensao(d, catalogo)).join(' / ')}
          </h2>
          <p className="text-muted text-xs font-mono">
            {numeroSimples(meta.linhas ?? linhas.length)} linhas · líquido {moeda(meta.total_liquido)} ·
            curva por {criterio === 'quantidade' ? 'quantidade' : 'valor'}
          </p>
        </div>

        {erro && (
          <p className="px-4 sm:px-5 py-8 text-danger text-sm" role="alert">
            {erro}
          </p>
        )}

        {!erro && primeiraCarga && (
          <div className="flex flex-col gap-2 px-4 sm:px-5 py-5">
            <div className="skeleton h-6 w-2/5" />
            <div className="skeleton h-64 w-full" />
            <p className="text-muted text-xs font-mono text-center">apurando no Winthor…</p>
          </div>
        )}

        {!erro && !primeiraCarga && linhas.length === 0 && (
          <p className="px-4 sm:px-5 py-10 text-center text-muted text-sm">
            Nenhum faturamento no período com os filtros aplicados.
          </p>
        )}

        {/* trocar de preset não pisca a tela: a tabela anterior fica esmaecida até a
            resposta nova chegar — quem opera o relatório troca de visão o tempo todo */}
        {!erro && !primeiraCarga && linhas.length > 0 && (
          <div
            className={`overflow-auto max-h-[70vh] ${carregando ? 'opacity-50 transition-opacity' : ''}`}
            aria-busy={carregando}
          >
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead>
                <tr>
                  {dimsExibidas.map((campo, i) => (
                    <th
                      key={campo}
                      scope="col"
                      className={`text-left font-display font-semibold text-ink px-3 py-2 whitespace-nowrap bg-card border-b border-line-strong sticky top-0 ${
                        i === 0 ? 'left-0 z-30 shadow-[1px_0_0_var(--color-line)]' : 'z-20'
                      }`}
                    >
                      <button
                        onClick={() => alternarOrdemLocal(campo)}
                        className="inline-flex items-center gap-1 hover:text-primary"
                        title={`Ordenar por ${rotuloDimensao(campo, catalogo)}`}
                      >
                        {rotuloDimensao(campo, catalogo)}
                        {ordemLocal?.campo === campo &&
                          (ordemLocal.direcao === 'desc' ? (
                            <ArrowDown className="w-3 h-3" strokeWidth={2} />
                          ) : (
                            <ArrowUp className="w-3 h-3" strokeWidth={2} />
                          ))}
                      </button>
                    </th>
                  ))}
                  {MEDIDAS.map((m) => (
                    <th
                      key={m.campo}
                      scope="col"
                      title={m.dica}
                      className="text-right font-display font-semibold text-ink px-3 py-2 whitespace-nowrap bg-card border-b border-line-strong sticky top-0 z-20"
                    >
                      <button
                        onClick={() => alternarOrdemLocal(m.campo)}
                        className="inline-flex flex-col items-end hover:text-primary"
                      >
                        <span className="inline-flex items-center gap-1">
                          {m.rotulo}
                          {ordemLocal?.campo === m.campo &&
                            (ordemLocal.direcao === 'desc' ? (
                              <ArrowDown className="w-3 h-3" strokeWidth={2} />
                            ) : (
                              <ArrowUp className="w-3 h-3" strokeWidth={2} />
                            ))}
                        </span>
                        {m.sub && (
                          <span className="font-sans font-normal text-[10px] text-muted leading-none">{m.sub}</span>
                        )}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {linhas.map((r, i) => {
                  // ★ Fundos SEMPRE opacos: a primeira coluna é fixa e qualquer
                  //   transparência deixaria o conteúdo rolar visível por baixo dela.
                  //   Creme para a curva A (destaque) e sage no hover — cores distintas,
                  //   senão o destaque some justamente na linha sob o cursor.
                  const fundo = r.classe_abc === 'A' ? 'bg-creme' : 'bg-card'
                  return (
                    <tr
                      key={`${i}-${String(r[dimsExibidas[0]] ?? '')}`}
                      className={`group ${fundo} hover:bg-primary-wash transition-colors`}
                    >
                      {dimsExibidas.map((campo, j) => {
                        const cod = r[`${campo}_cod`]
                        const texto = String(r[campo] ?? '—')
                        return (
                          <td
                            key={campo}
                            className={`px-3 py-1.5 border-b border-line text-ink-soft align-top ${
                              j === 0
                                ? `sticky left-0 z-10 ${fundo} group-hover:bg-primary-wash shadow-[1px_0_0_var(--color-line)]`
                                : ''
                            }`}
                          >
                            {/* a largura máxima mora no span, não na célula: max-width em
                                <td> é palpite para o navegador e uma descrição longa de
                                produto empurraria a coluna fixa por cima da tabela */}
                            <span
                              className={`flex items-baseline gap-1.5 ${
                                j === 0 ? 'max-w-[13rem] sm:max-w-[20rem]' : 'max-w-[16rem]'
                              }`}
                            >
                              {cod !== undefined && cod !== null && (
                                <span className="font-mono text-[10px] text-muted shrink-0">{String(cod)}</span>
                              )}
                              <span className="truncate" title={texto}>
                                {texto}
                              </span>
                            </span>
                          </td>
                        )
                      })}

                      <td className="px-3 py-1.5 border-b border-line text-right font-mono whitespace-nowrap">
                        {formatarQuantidade(r.quantidade)}
                      </td>
                      <td className="px-3 py-1.5 border-b border-line text-right font-mono whitespace-nowrap text-muted">
                        {moeda(r.bruto)}
                      </td>
                      <td className="px-3 py-1.5 border-b border-line text-right font-mono whitespace-nowrap text-muted">
                        {moeda(r.devolucao, true)}
                      </td>
                      <td className="px-3 py-1.5 border-b border-line text-right font-mono whitespace-nowrap font-semibold text-ink">
                        {moeda(r.liquido)}
                      </td>
                      <td className="px-3 py-1.5 border-b border-line text-right font-mono whitespace-nowrap text-muted">
                        {moeda(r.custo)}
                      </td>
                      <td className="px-3 py-1.5 border-b border-line text-right font-mono whitespace-nowrap">
                        {formatarPercentual(r.margem_pct)}
                      </td>
                      <td className="px-3 py-1.5 border-b border-line text-right font-mono whitespace-nowrap">
                        {formatarPercentual(r.share_pct, 2)}
                      </td>
                      <td className="px-3 py-1.5 border-b border-line text-right font-mono whitespace-nowrap text-muted">
                        {formatarAcumulado(r.acumulado_pct, plano.acumuladoLegivel)}
                      </td>
                      <td className="px-3 py-1.5 border-b border-line text-center">
                        <SeloCurva valor={r.classe_abc} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>

              {/* ★ Totalizador FIXO no rodapé, e sem colSpan na primeira célula: uma
                  célula esticada sobre as colunas de dimensão continuaria colada à
                  esquerda na rolagem horizontal e cobriria os valores à direita. */}
              <tfoot>
                <tr className="font-semibold">
                  <th
                    scope="row"
                    className="text-left px-3 py-2.5 bg-floor border-t border-line-strong sticky bottom-0 left-0 z-30 shadow-[1px_0_0_var(--color-line)] whitespace-nowrap"
                  >
                    Total
                  </th>
                  {dimsExibidas.slice(1).map((campo) => (
                    <td key={campo} className="bg-floor border-t border-line-strong sticky bottom-0 z-20" />
                  ))}
                  <td
                    className="px-3 py-2.5 bg-floor border-t border-line-strong sticky bottom-0 z-20 text-right font-mono whitespace-nowrap"
                    title={
                      totalQuantidade === null
                        ? 'relatório truncado: somar só as linhas exibidas daria um total falso'
                        : undefined
                    }
                  >
                    {formatarQuantidade(totalQuantidade)}
                  </td>
                  <td className="px-3 py-2.5 bg-floor border-t border-line-strong sticky bottom-0 z-20 text-right font-mono whitespace-nowrap text-muted">
                    {moeda(meta.total_bruto)}
                  </td>
                  <td className="px-3 py-2.5 bg-floor border-t border-line-strong sticky bottom-0 z-20 text-right font-mono whitespace-nowrap text-muted">
                    {moeda(meta.total_devolucao, true)}
                  </td>
                  <td className="px-3 py-2.5 bg-floor border-t border-line-strong sticky bottom-0 z-20 text-right font-mono whitespace-nowrap text-ink">
                    {moeda(meta.total_liquido)}
                  </td>
                  <td className="px-3 py-2.5 bg-floor border-t border-line-strong sticky bottom-0 z-20 text-right font-mono whitespace-nowrap text-muted">
                    {moeda(meta.total_custo)}
                  </td>
                  <td className="px-3 py-2.5 bg-floor border-t border-line-strong sticky bottom-0 z-20 text-right font-mono whitespace-nowrap">
                    {formatarPercentual(meta.margem_pct)}
                  </td>
                  <td className="px-3 py-2.5 bg-floor border-t border-line-strong sticky bottom-0 z-20 text-right font-mono whitespace-nowrap">
                    100,00%
                  </td>
                  <td className="px-3 py-2.5 bg-floor border-t border-line-strong sticky bottom-0 z-20" />
                  <td className="px-3 py-2.5 bg-floor border-t border-line-strong sticky bottom-0 z-20" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {!erro && !primeiraCarga && linhas.length > 0 && (
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 px-4 sm:px-5 py-3 border-t border-line">
            {resumo ? (
              <>
                <span className="text-[11px] font-mono text-muted">
                  curva A: <span className="text-primary font-semibold">{numeroSimples(resumo.A.linhas)}</span>{' '}
                  linhas · {moeda(resumo.A.liquido)}
                </span>
                <span className="text-[11px] font-mono text-muted">
                  B: <span className="text-ink-soft font-semibold">{numeroSimples(resumo.B.linhas)}</span> ·{' '}
                  {moeda(resumo.B.liquido)}
                </span>
                <span className="text-[11px] font-mono text-muted">
                  C: <span className="text-ink-soft font-semibold">{numeroSimples(resumo.C.linhas)}</span> ·{' '}
                  {moeda(resumo.C.liquido)}
                </span>
                {resumo.fora.linhas > 0 && (
                  <span className="text-[11px] font-mono text-muted" title={meta.abc?.nota}>
                    fora da curva: {numeroSimples(resumo.fora.linhas)} (linha zerada ou negativa por devolução)
                  </span>
                )}
              </>
            ) : (
              /* ★ Relatório truncado: o total por classe A/B/C soma só o que está na tela e
                 seria lido como número do relatório — na medição de jan–jun/2026 a classe C
                 aparecia com 962 linhas · R$ 90.688,21 contra 1.206 · R$ 94.727,48 reais, e
                 as 63 linhas fora da curva sumiam. O que o backend apurou sobre o conjunto
                 inteiro continua publicado; o resto pede o relatório completo. */
              <span className="text-[11px] font-mono text-muted" title={meta.abc?.nota}>
                curva do relatório inteiro:{' '}
                <span className="text-ink-soft font-semibold">{numeroSimples(meta.abc?.linhas_na_curva)}</span>{' '}
                linhas na curva ·{' '}
                <span className="text-ink-soft font-semibold">
                  {numeroSimples(meta.abc?.linhas_fora_da_curva)}
                </span>{' '}
                fora — o total por classe A/B/C só fecha com as {numeroSimples(meta.linhas)} linhas na tela
              </span>
            )}
            <span className="text-[11px] font-mono text-muted">
              devolução {formatarPercentual(meta.devolucao_pct, 2)} do bruto
            </span>
          </div>
        )}
      </section>
    </div>
  )
}
