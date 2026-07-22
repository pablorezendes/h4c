import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { FaixaAging } from '../../lib/api'
import { brlCompacto, brlExato } from '../../lib/format'

/**
 * Aging do contas a receber.
 *
 * ★ A FAIXA "1-30 DIAS" ESCONDIA O ESSENCIAL. Medido em 21/07/2026: dos R$ 14.953
 *   que ela mostrava, R$ 13.780 (92%) estavam nos 15 primeiros dias. Atraso fresco
 *   se cobra por telefone; atraso velho já é decisão de crédito — são ações
 *   diferentes, então 1-15 e 16-30 vivem separadas.
 *
 * ★ "A VENCER" ESMAGA A ESCALA. Na mesma medição a carteira a vencer somava
 *   R$ 313.990 contra R$ 26.384 de vencido inteiro: no mesmo eixo, todas as faixas
 *   de atraso viram uma linha rente ao chão. Quem quer ler o atraso passa
 *   `mostrarAVencer={false}` e mostra o a vencer como número, fora do gráfico.
 */
const ORDEM = ['A vencer', '1-15 dias', '16-30 dias', '31-60 dias', '61-90 dias', '> 90 dias']

/** Faixa fora da lista conhecida vai para o fim, em vez de saltar para o começo
 *  (indexOf devolve -1, que ordenaria antes de tudo). */
const posicao = (faixa: string) => {
  const i = ORDEM.indexOf(faixa)
  return i === -1 ? ORDEM.length : i
}

const GRADE = 'rgba(27, 28, 25, 0.08)'
const EIXO = '#6b6e64'
const OLIVA = '#5b691d'
const TERRACOTA = '#b23a2a'

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

export default function Aging({
  dados,
  mostrarAVencer = true,
  altura = 240,
}: {
  dados: FaixaAging[]
  mostrarAVencer?: boolean
  altura?: number
}) {
  const ordenado = [...dados]
    .filter((f) => mostrarAVencer || f.faixa !== 'A vencer')
    .sort((a, b) => posicao(a.faixa) - posicao(b.faixa))

  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart data={ordenado} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barCategoryGap="28%">
        <CartesianGrid stroke={GRADE} vertical={false} />
        <XAxis dataKey="faixa" tick={{ fill: EIXO, fontSize: 11, fontFamily: 'JetBrains Mono' }} axisLine={{ stroke: GRADE }} tickLine={false} interval={0} />
        <YAxis tickFormatter={brlCompacto} tick={{ fill: EIXO, fontSize: 11, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} width={72} />
        <Tooltip content={<TooltipCustom />} cursor={{ fill: 'rgba(27,28,25,0.04)' }} />
        {/* a vencer é carteira saudável (oliva); o que passou do vencimento é perda
            de caixa em curso e sai em terracota */}
        <Bar dataKey="valor" radius={[2, 2, 0, 0]} maxBarSize={48}>
          {ordenado.map((f) => (
            <Cell key={f.faixa} fill={f.faixa === 'A vencer' ? OLIVA : TERRACOTA} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
