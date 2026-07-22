import { useEffect, useMemo, useState } from 'react'
import { PackageX, ShoppingBag, TrendingDown, UserMinus, UserX, Users } from 'lucide-react'
import { api } from '../lib/api'
import Layout from '../components/Layout'
import BotaoAjuda from '../components/ajuda/BotaoAjuda'
import BotaoExportar from '../components/BotaoExportar'
import FiltroBar, { filtroQuery, isoLocal, useFiltro, type Filtro } from '../components/FiltroBar'
import IndicadorCard, { type Indicador } from '../components/IndicadorCard'
import KpiCard from '../components/KpiCard'
import Placar, { type ItemPlacar } from '../components/cockpit/Placar'
import Radar, { type Alerta } from '../components/cockpit/Radar'
import Equipe, { type Vendedor } from '../components/cockpit/Equipe'
import SerieFaturamento, { type PontoMensal, type ProjecaoMes } from '../components/charts/SerieFaturamento'
import SerieMargem from '../components/comercial/SerieMargem'
import Secao from '../components/comercial/Secao'
import MixRca, { type ItemForaDoMix, type LinhaMix, type MetaMix } from '../components/comercial/MixRca'
import RcaDepartamento, { type LinhaRcaDepto } from '../components/comercial/RcaDepartamento'
import Churn, {
  type AnotacaoPatch, type LinhaChurn, type MetaChurn, type MotivoPerda,
} from '../components/comercial/Churn'
import { mesLongo, milCurto, moeda, numero, pct, plural } from '../components/comercial/formato'
import type { Farol } from '../components/Semaforo'

/**
 * Aba COMERCIAL — o painel que o dono abre primeiro.
 *
 * ★ TODO número de venda aqui é LÍQUIDO DE DEVOLUÇÃO. O bruto existe só como detalhe
 *   secundário e sempre rotulado "sem dedução". Faturamento bruto no lugar de honra é
 *   número maquiado e invalida margem, ticket, projeção e meta de uma vez.
 *
 * ★ NADA de métrica financeira nesta aba. Vencido a receber, PMR, PMP e caixa moram no
 *   Financeiro — cada métrica pertence a exatamente uma aba, sem card duplicado.
 *
 * ★ NADA de "próximos 30 dias". A unidade é o mês fechado; o mês corrente aparece como
 *   PROJEÇÃO do fechamento, calculada por regra de três de dias úteis.
 *
 * ★ Um endpoint que cai derruba a SUA seção, nunca a tela. Cada bloco carrega sozinho
 *   e cai sozinho — o padrão é a tela continuar útil com o que respondeu.
 */

// ---------------------------------------------------------------------------
// Contratos das respostas (só o que a tela realmente lê)
// ---------------------------------------------------------------------------

interface Semaforo {
  farol: string
  meta: number
  atingimento_pct: number | null
}

interface Resumo {
  periodo: { dt_ini: string; dt_fim: string; rotulo: string; fechado: boolean; mes_cheio?: boolean }
  periodo_anterior?: { dt_ini: string; dt_fim: string; rotulo: string }
  faturamento: {
    liquido: number
    bruto: number
    devolucao: number
    devolucao_pct: number | null
    liquido_anterior: number
    variacao_pct: number | null
  }
  margem: Semaforo & { valor_pct: number | null; receita: number; custo: number }
  positivacao: Semaforo & {
    valor_pct: number | null
    positivados: number
    carteira: number
    /** false quando o período passa dos 90 dias de "cliente ativo" (§4). */
    apuravel: boolean
    /** Texto do backend explicando por que não há apuração. Null quando apurável. */
    motivo: string | null
  }
  ticket_medio: number | null
  clientes: number
  notas: number
  projecao: ProjecaoMes
}

interface RespostaSerie {
  rows: PontoMensal[]
  meta: { projecao_mes_corrente?: ProjecaoMes; meta_margem_pct?: number }
}

interface RespostaRca {
  rows: Vendedor[]
  meta: {
    periodo_anterior?: { rotulo: string }
    meta_margem_pct?: number
    meta_positivacao_pct?: number
    /** false: positivacao_pct vem null em todas as linhas — não comparar com a meta. */
    positivacao_apuravel?: boolean
  }
}

interface RespostaMix {
  rows: LinhaMix[]
  meta: MetaMix
}

interface RespostaPerdidos {
  rows: ItemForaDoMix[]
  meta: { linhas: number; truncado_em: number | null; aviso?: string | null }
}

interface RespostaRcaDepto {
  rows: LinhaRcaDepto[]
}

interface RespostaChurn {
  rows: LinhaChurn[]
  meta: MetaChurn
}

interface Anotacao {
  codcli: number
  motivo: string | null
  observacao: string | null
  silenciar_ate: string | null
}

// ---------------------------------------------------------------------------
// Carregamento resiliente
// ---------------------------------------------------------------------------

interface Recurso<T> {
  dado: T | null
  carregando: boolean
  erro: string | null
}

/**
 * Um endpoint por bloco. Falha de rede vira `erro` na seção — nunca tela branca e
 * nunca uma exceção que leva o painel inteiro junto.
 */
function useRecurso<T>(url: string): Recurso<T> {
  const [estado, setEstado] = useState<Recurso<T>>({ dado: null, carregando: true, erro: null })

  useEffect(() => {
    let vivo = true
    setEstado((e) => ({ dado: e.dado, carregando: true, erro: null }))
    api<T>(url)
      .then((d) => {
        if (vivo) setEstado({ dado: d, carregando: false, erro: null })
      })
      .catch((e: unknown) => {
        if (vivo) setEstado({ dado: null, carregando: false, erro: String((e as Error)?.message ?? e) })
      })
    return () => {
      vivo = false
    }
  }, [url])

  return estado
}

/** Só as dimensões — para os blocos que ignoram o período (série de 12 meses, churn). */
function queryDimensoes(f: Filtro): string {
  const p = new URLSearchParams()
  if (f.rcas.length) p.set('rcas', f.rcas.join(','))
  if (f.deptos.length) p.set('deptos', f.deptos.join(','))
  return p.toString()
}

function comQuery(base: string, extra: string): string {
  return extra ? `${base}${base.includes('?') ? '&' : '?'}${extra}` : base
}

/** O backend manda o farol como texto; aqui ele vira o tipo do semáforo. */
function farolDe(s: string | undefined): Farol {
  return s === 'verde' || s === 'amarelo' || s === 'vermelho' ? s : 'indefinido'
}

function indicador(campos: Partial<Indicador> & { id: string; nome: string }): Indicador {
  return {
    formato: 'inteiro',
    valor: null,
    valor_anterior: null,
    variacao_pct: null,
    depende_do_periodo: true,
    ...campos,
  }
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export default function Comercial() {
  const [filtro, setFiltro] = useFiltro()
  const q = filtroQuery(filtro)
  const qd = queryDimensoes(filtro)

  const resumo = useRecurso<Resumo>(`/api/comercial/resumo?${q}`)
  const serie = useRecurso<RespostaSerie>(comQuery('/api/comercial/serie?meses=12', qd))
  const rca = useRecurso<RespostaRca>(`/api/comercial/rca?${q}`)
  const mix = useRecurso<RespostaMix>(comQuery(`/api/comercial/rca/mix?dt_fim=${filtro.dt_fim}`, qd))
  const perdidos = useRecurso<RespostaPerdidos>(
    comQuery(`/api/comercial/rca/mix/perdidos?dt_fim=${filtro.dt_fim}&limite=2000`, qd),
  )
  const rcaDepto = useRecurso<RespostaRcaDepto>(comQuery('/api/comercial/rca-departamento?meses=12', qd))
  const churn = useRecurso<RespostaChurn>(comQuery('/api/clientes/churn', qd))
  const motivos = useRecurso<MotivoPerda[]>('/api/clientes/motivos')

  // o churn é a única lista que a tela EDITA: fica em estado próprio para a gravação
  // do motivo refletir na hora, sem recarregar a apuração inteira
  const [linhasChurn, setLinhasChurn] = useState<LinhaChurn[]>([])
  useEffect(() => {
    setLinhasChurn(churn.dado?.rows ?? [])
  }, [churn.dado])

  const [rcaMix, setRcaMix] = useState<number | null>(null)
  useEffect(() => {
    setRcaMix(null) // trocou o filtro: a lista aberta não vale mais
  }, [q])

  const r = resumo.dado
  const projecao = r?.projecao ?? serie.dado?.meta.projecao_mes_corrente ?? null
  const metaMargem = r?.margem.meta ?? serie.dado?.meta.meta_margem_pct ?? 33
  const metaPositivacao = r?.positivacao.meta ?? 80
  const rotuloAnterior = r?.periodo_anterior?.rotulo ?? rca.dado?.meta.periodo_anterior?.rotulo

  /**
   * ★ POSITIVAÇÃO SÓ TEM FAROL QUANDO O BACKEND DIZ QUE É APURÁVEL.
   *
   * A carteira é "quem comprou nos últimos 90 dias" (cliente ativo da 1464). Num
   * período de 90 dias ou mais — os presets "3 meses"/"6 meses"/"90d"/"180d" desta
   * mesma barra — a carteira vira o próprio período: todo cliente do denominador está
   * no numerador e a positivação trava em 100,0%, VERDE, 125% da meta de 80%. Medido:
   * 3 meses (01/04–30/06) dava 154/154 = 100% e junho fechado dá 112/153 = 73,2%,
   * AMARELO. O dono lia "meta batida com folga" e parava de cobrar a equipe.
   *
   * O backend agora recusa a apuração nesses recortes (positivacao.apuravel = false,
   * valor_pct = null). Aqui a tela para de pedir farol e atingimento nesse caso e
   * mostra o motivo no lugar do número — melhor um "não apurável" explicado que um
   * verde que nunca pisca. Default `true` para não descolorir a tela contra um backend
   * antigo que ainda não mande o campo.
   */
  const positivacaoApuravel = r?.positivacao.apuravel ?? true
  const motivoPositivacao = r?.positivacao.motivo ?? null
  const positivacaoRcaApuravel = rca.dado?.meta.positivacao_apuravel ?? true

  // ---------------- Placar (§4) ----------------
  const placar: ItemPlacar[] = useMemo(() => {
    const projetado = projecao?.projetado ?? null
    const rotuloProjecao = projecao ? `Projeção do fechamento de ${mesLongo(projecao.mes)}` : 'Projeção do fechamento'
    return [
      {
        rotulo: 'Faturamento líquido de devolução',
        valor: r ? moeda(r.faturamento.liquido) : '…',
        variacao_pct: r?.faturamento.variacao_pct ?? null,
        detalhe: rotuloAnterior ? `vs ${rotuloAnterior}` : 'vs período anterior',
        tom: 'text-primary',
        linhas: r
          ? [
              `bruto ${moeda(r.faturamento.bruto)} (sem dedução de devolução)`,
              `devolução ${moeda(r.faturamento.devolucao)} · ${pct(r.faturamento.devolucao_pct, 2)} do bruto`,
            ]
          : undefined,
      },
      {
        rotulo: 'Margem de contribuição',
        valor: r ? pct(r.margem.valor_pct) : '…',
        farol: farolDe(r?.margem.farol),
        meta: pct(metaMargem, 0),
        atingimento_pct: r?.margem.atingimento_pct ?? null,
        linhas: r
          ? [
              'antes de imposto e frete, sobre o líquido',
              `custo ${moeda(r.margem.custo)} sobre ${moeda(r.margem.receita)}`,
            ]
          : undefined,
      },
      // sem farol, sem meta e sem atingimento quando o período não permite apurar:
      // o Placar só entra no modo semáforo quando recebe `farol`
      {
        rotulo: 'Positivação da carteira',
        valor: !r ? '…' : positivacaoApuravel ? pct(r.positivacao.valor_pct) : 'não apurável',
        tamanho: r && !positivacaoApuravel ? 'sm' : 'md',
        farol: r && !positivacaoApuravel ? undefined : farolDe(r?.positivacao.farol),
        meta: positivacaoApuravel ? pct(metaPositivacao, 0) : undefined,
        atingimento_pct: positivacaoApuravel ? (r?.positivacao.atingimento_pct ?? null) : null,
        detalhe: r && !positivacaoApuravel ? 'sem comparação com a meta neste recorte' : undefined,
        linhas: !r
          ? undefined
          : positivacaoApuravel
            ? [
                `${numero(r.positivacao.positivados)} de ${numero(r.positivacao.carteira)} clientes compraram`,
                'carteira = quem comprou nos últimos 90 dias',
              ]
            : [
                motivoPositivacao ??
                  'positivação é apurada em janela de até 90 dias; escolha um mês fechado',
              ],
      },
      {
        rotulo: rotuloProjecao,
        valor: projetado === null ? 'aguardando dados' : moeda(projetado),
        tamanho: projetado === null ? 'sm' : 'md',
        detalhe: projetado === null ? undefined : 'pela regra de dias úteis',
        linhas: projecao
          ? [
              `realizado ${moeda(projecao.realizado_liquido)} até agora`,
              // ★ o backend segura a projeção enquanto não há 2 dias úteis transcorridos;
              //   escrever "nenhum dia útil transcorrido" no dia 1 útil seria falso — o
              //   motivo é o dia parcial, não a ausência de dia
              projetado === null
                ? `${numero(projecao.uteis_transcorridos)} de ${numero(projecao.uteis_total)} dias úteis — projeção só a partir do 2º`
                : `${numero(projecao.uteis_transcorridos)} de ${numero(projecao.uteis_total)} dias úteis`,
            ]
          : undefined,
      },
    ]
  }, [r, projecao, metaMargem, metaPositivacao, rotuloAnterior, positivacaoApuravel, motivoPositivacao])

  // ---------------- Radar de ação comercial ----------------
  const linhasMix = mix.dado?.rows ?? []
  const emQueda = linhasMix.filter((l) => l.alerta)
  const itensFora = perdidos.dado?.rows ?? []
  const metaChurn = churn.dado?.meta

  const alertas: Alerta[] = []
  if (mix.dado)
    alertas.push({
      icone: TrendingDown,
      tom: emQueda.length > 0 ? 'aviso' : 'ok',
      numero: numero(emQueda.length),
      titulo: 'RCAs com queda de mix',
      detalhe:
        emQueda.length > 0
          ? emQueda
              .slice(0, 2)
              .map((l) => (l.nome ?? `RCA ${l.codusur}`).split(' ')[0])
              .join(', ')
          : 'nenhum RCA vendendo menos itens',
      para: '#mix',
    })
  if (perdidos.dado)
    alertas.push({
      icone: PackageX,
      tom: itensFora.length > 0 ? 'aviso' : 'ok',
      numero: numero(itensFora.length),
      titulo: 'Itens fora do mix',
      // no mês em andamento a lista é ferramenta de trabalho e encolhe sozinha —
      // o rótulo diz isso para o número não ser lido como queda apurada
      detalhe: mix.dado?.meta.parcial
        ? 'lista do mês em andamento, ainda encolhe'
        : `${milCurto(itensFora.reduce((s, i) => s + (i.valor_mes_anterior || 0), 0))} vendidos no mês anterior`,
      para: '#mix',
    })
  if (metaChurn)
    alertas.push({
      icone: UserMinus,
      tom: metaChurn.risco > 0 ? 'aviso' : 'ok',
      numero: numero(metaChurn.risco),
      titulo: 'Clientes em risco',
      detalhe: 'passaram de 1,6× o próprio ciclo',
      para: '#churn',
    })
  if (metaChurn)
    alertas.push({
      icone: UserX,
      tom: metaChurn.perdidos > 0 ? 'erro' : 'ok',
      numero: numero(metaChurn.perdidos),
      titulo: 'Clientes perdidos',
      detalhe: `${moeda(metaChurn.receita_perdida)} de líquido em 12 meses`,
      para: '#churn',
    })

  // ---------------- Indicadores de apoio do período ----------------
  const indicadores: Indicador[] = r
    ? [
        indicador({
          id: 'ticket',
          nome: 'Ticket médio por cliente',
          formato: 'moeda',
          valor: r.ticket_medio,
          Icone: ShoppingBag,
          detalhe: 'líquido do período ÷ clientes atendidos',
        }),
        indicador({
          id: 'clientes',
          nome: 'Clientes atendidos',
          valor: r.clientes,
          Icone: Users,
          detalhe: `${numero(r.notas)} notas de venda emitidas`,
        }),
        indicador({
          id: 'mix-empresa',
          nome: 'Mix da empresa',
          valor: mix.dado?.meta.mix_empresa ?? null,
          Icone: PackageX,
          detalhe: mix.dado
            ? `era ${numero(mix.dado.meta.mix_empresa_anterior)} em ${mix.dado.meta.rotulo_anterior ?? mix.dado.meta.mes_anterior}`
            : undefined,
        }),
        indicador({
          id: 'devolucao',
          nome: 'Devolução sobre o bruto',
          formato: 'percentual',
          valor: r.faturamento.devolucao_pct,
          Icone: PackageX,
          informativo: true,
          detalhe: `${moeda(r.faturamento.devolucao)} devolvidos — informativo, sem meta`,
        }),
      ]
    : []

  // ---------------- Gravação do motivo da perda ----------------
  const hoje = isoLocal(new Date())
  const catalogo = motivos.dado ?? []
  const edicaoDisponivel = motivos.erro === null && (metaChurn?.anotacoes_disponiveis ?? true)

  const salvarAnotacao = async (codcli: number, dados: AnotacaoPatch) => {
    const salvo = await api<Anotacao>(`/api/clientes/${codcli}/anotacao`, {
      method: 'PUT',
      body: JSON.stringify(dados),
    })
    setLinhasChurn((prev) =>
      prev.map((l) =>
        l.codcli === codcli
          ? {
              ...l,
              motivo: salvo.motivo,
              motivo_descricao: catalogo.find((m) => m.codigo === salvo.motivo)?.descricao ?? null,
              observacao: salvo.observacao,
              silenciado_ate: salvo.silenciar_ate,
              // "até" é inclusivo: silenciado até hoje ainda está silenciado hoje
              silenciado: !!salvo.silenciar_ate && salvo.silenciar_ate >= hoje,
            }
          : l,
      ),
    )
  }

  const linhasSerie = serie.dado?.rows ?? []

  // ★ O bloco por RCA compara positivação com a meta linha a linha. Quando o período
  //   não é apurável o backend já manda positivacao_pct = null, mas ainda manda
  //   positivados/carteira zerados — e o detalhe da coluna sairia "0/0 da carteira",
  //   que se lê como "nenhum cliente comprou". Removendo os dois, a coluna fica em
  //   "—" com o ponto cinza de "Sem dado" e a ressalva da seção explica o porquê.
  const linhasRca = useMemo(() => {
    const rows = rca.dado?.rows ?? []
    if (positivacaoRcaApuravel) return rows
    return rows.map((v) => ({ ...v, positivacao_pct: null, positivados: undefined, carteira: undefined }))
  }, [rca.dado, positivacaoRcaApuravel])

  return (
    <Layout>
      <header className="mb-5 sm:mb-6 surgir">
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink tracking-tight">Comercial</h1>
        <p className="text-muted mt-2 flex items-center gap-2 text-sm sm:text-base">
          <span className="dot dot-ativo hidden sm:inline-block" aria-hidden />
          Faturamento líquido, metas da equipe e carteira — ciclo mensal fechado
        </p>
      </header>

      <div className="mb-5">
        <FiltroBar
          filtro={filtro}
          onChange={setFiltro}
          mostrarHora={false}
          mostrarRca
          mostrarDepto
          aviso={
            r?.periodo
              // `fechado` diz que o período já terminou — não que ele é UM mês. Chamar de
              // "mês fechado" um recorte de seis meses faz o gestor achar que está lendo
              // um mês, e é justamente aí que a positivação deixa de ser apurável.
              ? `Período apurado: ${r.periodo.rotulo}${r.periodo.fechado ? (r.periodo.mes_cheio === false ? ' (período encerrado)' : ' (mês fechado)') : ' — em andamento, ainda não comparável a um mês fechado'}. Todo faturamento desta aba é líquido de devolução.`
              : 'O padrão é o último mês fechado — é nele que metas e comparações são apuradas. Todo faturamento desta aba é líquido de devolução.'
          }
        />
      </div>

      {resumo.erro && (
        <div className="tile p-4 mb-5 text-danger text-sm break-words" role="alert">
          Não foi possível carregar o resumo do período: {resumo.erro}
        </div>
      )}

      <div className="flex flex-col gap-5">
        {/* 1 — Placar: os quatro números que abrem a conversa */}
        <Placar itens={placar} />

        {/* 2 — Radar: o que precisa de ação, com atalho para a lista */}
        <Radar alertas={alertas} titulo="Radar comercial" />

        {/* 3 — Série mensal: faturamento líquido e margem, um painel cada */}
        <Secao
          titulo="Faturamento líquido e margem, mês a mês"
          descricao="Últimos 12 meses fechados mais a projeção do mês corrente — independe do período filtrado acima"
          acoes={<BotaoExportar nome="Serie mensal comercial" rows={linhasSerie as unknown as Record<string, unknown>[]} />}
          erro={serie.erro}
          carregando={serie.carregando}
          vazio={!linhasSerie.length}
          atraso={2}
        >
          <div className="flex flex-col gap-6">
            <SerieFaturamento mensal={linhasSerie} projecao={projecao} />
            <div className="border-t border-line pt-5">
              <h3 className="label-caps mb-2">Margem de contribuição</h3>
              <SerieMargem mensal={linhasSerie} meta={metaMargem} />
            </div>
          </div>
        </Secao>

        {/* 4 — Números de apoio do período filtrado */}
        {indicadores.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
            {indicadores.map((i, n) => (
              <IndicadorCard key={i.id} ind={i} indice={n} />
            ))}
          </div>
        )}

        {/* 5 — Desempenho por RCA (§5.1 e §5.4) */}
        <Secao
          titulo="Desempenho por RCA"
          descricao={`Faturamento líquido do período contra ${
            positivacaoRcaApuravel ? 'as metas de margem e positivação' : 'a meta de margem'
          }${rotuloAnterior ? ` · comparação com ${rotuloAnterior}` : ''}`}
          aviso={
            positivacaoRcaApuravel
              ? null
              : `Positivação não apurada neste período: ${
                  motivoPositivacao ??
                  'a apuração é em janela de até 90 dias (cliente ativo da rotina 1464)'
                }. A coluna sai sem valor e sem semáforo — nenhum RCA está sendo comparado com a meta de positivação aqui.`
          }
          acoes={<BotaoExportar nome="Desempenho por RCA" rows={linhasRca as unknown as Record<string, unknown>[]} />}
          erro={rca.erro}
          carregando={rca.carregando}
          vazio={!linhasRca.length}
          atraso={3}
        >
          <Equipe
            vendedores={linhasRca}
            metaMargem={rca.dado?.meta.meta_margem_pct ?? metaMargem}
            metaPositivacao={rca.dado?.meta.meta_positivacao_pct ?? metaPositivacao}
            rotuloAnterior={rotuloAnterior}
          />
        </Secao>

        {/* 6 — Mix por RCA e o que saiu do mix (§5.2) */}
        <Secao
          id="mix"
          titulo="Mix de produtos por RCA"
          descricao="Produtos distintos vendidos no mês contra o mês anterior"
          acoes={<BotaoExportar nome="Itens fora do mix" rows={itensFora as unknown as Record<string, unknown>[]} />}
          aviso={mix.dado?.meta.aviso ?? null}
          erro={mix.erro}
          carregando={mix.carregando}
          vazio={!linhasMix.length || !mix.dado}
          atraso={3}
        >
          {mix.dado && (
            <MixRca
              rows={linhasMix}
              meta={mix.dado.meta}
              selecionado={rcaMix}
              aoSelecionar={setRcaMix}
              perdidos={itensFora}
              carregandoPerdidos={perdidos.carregando}
              erroPerdidos={perdidos.erro}
            />
          )}
        </Secao>

        {/* 7 — Cruzamento RCA × Departamento (§5.3) */}
        <Secao
          titulo="Faturamento por RCA e departamento"
          descricao="Série mensal cruzada — quanto cada vendedor faturou dentro de cada categoria"
          acoes={
            <BotaoExportar
              nome="RCA x Departamento"
              rows={(rcaDepto.dado?.rows ?? []) as unknown as Record<string, unknown>[]}
            />
          }
          erro={rcaDepto.erro}
          carregando={rcaDepto.carregando}
          vazio={!rcaDepto.dado?.rows.length}
          atraso={4}
        >
          <RcaDepartamento rows={rcaDepto.dado?.rows ?? []} />
        </Secao>

        {/* 8 — Churn: quem parou de comprar e por quê (§9) */}
        <Secao
          id="churn"
          titulo="Clientes em risco e perdidos"
          descricao="Posição de hoje — o churn não segue o período filtrado, e sim o ritmo de compra de cada cliente"
          acoes={<BotaoExportar nome="Churn de clientes" rows={linhasChurn as unknown as Record<string, unknown>[]} />}
          erro={churn.erro}
          carregando={churn.carregando}
          vazio={!churn.dado}
          atraso={4}
        >
          {metaChurn && (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <KpiCard
                  card={{ id: 'ativos', label: 'Clientes ativos', valor: metaChurn.ativos, formato: 'inteiro', tom: 'text-emerald', Icone: Users }}
                  indice={0}
                />
                <KpiCard
                  card={{ id: 'risco', label: 'Em risco de abandono', valor: metaChurn.risco, formato: 'inteiro', tom: 'text-amber', Icone: UserMinus }}
                  indice={1}
                />
                <KpiCard
                  card={{ id: 'perdidos', label: 'Perdidos', valor: metaChurn.perdidos, formato: 'inteiro', tom: 'text-danger', Icone: UserX }}
                  indice={2}
                />
                <KpiCard
                  card={{
                    id: 'receita-perdida',
                    label: 'Líquido dos perdidos (12 m)',
                    valor: metaChurn.receita_perdida,
                    formato: 'moeda',
                    tom: 'text-danger',
                    Icone: TrendingDown,
                    detalhe:
                      metaChurn.receita_perdida_pct !== null && metaChurn.receita_perdida_pct !== undefined
                        ? `${pct(metaChurn.receita_perdida_pct)} do líquido de 12 meses`
                        : undefined,
                  }}
                  indice={3}
                />
              </div>

              {metaChurn.nunca_compraram > 0 && (
                <p className="text-[11px] font-mono text-muted">
                  Fora da lista: {plural(metaChurn.nunca_compraram, 'cliente cadastrado que nunca comprou', 'clientes cadastrados que nunca compraram')} —
                  carteira não aberta, não é perda.
                </p>
              )}

              <Churn
                rows={linhasChurn}
                meta={metaChurn}
                motivos={catalogo}
                edicaoDisponivel={edicaoDisponivel}
                aoSalvar={salvarAnotacao}
              />
            </div>
          )}
        </Secao>
      </div>

      <BotaoAjuda flutuante contexto={{ tela: 'comercial', dt_ini: filtro.dt_ini, dt_fim: filtro.dt_fim }} />
    </Layout>
  )
}
