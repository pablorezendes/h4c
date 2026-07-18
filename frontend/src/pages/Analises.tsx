import { useEffect, useRef, useState } from 'react'
import { BrainCircuit, Compass, Microscope, TrendingUpDown } from 'lucide-react'
import Layout from '../components/Layout'
import BotaoExportar from '../components/BotaoExportar'
import BotaoAjuda from '../components/ajuda/BotaoAjuda'
import FiltroBar, { filtroQuery, useFiltro, type Filtro } from '../components/FiltroBar'
import AnaliseViz, { Glossario, type ResultadoAnalise, type Viz } from '../components/AnaliseViz'
import { api } from '../lib/api'

interface ItemCatalogo {
  id: string
  titulo: string
  pergunta_negocio: string
  nivel: 'descritiva' | 'diagnostica' | 'preditiva' | 'prescritiva'
  tecnica?: string
  como_calculado?: string
  como_ler?: string
  viz?: Viz
  status: string
  obs?: string
}

const NIVEIS = [
  { key: 'descritiva', rotulo: 'Descritiva', pergunta: 'O que aconteceu?', Icone: Compass },
  { key: 'diagnostica', rotulo: 'Diagnóstica', pergunta: 'Por que aconteceu?', Icone: Microscope },
  { key: 'preditiva', rotulo: 'Preditiva', pergunta: 'O que vai acontecer?', Icone: TrendingUpDown },
  { key: 'prescritiva', rotulo: 'Prescritiva', pergunta: 'O que devemos fazer?', Icone: BrainCircuit },
] as const

function CardAnalise({ item, filtro }: { item: ItemCatalogo; filtro: Filtro }) {
  const [resultado, setResultado] = useState<ResultadoAnalise | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [visivel, setVisivel] = useState(false)
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // checagem manual + polling: IntersectionObserver e eventos de scroll não
    // disparam em alguns ambientes embutidos (webviews/painéis de preview)
    let limpar: () => void = () => {}
    const checar = () => {
      const r = el.getBoundingClientRect()
      if (r.top < window.innerHeight + 300 && r.bottom > -300) {
        setVisivel(true)
        limpar()
      }
    }
    const intervalo = window.setInterval(checar, 800)
    window.addEventListener('scroll', checar, { passive: true })
    window.addEventListener('resize', checar)
    limpar = () => {
      window.clearInterval(intervalo)
      window.removeEventListener('scroll', checar)
      window.removeEventListener('resize', checar)
    }
    checar()
    return limpar
  }, [])

  useEffect(() => {
    if (!visivel) return
    setCarregando(true)
    setErro(null)
    api<ResultadoAnalise>(`/api/analises/${item.id}?${filtroQuery(filtro)}`)
      .then(setResultado)
      .catch((e) => setErro(String(e.message ?? e)))
      .finally(() => setCarregando(false))
  }, [visivel, filtro, item.id])

  return (
    <section ref={ref} className="tile tile-hover p-4 sm:p-6">
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] font-semibold text-primary">{item.id}</span>
          {item.status !== 'validado' && (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-amber">
              <span className="dot dot-aviso" /> a validar
            </span>
          )}
          <span className="ml-auto flex items-center gap-1">
            <BotaoAjuda contexto={{ tela: 'analises', foco_id: item.id, dt_ini: filtro.dt_ini, dt_fim: filtro.dt_fim }} />
            <BotaoExportar nome={`${item.id} ${item.titulo}`} rows={resultado?.rows} />
          </span>
        </div>
        <h3 className="font-display text-xl font-semibold text-ink mt-1">{item.titulo}</h3>
        <p className="text-muted text-sm mt-1">{item.pergunta_negocio}</p>
        {item.como_ler && (
          <p className="text-sm mt-2.5 px-3 py-2 rounded bg-primary-wash border-l-2 border-l-primary text-ink-soft">
            <span className="font-semibold">Como ler:</span> {item.como_ler}
          </p>
        )}
      </div>

      {carregando && (
        <div className="flex flex-col gap-3 py-4">
          <div className="skeleton h-6 w-2/5" />
          <div className="skeleton h-32 w-full" />
          <p className="text-muted text-xs font-mono text-center">consultando o Winthor…</p>
        </div>
      )}
      {erro && <p className="text-danger text-sm py-4">{erro}</p>}
      {resultado && !carregando && (
        <>
          <AnaliseViz resultado={resultado} />
          {resultado.viz?.tipo !== 'grupos' && <Glossario rows={resultado.rows} />}
          {resultado.viz?.tipo !== 'grupos' && Object.keys(resultado.meta ?? {}).length > 0 && (
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-4 pt-3 border-t border-line">
              {Object.entries(resultado.meta).map(([k, v]) => (
                <span key={k} className="text-[11px] font-mono text-muted">
                  {k.replace(/_/g, ' ')}: <span className="text-ink-soft font-semibold">{typeof v === 'number' ? v.toLocaleString('pt-BR') : String(v)}</span>
                </span>
              ))}
            </div>
          )}
          {item.como_calculado && (
            <p className="text-muted text-xs mt-3 italic">De onde vem o número: {item.como_calculado}</p>
          )}
        </>
      )}
    </section>
  )
}

export default function Analises() {
  const [catalogo, setCatalogo] = useState<ItemCatalogo[]>([])
  const [nivel, setNivel] = useState<string>('descritiva')
  const [filtro, setFiltro] = useFiltro()
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    api<ItemCatalogo[]>('/api/analises')
      .then(setCatalogo)
      .catch((e) => setErro(String(e.message ?? e)))
  }, [])

  const doNivel = catalogo.filter((c) => c.nivel === nivel)

  return (
    <Layout>
      <header className="mb-6 surgir">
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink tracking-tight">Análises</h1>
        <p className="text-muted mt-2 text-sm sm:text-base">
          Escala de maturidade analítica sobre os dados reais do Winthor —{' '}
          <span className="text-primary font-semibold">{catalogo.length} análises</span> projetadas e auditadas
        </p>
      </header>

      <div className="mb-5">
        <FiltroBar filtro={filtro} onChange={setFiltro} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {NIVEIS.map(({ key, rotulo, pergunta, Icone }) => {
          const ativo = nivel === key
          const qtd = catalogo.filter((c) => c.nivel === key).length
          return (
            <button
              key={key}
              onClick={() => setNivel(key)}
              className={`tile p-3.5 sm:p-4 text-left transition-all ${ativo ? 'tile-active' : 'opacity-70 hover:opacity-100'}`}
            >
              <div className="flex items-center gap-2">
                <Icone className={`w-4 h-4 ${ativo ? 'text-primary' : 'text-muted'}`} strokeWidth={1.75} />
                <span className={`font-display font-semibold text-sm ${ativo ? 'text-ink' : 'text-ink-soft'}`}>{rotulo}</span>
                <span className={`ml-auto font-mono text-xs font-semibold ${ativo ? 'text-primary' : 'text-muted'}`}>{qtd}</span>
              </div>
              <p className="text-muted text-xs mt-1.5 italic hidden sm:block">"{pergunta}"</p>
            </button>
          )
        })}
      </div>

      {erro && (
        <div className="tile p-4 mb-6 text-danger text-sm" role="alert">{erro}</div>
      )}
      {!erro && catalogo.length === 0 && (
        <div className="tile p-8 text-center text-muted text-sm">
          Catálogo de análises ainda não gerado (aguardando <span className="font-mono">analises-spec.json</span>).
        </div>
      )}

      <div className="flex flex-col gap-5">
        {doNivel.map((item) => (
          <CardAnalise key={`${item.id}-${nivel}`} item={item} filtro={filtro} />
        ))}
      </div>
      <BotaoAjuda flutuante contexto={{ tela: 'analises', dt_ini: filtro.dt_ini, dt_fim: filtro.dt_fim }} />
    </Layout>
  )
}
