import { ArrowRight, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

/**
 * Radar de ação: o que precisa de atenção AGORA, com atalho para onde agir.
 *
 * ★ `para` é opcional e aceita âncora da própria página ('#churn'). O detalhamento
 *   do alerta comercial mora na MESMA aba, logo abaixo — mandar o gestor para outra
 *   rota só para voltar seria ruído. Sem destino, o card é leitura pura.
 */
export interface Alerta {
  icone: LucideIcon
  tom: 'erro' | 'aviso' | 'ok'
  numero: string
  titulo: string
  detalhe?: string
  /** Rota ('/financeiro') ou âncora nesta página ('#mix'). Ausente = card sem link. */
  para?: string
}

const TOM = {
  erro: { dot: 'dot-erro', texto: 'text-danger' },
  aviso: { dot: 'dot-aviso', texto: 'text-amber' },
  ok: { dot: 'dot-ativo', texto: 'text-emerald' },
} as const

const CLASSE_CARD = 'tile tile-hover p-4 flex flex-col gap-2 group'

export default function Radar({ alertas, titulo = 'Radar de ação' }: { alertas: Alerta[]; titulo?: string }) {
  if (!alertas.length) return null
  return (
    <section className="surgir surgir-2">
      <div className="flex items-baseline gap-3 mb-3">
        <h2 className="label-caps">{titulo}</h2>
        <span className="h-px flex-1 bg-line" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {alertas.map((a) => {
          const t = TOM[a.tom]
          const conteudo = (
            <>
              <div className="flex items-center gap-2">
                <span className={`dot ${t.dot}`} />
                <a.icone className="w-4 h-4 text-muted" strokeWidth={1.75} />
                <span className="label-caps">{a.titulo}</span>
              </div>
              <p className={`num text-2xl font-bold ${t.texto}`}>{a.numero}</p>
              <p className="flex items-center justify-between gap-2 text-xs text-muted min-h-4">
                <span className="truncate">{a.detalhe}</span>
                {a.para && (
                  <span className="inline-flex items-center gap-1 font-mono font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    ver <ArrowRight className="w-3 h-3" />
                  </span>
                )}
              </p>
            </>
          )

          if (!a.para) {
            return (
              <div key={a.titulo} className={CLASSE_CARD}>
                {conteudo}
              </div>
            )
          }
          // âncora interna: <Link to="#x"> do react-router reescreve o caminho e
          // perderia a rota atual — para rolar dentro da página vale o <a> puro
          if (a.para.startsWith('#')) {
            return (
              <a key={a.titulo} href={a.para} className={CLASSE_CARD}>
                {conteudo}
              </a>
            )
          }
          return (
            <Link key={a.titulo} to={a.para} className={CLASSE_CARD}>
              {conteudo}
            </Link>
          )
        })}
      </div>
    </section>
  )
}
