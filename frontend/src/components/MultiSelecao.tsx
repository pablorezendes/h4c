import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import type { Opcao } from '../lib/dimensoes'

/**
 * Seleção múltipla em popover (RCA, Departamento).
 *
 * ★ Convenção do BI: NENHUM item marcado = TODOS. É o mesmo resultado de marcar todos,
 *   e é o que o backend entende por lista vazia — por isso o gatilho mostra "Todos os
 *   RCAs" nas duas pontas (nada marcado ou tudo marcado) e o popover diz isso em texto.
 */
function textoGatilho(opcoes: Opcao[], selecionados: number[], rotuloTodos: string): string {
  const n = selecionados.length
  if (n === 0 || (opcoes.length > 0 && n >= opcoes.length)) return rotuloTodos
  if (n === 1) {
    const achado = opcoes.find((o) => o.valor === selecionados[0])
    return achado ? achado.rotulo : `${selecionados[0]}`
  }
  return `${n} selecionados`
}

export default function MultiSelecao({
  opcoes,
  selecionados,
  onChange,
  rotuloTodos,
  rotuloFiltro,
  carregando = false,
  erro = false,
}: {
  opcoes: Opcao[]
  selecionados: number[]
  onChange: (valores: number[]) => void
  /** Texto quando não há filtro aplicado, ex.: "Todos os RCAs". */
  rotuloTodos: string
  /** Nome da dimensão para leitores de tela, ex.: "RCA". */
  rotuloFiltro: string
  carregando?: boolean
  erro?: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const caixa = useRef<HTMLDivElement>(null)
  const gatilho = useRef<HTMLButtonElement>(null)
  const campoBusca = useRef<HTMLInputElement>(null)
  const idPainel = useId()

  const desabilitado = carregando || erro || opcoes.length === 0

  // clique fora e foco que escapa (tab) fecham o popover
  useEffect(() => {
    if (!aberto) return
    const fora = (e: Event) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    document.addEventListener('focusin', fora)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('focusin', fora)
    }
  }, [aberto])

  useEffect(() => {
    if (aberto) campoBusca.current?.focus()
    else setBusca('')
  }, [aberto])

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return opcoes
    return opcoes.filter((o) => o.rotulo.toLowerCase().includes(termo) || String(o.valor) === termo)
  }, [opcoes, busca])

  const alternar = (valor: number) => {
    onChange(
      selecionados.includes(valor)
        ? selecionados.filter((v) => v !== valor)
        : [...selecionados, valor].sort((a, b) => a - b),
    )
  }

  const fechar = () => {
    setAberto(false)
    gatilho.current?.focus()
  }

  const rotulo = desabilitado
    ? carregando
      ? 'carregando…'
      : erro
        ? 'indisponível'
        : 'sem opções'
    : textoGatilho(opcoes, selecionados, rotuloTodos)

  const filtrando = selecionados.length > 0 && selecionados.length < opcoes.length

  return (
    <div
      className="relative"
      ref={caixa}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && aberto) {
          e.stopPropagation()
          fechar()
        }
      }}
    >
      <button
        type="button"
        ref={gatilho}
        disabled={desabilitado}
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-controls={aberto ? idPainel : undefined}
        aria-label={`Filtrar por ${rotuloFiltro}: ${rotulo}`}
        className={`input-dark flex items-center gap-2 px-3 py-2 text-sm min-w-[11rem] w-full sm:w-auto text-left ${
          desabilitado ? 'opacity-50 cursor-not-allowed' : 'hover:border-line-strong'
        } ${filtrando ? 'border-primary' : ''}`}
      >
        <span className="truncate flex-1">{rotulo}</span>
        <ChevronDown className="w-4 h-4 shrink-0 text-muted" strokeWidth={1.75} />
      </button>

      {aberto && (
        <div
          id={idPainel}
          role="dialog"
          aria-label={`Filtro de ${rotuloFiltro}`}
          className="tile absolute z-40 mt-1 left-0 w-full sm:w-72 p-2 flex flex-col gap-2"
        >
          <div className="flex items-center gap-2 border border-line rounded-sm px-2">
            <Search className="w-3.5 h-3.5 text-muted shrink-0" strokeWidth={1.75} />
            <input
              ref={campoBusca}
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar"
              aria-label={`Buscar ${rotuloFiltro}`}
              className="flex-1 bg-transparent py-2 text-sm font-mono outline-none min-w-0"
            />
          </div>

          <div className="max-h-56 overflow-y-auto flex flex-col" role="group" aria-label={rotuloFiltro}>
            {filtradas.length === 0 && (
              <p className="text-muted text-xs font-mono px-2 py-3">nada encontrado</p>
            )}
            {filtradas.map((o) => {
              const marcado = selecionados.includes(o.valor)
              return (
                <label
                  key={o.valor}
                  className="flex items-center gap-2 px-2 py-2 rounded-sm cursor-pointer hover:bg-primary-wash"
                >
                  <input
                    type="checkbox"
                    checked={marcado}
                    onChange={() => alternar(o.valor)}
                    className="w-4 h-4 accent-primary shrink-0"
                  />
                  <span className="text-sm truncate flex-1">{o.rotulo}</span>
                  {marcado && <Check className="w-3.5 h-3.5 text-primary shrink-0" strokeWidth={2} />}
                </label>
              )
            })}
          </div>

          <div className="flex items-center gap-3 border-t border-line pt-2">
            <button
              type="button"
              onClick={() => onChange(opcoes.map((o) => o.valor))}
              className="text-xs font-mono text-muted hover:text-ink underline"
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-xs font-mono text-muted hover:text-ink underline"
            >
              Limpar
            </button>
            <span className="ml-auto text-[11px] font-mono text-muted">nada marcado = todos</span>
          </div>
        </div>
      )}
    </div>
  )
}
