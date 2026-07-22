import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { brl, brlCompacto, brlExato, inteiro } from '../../lib/format'
import { pct, un, Vazio } from './formatos'
import type { LinhaAbc, RespostaAbc } from './tipos'

/**
 * Curva ABC de produto — a mesma ordenação da rotina 1464 (ABC por valor de venda,
 * ABC por quantidade como visão alternativa), sempre sobre o LÍQUIDO de devolução.
 *
 * A curva A é a que carrega meta de suprimento (45 dias) e, nesta operação, é
 * basicamente químicos e papéis: em jun/2026 são 41 SKUs que fazem 80,36% do
 * líquido. Por isso ela é a única com cor cheia — B e C ficam discretas.
 *
 * ★ LINHA COM LÍQUIDO <= 0 FICA FORA DA CURVA. Quando a devolução do período supera
 *   a venda, somar o item ao acumulado empurraria o total acima de 100% e a curva
 *   perderia o sentido. O backend as devolve em `meta.negativos`: continuam visíveis,
 *   só não entram no ranking.
 */

const LIMITE_BARRAS = 120
const GRADE = 'rgba(27, 28, 25, 0.08)'
const EIXO = '#6b6e64'
const COR_CLASSE: Record<string, string> = { A: '#5b691d', B: '#9a6a00', C: '#c3c4ac' }
const COR_ACUM = '#215fa6'

function TooltipCustom({
  active,
  payload,
  criterio,
}: {
  active?: boolean
  payload?: { payload: LinhaAbc }[]
  criterio: string
}) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="rounded border border-line bg-surface px-4 py-3 max-w-72">
      <p className="text-sm text-ink font-semibold leading-snug">{p.descricao}</p>
      <p className="text-muted text-[11px] font-mono mt-0.5">
        cód. {p.codprod} · {p.secao ?? p.departamento ?? 'sem seção'}
      </p>
      <p className="num text-lg font-semibold mt-1.5">
        {criterio === 'quantidade' ? `${un(p.qt_liquida)} un` : brlExato.format(p.valor_liquido)}
      </p>
      <p className="text-muted text-xs mt-0.5 font-mono">
        curva {p.classe_abc ?? '—'} · {pct(p.share_pct, 2)} do total · acumulado {pct(p.acumulado_pct)}
      </p>
    </div>
  )
}

export default function CurvaAbc({ dados }: { dados: RespostaAbc | null }) {
  if (!dados) return <Vazio>curva ABC indisponível no momento</Vazio>
  const rows = dados.rows ?? []
  if (!rows.length) return <Vazio>sem produto com venda líquida positiva no período</Vazio>

  const m = dados.meta
  const criterio = m.criterio ?? 'valor'
  const porQuantidade = criterio === 'quantidade'
  const chave = porQuantidade ? 'qt_liquida' : 'valor_liquido'
  const visiveis = rows.slice(0, LIMITE_BARRAS)
  const ocultos = rows.length - visiveis.length

  // participação de cada classe no critério — é o resumo que o comprador lê antes
  // de olhar qualquer produto individualmente
  const soma = (c: string) =>
    rows.filter((r) => r.classe_abc === c).reduce((s, r) => s + (porQuantidade ? r.qt_liquida : r.valor_liquido), 0)
  const total = porQuantidade ? m.total_qt_liquida : m.total_valor_liquido
  const faixas = [
    { classe: 'A', skus: m.skus_a, valor: soma('A') },
    { classe: 'B', skus: m.skus_b, valor: soma('B') },
    { classe: 'C', skus: m.skus_c, valor: soma('C') },
  ]

  return (
    <>
      <div className="grid grid-cols-3 gap-3 mb-4">
        {faixas.map((f) => (
          <div
            key={f.classe}
            className={`rounded border p-3 ${f.classe === 'A' ? 'border-primary bg-primary-wash' : 'border-line bg-floor'}`}
          >
            <p className="label-caps flex items-center gap-2">
              <span className="w-2.5 h-2.5 shrink-0" style={{ background: COR_CLASSE[f.classe] }} aria-hidden />
              Curva {f.classe}
            </p>
            <p className="num text-xl sm:text-2xl font-bold mt-1">{f.skus}</p>
            <p className="text-muted text-[11px] font-mono mt-0.5">
              {f.skus === 1 ? 'produto' : 'produtos'} ·{' '}
              {total ? pct((100 * f.valor) / total) : '—'}
            </p>
            <p className="text-muted text-[11px] font-mono">
              {porQuantidade ? `${un(f.valor)} un` : brl.format(f.valor)}
            </p>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={visiveis} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={GRADE} vertical={false} />
          {/* o eixo X é o ranking: 120 rótulos de produto não caberiam nem seriam
              lidos — a identificação sai no tooltip */}
          <XAxis dataKey="codprod" tick={false} axisLine={{ stroke: GRADE }} tickLine={false} height={8} />
          <YAxis
            yAxisId="v"
            tickFormatter={(v: number) => (porQuantidade ? inteiro.format(v) : brlCompacto(v))}
            tick={{ fill: EIXO, fontSize: 11, fontFamily: 'JetBrains Mono' }}
            axisLine={false}
            tickLine={false}
            width={72}
          />
          <YAxis
            yAxisId="a"
            orientation="right"
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fill: EIXO, fontSize: 11, fontFamily: 'JetBrains Mono' }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip content={<TooltipCustom criterio={criterio} />} cursor={{ fill: 'rgba(27,28,25,0.04)' }} />
          <Bar yAxisId="v" dataKey={chave} maxBarSize={22}>
            {visiveis.map((r) => (
              <Cell key={r.codprod} fill={COR_CLASSE[r.classe_abc ?? 'C'] ?? COR_CLASSE.C} />
            ))}
          </Bar>
          {/* corte da curva A: tudo à esquerda dos 80% acumulados */}
          <ReferenceLine
            yAxisId="a"
            y={m.corte_a_pct ?? 80}
            stroke={COR_ACUM}
            strokeDasharray="5 4"
            ifOverflow="extendDomain"
            label={{
              value: `corte da curva A · ${m.corte_a_pct ?? 80}%`,
              position: 'insideTopRight',
              fill: COR_ACUM,
              fontSize: 11,
              fontFamily: 'JetBrains Mono',
            }}
          />
          <Line
            yAxisId="a"
            type="monotone"
            dataKey="acumulado_pct"
            stroke={COR_ACUM}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3, fill: COR_ACUM }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3 text-[11px] font-mono text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-0.5" style={{ background: COR_ACUM }} /> acumulado (eixo direito)
        </span>
        {ocultos > 0 && <span>mostrando os {LIMITE_BARRAS} primeiros de {rows.length} produtos</span>}
        {m.negativos?.length > 0 && (
          <span title={m.nota_negativos}>
            {m.negativos.length} itens com devolução maior que a venda ficaram fora da curva
          </span>
        )}
      </div>
    </>
  )
}
