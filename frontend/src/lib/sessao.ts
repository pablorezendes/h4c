import { useEffect, useSyncExternalStore } from 'react'
import { ErroApi, api, getToken, registrarExpiracao } from './api'

/**
 * A SESSÃO DO BI — quem está usando e o que essa pessoa pode ver.
 *
 * Carrega /api/auth/eu UMA vez por carga da página e guarda o resultado aqui, em
 * memória do módulo. Todo o resto do frontend pergunta a este arquivo em vez de
 * pedir de novo ao servidor: o menu, a guarda de rota e a tela de Configurações
 * fazem essa pergunta a cada render, e uma requisição por render seria um pedido
 * de HTTP por movimento de mouse.
 *
 * ★ A IDENTIDADE VEM DO WINTHOR, A SENHA É DO BI. Login é o `USUARIOBD` do ERP
 *   (ADRIEL, MARCELO.CURADO, 8888), não e-mail — só 2 dos 28 funcionários têm
 *   e-mail cadastrado. Ver backend/app/auth.py.
 *
 * ★ ESCONDER A ABA AQUI NÃO É CONTROLE DE ACESSO. `permissoes` e `abas` existem
 *   para a tela não oferecer o que a pessoa não pode abrir. Quem barra de verdade
 *   é o backend (`Depends(permissoes.requer(...))` na rota e `escopo_rca()` dentro
 *   da consulta) — qualquer um abre o DevTools e chama /api/comercial/rca na mão.
 *   Se a única trava fosse este arquivo, a carteira do colega estaria a um `fetch`
 *   de distância.
 *
 * ★ POR QUE LOJA DE MÓDULO (`useSyncExternalStore`) E NÃO UM <ProvedorSessao>:
 *   1. este arquivo é `.ts`, e um Provider exigiria JSX (ou `createElement` na
 *      mão, que é pior de ler);
 *   2. `pode()` precisa ser chamável FORA de componente — a guarda de rota e o
 *      redirecionamento do 401 acontecem sem árvore React por perto —, e um
 *      `useContext` só funciona dentro do render;
 *   3. com Provider a sessão passaria a existir em dois lugares (o módulo e a
 *      árvore) e eles divergiriam no dia em que alguém montasse dois Providers.
 *   O efeito prático de um contexto — re-render de quem depende da sessão quando
 *   ela muda — está garantido pela assinatura da loja em `useSessao()`.
 */

export type Papel = 'admin' | 'gestor' | 'leitor'

/** Corpo de GET /api/auth/eu (backend: `UsuarioSessao.para_tela`). */
export interface Sessao {
  id: number
  login: string
  nome: string
  email: string | null
  papel: Papel
  /** Carteira do vendedor. null = sem carteira vinculada. */
  codusur: number | null
  restrito_a_carteira: boolean
  deve_trocar_senha: boolean
  /** Recursos do catálogo (aba e relatórios) que esta pessoa enxerga. */
  permissoes: string[]
  /** Só as abas, na ordem do catálogo — atalho para o menu. */
  abas: string[]
  /** Frase pronta do backend explicando o recorte, ex.: "Dados limitados à carteira do RCA 5." */
  escopo: string | null
  /** Entrou pela conta de emergência do .env: não tem linha em app.usuario. */
  bootstrap: boolean
}

export type Situacao = 'ausente' | 'carregando' | 'pronta' | 'erro'

export interface EstadoSessao {
  situacao: Situacao
  sessao: Sessao | null
  erro: string | null
}

// ---------------------------------------------------------------------------
// A loja
// ---------------------------------------------------------------------------
let estado: EstadoSessao = { situacao: 'ausente', sessao: null, erro: null }
const ouvintes = new Set<() => void>()

function publicar(novo: EstadoSessao) {
  estado = novo
  for (const avisar of ouvintes) avisar()
}

function assinar(avisar: () => void): () => void {
  ouvintes.add(avisar)
  return () => {
    ouvintes.delete(avisar)
  }
}

/** ★ Precisa devolver SEMPRE a mesma referência enquanto nada mudar: o
 *  `useSyncExternalStore` compara por identidade e um objeto novo a cada leitura
 *  vira laço infinito de render. Por isso `publicar` TROCA o objeto e nunca o
 *  edita no lugar. */
function ler(): EstadoSessao {
  return estado
}

// ---------------------------------------------------------------------------
// Carga
// ---------------------------------------------------------------------------
/** Requisição em voo. Sem isto o StrictMode do React 19 (que monta, desmonta e
 *  remonta em desenvolvimento) e duas telas montadas juntas pediriam /api/auth/eu
 *  três vezes na primeira pintura. */
let emVoo: Promise<Sessao | null> | null = null

export function garantirSessao(): Promise<Sessao | null> {
  if (estado.situacao === 'pronta' && estado.sessao) return Promise.resolve(estado.sessao)
  if (emVoo) return emVoo

  if (!getToken()) {
    if (estado.situacao !== 'ausente') publicar({ situacao: 'ausente', sessao: null, erro: null })
    return Promise.resolve(null)
  }

  // mantém a sessão anterior visível durante a recarga: sem isso um `recarregar()`
  // depois de mudar permissão pisca a tela de "carregando" no meio do trabalho
  publicar({ situacao: 'carregando', sessao: estado.sessao, erro: null })

  emVoo = api<Sessao>('/api/auth/eu')
    .then((s) => {
      publicar({ situacao: 'pronta', sessao: s, erro: null })
      return s
    })
    .catch((e: unknown) => {
      if (e instanceof ErroApi && e.status === 401) {
        // token vencido/revogado: `api()` já limpou e já mandou para /login. Vira
        // 'ausente' e não 'erro' porque o `location.assign` demora o suficiente para
        // a tela pintar antes de trocar de página — e "não consegui carregar sua
        // sessão" no meio de um logout normal é susto à toa.
        publicar({ situacao: 'ausente', sessao: null, erro: null })
        return null
      }
      // o resto — API fora do ar, 500, proxy devolvendo HTML — NÃO pode virar tela
      // branca nem ida silenciosa para o login, senão o dono acha que a senha dele
      // parou de funcionar.
      const erro = e instanceof ErroApi ? e.detalhe || e.message : String((e as Error)?.message ?? e)
      publicar({ situacao: 'erro', sessao: null, erro })
      return null
    })
    .finally(() => {
      emVoo = null
    })

  return emVoo
}

/** Recarrega do servidor (a tela de Configurações chama depois de mudar a própria conta). */
export function recarregarSessao(): Promise<Sessao | null> {
  emVoo = null
  publicar({ situacao: 'ausente', sessao: estado.sessao, erro: null })
  return garantirSessao()
}

/**
 * Aproveita o `usuario` que veio no corpo do POST /api/auth/login.
 *
 * Evita a segunda ida ao servidor logo depois de entrar — que, além de lenta na
 * rede do escritório, deixaria a primeira tela sem menu por um instante.
 */
export function aplicarSessao(sessao: Sessao) {
  emVoo = null
  publicar({ situacao: 'pronta', sessao, erro: null })
}

/** Esquece quem estava logado. Chamada no "Sair" e quando o token expira. */
export function limparSessao() {
  emVoo = null
  publicar({ situacao: 'ausente', sessao: null, erro: null })
}

// `api()` avisa aqui quando o servidor recusar o token (401 fora do login).
registrarExpiracao(limparSessao)

// ---------------------------------------------------------------------------
// Perguntas
// ---------------------------------------------------------------------------
export function sessaoAtual(): Sessao | null {
  return estado.sessao
}

/** Versão pura, para quem já tem a sessão em mãos (a guarda de rota, os testes). */
export function podeCom(sessao: Sessao | null, recurso: string): boolean {
  if (!sessao) return false
  // admin não depende de caixinha marcada: o papel já responde por tudo, igual ao
  // `permissoes.permitido()` do backend
  if (sessao.papel === 'admin') return true
  return sessao.permissoes.includes(recurso)
}

/**
 * Esta pessoa pode ver este recurso do catálogo ('comercial', 'financeiro.vencido', ...)?
 *
 * Chamável dentro e fora do render. ★ Dentro de componente, chame `useSessao()`
 * antes: é ela que assina a loja. Um componente que só chama `pode()` lê o valor
 * certo na primeira pintura e não repinta quando a sessão muda.
 */
export function pode(recurso: string): boolean {
  return podeCom(estado.sessao, recurso)
}

export function ehAdmin(): boolean {
  return estado.sessao?.papel === 'admin'
}

// ---------------------------------------------------------------------------
// O hook
// ---------------------------------------------------------------------------
/**
 * Assina a sessão e dispara a carga na primeira vez que alguém precisa dela.
 *
 * Devolve o estado inteiro (e não só a sessão) porque a diferença entre "ainda
 * estou carregando", "deu erro" e "não tem ninguém logado" muda o que a tela
 * mostra — juntar os três em `sessao === null` foi exatamente o que produzia
 * tela branca.
 */
export function useSessao(): EstadoSessao {
  const atual = useSyncExternalStore(assinar, ler)

  useEffect(() => {
    if (atual.situacao === 'ausente' && getToken()) void garantirSessao()
  }, [atual.situacao])

  return atual
}
