/**
 * Curva ABC da apuração de faturamento — helpers puros.
 *
 * ★ O acumulado e a classe exibidos são os que o BACKEND mandou. Ele calcula a curva
 *   sobre o conjunto inteiro, com um denominador que a tela não tem: a soma das linhas
 *   POSITIVAS, não o líquido total. Recalcular na tela com o líquido total é o erro
 *   clássico — em jan/2026, agrupando Cliente/Produto, 441 linhas incluem 4 negativas
 *   (devolução maior que a venda no mês) e o acumulado fechava em 100,49% em vez de
 *   100,00%. Some-se a isso o truncamento: com 2.000 linhas de um relatório de 8.000, a
 *   curva local seria de outro universo.
 *
 * Estes helpers servem para três coisas, e só:
 *   1. rotular e descrever a classe que veio pronta;
 *   2. formatar o acumulado — inclusive apagá-lo quando a tabela sai da ordem da curva,
 *      porque fora dela o número deixa de ser lido de cima para baixo;
 *   3. refazer a curva LOCALMENTE quando o usuário reordena a tabela pelo outro critério
 *      (valor <-> quantidade), sem uma ida ao servidor — e SOMENTE quando a resposta veio
 *      inteira. Quem decide isso é `planoDaCurva()`, para o aviso do ★ acima não depender
 *      de a tela lembrar dele.
 *
 * A regra de classificação é a mesma dos routers (regras.CURVA_A_CORTE_PCT / _B_): a
 * linha que ATRAVESSA o corte ainda pertence à classe de baixo. Duas curvas ABC
 * diferentes no mesmo BI é o tipo de divergência que ninguém consegue explicar depois.
 */

export type ClasseAbc = 'A' | 'B' | 'C'
/** Critério da curva: valor faturado (padrão) ou quantidade vendida. */
export type CriterioAbc = 'liquido' | 'quantidade'
export type Direcao = 'asc' | 'desc'

export const CORTE_A_PCT = 80
export const CORTE_B_PCT = 95

/** O mínimo que uma linha precisa ter para entrar na curva. */
export interface LinhaCurva {
  liquido: number
  quantidade: number
  acumulado_pct: number | null
  classe_abc: string | null
}

export const ROTULO_CRITERIO: Record<CriterioAbc, string> = {
  liquido: 'valor',
  quantidade: 'quantidade',
}

export const DESCRICAO_CLASSE: Record<ClasseAbc, string> = {
  A: `Curva A — dentro dos primeiros ${CORTE_A_PCT}% do acumulado. É a faixa que sustenta o faturamento.`,
  B: `Curva B — entre ${CORTE_A_PCT}% e ${CORTE_B_PCT}% do acumulado.`,
  C: `Curva C — a cauda depois de ${CORTE_B_PCT}% do acumulado.`,
}

export function ehClasse(valor: unknown): valor is ClasseAbc {
  return valor === 'A' || valor === 'B' || valor === 'C'
}

export function rotuloClasse(valor: unknown): string {
  return ehClasse(valor) ? valor : '—'
}

export function descricaoClasse(valor: unknown): string {
  return ehClasse(valor)
    ? DESCRICAO_CLASSE[valor]
    : 'Fora da curva: linha zerada ou negativa (devolução igual ou maior que a venda no período).'
}

/**
 * Classe pela POSIÇÃO na curva.
 *
 * `pesoPct` é a participação da própria linha na base da curva. O acumulado ANTES da
 * linha é o que decide: quem começa abaixo de 80% é A mesmo que termine em 85%, senão
 * o item que sozinho atravessa o corte seria rebaixado e a curva A perderia justamente
 * o item mais pesado.
 */
export function classeDoAcumulado(
  acumuladoPct: number | null | undefined,
  pesoPct: number,
): ClasseAbc | null {
  if (acumuladoPct === null || acumuladoPct === undefined || !Number.isFinite(acumuladoPct)) return null
  if (!Number.isFinite(pesoPct) || pesoPct <= 0) return null
  const anterior = acumuladoPct - pesoPct
  if (anterior < CORTE_A_PCT) return 'A'
  return anterior < CORTE_B_PCT ? 'B' : 'C'
}

function valorDe(linha: LinhaCurva, criterio: CriterioAbc): number {
  const v = criterio === 'quantidade' ? linha.quantidade : linha.liquido
  return Number.isFinite(v) ? Number(v) : 0
}

/** Denominador da curva: soma só das linhas positivas. É o que faz o acumulado fechar em 100%. */
export function baseDaCurva(rows: readonly LinhaCurva[], criterio: CriterioAbc): number {
  let base = 0
  for (const r of rows) {
    const v = valorDe(r, criterio)
    if (v > 0) base += v
  }
  return base
}

const duasCasas = (v: number) => Math.round(v * 100) / 100

/**
 * Reordena por um critério e refaz acumulado + classe — para a troca local
 * valor <-> quantidade sem nova requisição.
 *
 * ★ Só use sobre o conjunto COMPLETO que o backend devolveu. Se a resposta veio
 *   truncada (`meta.truncado_em`), a curva local é de um recorte e não da apuração.
 */
export function recalcularCurva<T extends LinhaCurva>(rows: readonly T[], criterio: CriterioAbc): T[] {
  const base = baseDaCurva(rows, criterio)
  // não-positivos por último: contribuem 0 e não podem furar a fila do acumulado
  const ordenadas = [...rows].sort((a, b) => {
    const va = valorDe(a, criterio)
    const vb = valorDe(b, criterio)
    if (va > 0 !== vb > 0) return va > 0 ? -1 : 1
    return vb - va
  })
  const marcar = (r: T, acumulado: number | null, classe: ClasseAbc | null): T =>
    ({ ...r, acumulado_pct: acumulado, classe_abc: classe }) as T

  if (base <= 0) return ordenadas.map((r) => marcar(r, null, null))

  let soma = 0
  return ordenadas.map((r) => {
    const v = valorDe(r, criterio)
    if (v <= 0) return marcar(r, null, null)
    soma += v
    const acumulado = duasCasas((100 * soma) / base)
    return marcar(r, acumulado, classeDoAcumulado(acumulado, (100 * v) / base))
  })
}

export interface ResumoClasse {
  linhas: number
  liquido: number
}

/**
 * Quantas linhas e quanto valor em cada classe — o rodapé de leitura da curva.
 *
 * ★ SOMA AS LINHAS QUE RECEBEU, e o rodapé é lido como número de RELATÓRIO. Por isso só
 *   pode ser chamado quando a tela tem TODAS as linhas: com a resposta cortada em 2.000
 *   de 2.307 (jan–jun/2026, Cliente/Produto), a classe C exibia 962 linhas · R$ 90.688,21
 *   contra 1.206 · R$ 94.727,48 do relatório, e "fora da curva" sumia (63 linhas). Quem
 *   chama pergunta antes a `planoDaCurva().resumoFechaRelatorio`.
 */
export function resumoClasses(
  rows: readonly LinhaCurva[],
): Record<ClasseAbc | 'fora', ResumoClasse> {
  const zero = (): ResumoClasse => ({ linhas: 0, liquido: 0 })
  const out: Record<ClasseAbc | 'fora', ResumoClasse> = { A: zero(), B: zero(), C: zero(), fora: zero() }
  for (const r of rows) {
    const alvo = ehClasse(r.classe_abc) ? out[r.classe_abc] : out.fora
    alvo.linhas += 1
    alvo.liquido += Number.isFinite(r.liquido) ? Number(r.liquido) : 0
  }
  return out
}

/** Ordenação escolhida no relatório -> critério da curva (a alfabética não muda a curva). */
export function criterioDaOrdenacao(ordenar: string): CriterioAbc {
  return ordenar === 'abc_quantidade' ? 'quantidade' : 'liquido'
}

/** O que a tela pode fazer com a curva no estado atual da tabela. */
export interface PlanoCurva {
  /** Critério a recalcular localmente, ou null para manter a classificação do backend. */
  recalcular: CriterioAbc | null
  /**
   * O acumulado pode ser lido de cima para baixo? Ele só é legível na ORDEM DA CURVA: em
   * ordem alfabética ou por margem ele salta para trás e para frente, e quem lê de cima
   * para baixo conclui errado. Nesses casos a coluna vira "—" em vez de mentir.
   */
  acumuladoLegivel: boolean
  /** O resumo por classe soma o relatório inteiro? Só quando a tela tem todas as linhas. */
  resumoFechaRelatorio: boolean
}

/**
 * Decide o destino da curva quando a tabela sai da ordem do servidor.
 *
 * ★ TRUNCAMENTO MANDA NESTA DECISÃO. Recalcular a curva sobre a página exibida produz uma
 *   classificação de OUTRO universo: medido na produção em 2026-07-21, jan–jun/2026
 *   agrupando Cliente/Produto dá 2.307 grupos e a resposta é cortada em 2.000 — um clique
 *   em "Líquido" rebaixava 3 linhas de A para B (R$ 2.800,26) e 18 de B para C
 *   (R$ 3.650,52), e a última linha da tela passava a exibir "acumulado 100,0%" quando no
 *   relatório inteiro ela está em 99,79%. A mesma tabela, na mesma ordem, com selos de
 *   curva diferentes antes e depois do clique é o tipo de divergência que ninguém explica
 *   depois. Com truncamento a classificação canônica do backend fica de pé e a tabela
 *   apenas reordena.
 *
 * O acumulado canônico continua legível no recorte quando a ordem pedida é o mesmo
 * critério em que o servidor o acumulou (`criterioDaOrdenacao`) — os valores são os do
 * relatório inteiro e seguem crescendo linha a linha; fora disso, "—".
 */
export function planoDaCurva(
  ordenar: string,
  ordemLocal: { campo: string; direcao: Direcao } | null,
  truncado: boolean,
): PlanoCurva {
  // ordem do servidor: é a da curva, exceto na alfabética
  if (!ordemLocal) {
    return { recalcular: null, acumuladoLegivel: ordenar !== 'alfabetica', resumoFechaRelatorio: !truncado }
  }
  const naCurva =
    ordemLocal.direcao === 'desc' && (ordemLocal.campo === 'liquido' || ordemLocal.campo === 'quantidade')
  if (!naCurva) {
    return { recalcular: null, acumuladoLegivel: false, resumoFechaRelatorio: !truncado }
  }
  const criterio: CriterioAbc = ordemLocal.campo === 'quantidade' ? 'quantidade' : 'liquido'
  if (!truncado) {
    return { recalcular: criterio, acumuladoLegivel: true, resumoFechaRelatorio: true }
  }
  return {
    recalcular: null,
    acumuladoLegivel: criterio === criterioDaOrdenacao(ordenar),
    resumoFechaRelatorio: false,
  }
}

export function formatarPercentual(valor: number | null | undefined, casas = 1): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—'
  return `${Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`
}

/** Acumulado da curva. `legivel=false` apaga o número em vez de exibi-lo fora de ordem. */
export function formatarAcumulado(valor: number | null | undefined, legivel = true): string {
  if (!legivel) return '—'
  return formatarPercentual(valor, 1)
}

/** Quantidade vendida líquida: aceita fração (kg, litro), mas sem poluir com zeros. */
export function formatarQuantidade(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—'
  return Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

/**
 * Reordenação local genérica (clique no cabeçalho). Texto compara com localeCompare
 * pt-BR — sem isso "Ácido" cai depois de "Zinco"; nulos vão sempre para o fim,
 * nos dois sentidos, porque "sem valor" não é o menor valor.
 */
export function ordenarPor<T extends Record<string, unknown>>(
  rows: readonly T[],
  campo: string,
  direcao: Direcao,
): T[] {
  const sinal = direcao === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const va = a[campo]
    const vb = b[campo]
    const vazioA = va === null || va === undefined
    const vazioB = vb === null || vb === undefined
    if (vazioA || vazioB) return vazioA && vazioB ? 0 : vazioA ? 1 : -1
    if (typeof va === 'number' && typeof vb === 'number') return sinal * (va - vb)
    return sinal * String(va).localeCompare(String(vb), 'pt-BR')
  })
}
