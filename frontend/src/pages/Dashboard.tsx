import { useEffect, useState } from 'react'
import { Banknote, PackageSearch, ReceiptText, UserX } from 'lucide-react'
import { api, type FaixaAging, type Overview, type PontoSerie, type ProdutoTop } from '../lib/api'
import Layout from '../components/Layout'
import BotaoExportar from '../components/BotaoExportar'
import KpiCard from '../components/KpiCard'
import IndicadorCard, { type Indicador } from '../components/IndicadorCard'
import FiltroBar, { filtroQuery, useFiltro } from '../components/FiltroBar'
import SerieFaturamento from '../components/charts/SerieFaturamento'
import Aging from '../components/charts/Aging'
import TopProdutos from '../components/TopProdutos'
import Placar, { moeda, type ItemPlacar } from '../components/cockpit/Placar'
import Radar, { type Alerta } from '../components/cockpit/Radar'
import Equipe, { type Vendedor } from '../components/cockpit/Equipe'

interface RespostaIndicadores {
  periodo: { dt_ini: string; dt_fim: string; dias: number } | null
  indicadores: Indicador[]
}

interface RespostaFuturo {
  rows: Record<string, unknown>[]
  meta: Record<string, unknown>
}

export default function Dashboard() {
  const [filtro, setFiltro] = useFiltro()
  const [overview, setOverview] = useState<Overview | null>(null)
  const [indicadores, setIndicadores] = useState<Indicador[]>([])
  const [serie, setSerie] = useState<PontoSerie[]>([])
  const [produtos, setProdutos] = useState<ProdutoTop[]>([])
  const [aging, setAging] = useState<FaixaAging[]>([])
  const [futuro, setFuturo] = useState<{ previsto?: number; ruptura?: number; urgentes?: string; risco?: number; riscoClientes?: number; caixa?: number }>({})
  const [equipe, setEquipe] = useState<Vendedor[]>([])
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    const q = filtroQuery(filtro)
    setErro(null)

    // 1ª leva: o essencial da tela (pinta rápido)
    Promise.all([
      api<Overview>(`/api/kpis/overview?${q}`),
      api<PontoSerie[]>(`/api/kpis/vendas/serie?${q}`),
      api<ProdutoTop[]>(`/api/kpis/vendas/top-produtos?${q}&limite=8`),
      api<FaixaAging[]>('/api/kpis/financeiro/aging'),
    ])
      .then(([ov, se, pr, ag]) => {
        setOverview(ov)
        setSerie(se)
        setProdutos(pr)
        setAging(ag)
      })
      .catch((e) => setErro(String(e.message ?? e)))

    // 2ª leva: indicadores + radar/equipe (mais lentos; não travam o paint)
    api<RespostaIndicadores>(`/api/indicadores?${q}`)
      .then((r) => setIndicadores(r.indicadores))
      .catch(() => setIndicadores([]))

    const anc = `dt_fim=${filtro.dt_fim}`
    Promise.allSettled([
      api<RespostaFuturo>(`/api/futuro/forecast-faturamento?horizonte=30&${anc}`),
      api<RespostaFuturo>(`/api/futuro/quando-comprar?limite=40&${anc}`),
      api<RespostaFuturo>(`/api/futuro/clientes-risco?${anc}`),
      api<RespostaFuturo>(`/api/futuro/caixa-previsto?semanas=8&${anc}`),
      api<RespostaFuturo>(`/api/analises/ANA-CRZ-03?${q}`),
    ]).then(([fc, qc, cr, cx, eq]) => {
      const meta = (r: PromiseSettledResult<RespostaFuturo>) => (r.status === 'fulfilled' ? r.value.meta : {})
      const rows = (r: PromiseSettledResult<RespostaFuturo>) => (r.status === 'fulfilled' ? r.value.rows : [])
      const urgentes = rows(qc)
        .filter((p) => p['status'] === 'ruptura_iminente')
        .slice(0, 2)
        .map((p) => String(p['descricao'] ?? '').split(' ').slice(0, 2).join(' '))
        .join(', ')
      setFuturo({
        previsto: meta(fc)['total_previsto_horizonte'] as number | undefined,
        ruptura: meta(qc)['em_risco_de_ruptura'] as number | undefined,
        urgentes,
        risco: meta(cr)['receita_em_risco'] as number | undefined,
        riscoClientes: meta(cr)['em_risco'] as number | undefined,
        caixa: meta(cx)['total_previsto'] as number | undefined,
      })
      setEquipe(rows(eq) as Vendedor[])
    })
  }, [filtro])

  const ind = (id: string) => indicadores.find((i) => i.id === id)
  const faturamento = ind('IND-01')
  const margem = ind('IND-09')

  const vencido = aging.filter((f) => f.faixa !== 'A vencer')
  const vencidoTotal = vencido.reduce((s, f) => s + f.valor, 0)
  const vencidoTitulos = vencido.reduce((s, f) => s + f.titulos, 0)

  const placar: ItemPlacar[] = [
    {
      rotulo: 'Faturamento no período',
      valor: faturamento?.valor != null ? moeda(faturamento.valor) : overview ? moeda(overview.cards[0]?.valor) : '…',
      variacao_pct: faturamento?.variacao_pct ?? overview?.cards[0]?.variacao_pct ?? null,
      detalhe: 'vs período anterior',
      tom: 'text-primary',
    },
    {
      rotulo: 'Lucro bruto de mercadoria',
      valor: margem?.valor != null ? `${margem.valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '…',
      variacao_pct: margem?.variacao_pct ?? null,
      detalhe: 'antes de impostos e frete',
    },
    {
      rotulo: 'Previsto próximos 30 dias',
      valor: moeda(futuro.previsto),
      detalhe: 'pelo ritmo atual de vendas',
    },
    {
      rotulo: 'Vencido a receber',
      valor: moeda(vencidoTotal),
      detalhe: `${vencidoTitulos} contas em atraso`,
      tom: vencidoTotal > 0 ? 'text-danger' : 'text-ink',
    },
  ]

  const alertas: Alerta[] = []
  if (futuro.ruptura !== undefined)
    alertas.push({
      icone: PackageSearch,
      tom: futuro.ruptura > 0 ? 'erro' : 'ok',
      numero: String(futuro.ruptura),
      titulo: 'Produtos p/ comprar já',
      detalhe: futuro.urgentes ? `urgentes: ${futuro.urgentes}` : 'estoque saudável',
      para: '/futuro',
    })
  if (futuro.risco !== undefined)
    alertas.push({
      icone: UserX,
      tom: (futuro.riscoClientes ?? 0) > 0 ? 'aviso' : 'ok',
      numero: moeda(futuro.risco),
      titulo: 'Receita em risco',
      detalhe: `${futuro.riscoClientes ?? 0} clientes esfriando`,
      para: '/futuro',
    })
  if (aging.length)
    alertas.push({
      icone: ReceiptText,
      tom: vencidoTotal > 0 ? 'erro' : 'ok',
      numero: moeda(vencidoTotal),
      titulo: 'Contas vencidas',
      detalhe: `${vencidoTitulos} títulos para cobrar`,
      para: '/analises',
    })
  if (futuro.caixa !== undefined)
    alertas.push({
      icone: Banknote,
      tom: 'ok',
      numero: moeda(futuro.caixa),
      titulo: 'Caixa previsto 8 sem.',
      detalhe: 'pelo costume de pagamento',
      para: '/futuro',
    })

  return (
    <Layout>
      <header className="mb-5 sm:mb-6 surgir">
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink tracking-tight">Visão geral</h1>
        <p className="text-muted mt-2 flex items-center gap-2 text-sm sm:text-base">
          <span className="dot dot-ativo hidden sm:inline-block" aria-hidden />
          Hygiene For Care · cockpit executivo com dados do Winthor ao vivo
        </p>
      </header>

      <div className="mb-5">
        <FiltroBar
          filtro={filtro}
          onChange={setFiltro}
          aviso="Hora aplicada onde o Winthor registra horário: pedidos e itens vendidos (a nota fiscal não tem hora)."
        />
      </div>

      {erro && (
        <div className="tile p-4 mb-6 text-danger text-sm" role="alert">
          {erro}
        </div>
      )}

      <div className="flex flex-col gap-5">
        {/* 1 — Placar: como estou indo */}
        <Placar itens={placar} />

        {/* 2 — Radar: onde agir hoje */}
        <Radar alertas={alertas} />

        {/* 3 — Gráficos: ritmo e recebimento */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-5">
          <section className="tile tile-hover p-4 sm:p-6 xl:col-span-2 surgir surgir-2">
            <div className="mb-4">
              <h2 className="font-display text-lg font-semibold text-ink">Faturamento diário</h2>
              <p className="text-muted text-sm mt-0.5">Notas fiscais de venda emitidas por dia</p>
            </div>
            <SerieFaturamento dados={serie} />
          </section>

          <section className="tile tile-hover p-4 sm:p-6 surgir surgir-3">
            <div className="mb-4">
              <h2 className="font-display text-lg font-semibold text-ink">Contas a receber</h2>
              <p className="text-muted text-sm mt-0.5">Carteira aberta por faixa de atraso</p>
            </div>
            <Aging dados={aging} />
          </section>
        </div>

        {/* 4 — Equipe e produtos: quem e o quê movem o resultado */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-5">
          <section className="tile tile-hover p-4 sm:p-6 surgir surgir-3">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-ink">Raio-X da equipe</h2>
                <p className="text-muted text-sm mt-0.5">Venda, lucro e cobertura de carteira por vendedor</p>
              </div>
              <BotaoExportar nome="Raio-X da equipe" rows={equipe as Record<string, unknown>[]} />
            </div>
            <Equipe vendedores={equipe} />
          </section>

          <section className="tile tile-hover p-4 sm:p-6 surgir surgir-4">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-ink">Top produtos</h2>
                <p className="text-muted text-sm mt-0.5">Venda faturada por produto no período</p>
              </div>
              <BotaoExportar nome="Top produtos" rows={produtos as unknown as Record<string, unknown>[]} />
            </div>
            <TopProdutos dados={produtos} />
          </section>
        </div>

        {/* 5 — Indicadores detalhados */}
        {indicadores.length > 0 ? (
          <section>
            <div className="flex items-baseline gap-3 mb-3">
              <h2 className="label-caps">Todos os indicadores do período</h2>
              <span className="h-px flex-1 bg-line" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
              {indicadores.map((i, n) => (
                <IndicadorCard key={i.id} ind={i} indice={n} />
              ))}
            </div>
          </section>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
            {overview?.cards.map((c, i) => <KpiCard key={c.id} card={c} indice={i} />)}
          </div>
        )}
      </div>
    </Layout>
  )
}
