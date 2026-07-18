import { useEffect, useState } from 'react'
import { AlertTriangle, Banknote, CalendarClock, PackageSearch, Sparkles, UserX } from 'lucide-react'
import Layout from '../components/Layout'
import AnaliseViz from '../components/AnaliseViz'
import BotaoAjuda from '../components/ajuda/BotaoAjuda'
import BotaoExportar from '../components/BotaoExportar'
import FiltroBar, { useFiltro } from '../components/FiltroBar'
import { api } from '../lib/api'
import { brl, brlExato, inteiro } from '../lib/format'

interface Resposta {
  id: string
  titulo: string
  rows: Record<string, unknown>[]
  meta: Record<string, unknown>
}

// status por PONTO colorido + texto (design editorial: sem pílulas)
const CHIP_STATUS: Record<string, { rotulo: string; dot: string; texto: string }> = {
  ruptura_iminente: { rotulo: 'Ruptura iminente', dot: 'dot-erro', texto: 'text-danger' },
  atencao: { rotulo: 'Atenção', dot: 'dot-aviso', texto: 'text-amber' },
  saudavel: { rotulo: 'Saudável', dot: 'dot-ativo', texto: 'text-emerald' },
  excesso: { rotulo: 'Excesso', dot: '', texto: 'text-muted' },
  sem_giro: { rotulo: 'Sem giro', dot: '', texto: 'text-muted' },
}

const CHIP_RISCO: Record<string, { rotulo: string; dot: string; texto: string }> = {
  provavelmente_perdido: { rotulo: 'Provavelmente perdido', dot: 'dot-erro', texto: 'text-danger' },
  alto: { rotulo: 'Alto', dot: 'dot-aviso', texto: 'text-amber' },
  medio: { rotulo: 'Médio', dot: '', texto: 'text-ink-soft' },
  saudavel: { rotulo: 'Saudável', dot: 'dot-ativo', texto: 'text-emerald' },
  indefinido: { rotulo: '—', dot: '', texto: 'text-muted' },
}

function Chip({ mapa, valor }: { mapa: Record<string, { rotulo: string; dot: string; texto: string }>; valor: string }) {
  const c = mapa[valor] ?? { rotulo: valor, dot: '', texto: 'text-muted' }
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-mono whitespace-nowrap ${c.texto}`}>
      {c.dot && <span className={`dot ${c.dot}`} />}
      {c.rotulo}
    </span>
  )
}

function Secao({ icone: Icone, titulo, subtitulo, meta, exportar, children }: {
  icone: typeof Sparkles
  titulo: string
  subtitulo: string
  meta?: Record<string, unknown>
  exportar?: Record<string, unknown>[] | null
  children: React.ReactNode
}) {
  return (
    <section className="tile tile-hover p-4 sm:p-6">
      <div className="flex items-start gap-3 mb-1">
        <div className="icon-badge w-9 h-9 shrink-0">
          <Icone className="w-4.5 h-4.5 text-primary-soft" strokeWidth={1.5} />
        </div>
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold text-ink">{titulo}</h2>
          <p className="text-muted text-sm">{subtitulo}</p>
        </div>
        <span className="ml-auto">
          <BotaoExportar nome={titulo} rows={exportar} />
        </span>
      </div>
      <div className="mt-4">{children}</div>
      {meta && (
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-4 pt-3 border-t border-line">
          {Object.entries(meta).map(([k, v]) => (
            <span key={k} className="text-[11px] font-mono text-muted">
              {k.replace(/_/g, ' ')}: <span className="text-ink-soft font-semibold">{typeof v === 'number' ? v.toLocaleString('pt-BR') : String(v)}</span>
            </span>
          ))}
        </div>
      )}
    </section>
  )
}

export default function Futuro() {
  const [forecast, setForecast] = useState<Resposta | null>(null)
  const [sazonal, setSazonal] = useState<Resposta | null>(null)
  const [comprar, setComprar] = useState<Resposta | null>(null)
  const [clientes, setClientes] = useState<Resposta | null>(null)
  const [caixa, setCaixa] = useState<Resposta | null>(null)
  const [demanda, setDemanda] = useState<Resposta | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [filtro, setFiltro] = useFiltro()

  useEffect(() => {
    // as previsoes se ancoram na data final do filtro; dt_ini delimita o aprendizado da sazonalidade
    const anc = `dt_fim=${filtro.dt_fim}`
    Promise.all([
      api<Resposta>(`/api/futuro/forecast-faturamento?horizonte=30&${anc}`),
      api<Resposta>(`/api/futuro/sazonalidade-mensal?dt_ini=${filtro.dt_ini}&${anc}`),
      api<Resposta>(`/api/futuro/quando-comprar?limite=40&${anc}`),
      api<Resposta>(`/api/futuro/clientes-risco?${anc}`),
      api<Resposta>(`/api/futuro/caixa-previsto?semanas=8&${anc}`),
      api<Resposta>(`/api/futuro/demanda-produtos?top=8&${anc}`),
    ])
      .then(([f, s, c, cl, cx, d]) => {
        setForecast(f); setSazonal(s); setComprar(c); setClientes(cl); setCaixa(cx); setDemanda(d)
      })
      .catch((e) => setErro(String(e.message ?? e)))
  }, [filtro.dt_ini, filtro.dt_fim])

  const totalPrevisto = (forecast?.meta?.total_previsto_horizonte as number) ?? null
  const receitaRisco = (clientes?.meta?.receita_em_risco as number) ?? null
  const emRuptura = (comprar?.meta?.em_risco_de_ruptura as number) ?? null
  const caixaPrevisto = (caixa?.meta?.total_previsto as number) ?? null

  const comprarRows = (comprar?.rows ?? []) as Record<string, never>[]
  const clientesRows = ((clientes?.rows ?? []) as Record<string, never>[]).filter(
    (r) => r['risco'] === 'alto' || r['risco'] === 'provavelmente_perdido',
  )

  return (
    <Layout>
      {/* Hero */}
      <header className="tile tile-accent-left p-5 sm:p-8 mb-6 surgir">
        <div className="flex items-center gap-3">
          <Sparkles className="w-6 h-6 sm:w-7 sm:h-7 text-primary" strokeWidth={1.5} />
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-ink">Veja o Futuro</h1>
        </div>
        <p className="text-muted mt-2 max-w-2xl">
          Modelos preditivos sobre os dados reais do Winthor: o que você vai faturar, o que comprar antes que falte,
          quem está prestes a te abandonar e quanto vai entrar no caixa.
        </p>
        <div className="grid grid-cols-1 min-[480px]:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mt-6">
          {[
            { rotulo: 'Faturamento previsto 30d', valor: totalPrevisto !== null ? brl.format(totalPrevisto) : '…', tom: 'text-primary' },
            { rotulo: 'Caixa previsto 8 semanas', valor: caixaPrevisto !== null ? brl.format(caixaPrevisto) : '…', tom: 'text-ink' },
            { rotulo: 'Produtos top em risco de ruptura', valor: emRuptura !== null ? String(emRuptura) : '…', tom: 'text-amber' },
            { rotulo: 'Receita em risco de churn', valor: receitaRisco !== null ? brl.format(receitaRisco) : '…', tom: 'text-danger' },
          ].map((c, i) => (
            <div key={c.rotulo} className={`rounded border border-line bg-floor px-4 sm:px-5 py-3.5 sm:py-4 surgir surgir-${i + 1}`}>
              <p className="label-caps">{c.rotulo}</p>
              <p className={`num text-2xl sm:text-3xl font-bold mt-1.5 ${c.tom}`}>{c.valor}</p>
            </div>
          ))}
        </div>
      </header>

      <div className="mb-5">
        <FiltroBar filtro={filtro} onChange={setFiltro} mostrarHora={false} />
        <p className="text-muted text-[11px] font-mono mt-1.5">
          As previsões partem da data final do período ({filtro.dt_fim.split('-').reverse().join('/')}) — mude a data para "ver o futuro" a partir de outro dia.
        </p>
      </div>

      {erro && <div className="tile p-4 mb-6 text-danger text-sm" role="alert">{erro}</div>}

      <div className="flex flex-col gap-5">
        {forecast && (
          <Secao exportar={forecast.rows} icone={Sparkles} titulo={forecast.titulo} subtitulo="Linha cheia = o que já aconteceu; linha tracejada = o que esperamos; a faixa clara mostra a margem de erro" meta={forecast.meta}>
            <AnaliseViz resultado={{ ...forecast, nivel: 'preditiva', viz: { tipo: 'linha', x: 'dia', y: 'valor' } }} />
          </Secao>
        )}

        {comprar && (
          <Secao
            exportar={comprar.rows}
            icone={PackageSearch}
            titulo="O que comprar — e quando"
            subtitulo="Por produto: demanda recente, estoque disponível, dias até a ruptura, mês de pico histórico e a sugestão de compra para 30 dias de cobertura"
            meta={comprar.meta}
          >
            <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card z-10">
                  <tr>
                    {[
                      { h: 'Produto' },
                      { h: 'Situação' },
                      { h: 'Venda/dia (28d)', so: 'hidden md:table-cell' },
                      { h: 'Tendência', so: 'hidden lg:table-cell' },
                      { h: 'Estoque disp.', so: 'hidden sm:table-cell' },
                      { h: 'Dias p/ ruptura' },
                      { h: 'Mês de pico', so: 'hidden lg:table-cell' },
                      { h: 'Comprar agora' },
                    ].map(({ h, so }) => (
                      <th key={h} className={`font-display font-semibold text-ink text-left px-2 sm:px-3 py-2 border-b border-line-strong ${so ?? ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comprarRows.map((r) => (
                    <tr key={String(r['codprod'])} className="hover:bg-primary-wash transition-colors">
                      <td className="px-2 sm:px-3 py-2 border-b border-line text-ink-soft max-w-[40vw] sm:max-w-72 truncate" title={String(r['descricao'])}>
                        {String(r['descricao'])}
                      </td>
                      <td className="px-2 sm:px-3 py-2 border-b border-line"><Chip mapa={CHIP_STATUS} valor={String(r['status'])} /></td>
                      <td className="px-3 py-2 border-b border-line text-right font-mono hidden md:table-cell">{Number(r['media_dia_28d']).toLocaleString('pt-BR')}</td>
                      <td className={`px-3 py-2 border-b border-line text-right font-mono hidden lg:table-cell ${Number(r['tendencia_pct']) >= 0 ? 'text-emerald' : 'text-amber'}`}>
                        {Number(r['tendencia_pct']) >= 0 ? '+' : ''}{Number(r['tendencia_pct']).toLocaleString('pt-BR')}%
                      </td>
                      <td className="px-3 py-2 border-b border-line text-right font-mono hidden sm:table-cell">{inteiro.format(Number(r['estoque_disponivel']))}</td>
                      <td className="px-2 sm:px-3 py-2 border-b border-line text-right font-mono">
                        {r['dias_ate_ruptura'] === null ? '—' : Number(r['dias_ate_ruptura']).toLocaleString('pt-BR')}
                      </td>
                      <td className="px-3 py-2 border-b border-line text-ink-soft hidden lg:table-cell">{String(r['mes_pico'] ?? '—')}</td>
                      <td className="px-2 sm:px-3 py-2 border-b border-line text-right font-mono font-semibold text-ink">
                        {Number(r['comprar_agora_un']) > 0 ? `${inteiro.format(Number(r['comprar_agora_un']))} un` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Secao>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {demanda && (
            <Secao exportar={demanda.rows} icone={CalendarClock} titulo={demanda.titulo} subtitulo="Unidades vendidas nos últimos 30 dias vs previsão para os próximos 30" meta={demanda.meta}>
              <AnaliseViz resultado={{ ...demanda, nivel: 'preditiva', viz: { tipo: 'barra_h', x: 'descricao' } }} />
            </Secao>
          )}
          {caixa && (
            <Secao exportar={caixa.rows} icone={Banknote} titulo={caixa.titulo} subtitulo="Títulos em aberto deslocados pelo comportamento histórico de pagamento" meta={caixa.meta}>
              <AnaliseViz resultado={{ ...caixa, nivel: 'preditiva', viz: { tipo: 'barra', x: 'semana', y: 'valor_previsto' } }} />
            </Secao>
          )}
        </div>

        {sazonal && (
          <Secao exportar={sazonal.rows} icone={CalendarClock} titulo="Em qual mês comprar mais" subtitulo="Faturamento por mês observado × departamento — os meses fortes de cada categoria indicam quando estocar antes" meta={sazonal.meta}>
            <AnaliseViz resultado={{ ...sazonal, nivel: 'preditiva', viz: { tipo: 'heatmap', x: 'mes', serie: 'departamento', y: 'faturamento' } }} />
          </Secao>
        )}

        {clientes && (
          <Secao
            exportar={clientes.rows}
            icone={UserX}
            titulo="Clientes em risco de abandono"
            subtitulo="Quem está há mais tempo sem comprar do que o próprio ritmo histórico — ordene a carteira de visitas por aqui"
            meta={clientes.meta}
          >
            {clientesRows.length === 0 ? (
              <p className="text-muted text-sm py-6 text-center">Nenhum cliente em risco alto no momento.</p>
            ) : (
              <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card z-10">
                    <tr>
                      {[
                        { h: 'Cliente' },
                        { h: 'RCA', so: 'hidden lg:table-cell' },
                        { h: 'Risco' },
                        { h: 'Última compra', so: 'hidden md:table-cell' },
                        { h: 'Dias parado' },
                        { h: 'Ciclo médio', so: 'hidden lg:table-cell' },
                        { h: 'Valor histórico', so: 'hidden sm:table-cell' },
                      ].map(({ h, so }) => (
                        <th key={h} className={`font-display font-semibold text-ink text-left px-2 sm:px-3 py-2 border-b border-line-strong ${so ?? ''}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {clientesRows.map((r) => (
                      <tr key={String(r['codcli'])} className="hover:bg-primary-wash transition-colors">
                        <td className="px-2 sm:px-3 py-2 border-b border-line text-ink-soft max-w-[42vw] sm:max-w-64 truncate" title={String(r['cliente'])}>{String(r['cliente'])}</td>
                        <td className="px-3 py-2 border-b border-line text-muted whitespace-nowrap hidden lg:table-cell">{String(r['rca'] ?? '—')}</td>
                        <td className="px-2 sm:px-3 py-2 border-b border-line"><Chip mapa={CHIP_RISCO} valor={String(r['risco'])} /></td>
                        <td className="px-3 py-2 border-b border-line font-mono hidden md:table-cell">{String(r['ultima_compra'])}</td>
                        <td className="px-2 sm:px-3 py-2 border-b border-line text-right font-mono text-amber">{inteiro.format(Number(r['dias_sem_comprar']))}</td>
                        <td className="px-3 py-2 border-b border-line text-right font-mono hidden lg:table-cell">{Number(r['ciclo_medio_dias']).toLocaleString('pt-BR')}d</td>
                        <td className="px-3 py-2 border-b border-line text-right font-mono text-ink hidden sm:table-cell">{brlExato.format(Number(r['valor_total']))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Secao>
        )}

        <div className="tile p-4 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber shrink-0 mt-0.5" strokeWidth={1.5} />
          <p className="text-muted text-xs leading-relaxed">
            Honestidade estatística: a base tem ~9 meses de histórico (out/2025 em diante). Os modelos usam tendência,
            sazonalidade de dia-da-semana e o padrão mensal <em>observado</em> — a sazonalidade anual completa só fica
            confiável com 12+ meses de dados (a partir de out/2026 os "meses de pico" cobrem o ano inteiro).
          </p>
        </div>
      </div>

      <BotaoAjuda flutuante contexto={{ tela: 'futuro', dt_ini: filtro.dt_ini, dt_fim: filtro.dt_fim }} />
    </Layout>
  )
}
