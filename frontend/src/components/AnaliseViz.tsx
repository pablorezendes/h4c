/** Renderizador genérico de análises por viz.tipo.
 *  Cores: paleta categórica validada (dataviz) — serie1..serie4. */
import { Fragment } from 'react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts'

export interface Viz {
  tipo: string
  x?: string
  y?: string
  serie?: string
  descricao?: string
  escala?: string // 'divergente' = verde acima do ponto médio, vermelho abaixo
  ponto_medio?: number | 'media'
}

export interface ResultadoAnalise {
  id: string
  titulo: string
  nivel: string
  viz?: Viz
  meta: Record<string, unknown>
  rows: Record<string, unknown>[]
}

// paleta categórica validada (dataviz) para fundo papel: azul, terracota, ocre, oliva
const PALETA = ['#215fa6', '#b23a2a', '#9a6a00', '#5b691d']
const OLIVA = '#5b691d'
const GRADE = 'rgba(27, 28, 25, 0.08)'
const EIXO = '#6b6e64'
const eNum = (v: unknown): v is number => typeof v === 'number' && isFinite(v)

const fmtBR = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
function fmtCompacto(v: unknown): string {
  if (!eNum(v)) return String(v ?? '—')
  if (Math.abs(v) >= 1_000_000) return `${fmtBR.format(v / 1_000_000)} mi`
  if (Math.abs(v) >= 10_000) return `${fmtBR.format(v / 1_000)} mil`
  return fmtBR.format(v)
}

const eData = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}/.test(v)
const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** Rótulo amigável: datas ISO viram "abr/26", números ganham separador. */
function fmtRotulo(v: unknown): string {
  if (eData(v)) {
    const s = v as string
    return `${MES_CURTO[Number(s.slice(5, 7)) - 1]}/${s.slice(2, 4)}`
  }
  if (eNum(v)) return v.toLocaleString('pt-BR')
  return String(v ?? '—')
}

/** Estatísticas simples por coluna para classificar papel (dimensão × medida). */
function perfilColunas(rows: Record<string, unknown>[]) {
  const chaves = Object.keys(rows[0] ?? {})
  return Object.fromEntries(
    chaves.map((k) => {
      const vals = rows.map((r) => r[k])
      const numerica = vals.filter(eNum).length > rows.length / 2
      const distintos = new Set(vals.map((v) => String(v))).size
      return [k, { numerica, distintos }]
    }),
  ) as Record<string, { numerica: boolean; distintos: number }>
}

/** Dimensão = texto/data, ou numérica com poucos valores distintos (ex.: hora 0-23). */
function ehDimensao(k: string | undefined, rows: Record<string, unknown>[], stats: ReturnType<typeof perfilColunas>): k is string {
  if (!k || !(k in stats)) return false
  return !stats[k].numerica || eData(rows[0]?.[k]) || stats[k].distintos <= 31
}

/** Deduz eixo de categoria (x) e medidas (ys), tolerando specs com papéis trocados. */
function deduzir(rows: Record<string, unknown>[], viz?: Viz): { x: string; ys: string[] } {
  const chaves = Object.keys(rows[0] ?? {})
  const stats = perfilColunas(rows)
  const medida = (k?: string) => !!k && k in stats && stats[k].numerica

  let x = viz?.x && chaves.includes(viz.x) ? viz.x : undefined
  let yPref = viz?.y && chaves.includes(viz.y) ? viz.y : undefined
  // spec com papéis invertidos (x = valor, y = categoria): destroca
  if (x && yPref && medida(x) && !medida(yPref) && ehDimensao(yPref, rows, stats)) {
    ;[x, yPref] = [yPref, x]
  }
  if (!x || !ehDimensao(x, rows, stats)) {
    x = chaves.find((k) => ehDimensao(k, rows, stats) && !medida(k))
      ?? chaves.find((k) => ehDimensao(k, rows, stats))
      ?? chaves[0]
  }
  let ys: string[]
  if (yPref && medida(yPref)) ys = [yPref]
  else ys = chaves.filter((k) => k !== x && k !== 'tipo' && medida(k) && stats[k].distintos > 1)
  if (!ys.length) ys = chaves.filter((k) => k !== x && medida(k))
  return { x, ys: ys.slice(0, 4) }
}

function TooltipGen({ active, payload, label }: { active?: boolean; payload?: { name: string; value: unknown; color: string }[]; label?: unknown }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded border border-line bg-surface px-4 py-3 text-sm">
      <p className="label-caps mb-1">{String(label ?? '')}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-ink-soft font-mono text-xs">
          <span className="inline-block w-2 h-2 mr-2" style={{ background: p.color }} />
          {p.name}: <span className="text-ink font-semibold">{eNum(p.value) ? p.value.toLocaleString('pt-BR') : String(p.value)}</span>
        </p>
      ))}
    </div>
  )
}

const eixo = { tick: { fill: EIXO, fontSize: 11, fontFamily: 'JetBrains Mono' }, axisLine: false, tickLine: false } as const
const grade = <CartesianGrid stroke={GRADE} vertical={false} />

export function Legenda({ itens }: { itens: { nome: string; cor: string; tracejada?: boolean }[] }) {
  if (itens.length < 2) return null
  return (
    <div className="flex flex-wrap gap-4 mb-2 px-1">
      {itens.map((it) => (
        <span key={it.nome} className="inline-flex items-center gap-1.5 text-xs text-muted">
          <span
            className="inline-block w-4 h-0.5"
            style={{ background: it.tracejada ? `repeating-linear-gradient(90deg, ${it.cor} 0 4px, transparent 4px 7px)` : it.cor }}
          />
          {it.nome}
        </span>
      ))}
    </div>
  )
}

function GraficoLinha({ rows, viz, area }: { rows: Record<string, unknown>[]; viz?: Viz; area?: boolean }) {
  const { x, ys } = deduzir(rows, viz)
  const temForecast = rows.some((r) => r.tipo === 'previsao')
  if (temForecast) {
    const dados = rows.map((r) => ({
      ...r,
      historico: r.tipo === 'historico' ? r.valor : null,
      previsao: r.tipo === 'previsao' ? r.valor : null,
    }))
    return (
      <>
        <Legenda itens={[{ nome: 'Histórico', cor: OLIVA }, { nome: 'Previsão', cor: '#9a6a00', tracejada: true }]} />
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            {grade}
            <XAxis dataKey={x} {...eixo} minTickGap={40} tickFormatter={(v: string) => String(v).slice(5)} />
            <YAxis {...eixo} width={64} tickFormatter={fmtCompacto} />
            <Tooltip content={<TooltipGen />} />
            <Area dataKey="ic_max" stroke="none" fill={OLIVA} fillOpacity={0.1} name="IC 95% máx" />
            <Area dataKey="ic_min" stroke="none" fill="#f6f4ea" fillOpacity={1} name="IC 95% mín" />
            <Line dataKey="historico" stroke={OLIVA} strokeWidth={2} dot={false} name="Histórico" />
            <Line dataKey="previsao" stroke="#9a6a00" strokeWidth={2} strokeDasharray="6 4" dot={false} name="Previsão" />
          </ComposedChart>
        </ResponsiveContainer>
      </>
    )
  }
  // séries por coluna numérica OU por categoria (ex.: uma linha por vendedor)
  const stats = perfilColunas(rows)
  const serieCat =
    viz?.serie && viz.serie !== x && viz.serie in stats && !stats[viz.serie].numerica && stats[viz.serie].distintos <= 8
      ? viz.serie
      : undefined
  let dados = rows
  let series = ys
  if (serieCat) {
    // pivota: uma coluna por categoria (Recharts precisa de colunas para múltiplas linhas)
    const categorias = [...new Set(rows.map((r) => String(r[serieCat])))]
    const xsOrd = [...new Set(rows.map((r) => String(r[x])))]
    dados = xsOrd.map((xv) => {
      const linha: Record<string, unknown> = { [x]: xv }
      for (const c of categorias) {
        const achada = rows.find((r) => String(r[x]) === xv && String(r[serieCat]) === c)
        linha[c] = achada ? achada[ys[0]] : null
      }
      return linha
    })
    series = categorias.slice(0, 4)
  }
  const Grafico = area ? AreaChart : LineChart
  const el = (y: string, i: number) =>
    area ? (
      <Area key={y} dataKey={y} name={y.replace(/_/g, ' ')} stroke={PALETA[i]} fill={PALETA[i]} fillOpacity={0.12} strokeWidth={2} connectNulls />
    ) : (
      <Line key={y} dataKey={y} name={y.replace(/_/g, ' ')} stroke={PALETA[i]} strokeWidth={2} dot={false} connectNulls />
    )
  return (
    <>
    <Legenda itens={series.map((y, i) => ({ nome: y.replace(/_/g, ' '), cor: PALETA[i] }))} />
    <ResponsiveContainer width="100%" height={280}>
      <Grafico data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={GRADE} vertical={false} />
        <XAxis dataKey={x} {...eixo} minTickGap={40} tickFormatter={fmtRotulo} />
        <YAxis {...eixo} width={64} tickFormatter={fmtCompacto} />
        <Tooltip content={<TooltipGen />} />
        {el(series[0], 0)}
        {series[1] != null ? el(series[1], 1) : null}
        {series[2] != null ? el(series[2], 2) : null}
        {series[3] != null ? el(series[3], 3) : null}
      </Grafico>
    </ResponsiveContainer>
    </>
  )
}

/** Agrega linhas repetidas da mesma categoria (soma os valores numéricos). */
function agregarPorCategoria(rows: Record<string, unknown>[], x: string, ys: string[]): Record<string, unknown>[] {
  const nomes = [...new Set(rows.map((r) => String(r[x] ?? '—')))]
  if (nomes.length === rows.length) return rows
  return nomes.map((nome) => {
    const grupo = rows.filter((r) => String(r[x] ?? '—') === nome)
    const linha: Record<string, unknown> = { [x]: nome }
    for (const y of ys) linha[y] = grupo.reduce((s, r) => s + (eNum(r[y]) ? (r[y] as number) : 0), 0)
    return linha
  })
}

/** Pizza (donut) editorial: composição de um todo, no máx. 6 fatias (top 5 + "Outros"). */
function GraficoPizza({ rows: cruas, viz }: { rows: Record<string, unknown>[]; viz?: Viz }) {
  const { x, ys } = deduzir(cruas, viz)
  const y = ys[0]
  const rows = agregarPorCategoria(cruas, x, [y])
  const ordenado = [...rows]
    .map((r) => ({ nome: String(r[x] ?? '—'), valor: eNum(r[y]) ? (r[y] as number) : 0 }))
    .filter((d) => d.valor > 0)
    .sort((a, b) => b.valor - a.valor)
  let fatias = ordenado
  if (ordenado.length > 6) {
    const top = ordenado.slice(0, 5)
    const resto = ordenado.slice(5).reduce((s, d) => s + d.valor, 0)
    fatias = [...top, { nome: 'Outros', valor: resto }]
  }
  const total = fatias.reduce((s, d) => s + d.valor, 0) || 1
  const CORES = [...PALETA, OLIVA, '#8a8d80']
  return (
    <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-8">
      <ResponsiveContainer width={230} height={230}>
        <PieChart>
          <Pie
            data={fatias}
            dataKey="valor"
            nameKey="nome"
            innerRadius={58}
            outerRadius={100}
            paddingAngle={2}
            stroke="#f6f4ea"
            strokeWidth={2}
          >
            {fatias.map((_, i) => (
              <Cell key={i} fill={CORES[i % CORES.length]} />
            ))}
          </Pie>
          <Tooltip content={<TooltipGen />} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="flex flex-col gap-2 min-w-0">
        {fatias.map((f, i) => (
          <li key={f.nome} className="flex items-center gap-2.5 text-sm min-w-0">
            <span className="w-3 h-3 shrink-0" style={{ background: CORES[i % CORES.length] }} />
            <span className="text-ink-soft truncate">{f.nome}</span>
            <span className="font-mono text-xs text-muted whitespace-nowrap ml-auto pl-3">
              {fmtCompacto(f.valor)} · <span className="text-ink font-semibold">{((f.valor / total) * 100).toFixed(1)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** KPI: 1-3 números grandes (uma linha de resultado). */
function PainelKpi({ rows }: { rows: Record<string, unknown>[] }) {
  const r = rows[0] ?? {}
  const entradas = Object.entries(r).filter(([, v]) => eNum(v)).slice(0, 4)
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {entradas.map(([k, v]) => (
        <div key={k} className="rounded border border-line bg-floor px-4 py-3">
          <p className="label-caps">{k.replace(/_/g, ' ')}</p>
          <p className="num text-2xl font-bold mt-1">{(v as number).toLocaleString('pt-BR')}</p>
        </div>
      ))}
    </div>
  )
}

const TOP_BARRAS = 15

function GraficoBarra({ rows: cruas, viz, horizontal }: { rows: Record<string, unknown>[]; viz?: Viz; horizontal?: boolean }) {
  const { x, ys } = deduzir(cruas, viz)
  const stats = perfilColunas(cruas)
  // colorir cada barra pela categoria da spec (ex.: classe A/B/C), quando houver
  const serieCat =
    viz?.serie && viz.serie !== x && viz.serie in stats && !stats[viz.serie].numerica && stats[viz.serie].distintos <= 6
      ? viz.serie
      : undefined
  const todas = serieCat ? cruas : agregarPorCategoria(cruas, x, ys)
  // rankings longos: mostra só os maiores para o gráfico continuar legível
  const cortado = todas.length > TOP_BARRAS + 5
  const rows = cortado
    ? [...todas].sort((a, b) => (eNum(b[ys[0]]) ? (b[ys[0]] as number) : 0) - (eNum(a[ys[0]]) ? (a[ys[0]] as number) : 0)).slice(0, TOP_BARRAS)
    : todas
  const alt = horizontal ? Math.max(220, rows.length * 34) : 280

  const categorias = serieCat ? [...new Set(todas.map((r) => String(r[serieCat])))].sort() : []
  const corDe = (cat: string) => PALETA[categorias.indexOf(cat) % PALETA.length]
  // recharts v3 não desenha filhos vindos de fragments/condicionais dentro do chart:
  // manter SEMPRE filhos diretos, alternando só as props por orientação
  const propsX = horizontal
    ? { type: 'number' as const, tickFormatter: fmtCompacto }
    : {
        dataKey: x,
        interval: 0 as const,
        angle: rows.length > 8 ? -30 : 0,
        textAnchor: rows.length > 8 ? ('end' as const) : ('middle' as const),
        height: rows.length > 8 ? 60 : 30,
        tickFormatter: fmtRotulo,
      }
  const propsY = horizontal
    ? { type: 'category' as const, dataKey: x, width: 170, tickFormatter: (v: unknown) => fmtRotulo(v).slice(0, 26) }
    : { width: 64, tickFormatter: fmtCompacto }
  const cores = serieCat ? rows.map((r) => corDe(String(r[serieCat]))) : null

  return (
    <>
    {serieCat ? (
      <Legenda itens={categorias.map((c) => ({ nome: c, cor: corDe(c) }))} />
    ) : (
      <Legenda itens={ys.map((y, i) => ({ nome: y.replace(/_/g, ' '), cor: PALETA[i] }))} />
    )}
    <ResponsiveContainer width="100%" height={alt}>
      <BarChart data={rows} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barCategoryGap="25%">
        <CartesianGrid stroke={GRADE} vertical={horizontal} horizontal={!horizontal} />
        <XAxis {...eixo} {...propsX} />
        <YAxis {...eixo} {...propsY} />
        <Tooltip content={<TooltipGen />} cursor={{ fill: 'rgba(27,28,25,0.04)' }} />
        <Bar dataKey={ys[0]} fill={PALETA[0]} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={40}>
          {(cores ?? []).map((cor, j) => (
            <Cell key={j} fill={cor} />
          ))}
        </Bar>
        {ys[1] != null && !serieCat ? <Bar dataKey={ys[1]} fill={PALETA[1]} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={40} /> : null}
        {ys[2] != null && !serieCat ? <Bar dataKey={ys[2]} fill={PALETA[2]} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={40} /> : null}
        {ys[3] != null && !serieCat ? <Bar dataKey={ys[3]} fill={PALETA[3]} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={40} /> : null}
      </BarChart>
    </ResponsiveContainer>
    {cortado && (
      <p className="text-muted text-[11px] font-mono mt-1">mostrando os {TOP_BARRAS} maiores de {todas.length}</p>
    )}
    </>
  )
}

/** Pareto: barras = participação %, linha = acumulado % — eixo único 0-100%. */
function GraficoPareto({ rows, viz }: { rows: Record<string, unknown>[]; viz?: Viz }) {
  const { x, ys } = deduzir(rows, viz)
  const yAbs = ys.find((k) => !/acum|pct|perc|%/i.test(k)) ?? ys[0]
  const total = rows.reduce((s, r) => s + (eNum(r[yAbs]) ? (r[yAbs] as number) : 0), 0) || 1
  let acum = 0
  const dados = rows.map((r) => {
    const pct = ((eNum(r[yAbs]) ? (r[yAbs] as number) : 0) / total) * 100
    acum += pct
    return { ...r, participacao: +pct.toFixed(1), acumulado: +acum.toFixed(1) }
  })
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        {grade}
        <XAxis dataKey={x} {...eixo} interval={0} angle={-30} textAnchor="end" height={70} />
        <YAxis {...eixo} width={48} unit="%" domain={[0, 100]} />
        <Tooltip content={<TooltipGen />} />
        <Bar dataKey="participacao" name="Participação %" fill={OLIVA} radius={[2, 2, 0, 0]} maxBarSize={36} />
        <Line dataKey="acumulado" name="Acumulado %" stroke="#9a6a00" strokeWidth={2} dot={{ r: 3 }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function GraficoScatter({ rows, viz }: { rows: Record<string, unknown>[]; viz?: Viz }) {
  const chaves = Object.keys(rows[0] ?? {})
  const nums = chaves.filter((k) => rows.some((r) => eNum(r[k])))
  const x = viz?.x && nums.includes(viz.x) ? viz.x : nums[0]
  const y = viz?.y && nums.includes(viz.y) ? viz.y : nums[1] ?? nums[0]
  const rotulo = chaves.find((k) => !nums.includes(k))
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
        {grade}
        <XAxis dataKey={x} name={x} type="number" {...eixo} tickFormatter={fmtCompacto} />
        <YAxis dataKey={y} name={y} type="number" {...eixo} width={64} tickFormatter={fmtCompacto} />
        {rotulo && <ZAxis dataKey={rotulo} name={rotulo} />}
        <Tooltip content={<TooltipGen />} cursor={{ strokeDasharray: '4 4', stroke: 'rgba(27,28,25,0.25)' }} />
        <Scatter data={rows} fill={OLIVA} fillOpacity={0.8} />
      </ScatterChart>
    </ResponsiveContainer>
  )
}

/** Heatmap em CSS grid. Detecta sozinho quem é linha (texto), coluna (tempo/hora) e
 *  valor (número), mesmo que a spec tenha trocado os papéis. Suporta escala
 *  divergente (verde acima do ponto médio, terracota abaixo) para "bom × ruim". */
function Heatmap({ rows, viz }: { rows: Record<string, unknown>[]; viz?: Viz }) {
  const chaves = Object.keys(rows[0] ?? {})
  const stats = perfilColunas(rows)
  const dim = (k?: string) => ehDimensao(k, rows, stats)

  // papéis da spec, quando fazem sentido; senão, detecção automática
  let colDim = dim(viz?.x) ? (viz!.x as string) : undefined
  let rowDim = dim(viz?.serie) ? (viz!.serie as string) : dim(viz?.y) ? (viz!.y as string) : undefined
  if (rowDim === colDim) rowDim = undefined
  const dimsAuto = chaves.filter((k) => dim(k) && k !== colDim && k !== rowDim)
  // linha = dimensão textual (nomes); coluna = dimensão ordenada (hora/data) quando possível
  if (!rowDim) rowDim = dimsAuto.find((k) => !stats[k].numerica && !eData(rows[0]?.[k])) ?? dimsAuto[0]
  if (!colDim) colDim = chaves.find((k) => dim(k) && k !== rowDim && (stats[k].numerica || eData(rows[0]?.[k])))
    ?? dimsAuto.find((k) => k !== rowDim)
  const val =
    [viz?.y, viz?.serie, viz?.x].find((k) => k && chaves.includes(k) && stats[k].numerica && k !== colDim && k !== rowDim)
    ?? chaves.find((k) => k !== colDim && k !== rowDim && stats[k].numerica && stats[k].distintos > 1)
    ?? chaves[2]
  if (!colDim || !rowDim || !val) return <Tabela rows={rows} />

  const xs = [...new Set(rows.map((r) => String(r[colDim!])))]
  const ys = [...new Set(rows.map((r) => String(r[rowDim!])))]
  // agrega células repetidas (ex.: vários meses do mesmo vendedor×linha):
  // percentuais/índices tiram média; valores absolutos somam
  const porMedia = /pct|percent|taxa|margem|indice|%/i.test(val)
  const soma = new Map<string, number>()
  const contagem = new Map<string, number>()
  for (const r of rows) {
    const chave = `${r[colDim!]}|${r[rowDim!]}`
    const v = eNum(r[val]) ? (r[val] as number) : 0
    soma.set(chave, (soma.get(chave) ?? 0) + v)
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1)
  }
  const mapa = new Map([...soma.entries()].map(([k, s]) => [k, porMedia ? s / (contagem.get(k) || 1) : s]))
  const valores = [...mapa.values()]
  const max = Math.max(...valores, 1)

  const divergente = viz?.escala === 'divergente'
  const media = valores.reduce((s, v) => s + v, 0) / (valores.length || 1)
  const centro = divergente ? (viz?.ponto_medio === 'media' || viz?.ponto_medio == null ? media : Number(viz.ponto_medio)) : 0
  const desvioMax = divergente ? Math.max(...valores.map((v) => Math.abs(v - centro)), 1e-9) : 1

  const corCelula = (v: number): { background: string; color: string } => {
    if (divergente) {
      const t = Math.min(1, Math.abs(v - centro) / desvioMax)
      if (t < 0.08) return { background: 'rgba(27,28,25,0.04)', color: '#6b6e64' }
      const alfa = 0.12 + 0.75 * t
      return v >= centro
        ? { background: `rgba(74, 122, 58, ${alfa})`, color: t > 0.5 ? '#fff' : '#2d4a24' }   // verde = melhor
        : { background: `rgba(178, 58, 42, ${alfa})`, color: t > 0.5 ? '#fff' : '#7a2018' }   // terracota = pior
    }
    if (!v) return { background: 'rgba(27,28,25,0.03)', color: '#6b6e64' }
    const t = v / max
    return { background: `rgba(70, 82, 22, ${0.1 + 0.85 * t})`, color: t > 0.45 ? '#ffffff' : '#46563b' }
  }

  return (
    <div className="overflow-x-auto">
      {divergente && (
        <div className="flex items-center gap-4 mb-2 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3" style={{ background: 'rgba(74,122,58,0.7)' }} /> acima do normal (melhor)</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3" style={{ background: 'rgba(178,58,42,0.7)' }} /> abaixo do normal (pior)</span>
        </div>
      )}
      <div className="grid gap-0.5 min-w-[560px]" style={{ gridTemplateColumns: `120px repeat(${xs.length}, 1fr)` }}>
        <div />
        {xs.map((c) => (
          <div key={c} className="text-center font-mono text-[10px] text-muted py-1">{fmtRotulo(c)}</div>
        ))}
        {ys.map((l) => (
          <Fragment key={l}>
            <div className="font-mono text-[10px] text-muted flex items-center pr-2 justify-end text-right leading-tight" title={l}>
              {fmtRotulo(l).slice(0, 18)}
            </div>
            {xs.map((c) => {
              const v = mapa.get(`${c}|${l}`) ?? 0
              const cor = corCelula(v)
              return (
                <div
                  key={`${c}|${l}`}
                  title={`${fmtRotulo(l)} × ${fmtRotulo(c)}: ${v.toLocaleString('pt-BR')}`}
                  className="h-8 rounded-sm flex items-center justify-center text-[10px] font-mono"
                  style={cor}
                >
                  {v ? fmtCompacto(v) : ''}
                </div>
              )
            })}
          </Fragment>
        ))}
      </div>
    </div>
  )
}

function Tabela({ rows }: { rows: Record<string, unknown>[] }) {
  const chaves = Object.keys(rows[0] ?? {})
  return (
    <div className="overflow-x-auto max-h-96 overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card">
          <tr>
            {chaves.map((k) => (
              <th key={k} className="font-display text-left text-ink font-semibold px-3 py-2 border-b border-line-strong">{k.replace(/_/g, ' ')}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-primary-wash transition-colors">
              {chaves.map((k) => (
                <td key={k} className={`px-3 py-2 border-b border-line ${eNum(r[k]) ? 'text-right font-mono text-ink-soft' : 'text-ink-soft'}`}>
                  {eNum(r[k]) ? (r[k] as number).toLocaleString('pt-BR') : String(r[k] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function AnaliseViz({ resultado }: { resultado: ResultadoAnalise }) {
  const { rows, viz } = resultado
  if (!rows.length) return <p className="text-muted text-sm py-8 text-center">Sem dados no período selecionado.</p>
  switch (viz?.tipo) {
    case 'linha':
      return <GraficoLinha rows={rows} viz={viz} />
    case 'area':
      return <GraficoLinha rows={rows} viz={viz} area />
    case 'barra':
      return <GraficoBarra rows={rows} viz={viz} />
    case 'barra_h':
      return <GraficoBarra rows={rows} viz={viz} horizontal />
    case 'pareto':
      return <GraficoPareto rows={rows} viz={viz} />
    case 'pizza':
      return <GraficoPizza rows={rows} viz={viz} />
    case 'kpi':
      return <PainelKpi rows={rows} />
    case 'scatter':
      return <GraficoScatter rows={rows} viz={viz} />
    case 'heatmap':
      return <Heatmap rows={rows} viz={viz} />
    case 'matriz':
      return <Heatmap rows={rows} viz={viz} />
    default:
      return <Tabela rows={rows} />
  }
}
