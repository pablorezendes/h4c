import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { FaixaAging } from '../../lib/api'
import { brlCompacto, brlExato } from '../../lib/format'

const ORDEM = ['A vencer', '1-30 dias', '31-60 dias', '61-90 dias', '> 90 dias']
const GRADE = 'rgba(27, 28, 25, 0.08)'
const EIXO = '#6b6e64'

function TooltipCustom({ active, payload, label }: { active?: boolean; payload?: { payload: FaixaAging }[]; label?: string }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="rounded border border-line bg-surface px-4 py-3">
      <p className="label-caps mb-1">{label}</p>
      <p className="num text-lg font-semibold">{brlExato.format(p.valor)}</p>
      <p className="text-muted text-xs mt-0.5 font-mono">{p.titulos} títulos</p>
    </div>
  )
}

export default function Aging({ dados }: { dados: FaixaAging[] }) {
  const ordenado = [...dados].sort((a, b) => ORDEM.indexOf(a.faixa) - ORDEM.indexOf(b.faixa))
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={ordenado} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barCategoryGap="28%">
        <CartesianGrid stroke={GRADE} vertical={false} />
        <XAxis dataKey="faixa" tick={{ fill: EIXO, fontSize: 11, fontFamily: 'JetBrains Mono' }} axisLine={{ stroke: GRADE }} tickLine={false} interval={0} />
        <YAxis tickFormatter={brlCompacto} tick={{ fill: EIXO, fontSize: 11, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} width={72} />
        <Tooltip content={<TooltipCustom />} cursor={{ fill: 'rgba(27,28,25,0.04)' }} />
        <Bar dataKey="valor" fill="#5e6e52" radius={[2, 2, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  )
}
