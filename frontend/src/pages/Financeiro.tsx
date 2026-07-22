import { useEffect, useMemo, useState } from 'react'
import { Info } from 'lucide-react'
import Layout from '../components/Layout'
import BotaoAjuda from '../components/ajuda/BotaoAjuda'
import BotaoExportar from '../components/BotaoExportar'
import FiltroBar, { filtroQuery, useFiltro } from '../components/FiltroBar'
import Aging from '../components/charts/Aging'
import CardVencido from '../components/financeiro/CardVencido'
import PainelPrazos from '../components/financeiro/PainelPrazos'
import SeriePrazos from '../components/financeiro/SeriePrazos'
import TabelaPrazo from '../components/financeiro/TabelaPrazo'
import TopDevedores from '../components/financeiro/TopDevedores'
import { Esqueleto, Vazio } from '../components/financeiro/formatos'
import type { RespostaPorPrazo, RespostaPrazos, RespostaVencido } from '../components/financeiro/tipos'
import { api } from '../lib/api'
import { brl, brlExato } from '../lib/format'

/**
 * Aba FINANCEIRO — geração de caixa.
 *
 * PRINCÍPIO DA ABA: para o dono, monitorar a geração de caixa importa mais que o
 * faturamento. A dor é vender acima do ponto de equilíbrio e mesmo assim ter de
 * adiantar boleto pagando juros porque o dinheiro não entrou no prazo. Por isso a
 * ordem da tela é: quanto já venceu e não entrou -> em quantos dias o dinheiro entra
 * contra em quantos dias ele sai -> em que prazo a empresa está vendendo.
 * Faturamento não mora aqui (ele é da aba Comercial); nada é duplicado entre abas.
 *
 * ★ O QUE NÃO ESTÁ AQUI, DE PROPÓSITO: projeção de fluxo de caixa, margem líquida
 *   contra a meta de 7%, break-even e custo de antecipação de recebíveis. Não é
 *   esquecimento — dependem das despesas que só existem na base do BPO financeiro e
 *   foram adiadas em reunião para a rodada com o Vinícius. Publicar um número
 *   incompleto que o dono usaria para decidir é pior do que não ter o número.
 *
 * ★ TOLERÂNCIA A FALHA: cada seção busca seu dado e cai sozinha. Um endpoint fora
 *   do ar vira aviso discreto no lugar da seção, nunca tela branca.
 */

const AVISO_FILTRO =
  'O filtro de RCA se aplica ao contas a receber (vencido, PMR e prazo concedido). ' +
  'O PMP é da empresa inteira: duplicata de fornecedor não pertence a vendedor nenhum. ' +
  'Departamento não filtra nada aqui: o título cobre a nota inteira e não se reparte por produto.'

function valor<T>(r: PromiseSettledResult<T>): T | null {
  return r.status === 'fulfilled' ? r.value : null
}

export default function Financeiro() {
  const [filtro, setFiltro] = useFiltro()
  const [prazos, setPrazos] = useState<RespostaPrazos | null>(null)
  const [vencido, setVencido] = useState<RespostaVencido | null>(null)
  const [porPrazo, setPorPrazo] = useState<RespostaPorPrazo | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [falhas, setFalhas] = useState<string[]>([])

  /**
   * ★ DEPARTAMENTO SAI DA CONSULTA. O filtro global é o mesmo em todas as abas, mas
   *   aqui ele criaria dois pesos: o título do contas a receber cobre a nota inteira e
   *   não se reparte por departamento (o backend o ignora em /prazos e /vencido),
   *   enquanto /faturamento-por-prazo sabe recortar por produto. Deixar passar faria a
   *   tabela por prazo falar de um recorte e o PMR ao lado falar de outro.
   */
  const q = useMemo(() => filtroQuery({ ...filtro, deptos: [] }), [filtro])

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    // allSettled: a tabela por prazo não pode derrubar o card do vencido
    Promise.allSettled([
      api<RespostaPrazos>(`/api/financeiro/prazos?${q}&meses=12`),
      api<RespostaVencido>(`/api/financeiro/vencido?${q}&limite=8`),
      api<RespostaPorPrazo>(`/api/financeiro/faturamento-por-prazo?${q}`),
    ]).then(([p, v, fp]) => {
      if (!vivo) return
      setPrazos(valor(p))
      setVencido(valor(v))
      setPorPrazo(valor(fp))
      setFalhas(
        [
          p.status === 'rejected' && 'prazos de caixa',
          v.status === 'rejected' && 'vencido a receber',
          fp.status === 'rejected' && 'faturamento por prazo',
        ].filter(Boolean) as string[],
      )
      setCarregando(false)
    })
    return () => {
      vivo = false
    }
  }, [q])

  const antecipacao = prazos?.meta?.antecipacao ?? null

  return (
    <Layout>
      <header className="mb-5 sm:mb-6 surgir">
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink tracking-tight">Financeiro</h1>
        <p className="text-muted mt-2 text-sm sm:text-base">
          Geração de caixa — quando o dinheiro entra, quando ele sai e o que já venceu sem entrar
        </p>
      </header>

      <div className="mb-5">
        <FiltroBar filtro={filtro} onChange={setFiltro} mostrarHora={false} mostrarRca aviso={AVISO_FILTRO} />
      </div>

      {falhas.length > 0 && (
        <div className="tile p-3.5 mb-5 flex items-start gap-2.5 text-sm text-amber" role="status">
          <Info className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} aria-hidden />
          <span>Sem resposta do servidor para: {falhas.join(', ')}. O resto da tela segue com dado real.</span>
        </div>
      )}

      <div className="flex flex-col gap-5">
        {/* 1 — o número que aperta o caixa */}
        <CardVencido dados={vencido} carregando={carregando} />

        {/* 2 — os três prazos lado a lado */}
        <PainelPrazos dados={prazos} carregando={carregando} />

        {/* 3 — a mesma leitura ao longo dos meses fechados */}
        <section className="tile tile-hover p-4 sm:p-6 surgir surgir-2">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-ink">Prazos mês a mês</h2>
              <p className="text-muted text-sm mt-0.5">
                Só meses fechados — o parcial do mês corrente faria o cliente parecer pontual
              </p>
            </div>
            <BotaoExportar
              nome="Prazos de caixa por mês"
              rows={(prazos?.serie ?? []) as unknown as Record<string, unknown>[]}
            />
          </div>
          {carregando && !prazos ? (
            <Esqueleto altura="h-56" />
          ) : prazos ? (
            <SeriePrazos dados={prazos.serie ?? []} />
          ) : (
            <Vazio>série de prazos indisponível</Vazio>
          )}
        </section>

        {/* 4 — onde o vencido está e com quem */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-5">
          <section className="tile tile-hover p-4 sm:p-6 surgir surgir-3">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-ink">Atraso por faixa</h2>
                <p className="text-muted text-sm mt-0.5">
                  Só o que já venceu. A carteira a vencer aparece à parte porque esmagaria a escala
                </p>
              </div>
              <BotaoExportar
                nome="Contas a receber por faixa"
                rows={(vencido?.aging ?? []) as unknown as Record<string, unknown>[]}
              />
            </div>
            {carregando && !vencido ? (
              <Esqueleto altura="h-56" />
            ) : vencido && vencido.total > 0 ? (
              <>
                <Aging dados={vencido.aging} mostrarAVencer={false} />
                <p className="text-muted text-[11px] font-mono mt-2">
                  a vencer (fora do gráfico): {brl.format(vencido.a_vencer)}
                </p>
              </>
            ) : (
              <Vazio>nenhum título vencido em aberto</Vazio>
            )}
          </section>

          <section className="tile tile-hover p-4 sm:p-6 surgir surgir-3">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-ink">Quem está devendo</h2>
                <p className="text-muted text-sm mt-0.5">Maiores saldos vencidos, com o RCA que atende</p>
              </div>
              <BotaoExportar
                nome="Maiores devedores"
                rows={(vencido?.top ?? []) as unknown as Record<string, unknown>[]}
              />
            </div>
            {carregando && !vencido ? <Esqueleto altura="h-56" /> : <TopDevedores dados={vencido?.top ?? []} />}
          </section>
        </div>

        {/* 5 — em que prazo a empresa está vendendo (relatório 14 da rotina 1464) */}
        <section className="tile tile-hover p-4 sm:p-6 surgir surgir-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-ink">Faturamento por prazo</h2>
              <p className="text-muted text-sm mt-0.5">
                Líquido de devolução por condição de pagamento — o PMR dos próximos meses já está sendo
                contratado aqui
              </p>
            </div>
            <BotaoExportar
              nome="Faturamento por prazo"
              rows={(porPrazo?.rows ?? []) as unknown as Record<string, unknown>[]}
            />
          </div>
          {carregando && !porPrazo ? <Esqueleto altura="h-56" /> : <TabelaPrazo dados={porPrazo} />}
        </section>

        {/* 6 — o que esta tela NÃO calcula, dito na cara */}
        <section className="tile p-4 sm:p-6 surgir surgir-4">
          <h2 className="font-display text-lg font-semibold text-ink">Antes de decidir com estes números</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4 mt-3">
            <div>
              <p className="label-caps">As duas margens não se confundem</p>
              <p className="text-ink-soft text-sm mt-1.5 leading-relaxed">
                <strong className="font-semibold">Margem de contribuição — meta 33%</strong>: lucro bruto de
                mercadoria antes de impostos e despesas. É apurada na aba Comercial e não se repete aqui.
              </p>
              <p className="text-ink-soft text-sm mt-2 leading-relaxed">
                <strong className="font-semibold">Margem de lucro líquido — meta 7%</strong>: meta global da
                empresa. Depende das despesas que estão na base do BPO financeiro, não no WinThor — por isso
                aparece como referência escrita e <em>não</em> como card calculado.
              </p>
            </div>
            <div>
              <p className="label-caps">Em construção com o BPO</p>
              <p className="text-ink-soft text-sm mt-1.5 leading-relaxed">
                Projeção de fluxo de caixa, acompanhamento do break-even e custo de antecipação de recebíveis
                entram na rodada com o Vinícius (sócio e líder do BPO financeiro), que já tem a base histórica
                de despesas. Calcular agora, só com o WinThor, produziria um número incompleto — e é com ele
                que a decisão seria tomada.
              </p>
              {antecipacao && antecipacao.valor > 0 && (
                <p className="text-muted text-xs mt-2.5 font-mono leading-relaxed">
                  o que dá para medir hoje: {brlExato.format(antecipacao.valor)} antecipados no período em{' '}
                  {antecipacao.titulos} títulos (cobrança 50). O <em>custo</em> dessa antecipação está nas taxas
                  do BPO.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>

      <BotaoAjuda flutuante contexto={{ tela: 'financeiro', dt_ini: filtro.dt_ini, dt_fim: filtro.dt_fim }} />
    </Layout>
  )
}
