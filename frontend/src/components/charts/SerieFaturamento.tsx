import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { PontoSerie } from '../../lib/api'
import { brlCompacto, brlExato, diaCurto } from '../../lib/format'
import { mesCurto, mesLongo, moeda, numero, pct } from '../comercial/formato'

/**
 * Série de faturamento — diária (legado) ou MENSAL (aba Comercial).
 *
 * ★ A granularidade da aba Comercial é o MÊS FECHADO, não o dia. A inteligência do
 *   negócio funciona por ciclo mensal: a série diária mostra o ruído de quando a nota
 *   saiu e esconde a tendência que o dono acompanha.
 *
 * ★ O valor plotado é o LÍQUIDO de devolução. Bruto e devolução só aparecem no
 *   tooltip, como detalhe — nunca como a altura da barra.
 *
 * ★ O mês corrente NÃO é uma barra igual às outras. Ele sai como realizado (cheio)
 *   + o que falta até a PROJEÇÃO por dias úteis (contorno tracejado). Sem essa
 *   distinção o mês em andamento parece um mês fraco e derruba a leitura da série.
 *   A projeção nunca é "próximos 30 dias": é o fechamento deste mês (§7).
 *
 * Uma medida por painel: a margem tem gráfico próprio (SerieMargem) porque duas
 * escalas no mesmo eixo fazem qualquer cruzamento das linhas parecer significado.
 */
const OLIVA = '#5b691d'
const GRADE = 'rgba(27, 28, 25, 0.08)'
const EIXO = '#6b6e64'
const PAPEL = '#fffdf7'

export interface PontoMensal {
  /** 'YYYY-MM' */
  mes: string
  rotulo?: string
  liquido: number
  bruto?: number
  devolucao?: number
  devolucao_pct?: number | null
  margem_pct?: number | null
  /** false = mês em andamento; a barra vira realizado + projeção. */
  fechado: boolean
}

export interface ProjecaoMes {
  mes: string
  rotulo?: string
  realizado_liquido?: number
  projetado: number | null
  uteis_transcorridos?: number
  uteis_total?: number
}

interface Barra {
  mes: string
  eixo: string
  realizado: number
  /** Distância do realizado até a projeção. Só existe no mês em andamento. */
  complemento: number | null
  fechado: boolean
  ponto: PontoMensal
}

function TooltipMes({
  active,
  payload,
  projecao,
}: {
  active?: boolean
  payload?: { payload: Barra }[]
  projecao?: ProjecaoMes | null
}) {
  if (!active || !payload?.length) return null
  const b = payload[0].payload
  const p = b.ponto
  const projetaEste = !b.fechado && projecao && projecao.mes === b.mes
  return (
    <div className="rounded border border-line bg-surface px-4 py-3 max-w-[17rem]">
      <p className="label-caps mb-1">
        {p.rotulo ?? mesLongo(b.mes)}
        {!b.fechado && ' · em andamento'}
      </p>
      <p className="num text-lg font-semibold">{brlExato.format(p.liquido)}</p>
      <p className="text-muted text-[11px] font-mono">líquido de devolução</p>
      <div className="mt-2 pt-2 border-t border-line flex flex-col gap-0.5 text-[11px] font-mono text-muted">
        {p.bruto !== undefined && <span>bruto {moeda(p.bruto)}</span>}
        {p.devolucao !== undefined && (
          <span>
            devolução {moeda(p.devolucao)}
            {p.devolucao_pct !== null && p.devolucao_pct !== undefined && ` (${pct(p.devolucao_pct, 2)})`}
          </span>
        )}
        {p.margem_pct !== null && p.margem_pct !== undefined && <span>margem {pct(p.margem_pct)}</span>}
        {projetaEste && (
          <span className="text-ink-soft">
            projeção do fechamento {moeda(projecao?.projetado ?? undefined)}
            {projecao?.uteis_total
              ? ` · ${numero(projecao.uteis_transcorridos ?? 0)} de ${numero(projecao.uteis_total)} dias úteis`
              : ''}
          </span>
        )}
      </div>
    </div>
  )
}

function TooltipDia({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { value: number; payload: PontoSerie }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="rounded border border-line bg-surface px-4 py-3">
      <p className="label-caps mb-1">{label ? diaCurto(label) : ''}</p>
      <p className="num text-lg font-semibold">{brlExato.format(p.faturamento)}</p>
      <p className="text-muted text-xs mt-0.5 font-mono">{p.notas} notas emitidas</p>
    </div>
  )
}

/** Legenda inline: a barra de contorno precisa ser explicada, não adivinhada. */
function Legenda() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-[11px] font-mono text-muted">
      <span className="inline-flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-sm" style={{ background: OLIVA }} />
        realizado (líquido de devolução)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          className="w-3 h-3 rounded-sm"
          style={{ background: PAPEL, border: `1.5px dashed ${OLIVA}` }}
        />
        projeção do fechamento do mês corrente
      </span>
    </div>
  )
}

function montar(mensal: PontoMensal[], projecao?: ProjecaoMes | null): Barra[] {
  return mensal.map((p) => {
    const projeta = !p.fechado && projecao && projecao.mes === p.mes && projecao.projetado !== null
    return {
      mes: p.mes,
      eixo: mesCurto(p.mes),
      realizado: p.liquido,
      complemento: projeta ? Math.max((projecao?.projetado ?? 0) - p.liquido, 0) : null,
      fechado: p.fechado,
      ponto: p,
    }
  })
}

/**
 * @param dados   série DIÁRIA (visão legada).
 * @param mensal  série MENSAL de faturamento líquido — o modo da aba Comercial.
 */
export default function SerieFaturamento({
  dados,
  mensal,
  projecao,
  altura = 280,
}: {
  dados?: PontoSerie[]
  mensal?: PontoMensal[]
  projecao?: ProjecaoMes | null
  altura?: number
}) {
  if (mensal) {
    if (!mensal.length) return <p className="text-muted text-sm py-10 text-center">Sem faturamento no período.</p>
    const barras = montar(mensal, projecao)
    return (
      <div>
        <Legenda />
        <ResponsiveContainer width="100%" height={altura}>
          <BarChart data={barras} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barCategoryGap="22%">
            <CartesianGrid stroke={GRADE} vertical={false} />
            <XAxis
              dataKey="eixo"
              tick={{ fill: EIXO, fontSize: 11, fontFamily: 'JetBrains Mono' }}
              axisLine={{ stroke: GRADE }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={brlCompacto}
              tick={{ fill: EIXO, fontSize: 11, fontFamily: 'JetBrains Mono' }}
              axisLine={false}
              tickLine={false}
              width={72}
            />
            <Tooltip
              content={<TooltipMes projecao={projecao} />}
              cursor={{ fill: 'rgba(27,28,25,0.04)' }}
            />
            <Bar dataKey="realizado" stackId="mes" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {barras.map((b) => (
                <Cell key={b.mes} fill={OLIVA} fillOpacity={b.fechado ? 1 : 0.85} />
              ))}
            </Bar>
            {/* contorno tracejado: mesma cor, textura diferente — a projeção se
                distingue mesmo impressa em preto e branco */}
            <Bar dataKey="complemento" stackId="mes" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {barras.map((b) => (
                <Cell key={b.mes} fill={PAPEL} stroke={OLIVA} strokeWidth={1.5} strokeDasharray="4 3" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={altura}>
      <AreaChart data={dados ?? []} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id="gradFat" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={OLIVA} stopOpacity={0.14} />
            <stop offset="100%" stopColor={OLIVA} stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRADE} vertical={false} />
        <XAxis
          dataKey="dia"
          tickFormatter={diaCurto}
          tick={{ fill: EIXO, fontSize: 11, fontFamily: 'JetBrains Mono' }}
          axisLine={{ stroke: GRADE }}
          tickLine={false}
          minTickGap={32}
        />
        <YAxis
          tickFormatter={brlCompacto}
          tick={{ fill: EIXO, fontSize: 11, fontFamily: 'JetBrains Mono' }}
          axisLine={false}
          tickLine={false}
          width={72}
        />
        <Tooltip content={<TooltipDia />} cursor={{ stroke: 'rgba(27,28,25,0.25)', strokeDasharray: '4 4' }} />
        <Area
          type="monotone"
          dataKey="faturamento"
          stroke={OLIVA}
          strokeWidth={2}
          fill="url(#gradFat)"
          activeDot={{ r: 4, fill: OLIVA, stroke: '#f6f4ea', strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
