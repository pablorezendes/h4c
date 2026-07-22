import { type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { clearToken } from '../lib/api'
import { ABAS, noRamo, type Aba } from '../lib/navegacao'

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

export default function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const sair = () => {
    clearToken()
    navigate('/login')
  }

  // ramo com sub-aba aberto (hoje: Compras > Estoque). No mobile não há sidebar para
  // indentar o filho, então ele vira uma faixa de sub-abas acima da barra inferior.
  const ramo = ABAS.find((a) => a.filhos && noRamo(pathname, a.para))
  const subAbas = ramo ? [ramo, ...(ramo.filhos ?? [])] : []

  return (
    <div className="min-h-dvh flex">
      {/* ===== Sidebar desktop ===== */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-30 w-60 bg-surface border-r border-line flex-col">
        <div className="px-6 py-6 border-b border-line">
          <Logo altura="h-10" />
          <p className="label-caps text-[11px] mt-2.5">Business Intelligence</p>
        </div>

        <nav className="flex-1 px-3 pt-5 flex flex-col gap-1" aria-label="Áreas do BI">
          {ABAS.map((aba) => (
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
        <div className="ml-auto flex items-center gap-2">
          <span className="dot dot-ativo" aria-hidden />
          <span className="label-caps text-[11px]">Winthor ao vivo</span>
        </div>
        {/* Sair sai da barra inferior porque lá o espaço agora é das 5 áreas */}
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

        <div className="grid grid-cols-5">
          {/* sem `end`: em /compras/estoque quem acende é o pai Compras — no mobile o
              filho aparece na faixa de sub-abas acima */}
          {ABAS.map(({ para, rotuloCurto, Icone }) => (
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
        {children}
      </main>
    </div>
  )
}
