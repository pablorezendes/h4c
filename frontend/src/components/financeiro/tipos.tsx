/**
 * Contrato dos endpoints /api/financeiro consumido pela aba.
 *
 * ★ TRÊS JANELAS DIFERENTES, NUNCA SOMAR (o backend repete o aviso no meta):
 *     prazo concedido -> títulos EMITIDOS no mês   (o que o comercial prometeu)
 *     PMR efetivo     -> títulos PAGOS no mês      (o que o cliente cumpriu)
 *     PMP             -> lançamentos LIQUIDADOS    (o que a empresa pagou)
 *   O título emitido em junho só é pago meses depois; os três ficam lado a lado
 *   para o dono ver o descompasso, e cada um carrega o próprio rótulo de janela.
 */

export interface PontoPrazo {
  mes: string
  pmr: number | null
  concedido: number | null
  pmp: number | null
  pmp_geral?: number | null
  valor_recebido?: number
  valor_emitido?: number
  valor_pago?: number
}

export interface Antecipacao {
  titulos: number
  valor: number
  em_aberto: number
  obs?: string
}

export interface RespostaPrazos {
  referencia: { mes: string; dt_ini: string; dt_fim: string; rotulo: string; fechado: boolean }
  pmr: number | null
  prazo_concedido: number | null
  pmp: number | null
  pmp_geral: number | null
  gap_caixa: number | null
  atraso_medio: number | null
  serie: PontoPrazo[]
  meta: {
    concedido_carteira_paga?: number | null
    atraso_carteira_paga?: number | null
    titulos_recebidos?: number
    valor_recebido?: number
    titulos_emitidos?: number
    valor_emitido?: number
    valor_pago_mercadoria?: number
    valor_pago_geral?: number
    aviso_janelas?: string
    aviso_rca?: string | null
    aviso_depto?: string | null
    antecipacao?: Antecipacao
    [k: string]: unknown
  }
}

export interface FaixaVencido {
  faixa: string
  titulos: number
  valor: number
}

export interface Devedor {
  codcli: number
  cliente: string | null
  codusur: number | null
  rca: string | null
  titulos: number
  valor: number
  dias_atraso: number
}

export interface RespostaVencido {
  total: number
  titulos: number
  a_vencer: number
  aging: FaixaVencido[]
  top: Devedor[]
  meta: {
    posicao?: string
    carteira_aberta?: number
    ate_15_dias?: number
    ate_15_dias_pct?: number | null
    vencido_sobre_carteira_pct?: number | null
    aviso_depto?: string | null
    [k: string]: unknown
  }
}

export interface LinhaPrazo {
  codplpag: number
  descricao: string
  numdias: number | null
  bruto: number
  devolucao: number
  liquido: number
  participacao_pct: number | null
}

export interface RespostaPorPrazo {
  rows: LinhaPrazo[]
  meta: {
    periodo?: { dt_ini: string; dt_fim: string; fechado: boolean }
    total_bruto?: number
    total_devolucao?: number
    total_liquido?: number
    total_liquido_vinculado?: number
    devolucao_sem_vinculo?: number
    prazo_medio_praticado?: number | null
    planos?: number
    [k: string]: unknown
  }
}
