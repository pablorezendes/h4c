import { useEffect, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, X } from 'lucide-react'

/**
 * Peças pequenas da tela de Configurações.
 *
 * Só tokens e utilitárias que já existem em index.css (.tile, .label-caps, .num,
 * .chip, .input-dark, .dot-*, .btn-primary) — Paper & Ink não tem sombra, blur
 * nem gradiente, e esta tela não é exceção só por ser de administração.
 */

/** Botão secundário. Alto o bastante no celular (44px) e compacto no desktop. */
export const BOTAO =
  'inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 min-h-11 sm:min-h-9 '
  + 'rounded-sm border border-line bg-card text-sm sm:text-xs font-mono font-semibold text-ink-soft '
  + 'hover:border-line-strong hover:bg-primary-wash transition-colors '
  + 'disabled:opacity-40 disabled:pointer-events-none'

export const BOTAO_PRINCIPAL =
  'btn-primary inline-flex items-center justify-center gap-2 px-4 py-2 min-h-11 sm:min-h-9 text-sm '
  + 'disabled:opacity-40 disabled:pointer-events-none'

/** Ação destrutiva: mesma forma do secundário, tinta de perigo. Nunca vermelho cheio. */
export const BOTAO_PERIGO = `${BOTAO} text-danger hover:border-danger`

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="text-muted text-sm font-mono py-6 text-center">{children}</p>
}

export function Esqueleto({ altura = 'h-24' }: { altura?: string }) {
  return <div className={`skeleton w-full ${altura}`} />
}

export function Nota({ children }: { children: ReactNode }) {
  return <p className="text-muted text-xs mt-3 leading-relaxed">{children}</p>
}

const TOM: Record<string, { icone: typeof Info; classe: string }> = {
  info: { icone: Info, classe: 'text-ink-soft' },
  alerta: { icone: AlertTriangle, classe: 'text-amber' },
  erro: { icone: ShieldAlert, classe: 'text-danger' },
  ok: { icone: CheckCircle2, classe: 'text-emerald' },
}

/** Faixa de aviso. O ícone segue o tom; a borda continua sendo a do .tile. */
export function Aviso({
  tom = 'info',
  children,
  aoFechar,
}: {
  tom?: 'info' | 'alerta' | 'erro' | 'ok'
  children: ReactNode
  aoFechar?: () => void
}) {
  const { icone: Icone, classe } = TOM[tom] ?? TOM.info
  return (
    <div className={`tile p-3.5 flex items-start gap-2.5 text-sm ${classe}`} role="status">
      <Icone className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} aria-hidden />
      <div className="min-w-0 flex-1 leading-relaxed">{children}</div>
      {aoFechar && (
        <button
          onClick={aoFechar}
          aria-label="Fechar aviso"
          className="text-muted hover:text-ink shrink-0 -mt-0.5 -mr-0.5 p-1"
        >
          <X className="w-4 h-4" strokeWidth={1.75} />
        </button>
      )}
    </div>
  )
}

/** Rótulo + campo, com a explicação em português embaixo. */
export function Campo({
  rotulo,
  dica,
  children,
  htmlFor,
}: {
  rotulo: string
  dica?: ReactNode
  children: ReactNode
  htmlFor?: string
}) {
  return (
    <div className="min-w-0">
      <label className="label-caps block mb-1.5" htmlFor={htmlFor}>
        {rotulo}
      </label>
      {children}
      {dica && <p className="text-muted text-xs mt-1.5 leading-relaxed">{dica}</p>}
    </div>
  )
}

export const CLASSE_INPUT = 'input-dark w-full px-3 py-2 text-sm'

/**
 * Caixa de marcação com rótulo clicável.
 * `accent-primary` pinta o controle nativo com o oliva da marca — nada de
 * reimplementar checkbox em div, que quebra teclado e leitor de tela.
 */
export function Marcar({
  marcado,
  aoMudar,
  rotulo,
  dica,
  desabilitado = false,
  parcial = false,
  forte = false,
}: {
  marcado: boolean
  aoMudar: (v: boolean) => void
  rotulo: ReactNode
  dica?: ReactNode
  desabilitado?: boolean
  parcial?: boolean
  forte?: boolean
}) {
  return (
    <label
      className={`flex items-start gap-2.5 ${desabilitado ? 'opacity-60' : 'cursor-pointer'}`}
    >
      <input
        type="checkbox"
        checked={marcado}
        disabled={desabilitado}
        onChange={(e) => aoMudar(e.target.checked)}
        // indeterminate só existe em JS: é a aba com ALGUNS relatórios marcados
        ref={(el) => {
          if (el) el.indeterminate = parcial && !marcado
        }}
        className="mt-0.5 w-4 h-4 shrink-0 accent-primary"
      />
      <span className="min-w-0">
        <span className={`block text-sm leading-snug ${forte ? 'font-display font-semibold text-ink' : 'text-ink-soft'}`}>
          {rotulo}
        </span>
        {dica && <span className="block text-muted text-xs mt-0.5 leading-relaxed">{dica}</span>}
      </span>
    </label>
  )
}

/**
 * Janela modal. Fecha no Esc e no clique fora — as duas saídas que a pessoa tenta
 * antes de procurar o X.
 */
export function Modal({
  titulo,
  children,
  aoFechar,
  largura = 'max-w-xl',
}: {
  titulo: string
  children: ReactNode
  aoFechar: () => void
  largura?: string
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar()
    }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [aoFechar])

  return (
    <>
      <div className="fixed inset-0 bg-ink/20 z-40" onClick={aoFechar} aria-hidden />
      <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-6 pointer-events-none overflow-y-auto">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={titulo}
          className={`tile w-full ${largura} bg-surface pointer-events-auto my-auto`}
        >
          <header className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-line">
            <h3 className="font-display text-lg font-semibold text-ink">{titulo}</h3>
            <button onClick={aoFechar} aria-label="Fechar" className="text-muted hover:text-ink p-1 -mr-1">
              <X className="w-4.5 h-4.5" strokeWidth={1.75} />
            </button>
          </header>
          <div className="px-4 sm:px-5 py-4">{children}</div>
        </div>
      </div>
    </>
  )
}

/**
 * Confirmação explícita. Existe para as duas decisões que não se desfazem sozinhas:
 * desativar alguém (derruba a sessão na hora) e promover a administrador (passa a
 * mandar em todo mundo, inclusive em quem promoveu).
 */
export function Confirmar({
  titulo,
  children,
  rotuloConfirmar,
  perigo = false,
  ocupado = false,
  aoConfirmar,
  aoCancelar,
}: {
  titulo: string
  children: ReactNode
  rotuloConfirmar: string
  perigo?: boolean
  ocupado?: boolean
  aoConfirmar: () => void
  aoCancelar: () => void
}) {
  return (
    <Modal titulo={titulo} aoFechar={aoCancelar} largura="max-w-md">
      <div className="text-sm text-ink-soft leading-relaxed">{children}</div>
      <div className="flex flex-wrap justify-end gap-2 mt-5">
        <button className={BOTAO} onClick={aoCancelar} disabled={ocupado}>
          Cancelar
        </button>
        <button
          className={perigo ? BOTAO_PERIGO : BOTAO_PRINCIPAL}
          onClick={aoConfirmar}
          disabled={ocupado}
        >
          {rotuloConfirmar}
        </button>
      </div>
    </Modal>
  )
}
