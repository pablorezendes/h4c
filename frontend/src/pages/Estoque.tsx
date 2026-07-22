import { useEffect, useMemo, useState } from 'react'
import { AlertOctagon, Info, Lock } from 'lucide-react'
import Layout from '../components/Layout'
import BotaoAjuda from '../components/ajuda/BotaoAjuda'
import BotaoExportar from '../components/BotaoExportar'
import FiltroBar, { filtroQuery, useFiltro } from '../components/FiltroBar'
import CoberturaEstoque, { type ItemCobertura } from '../components/charts/CoberturaEstoque'
import TopProdutos from '../components/TopProdutos'
import TabelaEstoque from '../components/compras/TabelaEstoque'
import { dias, Esqueleto, Nota, un, Vazio } from '../components/compras/formatos'
import type { RespostaEstoque } from '../components/compras/tipos'
import { api } from '../lib/api'
import { brl, brlExato } from '../lib/format'

/**
 * Sub-aba ESTOQUE — o que o time de vendas não vê.
 *
 * A gestão bloqueia itens no sistema para garantir contratos com SLA e multa: no app
 * de vendas o produto aparece ZERADO e o vendedor não consegue vendê-lo para cliente
 * pequeno. O volume típico dessa reserva é ~1 semana de demanda — o tempo que a
 * empresa ganha para buscar mercadoria em concorrente ou ajustar o fluxo.
 *
 * O BI existe para expor essa reserva ao dono: as quatro quantidades ficam separadas
 * (físico, reservado, trancado, avaria), o disponível é o mesmo que o app de vendas
 * enxerga, e o trancado aparece também EM DIAS DE DEMANDA, que é como o dono confere
 * se a reserva está no padrão.
 *
 * ★ Sem filtro de RCA: estoque não pertence a vendedor. Só departamento.
 *
 * ★ Sem janela móvel no seletor (`mostrarDias={false}`): a cobertura é disponível ÷
 *   demanda diária do MÊS FECHADO (§10). O filtro é global e persistido — o preset
 *   "30d" clicado em outra aba chegava aqui e trocava o divisor por 22 dias úteis de
 *   dois meses diferentes sem nada na tela dizer isso.
 */

const QTD_NO_GRAFICO = 14
const BOTAO =
  'px-3 py-2 sm:py-1.5 min-h-11 sm:min-h-0 rounded-sm text-sm sm:text-xs font-mono font-semibold transition-colors'

export default function Estoque() {
  const [filtro, setFiltro] = useFiltro()
  const [somenteTrancado, setSomenteTrancado] = useState(false)
  const [dados, setDados] = useState<RespostaEstoque | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(false)

  // estoque não se recorta por vendedor — o RCA de outra aba é ignorado aqui
  const q = useMemo(() => filtroQuery({ ...filtro, rcas: [] }), [filtro])

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    setErro(false)
    // sempre a lista inteira: o recorte "só trancados" é da TABELA, e refazer a
    // consulta faria os cards e o gráfico de cobertura mudarem junto — o total
    // trancado passaria a ser calculado sobre a própria seleção de trancados
    api<RespostaEstoque>(`/api/compras/estoque?${q}&limite=800`)
      .then((r) => {
        if (!vivo) return
        setDados(r)
        setCarregando(false)
      })
      .catch(() => {
        if (!vivo) return
        setDados(null)
        setErro(true)
        setCarregando(false)
      })
    return () => {
      vivo = false
    }
  }, [q])

  const m = dados?.meta
  // memoizado porque `?? []` cria um array novo a cada render e invalidaria todos
  // os useMemo derivados, que passariam a reordenar a lista inteira sem necessidade
  const rows = useMemo(() => dados?.rows ?? [], [dados])
  const metaDias = m?.meta_dias_curva_a ?? 45

  // o backend já diz se o período apurado é um mês INTEIRO e ENCERRADO; enquanto
  // não respondeu, nada é acusado (o padrão do backend é o último mês fechado)
  const periodo = m?.periodo
  const cicloFechado = !periodo || (periodo.mes_cheio && periodo.fechado)
  const rotuloPeriodo = cicloFechado ? 'mês fechado' : `período de ${periodo?.rotulo}`

  // O gráfico é sobre RISCO DE RUPTURA: menor cobertura primeiro, e só quem tem
  // demanda no mês fechado. Produto parado com cobertura infinita ocuparia o
  // espaço de quem está prestes a faltar.
  const candidatos = useMemo(
    () => rows.filter((r) => r.demanda_diaria > 0 && r.cobertura_dias != null),
    [rows],
  )

  // ★ QUEM JÁ ESTÁ EM RUPTURA FICA FORA DO GRÁFICO. Cobertura zero desenha barra de
  //   comprimento zero: com 27 produtos zerados contra 204 com cobertura positiva
  //   (jun/2026, medido no Oracle), os 14 menores eram TODOS zero e o gestor via um
  //   retângulo em branco com a linha tracejada dos 45 dias e nada mais. A ruptura já
  //   tem card próprio ("Em ruptura"); aqui o gráfico existe para mostrar a DISTÂNCIA
  //   até a meta, e isso só a cobertura positiva desenha. O contador abaixo do gráfico
  //   diz quantos ficaram de fora para o recorte não sumir da vista.
  const emRuptura = useMemo(
    () => candidatos.filter((r) => (r.cobertura_dias ?? 0) <= 0).length,
    [candidatos],
  )

  const paraGrafico: ItemCobertura[] = useMemo(
    () =>
      candidatos
        .filter((r) => (r.cobertura_dias ?? 0) > 0)
        .sort((a, b) => (a.cobertura_dias ?? 0) - (b.cobertura_dias ?? 0))
        .slice(0, QTD_NO_GRAFICO)
        .map((r) => ({
          codprod: r.codprod,
          descricao: r.descricao,
          cobertura_dias: r.cobertura_dias,
          disponivel: r.disponivel,
          trancado: r.trancado,
          demanda_diaria: r.demanda_diaria,
        })),
    [candidatos],
  )

  // ranking por dinheiro parado: responde "quanto capital está preso na reserva",
  // que é uma leitura diferente da tabela (lá a ordem é por risco de ruptura)
  const topTrancado = useMemo(
    () =>
      rows
        .filter((r) => r.trancado > 0)
        .sort((a, b) => b.trancado_valor - a.trancado_valor)
        .slice(0, 8)
        .map((r) => ({
          codprod: r.codprod,
          descricao: r.descricao,
          valor: r.trancado_valor,
          quantidade: r.trancado,
        })),
    [rows],
  )

  const naTabela = useMemo(
    () => (somenteTrancado ? rows.filter((r) => r.trancado > 0) : rows),
    [rows, somenteTrancado],
  )

  // o caso emblemático: mercadoria no galpão com venda bloqueada
  const caso = useMemo(
    () =>
      rows
        .filter((r) => r.trancado > 0 && r.disponivel <= 0)
        .sort((a, b) => b.trancado_valor - a.trancado_valor)[0] ?? null,
    [rows],
  )

  return (
    <Layout>
      <header className="mb-5 sm:mb-6 surgir">
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink tracking-tight">Estoque</h1>
        <p className="text-muted mt-2 text-sm sm:text-base">
          Físico, reservado, trancado pela gestão, avaria e o que sobra de verdade para vender
        </p>
      </header>

      <div className="mb-5">
        <FiltroBar
          filtro={filtro}
          onChange={setFiltro}
          mostrarHora={false}
          mostrarDepto
          mostrarDias={false}
          aviso="O período seleciona a demanda usada na cobertura — só mês fechado, porque janela móvel troca o divisor de dias úteis (§10). As quantidades de estoque são a posição de agora."
        />
      </div>

      {erro && (
        <div className="tile p-3.5 mb-5 flex items-start gap-2.5 text-sm text-amber" role="status">
          <Info className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} aria-hidden />
          <span>Sem resposta do servidor para o estoque. Tente de novo em instantes.</span>
        </div>
      )}

      {periodo && !cicloFechado && (
        <div className="tile p-3.5 mb-5 flex items-start gap-2.5 text-sm text-amber" role="status">
          <Info className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} aria-hidden />
          <span>
            <strong className="font-semibold">Período fora do ciclo mensal fechado.</strong> A demanda diária da
            cobertura vem de {periodo.rotulo} ({periodo.dias_uteis} dias úteis), não do último mês encerrado. Use
            "Mês fechado" para a cobertura canônica dos {metaDias} dias.
          </span>
        </div>
      )}

      <div className="flex flex-col gap-5">
        {/* 1 — o tamanho da reserva de gestão */}
        <section className="tile tile-accent-left p-5 sm:p-6 surgir">
          {carregando && !m ? (
            <Esqueleto altura="h-20" />
          ) : !m ? (
            <Vazio>estoque indisponível no momento</Vazio>
          ) : (
            <div className="grid grid-cols-1 min-[480px]:grid-cols-2 xl:grid-cols-4 gap-x-8 gap-y-5">
              <div className="min-w-0">
                <p className="label-caps flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-amber" strokeWidth={2} aria-hidden />
                  Trancado pela gestão
                </p>
                <p className="num text-3xl sm:text-4xl font-bold mt-1.5 text-amber">
                  {brl.format(m.total_trancado_valor)}
                </p>
                <p className="text-muted text-xs font-mono mt-1.5">
                  {un(m.total_trancado_un)} unidades em {m.skus_trancados} produtos
                </p>
              </div>

              <div className="min-w-0">
                <p className="label-caps flex items-center gap-2">
                  <AlertOctagon className="w-3.5 h-3.5 text-danger" strokeWidth={2} aria-hidden />
                  Em ruptura
                </p>
                <p
                  className={`num text-3xl sm:text-4xl font-bold mt-1.5 ${
                    m.skus_em_ruptura ? 'text-danger' : 'text-emerald'
                  }`}
                >
                  {m.skus_em_ruptura}
                </p>
                <p className="text-muted text-xs font-mono mt-1.5">
                  produtos com demanda no {rotuloPeriodo} e disponível zerado
                </p>
              </div>

              <div className="min-w-0">
                <p className="label-caps">Valor do estoque</p>
                <p className="num text-3xl sm:text-4xl font-bold mt-1.5 text-ink">{brl.format(m.valor_estoque)}</p>
                <p className="text-muted text-xs font-mono mt-1.5">{m.skus} produtos em posição</p>
              </div>

              <div className="min-w-0">
                <p className="label-caps">Base da cobertura</p>
                <p className="num text-3xl sm:text-4xl font-bold mt-1.5 text-ink">{m.dias_uteis} d</p>
                <p className="text-muted text-xs font-mono mt-1.5">
                  dias úteis de {m.periodo.rotulo} · meta de suprimento {metaDias} dias
                </p>
              </div>
            </div>
          )}
        </section>

        {/* 2 — o caso real, escrito por extenso */}
        {caso && (
          <section className="tile p-4 sm:p-5 surgir surgir-1 border-l-[3px] border-l-amber">
            <p className="label-caps flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-amber" strokeWidth={2} aria-hidden />
              Mercadoria no galpão que o time de vendas não enxerga
            </p>
            <p className="text-ink-soft text-sm sm:text-base mt-2 leading-relaxed">
              <strong className="font-semibold">{caso.descricao}</strong> (cód. {caso.codprod}):{' '}
              <span className="font-mono">{un(caso.fisico)}</span> no estoque físico,{' '}
              <span className="font-mono">{un(caso.trancado)}</span> trancadas e{' '}
              <span className="font-mono text-danger font-semibold">disponível zero</span> —
              {caso.dias_trancados != null ? (
                <>
                  {' '}
                  o equivalente a <span className="font-mono">{dias(caso.dias_trancados)}</span> de demanda
                  reservados para não romper contrato com multa.
                </>
              ) : (
                ` reserva de gestão sem demanda no ${rotuloPeriodo} para comparar.`
              )}
            </p>
            <p className="text-muted text-xs font-mono mt-2">
              {brlExato.format(caso.trancado_valor)} parados nesse item · o padrão da gestão é reservar cerca de
              uma semana de demanda
            </p>
          </section>
        )}

        {/* 3 — cobertura com a linha de meta + onde o capital está parado */}
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4 sm:gap-5">
          <section className="tile tile-hover p-4 sm:p-6 surgir surgir-2">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-ink">Cobertura de estoque</h2>
                <p className="text-muted text-sm mt-0.5">
                  Os {paraGrafico.length || QTD_NO_GRAFICO} produtos de menor cobertura ainda com estoque, em dias
                  de demanda — a linha tracejada é a meta de {metaDias} dias
                </p>
              </div>
              <BotaoExportar
                nome="Cobertura de estoque"
                rows={paraGrafico as unknown as Record<string, unknown>[]}
              />
            </div>
            {carregando && !dados ? (
              <Esqueleto altura="h-64" />
            ) : paraGrafico.length ? (
              <>
                <CoberturaEstoque dados={paraGrafico} meta={metaDias} />
                <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3 text-[11px] font-mono text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5" style={{ background: '#9a6a00' }} /> abaixo da meta
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5" style={{ background: '#5b691d' }} /> na meta
                  </span>
                  {emRuptura > 0 && (
                    <span className="text-danger">
                      + {emRuptura} em ruptura (cobertura 0), fora do gráfico
                    </span>
                  )}
                </div>
                <Nota>
                  Cobertura = disponível ÷ demanda diária do {rotuloPeriodo}. O trancado fica de fora da conta de
                  propósito: ele não está à venda, e somá-lo faria a cobertura parecer confortável enquanto o
                  vendedor recebe "sem estoque".
                  {emRuptura > 0 &&
                    ` Os ${emRuptura} produtos com disponível zerado ficam fora do gráfico — barra de comprimento zero não mostra distância até a meta; eles estão no card "Em ruptura" e no topo da tabela.`}
                </Nota>
              </>
            ) : (
              <Vazio>
                {emRuptura > 0
                  ? `todos os ${emRuptura} produtos com demanda estão em ruptura — não há cobertura positiva para desenhar`
                  : 'nenhum produto com demanda no período para calcular cobertura'}
              </Vazio>
            )}
          </section>

          <section className="tile tile-hover p-4 sm:p-6 surgir surgir-2">
            <div className="mb-4">
              <h2 className="font-display text-lg font-semibold text-ink">Onde o capital está trancado</h2>
              <p className="text-muted text-sm mt-0.5">Maiores valores parados na reserva de gestão</p>
            </div>
            {carregando && !dados ? (
              <Esqueleto altura="h-64" />
            ) : (
              <TopProdutos dados={topTrancado} unidade="trancadas" vazio="nenhum produto trancado no recorte" />
            )}
          </section>
        </div>

        {/* 4 — a tabela completa */}
        <section className="tile tile-hover p-4 sm:p-6 surgir surgir-3">
          <div className="mb-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-ink">Posição por produto</h2>
              <p className="text-muted text-sm mt-0.5">
                Trancado primeiro, depois o que tem menor cobertura
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex gap-1 rounded border border-line bg-floor p-1" role="group" aria-label="Recorte">
                <button
                  onClick={() => setSomenteTrancado(false)}
                  aria-pressed={!somenteTrancado}
                  className={`${BOTAO} ${
                    !somenteTrancado ? 'bg-primary-wash text-ink' : 'text-muted hover:text-ink hover:bg-primary-wash'
                  }`}
                >
                  Tudo
                </button>
                <button
                  onClick={() => setSomenteTrancado(true)}
                  aria-pressed={somenteTrancado}
                  title="Só os produtos com reserva de gestão"
                  className={`${BOTAO} whitespace-nowrap ${
                    somenteTrancado ? 'bg-primary-wash text-ink' : 'text-muted hover:text-ink hover:bg-primary-wash'
                  }`}
                >
                  Só trancados
                </button>
              </div>
              <BotaoExportar nome="Posição de estoque" rows={naTabela as unknown as Record<string, unknown>[]} />
            </div>
          </div>

          {carregando && !dados ? <Esqueleto altura="h-64" /> : <TabelaEstoque dados={naTabela} />}

          {m && (
            <div className="flex flex-wrap gap-x-6 gap-y-1.5 mt-4 pt-3 border-t border-line text-[11px] font-mono text-muted">
              <span>
                produtos listados: <span className="text-ink-soft font-semibold">{naTabela.length}</span>
                {somenteTrancado && <span className="text-muted"> de {rows.length}</span>}
              </span>
              <span>
                avaria total: <span className="text-ink-soft font-semibold">{un(m.total_avaria_un)} un</span>
              </span>
              {m.truncado_em && <span>lista cortada em {m.truncado_em} linhas</span>}
            </div>
          )}
        </section>
      </div>

      <BotaoAjuda flutuante contexto={{ tela: 'estoque', dt_ini: filtro.dt_ini, dt_fim: filtro.dt_fim }} />
    </Layout>
  )
}
