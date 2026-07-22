import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

/**
 * Cobertura de estoque em dias, com a LINHA DE META de 45 dias.
 *
 * A meta de suprimento da curva A é 45 dias (químicos e papéis). O gestor precisa ver
 * de imediato quem está acima e quem está abaixo do alvo — daí a linha tracejada
 * cruzando as barras em vez de um número solto em outra coluna.
 *
 * ★ EM BARRAS HORIZONTAIS (layout="vertical") A LINHA DE META É `x`, NÃO `y`: o eixo
 *   de valor é o X. Trocar os dois faz a linha nascer no eixo de categorias e sumir
 *   do gráfico sem erro nenhum no console.
 *
 * ★ `ifOverflow="extendDomain"` é obrigatório aqui: quando todo mundo está com menos
 *   de 45 dias — que é justamente o caso de alerta — o domínio automático pararia em
 *   ~30 e a linha de meta ficaria FORA da área desenhada, escondendo o diagnóstico.
 */

export interface ItemCobertura {
  codprod: number
  descricao: string
  cobertura_dias: number | null
  disponivel: number
  trancado: number
  demanda_diaria: number
}

const GRADE = 'rgba(27, 28, 25, 0.08)'
const EIXO = '#6b6e64'
const OLIVA = '#5b691d'
const AMBAR = '#9a6a00'
const TERRACOTA = '#b23a2a'
const META = '#1b1c19'

/** Nome curto: com 40 caracteres o eixo come metade da largura do gráfico. */
const curto = (s: string, n = 22) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

function cor(item: ItemCobertura, meta: number): string {
  if (item.disponivel <= 0) return TERRACOTA // ruptura: o vendedor já não consegue vender
  if ((item.cobertura_dias ?? 0) < meta) return AMBAR
  return OLIVA
}

function TooltipCustom({
  active,
  payload,
  meta,
}: {
  active?: boolean
  payload?: { payload: ItemCobertura }[]
  meta: number
}) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  const falta = p.cobertura_dias == null ? null : meta - p.cobertura_dias
  return (
    <div className="rounded border border-line bg-surface px-4 py-3 max-w-72">
      <p className="text-sm text-ink font-semibold leading-snug">{p.descricao}</p>
      <p className="num text-lg font-semibold mt-1.5">
        {p.cobertura_dias == null
          ? 'sem demanda'
          : `${p.cobertura_dias.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`}
      </p>
      <p className="text-muted text-xs mt-0.5 font-mono">
        {p.disponivel.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} disponíveis ·{' '}
        {p.demanda_diaria.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}/dia
      </p>
      {p.trancado > 0 && (
        <p className="text-muted text-xs mt-0.5 font-mono">
          {p.trancado.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} trancados (fora do disponível)
        </p>
      )}
      {falta != null && falta > 0 && (
        <p className="text-amber text-xs mt-1 font-mono">
          {falta.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias abaixo da meta
        </p>
      )}
    </div>
  )
}

export default function CoberturaEstoque({
  dados,
  meta = 45,
}: {
  dados: ItemCobertura[]
  meta?: number
}) {
  const altura = Math.max(200, dados.length * 28 + 40)
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart data={dados} layout="vertical" margin={{ top: 8, right: 24, bottom: 0, left: 8 }} barCategoryGap="24%">
        <CartesianGrid stroke={GRADE} horizontal={false} />
        <XAxis
          type="number"
          tickFormatter={(v: number) => `${v} d`}
          tick={{ fill: EIXO, fontSize: 11, fontFamily: 'JetBrains Mono' }}
          axisLine={{ stroke: GRADE }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="descricao"
          tickFormatter={(v: string) => curto(v)}
          tick={{ fill: EIXO, fontSize: 11, fontFamily: 'JetBrains Mono' }}
          axisLine={false}
          tickLine={false}
          width={150}
          interval={0}
        />
        <Tooltip content={<TooltipCustom meta={meta} />} cursor={{ fill: 'rgba(27,28,25,0.04)' }} />
        <Bar dataKey="cobertura_dias" radius={[0, 2, 2, 0]} maxBarSize={20}>
          {dados.map((d) => (
            <Cell key={d.codprod} fill={cor(d, meta)} />
          ))}
        </Bar>
        <ReferenceLine
          x={meta}
          stroke={META}
          strokeDasharray="5 4"
          ifOverflow="extendDomain"
          label={{
            value: `meta ${meta} d`,
            position: 'top',
            fill: META,
            fontSize: 11,
            fontFamily: 'JetBrains Mono',
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
