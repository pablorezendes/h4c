"""Regras canonicas do BI da distribuidora (skill `correcoes-bi-distribuidora`).

Qualquer visao, metrica ou query que contrarie este modulo esta errada. Aqui moram
a REGRA DE OURO (faturamento sempre liquido de devolucao), as metas do cliente e os
filtros canonicos — para que nenhuma tela reinvente a medida e divirja das outras.

★ MEDIDA CANONICA (validada contra o Oracle de producao em 2026-07-21)

    Faturamento Liquido = SUM( +qt*punit dos itens CODOPER='S'
                               -qt*punit dos itens CODOPER='ED' )   em PCMOV

Por que item (PCMOV) e nao capa (PCNFSAID.VLTOTAL): nesta operacao os dois dao o
MESMO total ao centavo (diferenca R$ 0,00 nos 6 meses fechados de 2026 — nao ha
IPI, ST nem frete), mas so o item abre por RCA, departamento, produto e cliente
sem join extra e sem risco de dupla contagem.

Por que CODOPER e nao CONDVENDA: CONDVENDA=1 cobre venda E remessa de comodato.
Filtrar por CONDVENDA inflaria o bruto em R$ 229.086,87 (+11,7%) em 6 meses.
Com CODOPER IN ('S','ED') ficam de fora, de graca: SR (remessa de comodato),
SB (bonificacao de saida, PUNIT=0), SD (devolucao AO fornecedor), EB (bonificacao
recebida), ER (retorno de comodato).

Devolucao de cliente e EXCLUSIVAMENTE CODOPER='ED' (CFOP 1202/2202) — contraprova:
PCNFENT com CODFISCAL=132 soma exatamente o mesmo valor, centavo a centavo.
E PCMOV.CODUSUR ja vem preenchido com o RCA da venda de origem em 100% das linhas
ED, entao a devolucao e atribuivel por RCA/cliente/produto sem nenhum join.

Impacto de nao deduzir (filial 1, 2026): jan 10,87% · fev 6,43% · mar 3,16% ·
abr 2,74% · mai 1,29% · jun 1,02%. Como o percentual caiu ao longo do semestre,
o BI bruto distorce toda comparacao mes a mes a favor dos meses recentes.

★ SQL DESTE MODULO E POSTGRES (espelho `winthor`), como o resto dos routers.
"""
import os
from datetime import date

# ---------------------------------------------------------------------------
# Constantes de negocio (validadas em reuniao com o cliente)
# ---------------------------------------------------------------------------

#: Filial da operacao. Hoje so existe a 1 (Hygiene For Care Ltda).
FILIAL = os.environ.get("FILIAL_PADRAO", "1")

META_MARGEM_PCT = 33.0        # margem de CONTRIBUICAO, antes de imposto e frete (§4)
META_POSITIVACAO_PCT = 80.0   # cobertura da carteira no mes fechado (§4)
META_COBERTURA_CURVA_A_DIAS = 45   # suprimento da curva A (§10)
DIAS_CLIENTE_ATIVO = 90       # "Nº Dias Clientes Ativos = 90" da rotina 1464

# Churn (§9): teto absoluto de 30 dias, ciclo medido so nos ultimos 90 dias
CHURN_TETO_DIAS = 30
CHURN_FATOR_RISCO = 1.6
CHURN_FATOR_PERDIDO = 2.0

#: Margem de lucro LIQUIDO ideal da empresa (7%). NAO e a margem da aba Comercial:
#: depende de despesas que estao na base do BPO — fase 2, com o Vinicius (§8).
#: Fica aqui apenas para documentar que as duas metas nao se confundem.
META_MARGEM_LIQUIDA_PCT_FASE2 = 7.0

CURVA_A_CORTE_PCT = 80.0      # acumulado de valor que define a curva A
CURVA_B_CORTE_PCT = 95.0

OPER_VENDA = "S"
OPER_DEVOLUCAO = "ED"

# ---------------------------------------------------------------------------
# Fragmentos SQL da medida canonica (PCMOV, alias padrao "m")
# ---------------------------------------------------------------------------


def filtro_venda(alias: str = "m", periodo: bool = True, coluna_data: str = "dtmov") -> str:
    """Filtro canonico do movimento que entra no faturamento liquido.

    Mantem `dtcancel IS NULL` mesmo com as linhas canceladas ja vindo com QT=0:
    o filtro protege o BI de uma mudanca de comportamento do ERP.
    """
    cond = (f"{alias}.codoper IN ('{OPER_VENDA}', '{OPER_DEVOLUCAO}') "
            f"AND {alias}.dtcancel IS NULL "
            f"AND {alias}.codfilial = :filial")
    if periodo:
        cond += f" AND {alias}.{coluna_data} >= :dt_ini AND {alias}.{coluna_data} < :dt_fim_x"
    return cond


def valor_liquido(alias: str = "m") -> str:
    """Faturamento liquido: venda menos devolucao, na mesma soma."""
    return (f"SUM(CASE WHEN {alias}.codoper = '{OPER_VENDA}' THEN {alias}.qt * {alias}.punit "
            f"ELSE -({alias}.qt * {alias}.punit) END)")


def valor_bruto(alias: str = "m") -> str:
    """Venda faturada SEM deducao. So para exibir ao lado do liquido, sempre rotulado."""
    return f"SUM(CASE WHEN {alias}.codoper = '{OPER_VENDA}' THEN {alias}.qt * {alias}.punit ELSE 0 END)"


def valor_devolucao(alias: str = "m") -> str:
    """Devolucao de cliente, em positivo (para exibir e para o % de devolucao)."""
    return f"SUM(CASE WHEN {alias}.codoper = '{OPER_DEVOLUCAO}' THEN {alias}.qt * {alias}.punit ELSE 0 END)"


def qt_liquida(alias: str = "m") -> str:
    """Quantidade liquida (demanda). Base da cobertura e da sugestao de compra (§10)."""
    return (f"SUM(CASE WHEN {alias}.codoper = '{OPER_VENDA}' THEN {alias}.qt "
            f"ELSE -{alias}.qt END)")


def custo_liquido(alias: str = "m") -> str:
    """Custo das vendas liquidas. A devolucao abate receita E custo — sem isso a
    margem do semestre sobe de 32,19% para 34,40% (2,2 p.p. de erro, o bastante
    para virar o semaforo).

    CUSTOFIN e CUSTOREAL sao bit-a-bit iguais nesta base; fixamos CUSTOFIN e nao
    trocamos mais: trocar a base de custo quebra o historico da serie que o dono
    acompanha.
    """
    return (f"SUM(CASE WHEN {alias}.codoper = '{OPER_VENDA}' THEN {alias}.qt * COALESCE({alias}.custofin, 0) "
            f"ELSE -({alias}.qt * COALESCE({alias}.custofin, 0)) END)")


def margem_pct(receita_sql: str, custo_sql: str) -> str:
    """Margem de contribuicao %, protegida contra receita zero."""
    return f"CASE WHEN {receita_sql} > 0 THEN 100.0 * ({receita_sql} - {custo_sql}) / {receita_sql} END"


# ---------------------------------------------------------------------------
# Filtros globais da visao Comercial (§3): RCA e Departamento, multi-selecao
# ---------------------------------------------------------------------------

def clausula_rca(rcas: list[int] | None, alias: str = "m") -> str:
    """RCA vem de PCMOV.CODUSUR — identico a PCNFSAID.CODUSUR em 7.275/7.275 itens,
    e e o unico disponivel nas linhas de devolucao."""
    return f" AND {alias}.codusur = ANY(:rcas)" if rcas else ""


def nome_rca(alias: str = "u") -> str:
    """Rotulo do vendedor, sem o prefixo do cadastro.

    PCUSUARI.NOME e cadastrado como "CARTEIRA FERNANDA MOURA"; o dono chama o
    vendedor pelo nome. Sem tirar o prefixo num lugar so, uma tela mostra
    "CARTEIRA, CARTEIRA" no alerta (as duas primeiras palavras sao iguais) e
    outra mostra o nome inteiro — e as duas parecem falar de gente diferente.
    """
    return f"TRIM(REGEXP_REPLACE({alias}.nome, '^CARTEIRA[[:space:]]+', ''))"


def clausula_depto(deptos: list[int] | None, alias: str = "p") -> str:
    """Departamento vem do CADASTRO do produto (PCPRODUT.CODEPTO), como manda o
    mapeamento da 1464 — nao de PCMOV.CODEPTO, que guarda a classificacao historica
    e diverge do cadastro em 43 linhas do semestre. Escolher uma e nao misturar."""
    return f" AND {alias}.codepto = ANY(:deptos)" if deptos else ""


def binds_dimensao(rcas: list[int] | None, deptos: list[int] | None) -> dict:
    b: dict = {}
    if rcas:
        b["rcas"] = list(rcas)
    if deptos:
        b["deptos"] = list(deptos)
    return b


def periodo_binds(dt_ini: date, dt_fim: date, filial: str | None = None) -> dict:
    """Binds do periodo. `dt_fim_x` e o dia seguinte ao fim: comparar com `< dt_fim_x`
    pega o dia inteiro mesmo quando a coluna e timestamp (o espelho converte DATE do
    Oracle em timestamp, e `BETWEEN dt_fim` perderia os lancamentos com hora)."""
    from datetime import timedelta
    return {
        "dt_ini": dt_ini,
        "dt_fim_x": dt_fim + timedelta(days=1),
        "filial": filial or FILIAL,
    }


# ---------------------------------------------------------------------------
# Contas a receber: filtro canonico de titulo valido
# ---------------------------------------------------------------------------

#: PCPREST guarda CADEIAS de estorno/reemissao — o mesmo titulo aparece 2 a 4 vezes
#: com PRESTs diferentes. Sem este filtro o BI conta a mesma parcela ate 3 vezes e o
#: PMR cai artificialmente (24,3 em vez de 24,9 dias).
COBRANCAS_NAO_FINANCEIRAS = ("ESTR", "CANC", "DESD", "DEVP", "DEVT", "BNF")


def filtro_titulo(alias: str = "t") -> str:
    lista = ", ".join(f"'{c}'" for c in COBRANCAS_NAO_FINANCEIRAS)
    return (f"{alias}.codfilial = :filial "
            f"AND {alias}.dtcancel IS NULL "
            f"AND {alias}.tipoestorno IS NULL "
            f"AND COALESCE({alias}.codcob, '') NOT IN ({lista}) "
            f"AND {alias}.valor > 0")


# ---------------------------------------------------------------------------
# Estoque (§10): trancado nunca entra no disponivel e nunca some da tela
# ---------------------------------------------------------------------------

#: Disponivel que o app Ion Vendas enxerga — provado contra IONV_SYNC.IONVD_ESTOQUE,
#: que recebe exatamente estes 4 campos, com IONV_PED_ACEITA_VENDA_SEM_EST='N'.
DISPONIVEL_VENDA = ("(COALESCE(e.qtest,0) - COALESCE(e.qtreserv,0) "
                    "- COALESCE(e.qtbloqueada,0) - COALESCE(e.qtpendente,0))")

#: O bloqueio da gestao (rotina 266) e a avaria/indenizacao moram no MESMO campo:
#: QTINDENIZ esta contido em QTBLOQUEADA (0 violacoes em 733 linhas). Somar os dois
#: contaria a avaria duas vezes.
TRANCADO_GESTAO = "(COALESCE(e.qtbloqueada,0) - COALESCE(e.qtindeniz,0))"
AVARIA = "COALESCE(e.qtindeniz,0)"


# ---------------------------------------------------------------------------
# Semaforo de meta (§4) — limiares sobre o ATINGIMENTO, nao sobre o valor
# ---------------------------------------------------------------------------

def semaforo(valor: float | None, meta: float) -> dict:
    """verde >= 100% da meta · amarelo 90-100% · vermelho < 90%.

    Caso de calibracao da reuniao: margem 27,2% com meta 33% => 82% => vermelho.
    """
    if valor is None or not meta:
        return {"farol": "indefinido", "atingimento_pct": None, "meta": meta}
    at = float(valor) / float(meta)
    farol = "verde" if at >= 1.0 else "amarelo" if at >= 0.9 else "vermelho"
    return {"farol": farol, "atingimento_pct": round(at * 100, 1), "meta": meta}
