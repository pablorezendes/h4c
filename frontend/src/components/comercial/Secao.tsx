import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

/**
 * Casca das seções da aba Comercial: título, subtítulo, ações e — o que importa —
 * os três estados degradados.
 *
 * ★ Endpoint que falha NUNCA derruba a tela. A seção continua no lugar com um aviso
 *   discreto: o gestor precisa saber que aquele bloco não carregou, e não perder o
 *   resto do painel por causa dele.
 */
export default function Secao({
  id,
  titulo,
  descricao,
  acoes,
  aviso,
  erro,
  carregando,
  vazio,
  mensagemVazio = 'Sem dados no período.',
  atraso,
  children,
}: {
  id?: string
  titulo: string
  descricao?: string
  acoes?: ReactNode
  /** Ressalva de leitura (ex.: mês parcial). Fica visível junto do conteúdo. */
  aviso?: string | null
  erro?: string | null
  carregando?: boolean
  vazio?: boolean
  mensagemVazio?: string
  /** 1..4 — escalona a entrada suave das seções. */
  atraso?: 1 | 2 | 3 | 4
  children: ReactNode
}) {
  return (
    <section
      id={id}
      className={`tile tile-hover p-4 sm:p-6 surgir${atraso ? ` surgir-${atraso}` : ''} scroll-mt-24`}
    >
      <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold text-ink">{titulo}</h2>
          {descricao && <p className="text-muted text-sm mt-0.5">{descricao}</p>}
        </div>
        {acoes}
      </div>

      {aviso && (
        <p className="mb-4 flex items-start gap-2 text-[11px] font-mono text-amber leading-relaxed">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" strokeWidth={1.75} />
          <span>{aviso}</span>
        </p>
      )}

      {erro ? (
        <p className="text-muted text-sm py-6 text-center font-mono" role="status">
          Não foi possível carregar este bloco.
          <span className="block text-[11px] mt-1 break-words">{erro}</span>
        </p>
      ) : carregando ? (
        <div className="flex flex-col gap-2 py-2" aria-busy="true">
          <div className="skeleton h-4 w-1/3" />
          <div className="skeleton h-24 w-full" />
        </div>
      ) : vazio ? (
        <p className="text-muted text-sm py-6 text-center">{mensagemVazio}</p>
      ) : (
        children
      )}
    </section>
  )
}
