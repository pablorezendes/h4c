import Layout from '../components/Layout'
import FiltroBar, { useFiltro } from '../components/FiltroBar'
import ApuracaoFaturamento from '../components/ApuracaoFaturamento'
import BotaoAjuda from '../components/ajuda/BotaoAjuda'

/**
 * Apuração de Faturamento — a aba que substitui a rotina 1464 do Winthor.
 *
 * A tela é a casca: período e filtros globais (RCA e Departamento combinam entre si) em
 * cima, e o relatório configurável embaixo. Toda a inteligência — presets da 1464,
 * composição de dimensões, curva ABC, totalizador e exportação — mora em
 * `ApuracaoFaturamento`.
 *
 * ★ Os demais filtros da aba F4 da 1464 (Seção, Fornecedor, Marca, Ramo, Plano de
 *   pagamento) NÃO sobem para o FiltroBar: ele é global e aparece em todas as abas, onde
 *   esses recortes não têm uso. Eles ficam no bloco recolhível "mais filtros" do próprio
 *   relatório, junto do que filtram.
 *
 * O período nasce no último mês FECHADO, que é o ciclo em que o BI apura: comparar um
 * mês pela metade com um mês inteiro é o erro mais caro que este relatório induz.
 */
export default function Apuracao() {
  const [filtro, setFiltro] = useFiltro()

  return (
    <Layout>
      <header className="mb-6 surgir">
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink tracking-tight">
          Apuração de faturamento
        </h1>
        <p className="text-muted mt-2 text-sm sm:text-base">
          O relatório da rotina <span className="font-mono">1464</span> aqui dentro: escolha uma visão
          pronta ou combine até cinco níveis de agrupamento. O faturamento é sempre{' '}
          <span className="text-primary font-semibold">líquido de devolução</span>.
        </p>
      </header>

      <div className="mb-5">
        <FiltroBar
          filtro={filtro}
          onChange={setFiltro}
          mostrarHora={false}
          mostrarRca
          mostrarDepto
          aviso="RCA e departamento combinam entre si e valem para todas as linhas do relatório — seção, fornecedor, marca, ramo e plano de pagamento ficam em 'mais filtros', logo abaixo"
        />
      </div>

      <ApuracaoFaturamento filtro={filtro} />

      <BotaoAjuda flutuante contexto={{ tela: 'apuracao', dt_ini: filtro.dt_ini, dt_fim: filtro.dt_fim }} />
    </Layout>
  )
}
