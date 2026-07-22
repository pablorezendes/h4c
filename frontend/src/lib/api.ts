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

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

/** Erro do FastAPI vem como {"detail": "..."} — o usuário lê a mensagem, não o JSON. */
function mensagemDoErro(status: number, corpo: string): string {
  try {
    const json = JSON.parse(corpo) as { detail?: unknown }
    if (typeof json.detail === 'string') return `Erro ${status}: ${json.detail}`
  } catch {
    /* corpo não é JSON (HTML do proxy, por exemplo) — segue com o texto cru */
  }
  return `Erro ${status}: ${corpo.slice(0, 300)}`
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
    throw new Error('Sem conexão com o servidor do BI')
  }
  if (res.status === 401) {
    clearToken()
    if (!location.pathname.startsWith('/login')) location.assign('/login')
    throw new Error('Sessão expirada')
  }
  if (!res.ok) {
    throw new Error(mensagemDoErro(res.status, await res.text()))
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
