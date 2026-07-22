import { useMemo, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { KeyRound, LogOut, type LucideIcon } from 'lucide-react'
import { clearToken } from '../lib/api'
import { limparSessao, podeCom, useSessao, type Papel } from '../lib/sessao'
import { colunasDoMenu, filtrarAbas, noRamo, type Aba } from '../lib/navegacao'

/** Marca oficial H4C (manual da marca). Lockup horizontal sobre fundo claro. */
function Logo({ altura = 'h-9' }: { altura?: string }) {
  return (
    <img
      src="/marca/logo-h4c.png"
      alt="H4C Distribuição"
      className={`${altura} w-auto shrink-0`}
      draggable={false}
    />
  )
}

const ROTULO_PAPEL: Record<Papel, string> = {
  admin: 'Administrador',
  gestor: 'Gestor',
  leitor: 'Leitor',
}

/**
 * Item da sidebar. O pai de um ramo usa `end`: em /compras/estoque quem se marca ativo é
 * o filho indentado logo abaixo, não os dois ao mesmo tempo.
 */
function ItemSidebar({ aba, filho = false }: { aba: Aba; filho?: boolean }) {
  const { para, rotulo, Icone } = aba
  return (
    <NavLink
      to={para}
      end={!!aba.filhos}
      className={({ isActive }) =>
        `relative flex items-center gap-3 px-3 py-2.5 rounded text-sm font-semibold transition-colors ${
          isActive ? 'bg-primary text-white' : 'text-muted hover:text-ink hover:bg-primary-wash'
        }`
      }
    >
      <Icone className={`shrink-0 ${filho ? 'w-4 h-4' : 'w-4.5 h-4.5'}`} strokeWidth={1.75} />
      <span className={`whitespace-nowrap uppercase tracking-wide ${filho ? 'text-[11px]' : 'text-xs'}`}>
        {rotulo}
      </span>
    </NavLink>
  )
}

/**
 * Casca do BI: menu, identificação de quem está logado e saída.
 *
 * ★ O MENU MOSTRA SÓ O QUE A PESSOA PODE ABRIR, e isso é CONVENIÊNCIA, não controle
 *   de acesso — quem barra é o backend, em `Depends(permissoes.requer(...))` e em
 *   `escopo_rca()`. O papel deste filtro é não oferecer a porta que vai bater na cara.
 *   A trava de verdade contra digitar a URL na mão é a guarda `Protegida` (main.tsx),
 *   e mesmo ela existe só para mostrar recado em vez de erro — o dado nunca vem.
 */
export default function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { sessao } = useSessao()

  const abas = useMemo(
    () => filtrarAbas((recurso) => podeCom(sessao, recurso), sessao?.papel === 'admin'),
    [sessao],
  )

  const sair = () => {
    clearToken()
    limparSessao()
    navigate('/login', { replace: true })
  }

  // ramo com sub-aba aberto (hoje: Compras > Estoque). No mobile não há sidebar para
  // indentar o filho, então ele vira uma faixa de sub-abas acima da barra inferior.
  const ramo = abas.find((a) => a.filhos && noRamo(pathname, a.para))
  const subAbas = ramo ? [ramo, ...(ramo.filhos ?? [])] : []

  return (
    <div className="min-h-dvh flex">
      {/* ===== Sidebar desktop ===== */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-30 w-60 bg-surface border-r border-line flex-col">
        <div className="px-6 py-6 border-b border-line">
          <Logo altura="h-10" />
          <p className="label-caps text-[11px] mt-2.5">Business Intelligence</p>
        </div>

        <nav className="flex-1 px-3 pt-5 flex flex-col gap-1 overflow-y-auto" aria-label="Áreas do BI">
          {abas.map((aba) => (
            <div key={aba.para} className="flex flex-col gap-1">
              <ItemSidebar aba={aba} />
              {aba.filhos && noRamo(pathname, aba.para) && (
                <div className="ml-5 pl-2 border-l border-line flex flex-col gap-1">
                  {aba.filhos.map((f) => (
                    <ItemSidebar key={f.para} aba={f} filho />
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* quem está logado: o BI passou a ter carteira e permissão por pessoa, e sem
            isto ninguém sabe de quem são os números na tela */}
        {sessao && (
          <div className="px-6 py-4 border-t border-line">
            <p className="text-sm font-semibold text-ink truncate" title={sessao.nome}>
              {sessao.nome}
            </p>
            <p className="label-caps text-[10px] mt-0.5 truncate">
              {ROTULO_PAPEL[sessao.papel] ?? sessao.papel}
              {sessao.restrito_a_carteira && ` · RCA ${sessao.codusur ?? '—'}`}
            </p>
            {!sessao.bootstrap && (
              <NavLink
                to="/trocar-senha"
                className="flex items-center gap-2 mt-3 text-muted hover:text-ink transition-colors"
              >
                <KeyRound className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
                <span className="uppercase tracking-wide text-[11px] font-semibold">Trocar senha</span>
              </NavLink>
            )}
          </div>
        )}

        <button
          onClick={sair}
          className="flex items-center gap-3 px-6 py-5 text-sm font-semibold text-muted hover:text-ink border-t border-line transition-colors"
        >
          <LogOut className="shrink-0 w-4.5 h-4.5" strokeWidth={1.75} />
          <span className="uppercase tracking-wide text-xs">Sair</span>
        </button>
      </aside>

      {/* ===== Topbar mobile ===== */}
      <header className="lg:hidden fixed top-0 inset-x-0 z-30 flex items-center gap-3 px-4 py-3 bg-surface border-b border-line">
        <Logo altura="h-7" />
        <div className="ml-auto flex items-center gap-2 min-w-0">
          <span className="dot dot-ativo" aria-hidden />
          <span className="label-caps text-[11px] truncate">{sessao?.login ?? 'Winthor ao vivo'}</span>
        </div>
        {/* Trocar senha e Sair saem da barra inferior porque lá o espaço agora é das áreas */}
        {sessao && !sessao.bootstrap && (
          <NavLink
            to="/trocar-senha"
            aria-label="Trocar senha"
            className="flex items-center px-2 py-2 text-muted hover:text-ink transition-colors"
          >
            <KeyRound className="w-5 h-5" strokeWidth={1.75} />
          </NavLink>
        )}
        <button
          onClick={sair}
          aria-label="Sair"
          className="flex items-center gap-1.5 px-2 py-2 -mr-2 text-muted hover:text-ink transition-colors"
        >
          <LogOut className="w-5 h-5" strokeWidth={1.75} />
        </button>
      </header>

      {/* ===== Bottom nav mobile ===== */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-surface border-t border-line pb-[env(safe-area-inset-bottom)]"
        aria-label="Áreas do BI"
      >
        {subAbas.length > 0 && (
          <div className="flex gap-1 px-3 py-2 border-b border-line bg-floor overflow-x-auto">
            {subAbas.map((sub) => (
              <NavLink
                key={sub.para}
                to={sub.para}
                end
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-sm text-[11px] font-bold uppercase tracking-wide whitespace-nowrap transition-colors ${
                    isActive ? 'bg-primary text-white' : 'text-muted'
                  }`
                }
              >
                {sub.rotuloCurto}
              </NavLink>
            ))}
          </div>
        )}

        {/* o número de colunas acompanha o que a pessoa pode ver: com permissão
            parcial, uma grade fixa de 5 deixaria buracos na barra */}
        <div className={`grid ${colunasDoMenu(abas.length)}`}>
          {/* sem `end`: em /compras/estoque quem acende é o pai Compras — no mobile o
              filho aparece na faixa de sub-abas acima */}
          {abas.map(({ para, rotuloCurto, Icone }) => (
            <NavLink
              key={para}
              to={para}
              className={({ isActive }) =>
                `relative flex flex-col items-center gap-1 py-2.5 px-1 text-[10px] font-bold uppercase tracking-tight transition-colors ${
                  isActive ? 'text-primary' : 'text-muted'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute top-0 w-8 h-0.5 bg-primary" />}
                  <Icone className="w-5 h-5" strokeWidth={1.75} />
                  <span className="max-w-full truncate">{rotuloCurto}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* ===== Conteúdo ===== */}
      <main
        className={`flex-1 min-w-0 lg:ml-60 px-4 sm:px-6 lg:px-12 pt-20 lg:pt-10 max-w-[1440px] ${
          subAbas.length > 0 ? 'pb-36' : 'pb-24'
        } lg:pb-10`}
      >
        {/* ★ O RECORTE DE CARTEIRA PRECISA ESTAR ESCRITO NA TELA. O backend filtra os
            números pelo RCA de quem está logado (`escopo_rca`), e número menor sem
            explicação vira chamado de "o BI está errado". A frase vem pronta do
            backend (`permissoes.descreve_escopo`) para tela e servidor não divergirem. */}
        {sessao?.escopo && (
          <p className="tile flex items-center gap-2 px-3 py-2 mb-5 text-xs text-muted">
            <span className="dot dot-aviso" aria-hidden />
            {sessao.escopo}
          </p>
        )}
        {children}
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Telas de estado da sessão (usadas pela guarda de rota em main.tsx)
// ---------------------------------------------------------------------------

/** Enquanto /api/auth/eu não responde. Sem isto a primeira pintura é tela branca. */
export function TelaCarregando() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-5 px-4">
      <Logo altura="h-10" />
      <div className="skeleton w-40 h-2" />
      <p className="label-caps text-[11px]">Carregando</p>
    </div>
  )
}

/**
 * Recado de página inteira: sem permissão, sem nenhuma aba, sessão que não carregou.
 *
 * ★ Existe para NENHUM desses casos virar tela branca. Tela branca faz a pessoa
 *   recarregar, tentar de novo, ligar para o TI — e o TI não tem o que olhar.
 */
export function TelaAviso({
  titulo,
  texto,
  Icone,
  acaoRotulo,
  onAcao,
  /** Dentro do Layout (a pessoa tem menu para ir a outro lugar): sem ocupar a tela toda. */
  compacto = false,
}: {
  titulo: string
  texto: string
  Icone?: LucideIcon
  acaoRotulo?: string
  onAcao?: () => void
  compacto?: boolean
}) {
  return (
    <div
      className={
        compacto
          ? 'flex flex-col items-center py-10'
          : 'min-h-dvh flex flex-col items-center justify-center px-4 py-10'
      }
    >
      <div className="tile w-full max-w-md p-10 text-center">
        {Icone && <Icone className="w-8 h-8 mx-auto mb-5 text-muted" strokeWidth={1.5} />}
        <h1 className="font-display text-2xl font-bold text-ink">{titulo}</h1>
        <p className="text-muted text-sm mt-3">{texto}</p>
        {acaoRotulo && onAcao && (
          <button
            onClick={onAcao}
            className="btn-primary w-full mt-8 py-3 text-sm font-medium uppercase"
          >
            {acaoRotulo}
          </button>
        )}
      </div>
    </div>
  )
}
