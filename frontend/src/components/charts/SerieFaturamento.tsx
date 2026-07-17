import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { PontoSerie } from '../../lib/api'
import { brlCompacto, brlExato, diaCurto } from '../../lib/format'

const OLIVA = '#5e6e52'
const GRADE = 'rgba(27, 28, 25, 0.08)'
const EIXO = '#6b6e64'

function TooltipCustom({ active, payload, label }: { active?: boolean; payload?: { value: number; payload: PontoSerie }[]; label?: string }) {
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

export default function SerieFaturamento({ dados }: { dados: PontoSerie[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
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
        <Tooltip content={<TooltipCustom />} cursor={{ stroke: 'rgba(27,28,25,0.25)', strokeDasharray: '4 4' }} />
        <Area
          type="monotone"
          dataKey="faturamento"
          stroke={OLIVA}
          strokeWidth={2}
          fill="url(#gradFat)"
          activeDot={{ r: 4, fill: OLIVA, stroke: '#fbf9f5', strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
