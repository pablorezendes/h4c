import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { brl } from '../../lib/format'
import { dias, mesCurto, Vazio } from './formatos'
import type { PontoPrazo } from './tipos'

/**
 * Série mensal dos três prazos — só meses FECHADOS.
 *
 * O parcial do mês corrente daria a ilusão de que o cliente ficou pontual: no meio
 * do mês só os títulos de vencimento curto já foram pagos, e a média cai sozinha.
 * Por isso o backend corta a série no último mês encerrado e a tela não "completa"
 * o gráfico com o mês em andamento.
 */

const COR = {
  concedido: '#9a6a00', // o que o comercial prometeu
  pmr: '#b23a2a', // o que o cliente cumpriu
  pmp: '#5b691d', // o que a empresa pagou
}

const GRADE = 'rgba(27, 28, 25, 0.08)'
const EIXO = '#6b6e64'

const LEGENDA = [
  { chave: 'concedido', rotulo: 'Concedido no boleto', cor: COR.concedido },
  { chave: 'pmr', rotulo: 'PMR recebido', cor: COR.pmr },
  { chave: 'pmp', rotulo: 'PMP mercadoria', cor: COR.pmp },
] as const

function TooltipCustom({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { payload: PontoPrazo }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="rounded border border-line bg-surface px-4 py-3">
      <p className="label-caps mb-1.5">{label ? mesCurto(label) : ''}</p>
      <ul className="flex flex-col gap-1 text-xs font-mono">
        <li className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 shrink-0" style={{ background: COR.concedido }} />
          concedido <span className="ml-auto text-ink font-semibold">{dias(p.concedido)}</span>
        </li>
        <li className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 shrink-0" style={{ background: COR.pmr }} />
          recebido <span className="ml-auto text-ink font-semibold">{dias(p.pmr)}</span>
        </li>
        <li className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 shrink-0" style={{ background: COR.pmp }} />
          pago <span className="ml-auto text-ink font-semibold">{dias(p.pmp)}</span>
        </li>
      </ul>
      {p.valor_recebido != null && (
        <p className="text-muted text-[11px] mt-1.5 font-mono">{brl.format(p.valor_recebido)} recebidos no mês</p>
      )}
    </div>
  )
}

export default function SeriePrazos({ dados }: { dados: PontoPrazo[] }) {
  const comDado = dados.filter((p) => p.pmr != null || p.concedido != null || p.pmp != null)
  if (comDado.length === 0) return <Vazio>sem meses fechados com título liquidado</Vazio>

  return (
    <>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 mb-3">
        {LEGENDA.map((l) => (
          <span key={l.chave} className="inline-flex items-center gap-1.5 text-[11px] font-mono text-muted">
            <span className="w-3 h-0.5" style={{ background: l.cor }} />
            {l.rotulo}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={comDado} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={GRADE} vertical={false} />
          <XAxis
            dataKey="mes"
            tickFormatter={mesCurto}
            tick={{ fill: EIXO, fontSize: 11, fontFamily: 'JetBrains Mono' }}
            axisLine={{ stroke: GRADE }}
            tickLine={false}
            minTickGap={16}
          />
          <YAxis
            tickFormatter={(v: number) => `${v} d`}
            tick={{ fill: EIXO, fontSize: 11, fontFamily: 'JetBrains Mono' }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip content={<TooltipCustom />} cursor={{ stroke: 'rgba(27,28,25,0.25)', strokeDasharray: '4 4' }} />
          {LEGENDA.map((l) => (
            <Line
              key={l.chave}
              type="monotone"
              dataKey={l.chave}
              name={l.rotulo}
              stroke={l.cor}
              strokeWidth={2}
              dot={{ r: 2.5, fill: l.cor, strokeWidth: 0 }}
              activeDot={{ r: 4, fill: l.cor, stroke: '#f6f4ea', strokeWidth: 2 }}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </>
  )
}
