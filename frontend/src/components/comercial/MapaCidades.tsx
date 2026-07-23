import { useMemo } from 'react'
import { ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts'
import { moeda, numero, pct, plural } from './formato'

/**
 * Mapa de vendas por cidade — MAPA DE CALOR self-contained (§Comercial).
 *
 * ★ SEM TILE EXTERNO. A política do BI é self-contained e a CSP não libera host de
 *   fora (nada de Leaflet/mapbox). A geografia real aparece porque cada ponto usa a
 *   COORDENADA verdadeira da cidade: um ScatterChart com a longitude no eixo X e a
 *   latitude no eixo Y desenha Goiânia e o interior de GO no lugar certo sozinho —
 *   sem carregar um único pixel de mapa.
 *
 * ★ A latitude cresce para o NORTE e o eixo Y do Recharts já cresce para cima, então
 *   o mapa não sai espelhado; a longitude no X põe o leste à direita. Eixos numéricos
 *   ocultos, com folga no domínio para os pontos da borda não colarem no corte.
 *
 * ★ TAMANHO POR RAIZ do líquido. Com escala linear a maior praça (Goiânia) vira um
 *   disco que engole o resto; com raio ∝ √líquido a ÁREA fica proporcional ao líquido
 *   — a leitura perceptual correta de "onde o faturamento está concentrado". A cor
 *   segue o mesmo √: quanto mais líquido, mais denso o oliva da marca.
 *
 * Um mapa sem números não fecha decisão: ao lado vai o ranking das maiores cidades
 * (cidade · líquido · participação) e, no rodapé, a nota de quantas cidades ficaram
 * sem coordenada (meta.sem_coordenada) — para o número não parecer que sumiu.
 */
export interface CidadeMapa {
  codibge: string | number
  cidade: string
  uf: string
  /** null quando a cidade não tem coordenada apurada — fica fora do mapa. */
  lat: number | null
  lng: number | null
  liquido: number
  clientes: number
  participacao_pct: number | null
}

export interface MetaMapa {
  total_liquido: number
  cidades: number
  sem_coordenada: number
  uf_principal: string | null
}

/** Só as cidades posicionáveis: sem lat/lng o ponto não tem onde cair no plano. */
function comCoordenada(rows: CidadeMapa[]): CidadeMapa[] {
  return rows.filter(
    (c) => c.lat != null && c.lng != null && Number.isFinite(c.lat) && Number.isFinite(c.lng),
  )
}

/** Domínio de um eixo com folga: sem ela os pontos da borda encostam no corte.
 *  Cidade única (delta 0) ganha uma folga fixa para não virar domínio degenerado. */
function comFolga(min: number, max: number): [number, number] {
  const delta = max - min
  const folga = delta > 0 ? delta * 0.12 : 0.5
  return [min - folga, max + folga]
}

function TooltipMapa({ active, payload }: {
  active?: boolean
  payload?: { payload?: CidadeMapa }[]
}) {
  if (!active || !payload?.length) return null
  const c = payload[0]?.payload
  if (!c) return null
  return (
    <div className="rounded border border-line bg-surface px-4 py-3 text-sm">
      <p className="font-display font-semibold text-ink leading-snug">
        {c.cidade}
        <span className="text-muted font-mono text-xs"> · {c.uf}</span>
      </p>
      <p className="text-ink-soft font-mono text-xs mt-1">
        Líquido: <span className="text-ink font-semibold">{moeda(c.liquido)}</span>
      </p>
      <p className="text-muted font-mono text-xs">
        {plural(c.clientes, 'cliente', 'clientes')} · {pct(c.participacao_pct)} do período
      </p>
    </div>
  )
}

export default function MapaCidades({ rows, meta }: { rows: CidadeMapa[]; meta: MetaMapa }) {
  const pontos = useMemo(() => comCoordenada(rows ?? []), [rows])

  const ranking = useMemo(
    () => [...(rows ?? [])].sort((a, b) => b.liquido - a.liquido).slice(0, 8),
    [rows],
  )

  // âncora da escala de tamanho/cor: o maior líquido entre os pontos plotados
  const maxLiq = useMemo(() => pontos.reduce((m, c) => Math.max(m, c.liquido), 0) || 1, [pontos])

  const [dominioX, dominioY] = useMemo<[[number, number], [number, number]]>(() => {
    if (!pontos.length) return [[0, 1], [0, 1]]
    const lngs = pontos.map((c) => c.lng as number)
    const lats = pontos.map((c) => c.lat as number)
    return [
      comFolga(Math.min(...lngs), Math.max(...lngs)),
      comFolga(Math.min(...lats), Math.max(...lats)),
    ]
  }, [pontos])

  // intensidade √: raio ∝ √líquido (⇒ área ∝ líquido) e a cor acompanha o mesmo t.
  // shape próprio no lugar do ZAxis para controlar raio E opacidade pela mesma régua.
  const ponto = (props: { cx?: number; cy?: number; payload?: CidadeMapa }) => {
    const { cx, cy, payload } = props
    if (cx == null || cy == null || !payload) return <g />
    const t = Math.min(1, Math.sqrt(Math.max(0, payload.liquido) / maxLiq))
    const r = 4 + 18 * t
    return (
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="var(--color-primary)"
        fillOpacity={0.28 + 0.62 * t}
        stroke="var(--color-primary-strong)"
        strokeOpacity={0.45}
        strokeWidth={0.75}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_18rem] gap-5">
        {/* o mapa de calor propriamente dito */}
        <div className="min-w-0">
          {pontos.length ? (
            <ResponsiveContainer width="100%" height={400}>
              <ScatterChart margin={{ top: 12, right: 16, bottom: 12, left: 16 }}>
                {/* eixos escondidos: a régua não interessa, só a POSIÇÃO relativa das cidades */}
                <XAxis type="number" dataKey="lng" domain={dominioX} hide />
                <YAxis type="number" dataKey="lat" domain={dominioY} hide />
                <Tooltip
                  content={<TooltipMapa />}
                  cursor={{ strokeDasharray: '3 3', stroke: 'rgba(27,28,25,0.15)' }}
                />
                <Scatter data={pontos} shape={ponto} isAnimationActive={false} />
              </ScatterChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[400px] flex items-center justify-center text-muted text-sm text-center px-4">
              Nenhuma cidade com coordenada para posicionar no mapa neste período — veja o ranking ao lado.
            </div>
          )}
        </div>

        {/* ranking: o mapa mostra a forma, o ranking fecha o número */}
        <div className="min-w-0">
          <p className="label-caps mb-2">Maiores cidades</p>
          {ranking.length ? (
            <ul className="flex flex-col divide-y divide-line">
              {ranking.map((c, i) => (
                <li key={`${c.codibge}-${i}`} className="flex items-baseline gap-2 py-1.5">
                  <span className="num text-xs text-muted w-4 shrink-0 text-right">{i + 1}</span>
                  <span className="text-xs text-ink truncate">
                    {c.cidade}
                    <span className="text-muted"> · {c.uf}</span>
                  </span>
                  <span className="ml-auto flex flex-col items-end shrink-0 pl-2">
                    <span className="num text-xs text-ink whitespace-nowrap">{moeda(c.liquido)}</span>
                    <span className="font-mono text-[10px] text-muted">{pct(c.participacao_pct)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted text-sm py-2">Sem cidades no período.</p>
          )}
        </div>
      </div>

      {/* legenda do que o tamanho significa + as cidades que ficaram fora do mapa */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-3 border-t border-line">
        <p className="flex items-center gap-2 text-[11px] font-mono text-muted">
          <span className="inline-flex items-center gap-1" aria-hidden>
            <span className="rounded-full" style={{ width: 7, height: 7, background: 'var(--color-primary)', opacity: 0.4 }} />
            <span className="rounded-full" style={{ width: 11, height: 11, background: 'var(--color-primary)', opacity: 0.62 }} />
            <span className="rounded-full" style={{ width: 15, height: 15, background: 'var(--color-primary)', opacity: 0.85 }} />
          </span>
          Tamanho e cor crescem com o faturamento líquido do período
        </p>
        {meta && (
          <p className="text-[11px] font-mono text-muted">
            {numero(meta.cidades)} cidades · {moeda(meta.total_liquido)}
            {meta.sem_coordenada > 0 &&
              ` · ${plural(meta.sem_coordenada, 'cidade sem coordenada (fora do mapa)', 'cidades sem coordenada (fora do mapa)')}`}
          </p>
        )}
      </div>
    </div>
  )
}
