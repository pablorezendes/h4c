/** Renderizador genérico de análises por viz.tipo.
 *  Cores: paleta categórica validada (dataviz) — serie1..serie4. */
import { Fragment, useMemo, useState } from 'react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts'
import { brl, brlCompacto, brlExato } from '../lib/format'

export interface Viz {
  tipo: string
  x?: string
  y?: string
  serie?: string
  descricao?: string
  escala?: string // 'divergente' = verde acima do ponto médio, vermelho abaixo
  ponto_medio?: number | 'media'
  // contrato do tipo 'grupos' (painel de blocos com ação — ver PainelGrupos)
  grupo?: string
  valor?: string
  rotulo?: string
  detalhe?: string[]
  ordem?: string[]
  grupos?: Record<string, GrupoMeta>
  alerta?: { quando: string; cor?: string; texto: string; ordenar_por?: string }
  nota_metodo?: string
}

export interface GrupoMeta {
  titulo: string
  cor?: string
  sub?: string
  acao?: string
  ordem?: 'asc' | 'desc'
  ordenar_por?: string
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
// nomes de cor usados pela spec (viz.grupos[].cor) — a spec não carrega hexadecimal
const CORQ: Record<string, string> = {
  oliva: '#5b691d', azul: '#215fa6', ocre: '#9a6a00', terracota: '#b23a2a', cinza: '#6b6e64',
}
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

/** Nome de vendedor no Winthor vem como "CARTEIRA FERNANDA MOURA" — o prefixo
 *  só ocupa espaço em rótulo curto (heatmap, eixo). */
const semPrefixo = (v: string) => v.replace(/^CARTEIRA\s+/i, '')

/** Encurta rótulo de eixo sem decepar o segundo termo de um par ("A + B"). */
function curto(v: string, max = 26): string {
  if (v.length <= max) return v
  if (v.includes(' + ')) {
    const lados = v.split(' + ')
    const cada = Math.max(8, Math.floor((max - 3) / lados.length))
    return lados.map((l) => (l.length > cada ? `${l.slice(0, cada - 1)}.` : l)).join(' + ')
  }
  return v.slice(0, max)
}

/** A coluna representa hora do dia? (ex.: hora, hora_pedido, faixa_horaria) */
const ehHora = (coluna?: string) => !!coluna && /hora/i.test(coluna)

/** "vl_perdido" -> "Valor perdido" — nomes de coluna legíveis para o cliente. */
const ABREV: Record<string, string> = {
  vl: 'valor', qt: 'quantidade', pct: '%', perc: '%', med: 'médio',
  dt: 'data', num: 'nº', qtd: 'quantidade', fat: 'faturamento',
}
function humaniza(coluna: string): string {
  const palavras = coluna.split('_').map((p) => ABREV[p.toLowerCase()] ?? p)
  const texto = palavras.join(' ')
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/** Rótulo amigável: data ISO vira "jun/26", hora vira "14h", número ganha separador.
 *  Datas com hora ("2026-06-01T00:00:00") também são reconhecidas — sem isso o
 *  tooltip mostrava o carimbo cru. */
function fmtRotulo(v: unknown, coluna?: string): string {
  if (eData(v)) {
    const s = v as string
    const mes = MES_CURTO[Number(s.slice(5, 7)) - 1]
    const dia = s.slice(8, 10)
    // com dia relevante mostra "05/jun"; senão o mês do período
    return dia && dia !== '01' ? `${dia}/${mes}` : `${mes}/${s.slice(2, 4)}`
  }
  if (eNum(v)) return ehHora(coluna) ? `${v}h` : v.toLocaleString('pt-BR')
  // hora às vezes chega como texto ("14") — o "h" tem que aparecer igual
  if (ehHora(coluna) && typeof v === 'string' && /^\d{1,2}$/.test(v)) return `${v}h`
  return String(v ?? '—')
}

/** Unidade deduzida do nome da coluna: sem isso o eixo mostra "60" sem dizer se
 *  são reais, por cento ou dias — a reclamação mais repetida do cliente. */
type Unid = 'brl' | 'pct' | 'dias' | null

/** Contagens e razões não têm unidade, mesmo carregando "venda"/"custo"/"atraso"
 *  no nome: `linhas_venda` é COUNT(*) e virava "R$ 128"; `n_dias_com_venda` é
 *  contagem de dias e virava "R$ 22"; `fator_atraso` é um multiplicador e virava
 *  "2,3 dias". Estes prefixos vetam a adivinhação. */
const SEM_UNIDADE = /^(qt|qtd|n|num|linhas|itens|fator|indice|razao|score|rank|rk|meses|clientes|pedidos|notas)_|_distintos$|^(qt|rk)$/i

function unidadeDe(col?: string): Unid {
  if (!col) return null
  if (SEM_UNIDADE.test(col)) return null
  if (/_pct$|^pct_|_perc$|^perc_|^perc|_pct_|taxa_|_share$/i.test(col)) return 'pct'
  // dias antes de dinheiro: "dias_com_venda" tem as duas palavras e é dia
  if (/(^|_)dias(_|$)|^recencia|_recencia|lead_?time|(^|_)prazo(_|$)|^atraso_|_atraso_(medio|maximo)/i.test(col)) return 'dias'
  if (/^vlr?_|^valor(_|$)|_valor$|^fat_|^saldo$|^custo(_|$)|_custo$|^venda(_|$)|_venda$|faturamento|ticket|receita|^lucro|_lucro$|^exposicao_|^limcred$|^margem_valor$/i.test(col)) return 'brl'
  return null
}

/** "Margem %" -> "margem": a unidade já vai no valor formatado ao lado. */
const semUnidade = (rotulo: string) => rotulo.replace(/\s*%$/, '').toLowerCase()

const SUFIXO: Record<string, string> = { brl: ' (R$)', pct: ' (%)', dias: ' (dias)' }

/** Cabeçalho de coluna com a unidade — sem duplicar quando o nome já a carrega
 *  ("Margem %" não vira "Margem % (%)"). */
function cabecalho(k: string): string {
  const nome = humaniza(k)
  const u = unidadeDe(k)
  if (!u) return nome
  if (u === 'pct' && nome.includes('%')) return nome
  if (u === 'dias' && /dias/i.test(nome)) return nome
  return nome + SUFIXO[u]
}

/** R$ para eixo: só abrevia a partir de 10 mil — abaixo disso o arredondamento
 *  repetia rótulos (1.650 e 2.200 viravam os dois "R$ 2 mil"). */
function brlEixo(v: number): string {
  if (Math.abs(v) >= 10_000) return brlCompacto(v)
  return brl.format(v)
}

function fmtUnid(v: unknown, u: Unid): string {
  if (!eNum(v)) return String(v ?? '—')
  if (u === 'brl') return brlEixo(v)
  if (u === 'pct') return `${fmtBR.format(v)}%`
  if (u === 'dias') return `${fmtBR.format(v)} dias`
  return fmtCompacto(v)
}

/** Termos técnicos que podem aparecer como coluna — explicados em português claro
 *  logo abaixo do gráfico, para o cliente não precisar adivinhar o que significam. */
const GLOSSARIO: [RegExp, string][] = [
  [/^lift$/i, '**Lift** — quantas vezes a dupla sai junta acima do que sairia por acaso. Acima de 1 é ligação real; abaixo de 1, coincidência.'],
  [/suporte/i, '**Suporte** — em quantos % de todos os pedidos os dois itens aparecem juntos.'],
  [/confianca/i, '**Confiança** — quando o cliente leva o primeiro item, em quantos % das vezes leva também o segundo.'],
  [/indice_mix|^indice/i, '**Índice** — 100 significa igual à média da empresa; abaixo de 100, vende menos que o normal ali.'],
  [/share|participacao/i, '**Participação** — quanto esse item representa do total.'],
  [/desvio/i, '**Desvio** — o quanto os valores variam em torno da média (quanto maior, mais imprevisível).'],
  [/p90|percentil/i, '**P90** — valor abaixo do qual ficam 90% dos casos (o "quase pior caso").'],
  [/score/i, '**Score** — nota calculada para ordenar por prioridade.'],
  [/recencia/i, '**Recência** — há quantos dias foi a última compra.'],
]

/** Explicações dos termos técnicos presentes nas colunas destes dados. */
export function Glossario({ rows }: { rows: Record<string, unknown>[] }) {
  const chaves = Object.keys(rows[0] ?? {})
  const vistos = new Set<string>()
  const textos: string[] = []
  for (const [padrao, texto] of GLOSSARIO) {
    if (chaves.some((c) => padrao.test(c)) && !vistos.has(texto)) {
      vistos.add(texto)
      textos.push(texto)
    }
  }
  if (!textos.length) return null
  return (
    <div className="mt-3 pt-3 border-t border-line flex flex-col gap-1">
      {textos.map((t) => {
        const [, termo, resto] = t.match(/\*\*(.+?)\*\*(.*)/) ?? [null, t, '']
        return (
          <p key={t} className="text-xs text-muted leading-relaxed">
            <span className="font-semibold text-ink-soft">{termo}</span>
            {resto}
          </p>
        )
      })}
    </div>
  )
}

/** Rótulo composto da spec: "departamento_a + departamento_b" vira uma coluna só. */
function resolveRotuloComposto(
  rows: Record<string, unknown>[],
  viz?: Viz,
): { rows: Record<string, unknown>[]; viz?: Viz } {
  if (!viz) return { rows, viz }
  const chaves = Object.keys(rows[0] ?? {})
  const ajustado: Viz = { ...viz }
  let mudou = false
  let linhas = rows

  for (const campo of ['x', 'y', 'serie'] as const) {
    const expr = viz[campo]
    if (typeof expr !== 'string' || !expr.includes('+')) continue
    const partes = expr.split('+').map((p) => p.trim())
    if (partes.length < 2 || !partes.every((p) => chaves.includes(p))) continue
    const nova = partes.join('_e_')
    linhas = linhas.map((r) => ({ ...r, [nova]: partes.map((p) => String(r[p] ?? '')).join(' + ') }))
    ajustado[campo] = nova
    mudou = true
  }
  return mudou ? { rows: linhas, viz: ajustado } : { rows, viz }
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

  const texto = (k?: string) => !!k && k in stats && !stats[k].numerica

  let x = viz?.x && chaves.includes(viz.x) ? viz.x : undefined
  let yPref = viz?.y && chaves.includes(viz.y) ? viz.y : undefined
  // spec com papéis invertidos (x = valor, y = categoria): destroca.
  // ★ Comparar por TEXTO, não por ehDimensao(): uma medida com poucos valores
  // distintos (pedidos_juntos, lift) passa no teste genérico de dimensão e o
  // eixo acabava listando números no lugar dos nomes.
  if (x && yPref && medida(x) && texto(yPref)) {
    ;[x, yPref] = [yPref, x]
  }
  // sem x válido na spec, prefere coluna de texto: medida com poucos valores
  // distintos passa em ehDimensao e virava categoria (números no lugar de nomes)
  if (!x || !ehDimensao(x, rows, stats)) {
    x = chaves.find((k) => texto(k))
      ?? chaves.find((k) => ehDimensao(k, rows, stats))
      ?? chaves[0]
  }
  let ys: string[]
  if (yPref && medida(yPref)) ys = [yPref]
  else ys = chaves.filter((k) => k !== x && k !== 'tipo' && medida(k) && stats[k].distintos > 1)
  if (!ys.length) ys = chaves.filter((k) => k !== x && medida(k))
  return { x, ys: ys.slice(0, 4) }
}

/** Tooltip. Recebe a coluna do eixo X para formatar o título com a mesma regra
 *  do eixo (data vira "jun/26", hora vira "14h") — antes mostrava o valor cru. */
function TooltipGen({ active, payload, label, colunaX, cor, extras }: {
  active?: boolean
  payload?: { name: string; value: unknown; color: string }[]
  label?: unknown
  colunaX?: string
  cor?: (linha: Record<string, unknown>) => string
  extras?: string[]
}) {
  if (!active || !payload?.length) return null
  const linha = (payload[0] as { payload?: Record<string, unknown> }).payload ?? {}
  return (
    <div className="rounded border border-line bg-surface px-4 py-3 text-sm">
      <p className="label-caps mb-1">
        {fmtRotulo(label, colunaX)}
        {ehHora(colunaX) ? ' — 00 a 59 min' : ''}
      </p>
      {payload.map((p, i) => (
        <p key={i} className="text-ink-soft font-mono text-xs">
          <span className="inline-block w-2 h-2 mr-2" style={{ background: cor ? cor(linha) : p.color }} />
          {humaniza(String(p.name))}: <span className="text-ink font-semibold">{eNum(p.value) ? p.value.toLocaleString('pt-BR') : String(p.value)}</span>
        </p>
      ))}
      {extras?.length ? (
        <div className="mt-1.5 pt-1.5 border-t border-line">
          {extras.map((k) => (
            <p key={k} className="text-muted font-mono text-xs">
              {humaniza(k)}: <span className="text-ink-soft font-semibold">{eNum(linha[k]) ? (linha[k] as number).toLocaleString('pt-BR') : String(linha[k] ?? '—')}</span>
            </p>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** Tooltip amarrado à coluna do eixo X (para formatar hora/data no título). */
const tooltipDe = (colunaX?: string, opts?: { cor?: (l: Record<string, unknown>) => string; extras?: string[] }) =>
  function TooltipComContexto(props: Record<string, unknown>) {
    return <TooltipGen {...props} colunaX={colunaX} cor={opts?.cor} extras={opts?.extras} />
  }

const eixo = { tick: { fill: EIXO, fontSize: 11, fontFamily: 'JetBrains Mono' }, axisLine: false, tickLine: false } as const
const grade = <CartesianGrid stroke={GRADE} vertical={false} />

export function Legenda({ itens }: { itens: { nome: string; cor: string; tracejada?: boolean }[] }) {
  if (!itens.length) return null
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
            <XAxis dataKey={x} {...eixo} minTickGap={40} tickFormatter={(v: unknown) => fmtRotulo(v, x)} />
            <YAxis {...eixo} width={72} tickFormatter={(v) => fmtUnid(v, unidadeDe(ys[0]))} />
            <Tooltip content={tooltipDe(x)} />
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
      <Area key={y} dataKey={y} name={humaniza(y)} stroke={PALETA[i]} fill={PALETA[i]} fillOpacity={0.12} strokeWidth={2} connectNulls />
    ) : (
      <Line key={y} dataKey={y} name={humaniza(y)} stroke={PALETA[i]} strokeWidth={2} dot={false} connectNulls />
    )
  return (
    <>
    <Legenda itens={series.map((y, i) => ({ nome: humaniza(y), cor: PALETA[i] }))} />
    <ResponsiveContainer width="100%" height={280}>
      <Grafico data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={GRADE} vertical={false} />
        <XAxis dataKey={x} {...eixo} minTickGap={40} tickFormatter={(v: unknown) => fmtRotulo(v, x)} />
        <YAxis {...eixo} width={72} tickFormatter={(v) => fmtUnid(v, unidadeDe(ys[0]))} />
        <Tooltip content={tooltipDe(x)} />
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
          <Tooltip content={tooltipDe(x)} />
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
  const { x, ys: todasYs } = deduzir(cruas, viz)
  const stats = perfilColunas(cruas)
  // colorir cada barra pela categoria da spec (ex.: classe A/B/C), quando houver
  const serieCat =
    viz?.serie && viz.serie !== x && viz.serie in stats && !stats[viz.serie].numerica && stats[viz.serie].distintos <= 6
      ? viz.serie
      : undefined
  /* `serie` numérica (ex.: lift) não é uma barra: é o SEMÁFORO que colore as
     barras — verde acima do limiar (ligação real), cinza abaixo (coincidência),
     exatamente o que o texto "Como ler" promete. */
  const serieLimiar =
    viz?.serie && /^lift$/i.test(viz.serie) && viz.serie in stats && stats[viz.serie].numerica ? viz.serie : undefined
  const limiar = typeof viz?.ponto_medio === 'number' ? viz.ponto_medio : 1
  /* Com o semáforo, o gráfico mostra UMA medida (a da spec). Empilhar 4 métricas
     técnicas na mesma barra deixava a leitura impossível — as demais seguem no
     tooltip e no Excel. */
  const ys = serieLimiar
    ? [todasYs.find((k) => k === viz?.x) ?? todasYs[0]].filter(Boolean)
    : todasYs
  const todas = serieCat || serieLimiar ? cruas : agregarPorCategoria(cruas, x, ys)
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
    ? { type: 'number' as const, tickFormatter: (v: unknown) => fmtUnid(v, unidadeDe(ys[0])) }
    : {
        dataKey: x,
        interval: 0 as const,
        angle: rows.length > 8 ? -30 : 0,
        textAnchor: rows.length > 8 ? ('end' as const) : ('middle' as const),
        height: rows.length > 8 ? 60 : 30,
        tickFormatter: (v: unknown) => fmtRotulo(v, x),
      }
  const propsY = horizontal
    ? { type: 'category' as const, dataKey: x, width: 170, tickFormatter: (v: unknown) => curto(semPrefixo(fmtRotulo(v, x))) }
    : { width: 72, tickFormatter: (v: unknown) => fmtUnid(v, unidadeDe(ys[0])) }
  const VERDE = OLIVA, CINZA = '#b4b3a4'
  const cores = serieCat
    ? rows.map((r) => corDe(String(r[serieCat])))
    : serieLimiar
      ? rows.map((r) => ((eNum(r[serieLimiar]) ? (r[serieLimiar] as number) : 0) >= limiar ? VERDE : CINZA))
      : null

  return (
    <>
    {serieCat ? (
      <Legenda itens={categorias.map((c) => ({ nome: c, cor: corDe(c) }))} />
    ) : serieLimiar ? (
      <Legenda itens={[
        { nome: `Ligação real (${humaniza(serieLimiar)} ≥ ${limiar})`, cor: VERDE },
        { nome: 'Provável coincidência', cor: CINZA },
      ]} />
    ) : (
      <Legenda itens={ys.map((y, i) => ({ nome: humaniza(y), cor: PALETA[i] }))} />
    )}
    <ResponsiveContainer width="100%" height={alt}>
      <BarChart data={rows} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barCategoryGap="25%">
        <CartesianGrid stroke={GRADE} vertical={horizontal} horizontal={!horizontal} />
        <XAxis {...eixo} {...propsX} />
        <YAxis {...eixo} {...propsY} />
        <Tooltip
          content={tooltipDe(x, serieLimiar
            ? { cor: (l) => ((eNum(l[serieLimiar]) ? (l[serieLimiar] as number) : 0) >= limiar ? VERDE : CINZA),
                /* todas as demais medidas da linha: saem do gráfico para não
                   poluir, mas continuam a um passe de mouse (e no Excel). */
                extras: Object.keys(stats).filter((k) => k !== x && !ys.includes(k) && stats[k].numerica) }
            : undefined)}
          cursor={{ fill: 'rgba(27,28,25,0.04)' }}
        />
        <Bar dataKey={ys[0]} name={humaniza(ys[0])} fill={PALETA[0]} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={40}>
          {(cores ?? []).map((cor, j) => (
            <Cell key={j} fill={cor} />
          ))}
        </Bar>
        {ys[1] != null && !serieCat ? <Bar dataKey={ys[1]} name={humaniza(ys[1])} fill={PALETA[1]} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={40} /> : null}
        {ys[2] != null && !serieCat ? <Bar dataKey={ys[2]} name={humaniza(ys[2])} fill={PALETA[2]} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={40} /> : null}
        {ys[3] != null && !serieCat ? <Bar dataKey={ys[3]} name={humaniza(ys[3])} fill={PALETA[3]} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={40} /> : null}
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
        <XAxis dataKey={x} {...eixo} interval={0} angle={-30} textAnchor="end" height={70}
               tickFormatter={(v: unknown) => fmtRotulo(v, x)} />
        <YAxis {...eixo} width={48} unit="%" domain={[0, 100]} />
        <Tooltip content={tooltipDe(x)} />
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
        <XAxis
          dataKey={x} name={x} type="number" {...eixo} height={44}
          tickFormatter={(v) => fmtUnid(v, unidadeDe(x))}
          label={{ value: humaniza(x) + (SUFIXO[unidadeDe(x) ?? ''] ?? ''), position: 'insideBottom', offset: -2, fill: EIXO, fontSize: 11 }}
        />
        <YAxis
          dataKey={y} name={y} type="number" {...eixo} width={76}
          tickFormatter={(v) => fmtUnid(v, unidadeDe(y))}
          label={{ value: humaniza(y) + (SUFIXO[unidadeDe(y) ?? ''] ?? ''), angle: -90, position: 'insideLeft', fill: EIXO, fontSize: 11 }}
        />
        {rotulo && <ZAxis dataKey={rotulo} name={rotulo} />}
        <Tooltip content={tooltipDe(x)} cursor={{ strokeDasharray: '4 4', stroke: 'rgba(27,28,25,0.25)' }} />
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

  // Convenção das specs: x = coluna, y = LINHA, serie = VALOR.
  // ★ Não usar ehDimensao() para escolher a linha: uma medida com poucos valores
  // distintos (ex.: taxa_cancel_pct) passa no teste e o heatmap acabava listando
  // percentuais no lugar dos nomes de vendedor. A linha tem que ser TEXTO.
  const eTexto = (k?: string) => !!k && k in stats && !stats[k].numerica
  const eMedida = (k?: string) => !!k && k in stats && stats[k].numerica

  // 1) valor: a medida (serie da spec; y como alternativa)
  let val = eMedida(viz?.serie) ? (viz!.serie as string)
    : eMedida(viz?.y) ? (viz!.y as string)
    : undefined
  // 2) linha: rótulo textual (nome de vendedor, produto, categoria…)
  let rowDim = eTexto(viz?.y) ? (viz!.y as string)
    : eTexto(viz?.serie) ? (viz!.serie as string)
    : undefined
  // 3) coluna: dimensão ordenada (hora, mês, dia da semana)
  let colDim = dim(viz?.x) && viz!.x !== val && viz!.x !== rowDim ? (viz!.x as string) : undefined

  if (!rowDim) rowDim = chaves.find((k) => eTexto(k) && k !== colDim && k !== val)
  if (!colDim) colDim = chaves.find((k) => dim(k) && k !== rowDim && k !== val)
  if (!rowDim) rowDim = chaves.find((k) => dim(k) && k !== colDim && k !== val)
  if (!val) {
    val = chaves.find((k) => eMedida(k) && k !== colDim && k !== rowDim && stats[k].distintos > 1)
      ?? chaves.find((k) => eMedida(k) && k !== colDim && k !== rowDim)
  }
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
      <div className="grid gap-0.5 min-w-[560px]" style={{ gridTemplateColumns: `150px repeat(${xs.length}, 1fr)` }}>
        <div />
        {xs.map((c) => (
          <div key={c} className="text-center font-mono text-[10px] text-muted py-1">{fmtRotulo(c, colDim)}</div>
        ))}
        {ys.map((l) => (
          <Fragment key={l}>
            <div className="font-mono text-[10px] text-muted flex items-center pr-2 justify-end text-right leading-tight" title={l}>
              {semPrefixo(fmtRotulo(l, rowDim)).slice(0, 20)}
            </div>
            {xs.map((c) => {
              const v = mapa.get(`${c}|${l}`) ?? 0
              const cor = corCelula(v)
              return (
                <div
                  key={`${c}|${l}`}
                  title={`${semPrefixo(fmtRotulo(l, rowDim))} × ${fmtRotulo(c, colDim)}: ${v.toLocaleString('pt-BR')}`}
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

/** Código interno do Winthor: serve para o sistema, não para quem lê a tela.
 *  Continua indo no Excel — só sai da tabela. */
const ehCodigoInterno = (k: string) => /^cod|^num(ped|transvenda|nota)/i.test(k)

function Tabela({ rows }: { rows: Record<string, unknown>[] }) {
  const todas = Object.keys(rows[0] ?? {})
  const chaves = todas.filter((k) => !ehCodigoInterno(k)).length ? todas.filter((k) => !ehCodigoInterno(k)) : todas
  return (
    <div className="overflow-x-auto max-h-96 overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card">
          <tr>
            {chaves.map((k) => (
              <th key={k} className="font-display text-left text-ink font-semibold px-3 py-2 border-b border-line-strong">
                {cabecalho(k)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-primary-wash transition-colors">
              {chaves.map((k) => (
                <td key={k} className={`px-3 py-2 border-b border-line ${eNum(r[k]) ? 'text-right font-mono text-ink-soft' : 'text-ink-soft'}`}>
                  {/* valor INTEGRAL na célula: abreviar aqui destruía o dado que é
                      o produto da tabela (um saldo de R$ 8.437 virava "R$ 8 mil").
                      A unidade fica no cabeçalho da coluna. */}
                  {eNum(r[k]) ? (r[k] as number).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : String(r[k] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface Bloco { chave: string; info: GrupoMeta; itens: Record<string, unknown>[]; soma: number; pico: number; temNegativo: boolean }

/** Uma linha da lista de um grupo. Fica FORA de PainelGrupos de propósito: declarado
 *  dentro, o React remonta a lista inteira a cada clique de abrir/fechar. */
function LinhaGrupo({ r, bloco, cValor, cRotulo, detalhe }: {
  r: Record<string, unknown>; bloco: Bloco; cValor: string; cRotulo: string; detalhe?: string[]
}) {
  const num = (v: unknown) => (eNum(v) ? v : 0)
  const brlCurto = (v: number) => (Math.abs(v) < 1000 ? brlExato.format(v) : brl.format(v))
  const v = num(r[cValor])
  const largura = `${Math.max(2, Math.abs(v) / bloco.pico * 100)}%`
  const cor = v < 0 ? CORQ.terracota : CORQ[bloco.info.cor ?? 'cinza'] ?? OLIVA
  return (
    <li className="py-2 border-t border-line/60 first:border-0">
      <p className="text-sm text-ink leading-snug">{String(r[cRotulo] ?? '—')}</p>
      {/* trilhas TÊM que ter o mesmo comprimento em todas as linhas: com largura
          livre, o texto do valor ("R$ 29.010" × "R$ 7.508") encolhia a trilha e dois
          valores praticamente iguais saíam com barras visivelmente diferentes */}
      <div className="flex items-center gap-2 mt-1.5">
        <div className="flex-1 min-w-[60px] h-1.5 rounded-sm bg-line/70 relative overflow-hidden">
          <span
            className="absolute top-0 h-full rounded-sm"
            style={{
              background: cor,
              width: bloco.temNegativo ? `calc(${largura} / 2)` : largura,
              left: bloco.temNegativo ? (v < 0 ? undefined : '50%') : 0,
              right: bloco.temNegativo && v < 0 ? '50%' : undefined,
            }}
          />
        </div>
        <span className="num text-xs text-ink font-semibold whitespace-nowrap w-24 text-right shrink-0">{brlCurto(v)}</span>
      </div>
      {/* detalhes em linha própria: no celular eles sumiam, e sem margem e venda
          o card "renegociar" não mostra a alavanca da negociação */}
      {(detalhe ?? []).length > 0 && (
        <p className="num text-[11px] text-muted mt-0.5 flex gap-x-4 flex-wrap">
          {(detalhe ?? []).map((d) => (
            <span key={d}>{semUnidade(humaniza(d))}: {fmtUnid(r[d], unidadeDe(d))}</span>
          ))}
        </p>
      )}
    </li>
  )
}

/** Painel de grupos: substitui o gráfico de dispersão onde a pergunta não é
 *  "como os itens se distribuem" e sim "o que eu faço com cada um".
 *
 *  Nada de Recharts aqui de propósito: nome de produto tem 39 caracteres e não
 *  cabe em eixo de gráfico — em CSS ele quebra em duas linhas e sai inteiro.
 *  Os nomes e as ações dos grupos vêm da spec (viz.grupos), nunca do código:
 *  este mesmo componente atende produto, cliente e vendedor, e "Peso morto —
 *  revisar o catálogo" seria texto falso em cima de uma carteira de clientes. */
function PainelGrupos({ rows, viz, meta }: { rows: Record<string, unknown>[]; viz?: Viz; meta?: Record<string, unknown> }) {
  const cGrupo = viz?.grupo ?? 'grupo'
  const cValor = viz?.valor ?? ''
  const cRotulo = viz?.rotulo ?? ''
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set([viz?.ordem?.[0] ?? '', 'alerta']))
  const [tudo, setTudo] = useState<Set<string>>(() => new Set())

  const num = (v: unknown) => (eNum(v) ? v : 0)
  const dados = useMemo(() => {
    const presentes = [...new Set(rows.map((r) => String(r[cGrupo])))]
    // ordem da spec primeiro, mas grupo que a spec não previu entra no fim:
    // filtrar só por viz.ordem fazia linhas inteiras desaparecerem sem contagem
    const chaves = viz?.ordem?.length
      ? [...viz.ordem.filter((k) => presentes.includes(k)), ...presentes.filter((k) => !viz.ordem!.includes(k))]
      : presentes
    const blocos = chaves.map((k) => {
      const info = viz?.grupos?.[k] ?? { titulo: humaniza(k) }
      const por = info.ordenar_por ?? cValor
      const itens = rows
        .filter((r) => r[cGrupo] === k)
        .sort((a, b) => (info.ordem === 'asc' ? num(a[por]) - num(b[por]) : num(b[por]) - num(a[por])))
      const soma = itens.reduce((s, r) => s + num(r[cValor]), 0)
      const pico = Math.max(...itens.map((r) => Math.abs(num(r[cValor]))), 1)
      return { chave: k, info, itens, soma, pico, temNegativo: itens.some((r) => num(r[cValor]) < 0) }
    })
    // "% do seu lucro" sobre a soma dos POSITIVOS: no líquido, o prejuízo encolhe
    // o denominador e o texto anuncia "112% de todo o lucro"
    const totalPositivo = rows.reduce((s, r) => s + Math.max(0, num(r[cValor])), 0)
    const emAlerta = viz?.alerta
      ? rows.filter((r) => r[viz.alerta!.quando] === true)
          .sort((a, b) => num(b[viz.alerta!.ordenar_por ?? cValor]) - num(a[viz.alerta!.ordenar_por ?? cValor]))
      : []
    return { blocos, totalPositivo, emAlerta }
  }, [rows, viz, cGrupo, cValor])

  // spec nova + backend antigo = coluna de grupo ausente. Cair na dispersão seria
  // pior (sem viz.x/viz.y ela plotaria codprod × qt_vendida); a tabela ao menos
  // mostra o dado verdadeiro em vez de anunciar "0 produtos trazem 0% do lucro"
  if (!rows.some((r) => r[cGrupo] != null)) return <Tabela rows={rows} />

  const alterna = (set: Set<string>, k: string, fn: (s: Set<string>) => void) => {
    const novo = new Set(set)
    novo.has(k) ? novo.delete(k) : novo.add(k)
    fn(novo)
  }
  // valor pequeno arredondado para reais vira "R$ 0" e o texto perde o sentido
  const brlCurto = (v: number) => (Math.abs(v) < 1000 ? brlExato.format(v) : brl.format(v))
  const plural = (n: number, um: string, muitos: string) => (n === 1 ? um : muitos)
  const principal = dados.blocos[0]
  // o grupo que concentra o resultado, não um nome fixo: com filtro de período ou
  // departamento "campeoes" pode nem existir, e o veredito abria com "peso morto"
  const destaque = [...dados.blocos].sort((a, b) => b.soma - a.soma)[0]
  const pctDestaque = dados.totalPositivo
    ? Math.min(100, Math.max(0, Math.round((destaque?.soma ?? 0) / dados.totalPositivo * 100)))
    : 0
  const alerta = viz?.alerta
  const somaAlerta = dados.emAlerta.reduce((s, r) => s + num(r[cValor]), 0)
  const composicao = dados.blocos.filter((b) => b.soma > 0)
  const totalComp = composicao.reduce((s, b) => s + b.soma, 0) || 1

  return (
    <div className="flex flex-col gap-3">
      {/* veredito: a resposta em uma frase, antes de qualquer número solto */}
      {destaque && (
        <p className="text-base text-ink leading-snug">
          O grupo <span className="font-semibold">{destaque.info.titulo}</span> ({destaque.itens.length}{' '}
          {plural(destaque.itens.length, 'item', 'itens')}) responde por{' '}
          <span className="font-semibold">{pctDestaque}%</span> do seu lucro.{' '}
          {principal && principal !== destaque && (
            <>Comece pelo grupo <span className="font-semibold">{principal.info.titulo}</span>, logo abaixo.</>
          )}
        </p>
      )}

      {alerta && dados.emAlerta.length > 0 && (
        <div className="rounded-sm border-l-2 pl-3 py-2" style={{ borderColor: CORQ[alerta.cor ?? 'terracota'], background: 'rgba(178,58,42,.06)' }}>
          <button className="text-left w-full" aria-expanded={abertos.has('alerta')} onClick={() => alterna(abertos, 'alerta', setAbertos)}>
            <p className="text-sm text-ink">
              <span className="font-semibold">
                {dados.emAlerta.length} {plural(dados.emAlerta.length, 'produto foi vendido', 'produtos foram vendidos')} abaixo do custo
              </span>
              {somaAlerta < 0 && <> e {plural(dados.emAlerta.length, 'tirou', 'tiraram')} {brlCurto(Math.abs(somaAlerta))} do seu lucro.</>}
            </p>
            <span className="text-xs text-muted">{abertos.has('alerta') ? 'ocultar ▴' : 'ver quais ▾'}</span>
          </button>
          {abertos.has('alerta') && (
            <ul className="mt-1.5 pr-1">
              {dados.emAlerta.slice(0, 8).map((r, i) => (
                <li key={i} className="py-1 border-t border-line/60 first:border-0 flex items-baseline justify-between gap-3">
                  <span className="text-sm text-ink leading-snug">{String(r[cRotulo] ?? '—')}</span>
                  <span className="num text-xs whitespace-nowrap" style={{ color: CORQ.terracota }}>{brlCurto(num(r[cValor]))}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* onde está o lucro: a única peça que mostra a desproporção entre grupos */}
      {composicao.length > 1 && (
        <div>
          <p className="label-caps mb-1.5">Onde está o seu lucro</p>
          <div className="flex h-3.5 rounded-sm overflow-hidden">
            {composicao.map((b) => (
              <span
                key={b.chave}
                title={`${b.info.titulo}: ${brlCurto(b.soma)}`}
                style={{ width: `${b.soma / totalComp * 100}%`, background: CORQ[b.info.cor ?? 'cinza'] ?? OLIVA }}
              />
            ))}
          </div>
          {/* faixa colorida sem legenda não diz nada: quem é cada cor e quanto vale */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
            {composicao.map((b) => (
              <span key={b.chave} className="text-[11px] text-muted flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-sm" style={{ background: CORQ[b.info.cor ?? 'cinza'] }} />
                {b.info.titulo} · <span className="num">{Math.round(b.soma / totalComp * 100)}%</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {dados.blocos.map((b) => {
        const aberto = abertos.has(b.chave)
        const mostra = tudo.has(b.chave) ? b.itens : b.itens.slice(0, 5)
        return (
          <section key={b.chave} className="rounded-sm border-l-2 pl-3 py-2" style={{ borderColor: CORQ[b.info.cor ?? 'cinza'] }}>
            <button className="text-left w-full" aria-expanded={aberto} onClick={() => alterna(abertos, b.chave, setAbertos)}>
              <h3 className="font-display text-base font-semibold text-ink">{b.info.titulo}</h3>
              {b.info.sub && <p className="text-muted text-sm mt-0.5 leading-snug">{b.info.sub}</p>}
              {b.info.acao && (
                <p className="text-sm text-ink-soft mt-1 leading-snug">
                  <span className="font-semibold">{b.info.acao.split('.')[0]}.</span>
                  {b.info.acao.slice(b.info.acao.indexOf('.') + 1)}
                </p>
              )}
              <p className="num text-xs text-muted mt-1.5">
                {b.itens.length} {plural(b.itens.length, 'item', 'itens')} · {brlCurto(b.soma)} de lucro · {aberto ? 'ocultar ▴' : 'ver a lista ▾'}
              </p>
            </button>
            {aberto && (
              <>
                {/* a âncora da barra é o MAIOR EM MÓDULO do bloco; num grupo todo
                    negativo, ancorar em zero imprimia "maior do grupo: R$ 0,00" */}
                <p className="num text-[11px] text-muted mt-1">
                  {b.temNegativo && b.soma < 0 ? 'maior prejuízo do grupo' : 'maior do grupo'}: {brlCurto(
                    b.itens.reduce((m, r) => (Math.abs(num(r[cValor])) > Math.abs(m) ? num(r[cValor]) : m), 0),
                  )}
                </p>
                <ul className="pr-1">
                  {mostra.map((r, i) => (
                    <LinhaGrupo key={String(r[cRotulo] ?? i)} r={r} bloco={b} cValor={cValor} cRotulo={cRotulo} detalhe={viz?.detalhe} />
                  ))}
                </ul>
                {b.itens.length > 5 && (
                  <button className="text-xs text-primary mt-1.5" onClick={() => alterna(tudo, b.chave, setTudo)}>
                    {tudo.has(b.chave) ? 'mostrar menos ▴' : `ver todos os ${b.itens.length} ▾`}
                  </button>
                )}
              </>
            )}
          </section>
        )
      })}

      {viz?.nota_metodo && (
        <p className="text-xs text-muted leading-relaxed pt-2 border-t border-line">
          {viz.nota_metodo.replace(/\{(\w+)\}/g, (_, k) => String(meta?.[k] ?? '—'))}
        </p>
      )}
    </div>
  )
}

export default function AnaliseViz({ resultado }: { resultado: ResultadoAnalise }) {
  if (!resultado.rows.length) return <p className="text-muted text-sm py-8 text-center">Sem dados no período selecionado.</p>
  // spec pode pedir rótulo composto ("departamento_a + departamento_b"): vira coluna real
  const { rows, viz } = resolveRotuloComposto(resultado.rows, resultado.viz)
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
    case 'grupos':
      return <PainelGrupos rows={rows} viz={viz} meta={resultado.meta} />
    default:
      return <Tabela rows={rows} />
  }
}
