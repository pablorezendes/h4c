/**
 * Cliente HTTP do BI + os tipos de resposta COMPARTILHADOS entre telas.
 *
 * Regra deste arquivo: contrato que só uma tela consome fica declarado na própria tela.
 * Aqui moram apenas os tipos usados por mais de um arquivo — hoje, os do painel legado
 * de KPIs (`/api/kpis/*`), que ainda alimenta os componentes de card e gráfico herdados.
 * As abas novas (Comercial, Financeiro, Compras > Estoque, Apuração) declaram cada uma o
 * tipo da sua própria resposta; duplicar aquilo aqui só criaria uma segunda verdade.
 *
 * ★ O card "A receber em aberto" SAIU do /api/kpis/overview: métrica financeira não mora
 *   na visão comercial. A versão canônica é /api/financeiro/vencido, na aba Financeiro.
 * ★ Os endpoints /api/futuro/* foram removidos do backend — projeção de fluxo de caixa
 *   (só depois da rodada com o BPO) e janelas móveis de "próximos 30 dias" (a regra é
 *   fechamento do mês por dias úteis). Não voltar a tipá-los aqui.
 */
const TOKEN_KEY = 'h4c_token'

/**
 * ★ DÍVIDA REGISTRADA: O TOKEN CONTINUA NO localStorage.
 *
 * O certo é cookie `httpOnly; Secure; SameSite=Lax`, porque no localStorage o JWT
 * fica legível por qualquer JavaScript da página — um XSS (ou uma dependência de
 * front comprometida) leva a sessão inteira embora, e o BI hoje é o que mostra
 * margem, inadimplência e a carteira nominal de cada vendedor.
 *
 * Fica para a próxima rodada por escopo, não por preguiça: mudar para cookie
 * mexe no BACKEND (Set-Cookie no /login, rota de logout que apaga o cookie,
 * proteção CSRF — hoje o Bearer manual é o que nos dá isso de graça — e CORS com
 * credenciais), e esta rodada é a da sessão no frontend. Enquanto isso valem os
 * paliativos que já existem: expiração curta do JWT, `token_versao` (trocar senha
 * ou desativar o usuário derruba o token emitido antes) e releitura do usuário no
 * banco a cada requisição.
 */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

/**
 * Erro HTTP com o status preservado.
 *
 * Antes só existia a `message`, e a tela de login precisava procurar '401' dentro
 * do texto para decidir o que dizer — o que quebra quando a mensagem muda. Agora
 * quem precisa decidir por status (401 = credencial errada, 423 = bloqueado por
 * tentativas, 403 = sem permissão) lê `status`, e quem só exibe continua lendo
 * `message`. `detalhe` é a frase que o BACKEND escreveu, sem o prefixo "Erro NNN:"
 * — é ela que se mostra para o usuário quando o backend já explicou o problema.
 */
export class ErroApi extends Error {
  readonly status: number
  readonly detalhe: string

  constructor(status: number, detalhe: string, mensagem?: string) {
    super(mensagem ?? `Erro ${status}: ${detalhe}`)
    this.name = 'ErroApi'
    this.status = status
    this.detalhe = detalhe
  }
}

/** Erro do FastAPI vem como {"detail": "..."} — o usuário lê a mensagem, não o JSON. */
function detalheDoErro(corpo: string): string {
  try {
    const json = JSON.parse(corpo) as { detail?: unknown }
    if (typeof json.detail === 'string') return json.detail
  } catch {
    /* corpo não é JSON (HTML do proxy, por exemplo) — segue com o texto cru */
  }
  return corpo.slice(0, 300)
}

/**
 * Quem limpar a sessão em memória quando o token morrer.
 *
 * É um registro e não um `import { limparSessao } from './sessao'` porque
 * `sessao.ts` já importa daqui: o import direto fecharia o ciclo
 * api -> sessao -> api. Aqui a seta aponta só num sentido.
 */
let aoExpirar: (() => void) | null = null

export function registrarExpiracao(fn: () => void) {
  aoExpirar = fn
}

/** O caminho do login: o 401 dele é "senha errada", não "sua sessão acabou". */
const ROTA_LOGIN = '/api/auth/login'

function expirou() {
  clearToken()
  aoExpirar?.()
  // `assign` recarrega a página inteira, o que também zera qualquer estado de tela
  // que tenha ficado com dado de quem saiu
  if (!location.pathname.startsWith('/login')) location.assign('/login')
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string>),
  }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(path, { ...init, headers })
  } catch {
    // fetch só rejeita quando a requisição nem chegou (API fora do ar, rede caída):
    // sem isto a tela mostrava "Failed to fetch" para quem opera o BI
    throw new ErroApi(0, 'Sem conexão com o servidor do BI', 'Sem conexão com o servidor do BI')
  }

  if (!res.ok) {
    const detalhe = detalheDoErro(await res.text())
    if (res.status === 401 && !path.startsWith(ROTA_LOGIN)) {
      expirou()
      throw new ErroApi(401, detalhe, 'Sessão expirada')
    }
    throw new ErroApi(res.status, detalhe)
  }

  // 204 (troca de senha, por exemplo) não tem corpo — `res.json()` estouraria com
  // "Unexpected end of JSON input" num caminho que deu certo
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T
  }
  return res.json()
}

/* ── Painel legado de KPIs (/api/kpis/*) ───────────────────────────────────────
   Tipos consumidos pelos componentes herdados (KpiCard, SerieFaturamento,
   TopProdutos, Aging). Todo valor de venda deles já é LÍQUIDO de devolução — a
   dedução mora na medida do backend (app/regras.py), não em filtro de tela.
   Estes tipos saem daqui junto com os componentes, quando eles forem aposentados. */

export interface Card {
  id: string
  label: string
  valor: number
  formato: 'moeda' | 'inteiro'
  variacao_pct: number | null
  extra?: Record<string, number>
}

export interface PontoSerie {
  dia: string
  faturamento: number
  notas: number
}

export interface ProdutoTop {
  codprod: number
  descricao: string
  valor: number
  quantidade: number
}

export interface FaixaAging {
  faixa: string
  titulos: number
  valor: number
}
