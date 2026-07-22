import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { PontoMensal } from '../charts/SerieFaturamento'
import { mesCurto, mesLongo, moeda, pct } from './formato'

/**
 * Margem de contribuição mês a mês contra a meta de 33%.
 *
 * ★ Painel SEPARADO do faturamento, de propósito. Margem é taxa e faturamento é
 *   valor: colocar os dois no mesmo gráfico exigiria dois eixos y, e aí o ponto em
 *   que as linhas se cruzam vira "significado" que só existe porque alguém escolheu
 *   as escalas. Mesmo eixo de meses, uma medida por painel.
 *
 * ★ É este o gráfico que o dono mais acompanha: a queda de 37,4% (fev) para 29,8%
 *   (jun) veio de reajuste de fornecedor sem repasse ao cliente. Por isso a linha de
 *   meta fica desenhada — a pergunta é sempre "está acima ou abaixo dos 33%".
 *
 * ★ O mês em andamento sai TRACEJADO e nunca é comparado a mês fechado como igual.
 */
const AZUL = '#215fa6'
const GRADE = 'rgba(27, 28, 25, 0.08)'
const EIXO = '#6b6e64'
const PAPEL = '#fffdf7'

interface Ponto {
  mes: string
  eixo: string
  fechado: boolean
  /** Só meses fechados — a linha cheia. */
  margem: number | null
  /** Último fechado + mês corrente — o trecho tracejado que os liga. */
  parcial: number | null
  liquido: number
}

function montar(mensal: PontoMensal[]): Ponto[] {
  return mensal.map((p, i) => {
    const proximoAberto = i + 1 < mensal.length && !mensal[i + 1].fechado
    const m = p.margem_pct ?? null
    return {
      mes: p.mes,
      eixo: mesCurto(p.mes),
      fechado: p.fechado,
      margem: p.fechado ? m : null,
      parcial: !p.fechado || proximoAberto ? m : null,
      liquido: p.liquido,
    }
  })
}

function TooltipMargem({ active, payload }: { active?: boolean; payload?: { payload: Ponto }[] }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  const valor = p.fechado ? p.margem : p.parcial
  return (
    <div className="rounded border border-line bg-surface px-4 py-3">
      <p className="label-caps mb-1">
        {mesLongo(p.mes)}
        {!p.fechado && ' · parcial'}
      </p>
      <p className="num text-lg font-semibold">{pct(valor, 2)}</p>
      <p className="text-muted text-[11px] font-mono mt-0.5">
        margem de contribuição sobre {moeda(p.liquido)} líquidos
      </p>
    </div>
  )
}

export default function SerieMargem({
  mensal,
  meta = 33,
  altura = 220,
}: {
  mensal: PontoMensal[]
  meta?: number
  altura?: number
}) {
  const pontos = montar(mensal).filter((p) => p.margem !== null || p.parcial !== null)
  if (!pontos.length) return <p className="text-muted text-sm py-10 text-center">Sem margem apurada no período.</p>

  const valores = pontos.map((p) => (p.fechado ? p.margem : p.parcial)).filter((v): v is number => v !== null)
  // eixo enquadrado na faixa real + a meta: com base em zero a variação de 29% para
  // 37% — que é a história inteira — vira um risco reto perto do topo
  const piso = Math.max(0, Math.floor(Math.min(...valores, meta) - 4))
  const teto = Math.ceil(Math.max(...valores, meta) + 4)

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-[11px] font-mono text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 h-0.5" style={{ background: AZUL }} />
          margem de contribuição (mês fechado)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="w-4 h-0"
            style={{ borderTop: `2px dashed ${AZUL}` }}
          />
          mês em andamento (parcial)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 h-0" style={{ borderTop: '1px dashed #6b6e64' }} />
          meta {pct(meta, 0)}
        </span>
      </div>

      <ResponsiveContainer width="100%" height={altura}>
        <LineChart data={pontos} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={GRADE} vertical={false} />
          <XAxis
            dataKey="eixo"
            tick={{ fill: EIXO, fontSize: 11, fontFamily: 'JetBrains Mono' }}
            axisLine={{ stroke: GRADE }}
            tickLine={false}
          />
          <YAxis
            domain={[piso, teto]}
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fill: EIXO, fontSize: 11, fontFamily: 'JetBrains Mono' }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip content={<TooltipMargem />} cursor={{ stroke: 'rgba(27,28,25,0.25)', strokeDasharray: '4 4' }} />
          <ReferenceLine
            y={meta}
            stroke={EIXO}
            strokeDasharray="5 4"
            label={{
              value: `meta ${pct(meta, 0)}`,
              position: 'insideTopRight',
              fill: EIXO,
              fontSize: 11,
              fontFamily: 'JetBrains Mono',
            }}
          />
          <Line
            type="monotone"
            dataKey="margem"
            stroke={AZUL}
            strokeWidth={2}
            dot={{ r: 4, fill: PAPEL, stroke: AZUL, strokeWidth: 2 }}
            activeDot={{ r: 5, fill: AZUL, stroke: PAPEL, strokeWidth: 2 }}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="parcial"
            stroke={AZUL}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={{ r: 4, fill: PAPEL, stroke: AZUL, strokeWidth: 2 }}
            activeDot={{ r: 5, fill: AZUL, stroke: PAPEL, strokeWidth: 2 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>

      <p className="mt-2 text-[11px] font-mono text-muted">
        Eixo iniciado em {piso}% para mostrar a distância da meta — não começa em zero.
      </p>
    </div>
  )
}
