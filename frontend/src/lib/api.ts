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

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string>),
  }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(path, { ...init, headers })
  if (res.status === 401) {
    clearToken()
    if (!location.pathname.startsWith('/login')) location.assign('/login')
    throw new Error('Sessão expirada')
  }
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Erro ${res.status}: ${body}`)
  }
  return res.json()
}

export interface Card {
  id: string
  label: string
  valor: number
  formato: 'moeda' | 'inteiro'
  variacao_pct: number | null
  extra?: Record<string, number>
}

export interface Overview {
  periodo: { dt_ini: string; dt_fim: string }
  cards: Card[]
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
