import { type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { FlaskConical, LayoutDashboard, LogOut, Sparkles } from 'lucide-react'
import { clearToken } from '../lib/api'

const NAV = [
  { para: '/', rotulo: 'Visão geral', Icone: LayoutDashboard },
  { para: '/analises', rotulo: 'Análises', Icone: FlaskConical },
  { para: '/futuro', rotulo: 'Veja o Futuro', Icone: Sparkles },
]

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

export default function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const sair = () => {
    clearToken()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex">
      {/* ===== Sidebar desktop ===== */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-30 w-60 bg-surface border-r border-line flex-col">
        <div className="px-6 py-6 border-b border-line">
          <Logo altura="h-10" />
          <p className="label-caps text-[10px] mt-2.5">Business Intelligence</p>
        </div>

        <nav className="flex-1 px-3 pt-5 flex flex-col gap-1">
          {NAV.map(({ para, rotulo, Icone }) => (
            <NavLink
              key={para}
              to={para}
              end={para === '/'}
              className={({ isActive }) =>
                `relative flex items-center gap-3 px-3 py-2.5 rounded text-sm font-semibold transition-colors ${
                  isActive ? 'bg-primary text-white' : 'text-muted hover:text-ink hover:bg-primary-wash'
                }`
              }
            >
              <Icone className="shrink-0 w-4.5 h-4.5" strokeWidth={1.75} />
              <span className="whitespace-nowrap uppercase tracking-wide text-xs">{rotulo}</span>
            </NavLink>
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
          <span className="label-caps text-[10px]">Winthor ao vivo</span>
        </div>
      </header>

      {/* ===== Bottom nav mobile ===== */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-surface border-t border-line pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-4">
          {NAV.map(({ para, rotulo, Icone }) => (
            <NavLink
              key={para}
              to={para}
              end={para === '/'}
              className={({ isActive }) =>
                `relative flex flex-col items-center gap-1 py-2.5 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                  isActive ? 'text-primary' : 'text-muted'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute top-0 w-8 h-0.5 bg-primary" />}
                  <Icone className="w-5 h-5" strokeWidth={1.75} />
                  {rotulo.split(' ')[0] === 'Veja' ? 'Futuro' : rotulo.split(' ')[0]}
                </>
              )}
            </NavLink>
          ))}
          <button onClick={sair} className="flex flex-col items-center gap-1 py-2.5 text-[10px] font-bold uppercase tracking-wide text-muted">
            <LogOut className="w-5 h-5" strokeWidth={1.75} />
            Sair
          </button>
        </div>
      </nav>

      {/* ===== Conteúdo ===== */}
      <main className="flex-1 min-w-0 lg:ml-60 px-4 sm:px-6 lg:px-12 pt-20 lg:pt-10 pb-24 lg:pb-10 max-w-[1440px]">
        {children}
      </main>
    </div>
  )
}
