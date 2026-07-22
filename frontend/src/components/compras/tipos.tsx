/**
 * Contrato dos endpoints /api/compras consumido pelas abas Compras e Estoque.
 *
 * ★ A demanda é SEMPRE a do último mês FECHADO, nunca "últimos 30 dias" — janela
 *   móvel é anti-padrão explícito das regras do cliente. O mês corrente aparece
 *   apenas como contexto e sempre PROJETADO por dias úteis, rotulado como projeção.
 */

export interface Periodo {
  mes: string | null
  dt_ini: string
  dt_fim: string
  rotulo: string
  mes_cheio: boolean
  fechado: boolean
  dias_uteis: number
}

export interface Projecao {
  mes: string
  rotulo: string
  uteis_transcorridos: number
  uteis_total: number
  qt_realizada: number
  valor_realizado: number
  qt_projetada: number | null
  valor_projetado: number | null
  parcial: boolean
  aviso?: string
}

export interface ResumoCurva {
  criterio: string
  total: number
  skus: number
  skus_a: number
  skus_b: number
  skus_c: number
  corte_a_pct: number
  corte_b_pct: number
  fora_da_curva: number
}

export type Classe = 'A' | 'B' | 'C' | null
export type AlertaVariacao = 'salto' | 'queda' | 'novo' | 'parou' | null

export interface LinhaDemanda {
  codprod: number
  descricao: string
  codepto: number | null
  departamento: string | null
  codsec: number | null
  secao: string | null
  qt_liquida: number
  valor_liquido: number
  demanda_diaria: number | null
  classe_abc: Classe
  variacao_pct: number | null
  alerta_variacao: AlertaVariacao
  qt_liquida_anterior: number
  demanda_diaria_anterior: number | null
}

export interface RespostaDemanda {
  rows: LinhaDemanda[]
  meta: {
    mes_fechado: Periodo
    dias_uteis: number
    periodo_anterior: Periodo
    mes_corrente: Projecao
    produtos: number
    curva: ResumoCurva
    alertas: { salto: number; queda: number; novo: number; parou: number }
    limiar_variacao_pct: number
    criterio_alerta: string
    truncado_em: number | null
  }
}

export interface LinhaAbc {
  codprod: number
  descricao: string
  codepto: number | null
  departamento: string | null
  codsec: number | null
  secao: string | null
  valor_liquido: number
  qt_liquida: number
  share_pct: number | null
  acumulado_pct: number | null
  classe_abc: Classe
}

export interface RespostaAbc {
  rows: LinhaAbc[]
  meta: ResumoCurva & {
    criterio: string
    periodo: Periodo
    total_valor_liquido: number
    total_qt_liquida: number
    negativos: { codprod: number; descricao: string; valor_liquido: number; qt_liquida: number }[]
    nota_negativos: string
    truncado_em: number | null
  }
}

export interface LinhaSugestao {
  codprod: number
  descricao: string
  codepto: number | null
  departamento: string | null
  codsec: number | null
  secao: string | null
  codfornec: number | null
  fornecedor: string | null
  classe_abc: Classe
  demanda_diaria: number
  disponivel: number
  trancado: number
  pendente_compra: number
  cobertura_dias: number | null
  meta_dias: number
  sugestao_qt: number
  sugestao_valor: number
  sugestao_se_destrancar: number | null
  sugestao_qt_mais_50: number
  lead_time_dias: number | null
  lead_time_escopo: string | null
  lead_time_status: string
  custo_unitario: number
  status: string
}

export interface RespostaSugestao {
  rows: LinhaSugestao[]
  meta: {
    meta_dias: number
    classes: string[]
    periodo: Periodo
    dias_uteis: number
    skus: number
    skus_com_sugestao: number
    custo_total: number
    custo_total_se_destrancar: number
    cenario_mais_50: { fator: number; custo_total: number; skus_com_sugestao: number; aviso: string }
    sem_lead_time: number
    sem_custo_cadastrado: number
    pedidos_compra_abertos: number
    aviso_pendente_zero: string | null
    truncado_em: number | null
  }
}

export interface LinhaEstoque {
  codprod: number
  descricao: string
  codepto: number | null
  departamento: string | null
  codsec: number | null
  secao: string | null
  fisico: number
  reservado: number
  trancado: number
  avaria: number
  disponivel: number
  demanda_diaria: number
  cobertura_dias: number | null
  dias_trancados: number | null
  trancado_valor: number
  valor_estoque: number
  custo_unitario: number
}

export interface RespostaEstoque {
  rows: LinhaEstoque[]
  meta: {
    periodo: Periodo
    dias_uteis: number
    skus: number
    skus_trancados: number
    total_trancado_un: number
    total_trancado_valor: number
    total_avaria_un: number
    valor_estoque: number
    skus_em_ruptura: number
    meta_dias_curva_a: number
    nota_trancado: string
    truncado_em: number | null
  }
}
