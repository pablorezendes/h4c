import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, Info, PackageSearch, Snowflake, TrendingUp, Truck } from 'lucide-react'
import Layout from '../components/Layout'
import BotaoAjuda from '../components/ajuda/BotaoAjuda'
import BotaoExportar from '../components/BotaoExportar'
import FiltroBar, { filtroQuery, useFiltro } from '../components/FiltroBar'
import MultiSelecao from '../components/MultiSelecao'
import CurvaAbc from '../components/compras/CurvaAbc'
import SemGiro, { type RespostaSemGiro } from '../components/compras/SemGiro'
import SugestaoMes, { type RespostaSugestaoMes } from '../components/compras/SugestaoMes'
import TabelaDemanda from '../components/compras/TabelaDemanda'
import TabelaSugestao from '../components/compras/TabelaSugestao'
import { Esqueleto, Nota, pct, un, Vazio } from '../components/compras/formatos'
import type { RespostaAbc, RespostaDemanda, RespostaSugestao } from '../components/compras/tipos'
import { api } from '../lib/api'
import { rotuloDe, useDepartamentos } from '../lib/dimensoes'
import { podeCom, useSessao } from '../lib/sessao'
import { brl, brlExato } from '../lib/format'

/**
 * Aba COMPRAS — aposentar a folha de papel do comprador.
 *
 * Hoje o líder de compras anota as saídas numa folha, separa mercadoria fisicamente e
 * calcula a reposição por achismo, porque o WinThor não sugere reposição. O objetivo
 * desta tela é tirá-lo da operação física para que ele foque em negociar com
 * fornecedor e proteger a margem. A tela só cumpre o papel quando a folha for
 * aposentada — por isso a sugestão vem em quantidade E em dinheiro, com cobertura,
 * lead time e status, e não como um gráfico bonito de demanda.
 *
 * ★ DEMANDA É SEMPRE DO ÚLTIMO MÊS FECHADO. O mês corrente aparece ao lado só como
 *   contexto, PROJETADO por regra de três de dias úteis e rotulado como projeção. O
 *   parcial cru ao lado de um mês fechado faria a demanda parecer despencar todo dia 5.
 *
 * ★ SEM FILTRO DE RCA, DE PROPÓSITO. A reposição é da empresa inteira: recortar a
 *   demanda por vendedor produziria sugestão menor que a necessidade real. Se houver
 *   RCA marcado em outra aba, ele é ignorado aqui e a tela avisa.
 *
 * ★ SEM JANELA MÓVEL NO SELETOR (`mostrarDias={false}`). "Calcular demanda de compras
 *   por janela móvel de 30 dias" é anti-padrão declarado (§10/§11) e o filtro é GLOBAL,
 *   persistido em localStorage: o preset "30d" clicado no Comercial chegava aqui e
 *   redimensionava a compra (jun/2026 fechado = R$ 416.378,65 em 21 dias úteis contra
 *   R$ 411.674,74 em 22 dias úteis de 22/06–21/07, medido no Oracle) enquanto a tela
 *   continuava escrevendo "mês fechado". Some o botão E, se o período gravado ainda
 *   não for um mês encerrado, os rótulos passam a dizer a verdade em vez do texto fixo.
 */

const CLASSES = [
  { id: 'A', rotulo: 'Curva A', dica: 'A curva com meta de suprimento — químicos e papéis' },
  { id: 'A,B', rotulo: 'A e B', dica: 'Inclui a curva B' },
  { id: '', rotulo: 'Todas', dica: 'Todos os produtos com movimento' },
]

const CRITERIOS = [
  { id: 'valor', rotulo: 'Por valor' },
  { id: 'quantidade', rotulo: 'Por quantidade' },
]

// Corte do "sem giro": há quantos dias o item não vende. Discreto, herda o resto do
// filtro da página (departamento) — o único recorte próprio desta seção é o corte.
const CORTES_SEM_GIRO = [30, 60, 90]

const CLASSE_BOTAO =
  'px-3 py-2 sm:py-1.5 min-h-11 sm:min-h-0 rounded-sm text-sm sm:text-xs font-mono font-semibold transition-colors'

function valorDe<T>(r: PromiseSettledResult<T>): T | null {
  return r.status === 'fulfilled' ? r.value : null
}

/**
 * ★ meta.ajuste_periodo — o fim do controle morto. O backend NORMALIZA qualquer janela
 *   para o mes fechado de dt_fim (§10) e DECLARA aqui o que foi pedido contra o que foi
 *   aplicado. Antes a tela ficava calada: um "30d" clicado em outra aba (o filtro e
 *   global) chegava aqui, o backend colapsava no mes fechado e nada dizia que a demanda
 *   nao era a do periodo do botao. Os tres endpoints (demanda/abc/sugestao) devolvem o
 *   mesmo campo — le-se de qualquer um.
 */
interface AjustePeriodo {
  ajustado: boolean
  solicitado: { rotulo: string }
  aplicado: { rotulo: string }
  motivo: string
}

function lerAjuste(meta: unknown): AjustePeriodo | null {
  const a = (meta as { ajuste_periodo?: AjustePeriodo | null } | null | undefined)?.ajuste_periodo
  return a && a.ajustado ? a : null
}

export default function Compras() {
  const [filtro, setFiltro] = useFiltro()
  const [criterio, setCriterio] = useState('valor')
  const [classes, setClasses] = useState('A')
  // ★ recorte LOCAL da curva ABC: quando preenchido, sobrescreve o departamento do
  //   filtro global SÓ na chamada da ABC. Vazio = herda o filtro da página. Não vaza
  //   para demanda/sugestão/sem-giro, que seguem com o filtro global.
  const [deptosAbc, setDeptosAbc] = useState<number[]>([])
  const [demanda, setDemanda] = useState<RespostaDemanda | null>(null)
  const [abc, setAbc] = useState<RespostaAbc | null>(null)
  const [sugestao, setSugestao] = useState<RespostaSugestao | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [falhas, setFalhas] = useState<string[]>([])

  // Sem giro: bloco resiliente à parte (saneamento, não reposição). Só quem tem o
  // recurso vê a seção — o backend recusa com 403, então nem chamamos sem permissão.
  const { sessao } = useSessao()
  const podeSemGiro = podeCom(sessao, 'compras.sem-giro')
  const [diasSemGiro, setDiasSemGiro] = useState(30)
  const [semGiro, setSemGiro] = useState<RespostaSemGiro | null>(null)
  const [semGiroCarregando, setSemGiroCarregando] = useState(true)
  const [semGiroErro, setSemGiroErro] = useState(false)

  // "Comprar para fechar o mês": horizonte curto, complementar à sugestão de 45 dias.
  // Mesmo padrão resiliente do sem-giro — gated por `compras.sugestao`, sem chamada
  // (nem 403 no topo) para quem não tem o recurso.
  const podeSugestaoMes = podeCom(sessao, 'compras.sugestao')
  const [sugestaoMes, setSugestaoMes] = useState<RespostaSugestaoMes | null>(null)
  const [sugestaoMesCarregando, setSugestaoMesCarregando] = useState(true)
  const [sugestaoMesErro, setSugestaoMesErro] = useState(false)

  // opções do multi-select local da ABC (o hook cacheia por sessão; a FiltroBar já
  // carregou a mesma lista, então aqui não há segunda ida ao servidor)
  const deptosDim = useDepartamentos()

  // RCA fica fora da consulta: a reposição é da empresa inteira (ver cabeçalho)
  const q = useMemo(() => filtroQuery({ ...filtro, rcas: [] }), [filtro])
  // ★ a ABC troca o departamento pelo recorte local quando ele existe; senão herda o
  //   global. É o único ponto onde o depto diverge do resto da página.
  const qAbc = useMemo(
    () => filtroQuery({ ...filtro, rcas: [], deptos: deptosAbc.length ? deptosAbc : filtro.deptos }),
    [filtro, deptosAbc],
  )
  // rótulo humano do recorte local, para a UI dizer que ele vale só para a ABC
  const recorteAbc = deptosAbc.length ? deptosAbc.map((v) => rotuloDe(deptosDim.opcoes, v)).join(' · ') : null

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    Promise.allSettled([
      api<RespostaDemanda>(`/api/compras/demanda?${q}&limite=400`),
      api<RespostaAbc>(`/api/compras/curva-abc?${qAbc}&criterio=${criterio}&limite=400`),
      api<RespostaSugestao>(`/api/compras/sugestao?${q}&classes=${encodeURIComponent(classes)}&limite=400`),
    ]).then(([d, a, s]) => {
      if (!vivo) return
      setDemanda(valorDe(d))
      setAbc(valorDe(a))
      setSugestao(valorDe(s))
      setFalhas(
        [
          d.status === 'rejected' && 'demanda',
          a.status === 'rejected' && 'curva ABC',
          s.status === 'rejected' && 'sugestão de compra',
        ].filter(Boolean) as string[],
      )
      setCarregando(false)
    })
    return () => {
      vivo = false
    }
  }, [q, qAbc, criterio, classes])

  // Efeito próprio do sem-giro: o corte de dias não deve refazer as chamadas de
  // reposição, e a falta de permissão pula a chamada sem poluir o aviso do topo.
  useEffect(() => {
    if (!podeSemGiro) {
      setSemGiro(null)
      setSemGiroCarregando(false)
      setSemGiroErro(false)
      return
    }
    let vivo = true
    setSemGiroCarregando(true)
    setSemGiroErro(false)
    // herda o departamento do filtro da página; sem data (o sem-giro é posição de hoje)
    const p = new URLSearchParams({ dias: String(diasSemGiro), limite: '400' })
    if (filtro.deptos.length) p.set('deptos', filtro.deptos.join(','))
    api<RespostaSemGiro>(`/api/compras/sem-giro?${p.toString()}`)
      .then((r) => {
        if (!vivo) return
        setSemGiro(r)
        setSemGiroCarregando(false)
      })
      .catch(() => {
        if (!vivo) return
        setSemGiro(null)
        setSemGiroErro(true)
        setSemGiroCarregando(false)
      })
    return () => {
      vivo = false
    }
  }, [podeSemGiro, diasSemGiro, filtro.deptos])

  // Efeito próprio do "fechar o mês": não tem período no seletor (o backend usa o mês
  // corrente + a demanda do último mês fechado), então só o departamento da página o
  // refaz. Sem permissão, pula a chamada.
  useEffect(() => {
    if (!podeSugestaoMes) {
      setSugestaoMes(null)
      setSugestaoMesCarregando(false)
      setSugestaoMesErro(false)
      return
    }
    let vivo = true
    setSugestaoMesCarregando(true)
    setSugestaoMesErro(false)
    const p = new URLSearchParams({ limite: '400' })
    if (filtro.deptos.length) p.set('deptos', filtro.deptos.join(','))
    api<RespostaSugestaoMes>(`/api/compras/sugestao-mes?${p.toString()}`)
      .then((r) => {
        if (!vivo) return
        setSugestaoMes(r)
        setSugestaoMesCarregando(false)
      })
      .catch(() => {
        if (!vivo) return
        setSugestaoMes(null)
        setSugestaoMesErro(true)
        setSugestaoMesCarregando(false)
      })
    return () => {
      vivo = false
    }
  }, [podeSugestaoMes, filtro.deptos])

  const md = demanda?.meta
  const projecao = md?.mes_corrente
  const alertas = md?.alertas
  const sm = sugestao?.meta

  const totalAlertas = alertas ? alertas.salto + alertas.queda + alertas.novo + alertas.parou : 0
  // ★ quem decide se há projeção é o backend (segura a regra de três enquanto não
  //   houver 2 dias úteis transcorridos) — a tela só lê o null
  const semProjecao = !projecao || projecao.valor_projetado == null

  // O backend já diz se o período apurado é um mês INTEIRO e ENCERRADO; enquanto o
  // dado não chegou, não acusa nada (o padrão do backend é o mês fechado).
  const periodo = md?.mes_fechado
  const cicloFechado = !periodo || (periodo.mes_cheio && periodo.fechado)

  // aviso discreto de período ajustado: qualquer das respostas serve, a primeira que
  // veio preenchida ganha (todas trazem o mesmo ajuste porque partem do mesmo _periodo)
  const ajuste = lerAjuste(sugestao?.meta) ?? lerAjuste(demanda?.meta) ?? lerAjuste(abc?.meta)

  // meta do "fechar o mês", para o subtítulo dizer a base e os dias que restam
  const smes = sugestaoMes?.meta

  return (
    <Layout>
      <header className="mb-5 sm:mb-6 surgir">
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink tracking-tight">Compras</h1>
        <p className="text-muted mt-2 text-sm sm:text-base">
          Demanda do mês fechado, curva ABC e quanto comprar de cada item — em caixa e em real
        </p>
      </header>

      <div className="mb-5">
        <FiltroBar
          filtro={filtro}
          onChange={setFiltro}
          mostrarHora={false}
          mostrarDepto
          mostrarDias={false}
          periodoMensal
          aviso={
            (cicloFechado
              ? 'A demanda é a do mês fechado selecionado; o mês corrente aparece apenas projetado por dias úteis.'
              : 'Sem janela móvel aqui: a reposição se apura em mês fechado (§10). O período gravado não é um mês encerrado — veja a ressalva abaixo.') +
            (filtro.rcas.length
              ? ' O filtro de RCA marcado em outra aba não se aplica aqui: a reposição é da empresa inteira.'
              : '')
          }
        />
      </div>

      {falhas.length > 0 && (
        <div className="tile p-3.5 mb-5 flex items-start gap-2.5 text-sm text-amber" role="status">
          <Info className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} aria-hidden />
          <span>Sem resposta do servidor para: {falhas.join(', ')}. O resto da tela segue com dado real.</span>
        </div>
      )}

      {ajuste && (
        <div className="tile p-3.5 mb-5 flex items-start gap-2.5 text-sm text-amber" role="status">
          <Info className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} aria-hidden />
          <span>
            <strong className="font-semibold">Período ajustado para {ajuste.aplicado.rotulo}.</strong> Você pediu{' '}
            {ajuste.solicitado.rotulo}, mas a reposição se apura sempre em mês fechado (§10) — a demanda, a curva e a
            sugestão saem de {ajuste.aplicado.rotulo}. Escolha um mês fechado no seletor para conferir outro recorte.
          </span>
        </div>
      )}

      {periodo && !cicloFechado && (
        <div className="tile p-3.5 mb-5 flex items-start gap-2.5 text-sm text-amber" role="status">
          <Info className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} aria-hidden />
          <span>
            <strong className="font-semibold">Período fora do ciclo mensal fechado.</strong> Demanda, cobertura e
            sugestão saem de {periodo.rotulo} ({periodo.dias_uteis} dias úteis), não do último mês encerrado —
            período em andamento ou janela de datas mistura meses e redimensiona a compra. Use "Mês fechado" para
            a apuração canônica.
          </span>
        </div>
      )}

      <div className="flex flex-col gap-5">
        {/* 1 — o retrato do mês fechado e o contexto do mês em andamento */}
        <section className="tile tile-accent-left p-5 sm:p-6 surgir">
          {carregando && !demanda ? (
            <Esqueleto altura="h-20" />
          ) : !md ? (
            <Vazio>demanda indisponível no momento</Vazio>
          ) : (
            <div className="grid grid-cols-1 min-[480px]:grid-cols-2 xl:grid-cols-4 gap-x-8 gap-y-5">
              <div className="min-w-0">
                {/* o rótulo segue o que o backend apurou: escrever "mês fechado" sobre
                    um período em aberto é a tela mentindo na linha de cima */}
                <p className="label-caps">{cicloFechado ? 'Demanda do mês fechado' : 'Demanda do período filtrado'}</p>
                <p className="num text-3xl sm:text-4xl font-bold mt-1.5 text-ink">
                  {brl.format(md.curva?.total ?? 0)}
                </p>
                <p className="text-muted text-xs font-mono mt-1.5">
                  {md.mes_fechado.rotulo} · {md.produtos} produtos · {md.dias_uteis} dias úteis
                </p>
              </div>

              <div className="min-w-0">
                <p className="label-caps">Mês corrente · projeção</p>
                <p className="num text-3xl sm:text-4xl font-bold mt-1.5 text-muted">
                  {semProjecao ? 'aguardando' : brl.format(projecao.valor_projetado ?? 0)}
                </p>
                <p className="text-muted text-xs font-mono mt-1.5">
                  {!projecao
                    ? 'sem contexto do mês corrente'
                    : semProjecao
                      ? `${projecao.uteis_transcorridos} de ${projecao.uteis_total} dias úteis — projeção só a partir do 2º`
                      : `${projecao.rotulo} · ${projecao.uteis_transcorridos} de ${projecao.uteis_total} dias úteis`}
                </p>
                <p className="text-muted text-[11px] mt-0.5">
                  regra de três de dias úteis — não é realizado
                </p>
              </div>

              <div className="min-w-0">
                <p className="label-caps flex items-center gap-2">
                  <PackageSearch className="w-3.5 h-3.5 text-primary-soft" strokeWidth={1.75} aria-hidden />
                  Curva A
                </p>
                <p className="num text-3xl sm:text-4xl font-bold mt-1.5 text-ink">{md.curva?.skus_a ?? 0}</p>
                <p className="text-muted text-xs font-mono mt-1.5">
                  produtos que fazem {pct(md.curva?.corte_a_pct ?? 80, 0)} do faturamento líquido
                </p>
              </div>

              <div className="min-w-0">
                <p className="label-caps flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5 text-primary-soft" strokeWidth={1.75} aria-hidden />
                  Variação brusca
                </p>
                <p className={`num text-3xl sm:text-4xl font-bold mt-1.5 ${totalAlertas ? 'text-amber' : 'text-emerald'}`}>
                  {totalAlertas}
                </p>
                <p className="text-muted text-xs font-mono mt-1.5">
                  {alertas
                    ? `${alertas.salto} saltos · ${alertas.queda} quedas · ${alertas.novo} novos · ${alertas.parou} pararam`
                    : '—'}
                </p>
              </div>
            </div>
          )}
        </section>

        {/* 1.5 — comprar para fechar o mês: horizonte curto, conversa com a sugestão de
            45 dias logo abaixo. Só para quem tem `compras.sugestao`. */}
        {podeSugestaoMes && (
          <section className="tile tile-hover p-4 sm:p-6 surgir surgir-1">
            <div className="mb-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-ink flex items-center gap-2">
                  <CalendarClock className="w-4 h-4 text-primary-soft" strokeWidth={1.75} aria-hidden />
                  Comprar para fechar o mês
                </h2>
                <p className="text-muted text-sm mt-0.5">
                  {smes
                    ? `Horizonte curto, complementar aos 45 dias: o que falta comprar para não faltar até o fim de ${smes.mes_corrente.rotulo}, pela demanda de ${smes.base_demanda.rotulo} e os ${smes.dias_uteis_restantes} dias úteis que restam`
                    : 'Horizonte curto, complementar à sugestão de 45 dias: o que falta comprar para não faltar até o fim do mês corrente'}
                </p>
              </div>
              <BotaoExportar
                nome="Comprar para fechar o mês"
                rows={(sugestaoMes?.rows ?? []) as unknown as Record<string, unknown>[]}
              />
            </div>
            {sugestaoMesCarregando && !sugestaoMes ? (
              <Esqueleto altura="h-64" />
            ) : sugestaoMesErro ? (
              <Vazio>sugestão para fechar o mês indisponível no momento</Vazio>
            ) : (
              <SugestaoMes dados={sugestaoMes} />
            )}
          </section>
        )}

        {/* 2 — sugestão de compra: o produto principal da aba */}
        <section className="tile tile-hover p-4 sm:p-6 surgir surgir-1">
          <div className="mb-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-ink">Sugestão de compra</h2>
              <p className="text-muted text-sm mt-0.5">
                {sm ? `Meta de ${sm.meta_dias} dias de suprimento` : 'Meta de 45 dias de suprimento'} — cobertura,
                quantidade e custo por item
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex gap-1 rounded border border-line bg-floor p-1" role="group" aria-label="Classe ABC">
                {CLASSES.map((c) => (
                  <button
                    key={c.id || 'todas'}
                    onClick={() => setClasses(c.id)}
                    title={c.dica}
                    aria-pressed={classes === c.id}
                    className={`${CLASSE_BOTAO} whitespace-nowrap ${
                      classes === c.id ? 'bg-primary-wash text-ink' : 'text-muted hover:text-ink hover:bg-primary-wash'
                    }`}
                  >
                    {c.rotulo}
                  </button>
                ))}
              </div>
              <BotaoExportar
                nome="Sugestão de compra"
                rows={(sugestao?.rows ?? []) as unknown as Record<string, unknown>[]}
              />
            </div>
          </div>

          {carregando && !sugestao ? (
            <Esqueleto altura="h-64" />
          ) : sugestao ? (
            <TabelaSugestao dados={sugestao.rows} />
          ) : (
            <Vazio>sugestão de compra indisponível no momento</Vazio>
          )}

          {sm && (
            <div className="mt-4 pt-3 border-t border-line flex flex-col gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3">
                <div>
                  <p className="label-caps">Custo da sugestão</p>
                  <p className="num text-2xl font-bold mt-1 text-ink">{brlExato.format(sm.custo_total)}</p>
                  <p className="text-muted text-[11px] font-mono mt-0.5">
                    {sm.skus_com_sugestao} de {sm.skus} produtos precisam de compra
                  </p>
                </div>
                <div>
                  <p className="label-caps">Se a demanda subir 50%</p>
                  <p className="num text-2xl font-bold mt-1 text-amber">
                    {brlExato.format(sm.cenario_mais_50.custo_total)}
                  </p>
                  <p className="text-muted text-[11px] font-mono mt-0.5">
                    {sm.cenario_mais_50.skus_com_sugestao} produtos · risco de caixa
                  </p>
                </div>
                {sm.custo_total_se_destrancar !== sm.custo_total && (
                  <div>
                    <p className="label-caps">Se o trancado for liberado</p>
                    <p className="num text-2xl font-bold mt-1 text-emerald">
                      {brlExato.format(sm.custo_total_se_destrancar)}
                    </p>
                    <p className="text-muted text-[11px] font-mono mt-0.5">
                      economia de {brlExato.format(sm.custo_total - sm.custo_total_se_destrancar)}
                    </p>
                  </div>
                )}
              </div>

              <p className="text-ink-soft text-sm leading-relaxed">
                O cenário +50% é o que o dono levantou como risco de travar a operação — o faturamento já saltou
                de R$ 224,9 mil (fev) para R$ 400,9 mil (mar/2026) e quebrou a previsão manual. Compare com um mês
                de faturamento antes de aprovar a compra.
              </p>

              {sm.aviso_pendente_zero && (
                <p className="flex items-start gap-2.5 text-sm text-amber">
                  <Truck className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} aria-hidden />
                  <span>
                    <strong className="font-semibold">Pedidos de compra pendentes = 0.</strong> A operação lança o
                    pedido no WinThor <em>depois</em> de receber a mercadoria, então nada é descontado como
                    mercadoria em trânsito e a sugestão pode estar superestimada.
                  </span>
                </p>
              )}

              {sm.sem_lead_time > 0 && (
                <Nota>
                  {sm.sem_lead_time} produtos sem lead time parametrizado — para eles o gatilho "comprar agora" não
                  dispara. Papel e químico têm janelas muito diferentes: químico repõe rápido (fábrica a ~500 km),
                  papel depende da janela da indústria e, se perdida, obriga a comprar de concorrente mais caro.
                </Nota>
              )}
            </div>
          )}
        </section>

        {/* 3 — curva ABC, com recorte de departamento PRÓPRIO desta seção */}
        <section className="tile tile-hover p-4 sm:p-6 surgir surgir-2">
          <div className="mb-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-ink">Curva ABC</h2>
              <p className="text-muted text-sm mt-0.5">
                Concentração do faturamento líquido por produto — mesma ordenação da apuração de faturamento
              </p>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              {/* recorte local de departamento: sobrescreve o filtro da página SÓ aqui */}
              <div className="flex flex-col gap-1">
                <MultiSelecao
                  opcoes={deptosDim.opcoes}
                  selecionados={deptosAbc}
                  onChange={setDeptosAbc}
                  rotuloTodos="Filtro da página"
                  rotuloFiltro="Departamento (só a curva ABC)"
                  carregando={deptosDim.carregando}
                  erro={deptosDim.erro}
                />
                <span className="text-muted text-[11px] font-mono">vale só para esta curva; vazio herda a página</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex gap-1 rounded border border-line bg-floor p-1" role="group" aria-label="Critério da curva">
                  {CRITERIOS.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setCriterio(c.id)}
                      aria-pressed={criterio === c.id}
                      className={`${CLASSE_BOTAO} whitespace-nowrap ${
                        criterio === c.id ? 'bg-primary-wash text-ink' : 'text-muted hover:text-ink hover:bg-primary-wash'
                      }`}
                    >
                      {c.rotulo}
                    </button>
                  ))}
                </div>
                <BotaoExportar nome={`Curva ABC por ${criterio}`} rows={(abc?.rows ?? []) as unknown as Record<string, unknown>[]} />
              </div>
            </div>
          </div>
          {carregando && !abc ? <Esqueleto altura="h-64" /> : <CurvaAbc dados={abc} recorte={recorteAbc} />}
        </section>

        {/* 4 — a demanda item a item, com o alerta de variação */}
        <section className="tile tile-hover p-4 sm:p-6 surgir surgir-3">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-ink">Demanda por produto</h2>
              <p className="text-muted text-sm mt-0.5">
                {md ? `${md.mes_fechado.rotulo} contra ${md.periodo_anterior.rotulo}` : 'Mês fechado contra o anterior'}
                {md ? ` · ${md.criterio_alerta}` : ''}
              </p>
            </div>
            <BotaoExportar
              nome="Demanda por produto"
              rows={(demanda?.rows ?? []) as unknown as Record<string, unknown>[]}
            />
          </div>
          {carregando && !demanda ? (
            <Esqueleto altura="h-64" />
          ) : demanda ? (
            <TabelaDemanda dados={demanda.rows} rotuloAnterior={md?.periodo_anterior.rotulo ?? 'Mês anterior'} />
          ) : (
            <Vazio>demanda indisponível no momento</Vazio>
          )}
          {md?.truncado_em && (
            <Nota>
              Lista cortada nos {un(md.truncado_em)} produtos de maior faturamento líquido — os demais têm peso
              desprezível na reposição.
            </Nota>
          )}
        </section>

        {/* 5 — itens sem giro: saneamento, não reposição. Depois da sugestão de propósito,
            e só para quem tem o recurso `compras.sem-giro`. */}
        {podeSemGiro && (
          <section className="tile tile-hover p-4 sm:p-6 surgir surgir-4">
            <div className="mb-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-ink flex items-center gap-2">
                  <Snowflake className="w-4 h-4 text-primary-soft" strokeWidth={1.75} aria-hidden />
                  Itens sem giro
                </h2>
                <p className="text-muted text-sm mt-0.5">
                  O dinheiro dormindo na prateleira — estoque sem venda há mais de {diasSemGiro} dias, separando o
                  parado real do que é frota de comodato
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex gap-1 rounded border border-line bg-floor p-1" role="group" aria-label="Corte de dias sem venda">
                  {CORTES_SEM_GIRO.map((d) => (
                    <button
                      key={d}
                      onClick={() => setDiasSemGiro(d)}
                      title={`Sem venda há mais de ${d} dias`}
                      aria-pressed={diasSemGiro === d}
                      className={`${CLASSE_BOTAO} whitespace-nowrap ${
                        diasSemGiro === d ? 'bg-primary-wash text-ink' : 'text-muted hover:text-ink hover:bg-primary-wash'
                      }`}
                    >
                      {d}d
                    </button>
                  ))}
                </div>
                <BotaoExportar
                  nome={`Itens sem giro (${diasSemGiro}d)`}
                  rows={(semGiro?.rows ?? []) as unknown as Record<string, unknown>[]}
                />
              </div>
            </div>
            {semGiroCarregando && !semGiro ? (
              <Esqueleto altura="h-64" />
            ) : semGiroErro ? (
              <Vazio>análise de itens sem giro indisponível no momento</Vazio>
            ) : (
              <SemGiro dados={semGiro} />
            )}
          </section>
        )}
      </div>

      <BotaoAjuda flutuante contexto={{ tela: 'compras', dt_ini: filtro.dt_ini, dt_fim: filtro.dt_fim }} />
    </Layout>
  )
}
