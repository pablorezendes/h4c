import { api, ErroApi } from '../../lib/api'
import type { Papel } from '../../lib/sessao'

/**
 * Contratos e conversões da tela de Configurações (usuários e permissões).
 *
 * O que esta tela administra vem de dois mundos que não se misturam:
 *   IDENTIDADE  — matrícula, login (PCEMPR.USUARIOBD), nome e situação, do WinThor;
 *   CREDENCIAL  — senha do BI (pbkdf2), papel, carteira e permissões, do Postgres.
 * A senha do ERP não é lida nem copiada; aqui ela simplesmente não existe.
 *
 * ★ NADA DE SENHA SALVA NESTA TELA. `tem_senha` é um booleano: diz se a pessoa já
 *   consegue entrar, e nada mais. A única senha que aparece na interface é a
 *   PROVISÓRIA, no instante em que o backend a gera — depois disso ela não pode
 *   ser recuperada por ninguém, nem pelo dono.
 */

// Papel mora em lib/sessao.ts, que é quem lê /api/auth/eu. Reexportado aqui só
// para os componentes desta pasta importarem de um lugar só — duas declarações do
// mesmo union divergiriam no dia em que alguém criasse um quarto papel.
export type { Papel }

/** GET /api/usuarios (`rows`) */
export interface Usuario {
  id: number
  login: string
  matricula: number | null
  nome: string
  email: string | null
  papel: Papel
  codusur: number | null
  /**
   * Nome da carteira em PCUSUARI. ★ Vem junto do número de propósito: o RCA 6 foi
   * reciclado de JOAO PEDRO (desligado) para BRUNO MATIAS, e "RCA 6" sozinho na
   * tela faria o dono conferir contra a memória — que está desatualizada.
   */
  carteira_nome?: string | null
  restrito_a_carteira: boolean
  ativo: boolean
  tem_senha: boolean
  deve_trocar_senha: boolean
  /** login travado por tentativas erradas seguidas (destrava sozinho) */
  bloqueado?: boolean
  ultimo_login: string | null
  origem: 'erp' | 'manual'
  situacao_erp: string | null
  permissoes: string[]
  /** POST/PATCH devolvem a linha com os avisos da decisão que acabou de ser tomada */
  avisos?: string[]
}

export interface RespostaUsuarios {
  rows: Usuario[]
  meta?: Record<string, unknown>
}

/**
 * GET /api/usuarios/importaveis (`rows`) — pessoa do ERP sem acesso ao BI.
 *
 * O backend semeia o PAPEL pelo setor (PCEMPR.CODSETOR x PCSETOR) e a CARTEIRA por
 * casamento exato de nome ('CARTEIRA ' || PCEMPR.NOME = PCUSUARI.NOME). PCEMPR.CODUSUR
 * é ignorado de propósito — o valor 1 é default de fábrica em 20 das 28 linhas.
 */
export interface Importavel {
  matricula: number
  login: string
  nome: string
  apelido?: string | null
  email?: string | null
  setor?: string | null
  codsetor?: number | null
  papel_sugerido?: Papel | null
  /** rótulo humano da função lida do setor: "vendedor", "comprador", "financeiro"… */
  funcao?: string | null
  restrito_sugerido?: boolean
  codusur_sugerido?: number | null
  carteira_nome?: string | null
  /** 'alta' | 'ambígua' | 'conflito' | 'sem sugestão' — é sobre a CARTEIRA, não sobre o papel */
  confianca_carteira?: string | null
  origem_carteira?: string | null
  /** por que este papel foi sugerido */
  motivos?: string[]
  /** o que o dono precisa conferir ANTES de importar */
  alertas?: string[]
  /** conta de nome genérico com uso intenso (PLANNING/PLANNING1) */
  revisar?: boolean | null
  permissoes_iniciais?: string[]
}

/** `meta` de /api/usuarios/importaveis — responde "e cadê o fulano?". */
export interface MetaImportaveis {
  disponivel?: boolean
  aviso?: string | null
  importaveis?: number
  genericas_ignoradas?: number
  desligados_ignorados?: number
  ja_no_bi?: number
  total_erp?: number
  avisos?: string[]
  regra?: string | null
}

export interface RespostaImportaveis {
  rows: Importavel[]
  meta?: MetaImportaveis
}

/** POST /api/usuarios/importar */
export interface RespostaImportar {
  criados?: { id: number; login: string; nome: string; alertas?: string[] }[]
  ignorados?: { matricula: number; login?: string; motivo: string }[]
  meta?: { criados?: number; ignorados?: number; proximo_passo?: string }
}

/** GET /api/usuarios/recursos — o catálogo que vive em backend/app/permissoes.py. */
export interface RecursoCatalogo {
  id: string
  rotulo: string
  aba: string
  descricao: string
  e_aba?: boolean
}

/** GET /api/usuarios/{id}/sugestao-erp */
export interface ModuloErp {
  codmodulo: number
  modulo: string
  liberadas: number
  rotinas: number
  cobertura: number
  usado: boolean
  mapeado: boolean
  recursos: string[]
}

export interface SugestaoErp {
  recursos?: string[]
  modulos?: ModuloErp[]
  meta?: {
    disponivel?: boolean
    aviso?: string | null
    regra?: string | null
    limiar?: number
    matricula?: number
    a_conceder?: string[]
    a_mais_hoje?: string[]
  }
}

// ---------------------------------------------------------------------------
// Chamadas
// ---------------------------------------------------------------------------

/**
 * `api()` com o corpo vazio virando `null`.
 *
 * `api()` devolve `undefined` no 204 (troca de senha, por exemplo) e nesta tela o
 * resultado é sempre lido com `?.` — normalizar para `null` deixa `if (r)` e
 * `r?.campo` significando a mesma coisa em todos os chamadores.
 */
export async function chamar<T>(caminho: string, init?: RequestInit): Promise<T | null> {
  return (await api<T>(caminho, init)) ?? null
}

/**
 * O texto que vai para a tela.
 *
 * ★ Prefere `ErroApi.detalhe` — a frase que o BACKEND escreveu ("Este é o último
 *   administrador ativo do BI…") — em vez da `message`, que vem prefixada com
 *   "Erro 409:". O dono desta tela não é quem lê código de status; e as mensagens
 *   de usuarios.py já foram escritas para ele.
 */
export function mensagemDoErro(e: unknown): string {
  if (e instanceof ErroApi) return e.detalhe || e.message
  const t = e instanceof Error ? e.message : String(e ?? '')
  return t || 'Não consegui falar com o servidor do BI.'
}

/** O backend recusou por papel. A tela troca isso por uma explicação, não por um erro. */
export function ehProibido(e: unknown): boolean {
  return e instanceof ErroApi && e.status === 403
}

/**
 * Aceita tanto `[...]` quanto `{itens: [...]}`.
 * Barato, e evita que a tela quebre inteira se o endpoint ganhar um envelope.
 */
export function comoLista<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[]
  const o = (r ?? {}) as Record<string, unknown>
  for (const chave of ['itens', 'rows', 'dados', 'usuarios', 'recursos']) {
    if (Array.isArray(o[chave])) return o[chave] as T[]
  }
  return []
}

// ---------------------------------------------------------------------------
// Papéis (espelho de permissoes.PAPEIS — texto que o dono lê)
// ---------------------------------------------------------------------------
export const PAPEIS: { id: Papel; rotulo: string; descricao: string }[] = [
  {
    id: 'admin',
    rotulo: 'Administrador',
    descricao: 'Vê todos os relatórios e administra usuários, senhas e permissões.',
  },
  {
    id: 'gestor',
    rotulo: 'Gestor',
    descricao: 'Começa vendo todas as abas do BI, mas não administra usuários.',
  },
  {
    id: 'leitor',
    rotulo: 'Leitor',
    descricao: 'Começa só com a aba Comercial. É o papel do vendedor, que normalmente '
      + 'vem junto com a restrição de carteira.',
  },
]

export function rotuloPapel(p: string | null | undefined): string {
  return PAPEIS.find((x) => x.id === p)?.rotulo ?? (p || '—')
}

// ---------------------------------------------------------------------------
// Leitura do estado de um usuário
// ---------------------------------------------------------------------------

/**
 * Desligado no ERP.
 *
 * ★ SITUACAO NULA NÃO É DESLIGAMENTO. Quem foi cadastrado à mão não tem linha em
 *   PCEMPR (caso da FERNANDA MOURA, a maior vendedora) e o espelho recém-criado
 *   também devolve nulo. Só é desligado quem TEM linha no ERP com situação
 *   diferente de 'A' — a mesma regra que o backend aplica no login.
 */
export function desligadoNoErp(u: Usuario): boolean {
  const s = (u.situacao_erp || '').trim().toUpperCase()
  return s !== '' && s !== 'A'
}

export interface Estado {
  rotulo: string
  dica: string
  dot: string
  classe: string
}

/** O estado que a lista mostra em UMA coluna, do mais grave para o mais banal. */
export function estadoDoAcesso(u: Usuario): Estado {
  if (desligadoNoErp(u)) {
    return {
      rotulo: 'desligado no ERP',
      dica: `Situação ${u.situacao_erp} em PCEMPR. O BI recusa o login desta pessoa a partir do `
        + 'próximo acesso, mesmo com o cadastro ativo aqui.',
      dot: 'dot-erro',
      classe: 'text-danger font-semibold',
    }
  }
  if (!u.ativo) {
    return {
      rotulo: 'desativado',
      dica: 'Desativado aqui no BI. O login é recusado e a sessão aberta cai no próximo clique.',
      dot: 'dot-erro',
      classe: 'text-danger',
    }
  }
  if (u.bloqueado) {
    return {
      rotulo: 'bloqueado',
      dica: 'Errou a senha cinco vezes seguidas. O bloqueio sai sozinho em alguns minutos — '
        + 'gerar uma senha provisória também destrava na hora.',
      dot: 'dot-aviso',
      classe: 'text-amber font-semibold',
    }
  }
  if (!u.tem_senha) {
    return {
      rotulo: 'sem senha',
      dica: 'Importado do ERP e ainda sem acesso: gere uma senha provisória para a pessoa entrar.',
      dot: 'dot-aviso',
      classe: 'text-amber',
    }
  }
  if (u.deve_trocar_senha) {
    return {
      rotulo: 'senha provisória',
      dica: 'A pessoa ainda usa a senha provisória e será obrigada a trocá-la no primeiro acesso.',
      dot: 'dot-aviso',
      classe: 'text-amber',
    }
  }
  return { rotulo: 'ativo', dica: 'Entra normalmente com senha própria.', dot: 'dot-ativo', classe: 'text-emerald' }
}

/**
 * Por que o botão de gerar senha está travado — ou null quando dá para gerar.
 *
 * As três recusas são as MESMAS do backend (403 para si próprio, 409 para inativo
 * e para desligado no ERP). Repeti-las aqui não é controle de acesso: é evitar que
 * o dono clique, espere e receba um erro que dava para prever antes do clique.
 */
export function porQueNaoPodeGerarSenha(u: Usuario, euId: number | null): string | null {
  if (euId !== null && u.id === euId) {
    return 'Para trocar a sua própria senha use a tela de troca de senha.'
  }
  if (!u.ativo) return 'Reative o acesso antes de gerar uma senha — senão ela não serve para nada.'
  if (desligadoNoErp(u)) {
    return 'Desligado no ERP: o login é recusado a cada requisição, e senha nova não resolveria.'
  }
  return null
}

/** Restrito à carteira sem RCA vinculado — o backend recusa TODA consulta assim. */
export function restricaoSemCarteira(u: { restrito_a_carteira: boolean; codusur: number | null }): boolean {
  return u.restrito_a_carteira && (u.codusur === null || u.codusur === undefined)
}

// ---------------------------------------------------------------------------
// Sugestão de importação
// ---------------------------------------------------------------------------
export interface Confianca {
  rotulo: string
  classe: string
  dot: string
}

/**
 * Confiança da CARTEIRA sugerida — e o que cada nível significa em português.
 *
 * ★ "sem sugestão" não é "baixa". O backend só diz "alta" quando o nome casou
 *   exatamente com uma única carteira em PCUSUARI; homônimo vira 'ambígua' e RCA
 *   já usado por outro usuário vira 'conflito', os dois SEM número sugerido.
 *   Inventar um nível para o que ninguém mediu é o começo de o dono clicar em
 *   "importar todos" sem ler.
 */
export function confiancaCarteira(i: Importavel): Confianca {
  const nivel = (i.confianca_carteira || '').trim().toLowerCase()
  if (nivel.startsWith('alta')) {
    return { rotulo: 'alta', classe: 'text-emerald', dot: 'dot-ativo' }
  }
  if (nivel.startsWith('amb')) {
    return { rotulo: 'ambígua', classe: 'text-amber', dot: 'dot-aviso' }
  }
  if (nivel.startsWith('confl')) {
    return { rotulo: 'conflito', classe: 'text-danger', dot: 'dot-erro' }
  }
  return { rotulo: 'sem sugestão', classe: 'text-muted', dot: 'bg-line-strong' }
}

/** Por que o papel foi sugerido + o que travou a carteira, numa frase só. */
export function porQueDaSugestao(i: Importavel): string | null {
  const partes = [...(i.motivos ?? []), i.origem_carteira ?? '']
  return partes.map((p) => (p || '').trim()).filter(Boolean).join(' · ') || null
}

/** A sugestão do ERP pode chegar como lista pura ou dentro de um objeto. */
export function recursosDaSugestao(r: unknown): string[] {
  const lista = Array.isArray(r) ? r : ((r ?? {}) as SugestaoErp).recursos
  return Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string') : []
}

/**
 * De onde a sugestão veio, em uma frase: os módulos do WinThor que a pessoa de
 * fato usa. Sem isso o botão de sugestão é um oráculo, e oráculo ninguém confere.
 */
export function origemDaSugestao(r: SugestaoErp | null): string | null {
  const usados = (r?.modulos ?? []).filter((m) => m.usado && m.mapeado)
  if (!usados.length) return null
  return usados.map((m) => `${m.modulo} (${Math.round(m.cobertura)}% das rotinas)`).join(', ')
}

// ---------------------------------------------------------------------------
// Catálogo de recursos
// ---------------------------------------------------------------------------
export function ehAba(r: RecursoCatalogo): boolean {
  return r.e_aba ?? r.id === r.aba
}

export interface GrupoRecurso {
  aba: RecursoCatalogo
  filhos: RecursoCatalogo[]
}

/**
 * Agrupa o catálogo em aba -> relatórios, mantendo a ordem que o backend entregou
 * (que é a ordem de exibição decidida em permissoes.CATALOGO).
 */
export function agruparPorAba(recursos: RecursoCatalogo[]): GrupoRecurso[] {
  const grupos: GrupoRecurso[] = []
  const porAba = new Map<string, GrupoRecurso>()
  for (const r of recursos) {
    if (!ehAba(r)) continue
    const g: GrupoRecurso = { aba: r, filhos: [] }
    porAba.set(r.id, g)
    grupos.push(g)
  }
  for (const r of recursos) {
    if (ehAba(r)) continue
    porAba.get(r.aba)?.filhos.push(r)
  }
  return grupos
}

/**
 * Aplica a MESMA normalização do backend (`permissoes.normalizar`): todo filho
 * marcado arrasta a aba dele.
 *
 * ★ Sem isto a tela mentiria. O dono marca "Desempenho por vendedor" sem marcar
 *   "Comercial", salva, e o backend grava as duas — na releitura a aba aparece
 *   marcada "sozinha", como se o BI tivesse mexido no que ele escolheu. Pior: a
 *   comparação "mudou alguma coisa?" nunca fecharia, e o botão Salvar ficaria
 *   aceso para sempre.
 */
export function normalizarRecursos(marcados: Iterable<string>, catalogo: RecursoCatalogo[]): string[] {
  const porId = new Map(catalogo.map((r) => [r.id, r]))
  const conjunto = new Set<string>()
  for (const id of marcados) {
    const r = porId.get(id)
    if (!r) continue
    conjunto.add(r.id)
    conjunto.add(r.aba)
  }
  return catalogo.filter((r) => conjunto.has(r.id)).map((r) => r.id)
}

export function mesmoConjunto(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const outro = new Set(b)
  return a.every((x) => outro.has(x))
}

// ---------------------------------------------------------------------------
// Formatos
// ---------------------------------------------------------------------------
export function dataHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function carteiraTexto(u: { codusur: number | null; restrito_a_carteira: boolean }): string {
  if (u.codusur === null || u.codusur === undefined) return u.restrito_a_carteira ? 'sem RCA' : '—'
  return `RCA ${u.codusur}`
}
