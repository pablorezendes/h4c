"""Aba Financeiro do BI — geracao de caixa (§8 das regras canonicas do cliente).

PRINCIPIO DA ABA: para o dono, monitorar a GERACAO DE CAIXA importa mais que o
faturamento. A dor e vender acima do ponto de equilibrio e mesmo assim ter de
adiantar boleto pagando juros porque o dinheiro nao entrou no prazo. Por isso a
ordem dos numeros aqui e: quanto ja venceu e nao entrou -> em quantos dias o
dinheiro entra (PMR) contra em quantos dias ele sai (PMP) -> em que prazo a
empresa esta vendendo (prazo concedido). Faturamento nao mora nesta aba.

★ TRES JANELAS DIFERENTES, NUNCA MISTURAR (cada numero carrega o proprio rotulo)

    prazo concedido -> titulos EMITIDOS no mes        (o que o comercial prometeu)
    PMR efetivo     -> titulos PAGOS no mes           (o que o cliente cumpriu)
    PMP             -> lancamentos LIQUIDADOS no mes  (o que a empresa pagou)

O titulo emitido em junho so vai ser pago em julho: "concedido de junho" e "PMR
de junho" falam de carteiras DIFERENTES. Os tres ficam lado a lado justamente
para o dono enxergar o descompasso — nunca para somar. Como o `atraso_medio` do
contrato (PMR - concedido) compara duas carteiras, o meta ainda devolve o atraso
medido sobre a MESMA carteira paga (`concedido_carteira_paga`), que e o numero
honesto quando alguem perguntar "atrasou quantos dias?".

★ PCPREST GUARDA CADEIAS DE ESTORNO/REEMISSAO: a mesma parcela reaparece com
PREST diferente ate 3 vezes. TODA consulta a PCPREST passa por
regras.filtro_titulo(). Medido no Oracle: sem o filtro o PMR do semestre cai de
24,94 para 24,28 dias (o BI diria que o cliente paga meio dia mais rapido do que
paga) e o vencido a receber ganha titulos que ja foram substituidos.
Data de emissao do titulo = DTEMISSAO (nao DTVENC menos prazo).

★ PRAZO CONCEDIDO SE MEDE POR DTVENCORIG, NUNCA POR DTVENC.
DTVENC e o vencimento VIGENTE: a rotina de prorrogacao do Winthor sobrescreve
esse campo e guarda o vencimento original em DTVENCORIG. Medir o concedido por
DTVENC faz TODA renegociacao posterior entrar na medida como se o comercial
tivesse prometido aquele prazo na venda — e o indicador existe justamente para
mostrar o descompasso entre o que foi prometido e o que foi cumprido. Medido no
Oracle (filial 1): mar/26 27,45 -> 24,66 dias (2,79 de inflacao) e jun/26
22,58 -> 21,69; na carteira PAGA de junho o concedido cai de 24,05 para 22,61 e
o atraso sobe de 5,75 para 7,20 dias — 25% de atraso que estava escondido.
Caso individual: cliente 81, plano "14 DIAS", vencimento 31/03 prorrogado para
13/07 e pago em 21/07 — por DTVENC o BI registrava 118 dias de prazo concedido e
8 de atraso; o boleto foi de 14 dias e o atraso real e de 112.
O volume prorrogado sai separado em meta.prorrogacao (73 titulos / R$ 93,6 mil
nos 6 meses fechados), que e a resposta a "o cliente atrasou ou eu que empurrei
o vencimento?". DTVENCORIG nunca vem nulo nesta base (0 de 2.998 titulos da
filial 1), mas o COALESCE fica como rede: sem ele um nulo zeraria o prazo.
Em /vencido e no aging continua valendo DTVENC — la o que importa e a data que
esta em vigor para cobrar, nao a que foi prometida.

★ PCLANC E O CONTAS A PAGAR DESTA BASE — nao existe PCPAGAR aqui.
Compra de mercadoria = CODCONTA 100001 (e o PMP que interessa ao dono, porque e
o unico comparavel ao PMR); CODFORNEC > 0 e "todos os fornecedores", que mistura
servico, frete e despesa e por isso puxa a media para baixo (47,6 contra 57,7
dias no semestre). TIPOLANC='P' e provisao — 225 lancamentos, R$ 751 mil, nunca
pagos; caem sozinhos porque DTPAGTO e nulo, mas o filtro continua escrito para
proteger quem reaproveitar este SQL num "a pagar em aberto".
Lancamentos de VPAGO negativo (46 no semestre, -R$ 228 mil, historico
"REF.ESTORN.BORDERO JA BAIXADO") sao os contra-lancamentos que anulam pagamentos
estornados: eles PERMANECEM na media ponderada, porque e assim que o estorno
cancela o pagamento original. Filtra-los levaria o PMP de junho de 63,5 para
62,7 dias contando pagamento que a empresa nao fez.

★ O QUE NAO ESTA AQUI, DE PROPOSITO (§8 fase 2 e §11 dos anti-padroes)
Projecao de fluxo de caixa, margem liquida vs. a meta de 7%, acompanhamento do
break-even e custo de antecipacao de recebiveis NAO sao esquecimento nem falta
de dado: dependem das despesas que so existem na base do BPO financeiro
(Vinicius, socio do Marcelo) e foram adiadas em reuniao para a rodada com ele.
Calcular com o que o Winthor tem hoje produziria um numero incompleto que o dono
usaria para decidir — pior do que nao ter. Nao "consertar" esta ausencia sem a
rodada com o BPO. O VOLUME de antecipacao de recebiveis (CODCOB='50') aparece
como informativo em /prazos: volume o Winthor sabe, custo nao.

NUMEROS MEDIDOS NO ORACLE DE PRODUCAO (filial 1, 2026-07-21) — servem de teste
de regressao para quem mexer neste arquivo:

    mes    | concedido(emitidos) | PMR(pagos) | PMP mercadoria | PMP geral
    2026-01|       23,92         |   16,72    |     55,67      |   42,15
    2026-02|       25,31         |   21,44    |     52,15      |   38,77
    2026-03|       24,66         |   24,58    |     45,66      |   32,92
    2026-04|       23,19         |   24,83    |     56,43      |   47,53
    2026-05|       22,66         |   21,24    |     59,68      |   50,81
    2026-06|       21,69         |   29,80    |     63,50      |   57,95
    6 meses|       23,40         |   24,94    |     57,66      |   47,64

(coluna "concedido" pelo vencimento ORIGINAL; por DTVENC os mesmos meses davam
24,21 · 25,52 · 27,45 · 23,33 · 22,63 · 22,58 e 24,25 no semestre.)

Junho e o retrato da dor: na carteira que foi PAGA em junho o boleto concedia
22,6 dias e o cliente pagou em 29,8 (7,2 dias de atraso), enquanto o fornecedor
de mercadoria foi pago em 63,5 — gap_caixa +33,7 dias. E no mesmo mes a empresa
antecipou R$ 63 mil em recebiveis.
"""
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query

from ..auth import require_user
from .. import calendario, consulta, regras

router = APIRouter(prefix="/api/financeiro", tags=["financeiro"], dependencies=[Depends(require_user)])

#: Plano de contas do a pagar: 100001 = compra de mercadoria. E o unico PMP
#: comparavel ao PMR, porque e a mesma mercadoria que virou a venda.
CONTA_COMPRA_MERCADORIA = 100001

#: Cobranca da antecipacao de recebiveis. Titulo valido (entra no filtro
#: canonico) — aqui so para medir o VOLUME antecipado, nunca o custo (fase 2).
COB_ANTECIPACAO = "50"

#: Faixas do aging. A faixa "1-30 dias" do BI antigo escondia o essencial:
#: medido em 2026-07-21, dos R$ 15,0 mil que ela mostrava, R$ 13,8 mil (92%)
#: estavam nos 15 primeiros dias — ou seja, quase todo o vencido e atraso fresco,
#: que se resolve com um telefonema, e nao inadimplencia velha, que e problema de
#: credito. Sao acoes diferentes, entao 1-15 e 16-30 vivem separadas.
FAIXAS = ["A vencer", "1-15 dias", "16-30 dias", "31-60 dias", "61-90 dias", "> 90 dias"]


# ---------------------------------------------------------------------------
# Parametros comuns (contrato: dt_ini, dt_fim, rcas, deptos)
# ---------------------------------------------------------------------------

def _periodo(dt_ini: date | None, dt_fim: date | None) -> tuple[date, date]:
    """Default = ultimo mes FECHADO. O ciclo do negocio e mensal fechado; um
    parcial do mes corrente no PMR daria a ilusao de que o cliente paga mais
    rapido, porque so os titulos de vencimento curto ja teriam sido pagos."""
    ini, fim = calendario.mes_fechado()
    return dt_ini or ini, dt_fim or fim


def _lista(csv: str | None, rotulo: str) -> list[int]:
    if not csv:
        return []
    try:
        return [int(p) for p in str(csv).replace(";", ",").split(",") if p.strip()]
    except ValueError:
        raise HTTPException(422, f"{rotulo} deve ser uma lista de inteiros separados por virgula")


def _meses(ini: date, fim: date) -> list[str]:
    """Chaves 'YYYY-MM' de ini ate fim, inclusive — a serie precisa mostrar o mes
    sem movimento como zero/nulo, e nao simplesmente sumir com ele."""
    saida, cur = [], calendario.primeiro_dia(ini)
    while cur <= fim:
        saida.append(cur.strftime("%Y-%m"))
        cur = calendario.primeiro_dia(cur + timedelta(days=32))
    return saida


def _f(v, casas: int = 2) -> float | None:
    return None if v is None else round(float(v), casas)


def _media(soma_dias_valor, soma_valor) -> float | None:
    """Media ponderada por valor. Sem valor nao ha prazo — devolve None em vez de
    zero, para o card exibir "sem dados" e nao "paga no ato"."""
    if not soma_valor:
        return None
    return round(float(soma_dias_valor) / float(soma_valor), 2)


def _prorrogacao(r: dict) -> dict:
    """Quanto do vencimento foi empurrado DEPOIS da emissao, na mesma janela.

    Numero irmao do prazo concedido: o concedido passou a ser medido pelo boleto
    original (DTVENCORIG), entao a renegociacao — que antes se disfarcava de
    "prazo longo concedido" — sai aqui explicita. E o que responde "o cliente
    atrasou ou fui eu que empurrei o vencimento?".
    """
    valor = float(r.get("valor_prorrogado") or 0)
    total = float(r.get("valor") or 0)
    return {
        "titulos": int(r.get("titulos_prorrogados") or 0),
        "valor": _f(valor),
        "valor_pct": round(100.0 * valor / total, 1) if total else None,
        # ponderado pelo valor prorrogado: quantos dias, em media, o vencimento andou
        "dias_empurrados_medio": _media(r.get("dias_empurrados"), valor),
    }


# ---------------------------------------------------------------------------
# 1) /prazos — concedido x PMR x PMP e o gap de caixa
# ---------------------------------------------------------------------------

def _sql_receber(por_mes: bool, filtro_rca: str, coluna_data: str) -> str:
    """Titulos do contas a receber agregados pela coluna de data escolhida.

    A MESMA query serve ao PMR (coluna dtpag) e ao prazo concedido (coluna
    dtemissao): as duas medidas so diferem na janela e no par de datas, e manter
    um SQL so garante que ambas usem exatamente o mesmo universo de titulos.
    Devolve as SOMAS (nao a media) para o chamador poder consolidar periodos.

    ★ O prazo concedido sai de DTVENCORIG (vencimento original do boleto), nao de
    DTVENC — ver o cabecalho do modulo. Junto vem o volume PRORROGADO da mesma
    janela, para o meta poder dizer quanto do vencimento a propria empresa
    empurrou: sem esse par de numeros lado a lado, um concedido mais curto pode
    ser lido como "vendemos mais a vista", quando foi renegociacao.
    """
    o = consulta.esquema()
    mes = f"to_char(date_trunc('month', t.{coluna_data}), 'YYYY-MM')"
    # COALESCE e rede de protecao: DTVENCORIG nulo (nao ocorre hoje) zeraria o prazo
    venc_orig = "COALESCE(t.dtvencorig, t.dtvenc)::date"
    prorrogado = f"t.dtvenc::date <> {venc_orig}"
    return f"""
        SELECT {mes if por_mes else "'total'"} AS mes,
               COUNT(*) AS titulos,
               SUM(t.valor) AS valor,
               SUM((t.dtpag::date  - t.dtemissao::date) * t.valor) AS dias_pago,
               SUM(({venc_orig} - t.dtemissao::date) * t.valor) AS dias_concedido,
               COUNT(CASE WHEN {prorrogado} THEN 1 END) AS titulos_prorrogados,
               SUM(CASE WHEN {prorrogado} THEN t.valor ELSE 0 END) AS valor_prorrogado,
               SUM(CASE WHEN {prorrogado} THEN (t.dtvenc::date - {venc_orig}) * t.valor
                        ELSE 0 END) AS dias_empurrados
        FROM {o}.pcprest t
        WHERE t.{coluna_data} >= :dt_ini AND t.{coluna_data} < :dt_fim_x
          AND t.dtemissao IS NOT NULL AND t.dtvenc IS NOT NULL
          AND {regras.filtro_titulo('t')}{filtro_rca}
        GROUP BY 1"""


def _sql_pagar(por_mes: bool) -> str:
    """Contas a pagar (PCLANC). Mercadoria (CODCONTA 100001) e "todos os
    fornecedores" saem na mesma varredura para nao divergirem de filtro."""
    o = consulta.esquema()
    mes = "to_char(date_trunc('month', l.dtpagto), 'YYYY-MM')"
    dias = "(l.dtpagto::date - l.dtemissao::date)"
    merc = f"l.codconta = {CONTA_COMPRA_MERCADORIA}"
    return f"""
        SELECT {mes if por_mes else "'total'"} AS mes,
               COUNT(CASE WHEN {merc} THEN 1 END) AS lancamentos,
               SUM(CASE WHEN {merc} THEN l.vpago ELSE 0 END) AS valor_merc,
               SUM(CASE WHEN {merc} THEN {dias} * l.vpago ELSE 0 END) AS dias_merc,
               SUM(CASE WHEN l.codfornec > 0 THEN l.vpago ELSE 0 END) AS valor_geral,
               SUM(CASE WHEN l.codfornec > 0 THEN {dias} * l.vpago ELSE 0 END) AS dias_geral
        FROM {o}.pclanc l
        WHERE l.dtpagto >= :dt_ini AND l.dtpagto < :dt_fim_x
          AND l.dtemissao IS NOT NULL
          AND l.codfilial = :filial
          AND l.dtcancel IS NULL
          AND COALESCE(l.lancexcluido, 'N') <> 'S'
          AND COALESCE(l.tipolanc, '') <> 'P'
        GROUP BY 1"""


@router.get("/prazos")
def prazos(dt_ini: date | None = None, dt_fim: date | None = None,
           rcas: str | None = None, deptos: str | None = None,
           meses: int = Query(6, ge=1, le=24)):
    """Prazo concedido x PMR efetivo x PMP, o gap de caixa e a serie mensal.

    Numero principal = periodo selecionado (default: ultimo mes fechado).
    A serie ao lado e SEMPRE de meses fechados, independente do periodo pedido —
    comparar um parcial com meses cheios inverteria a leitura da tendencia.
    """
    dt_ini, dt_fim = _periodo(dt_ini, dt_fim)
    lista_rcas = _lista(rcas, "rcas")
    lista_deptos = _lista(deptos, "deptos")
    filtro_rca = regras.clausula_rca(lista_rcas, "t")

    def binds(i: date, f: date) -> dict:
        b = regras.periodo_binds(i, f)
        if lista_rcas:
            b["rcas"] = list(lista_rcas)
        return b

    # ---- numero principal (periodo selecionado) ----
    pagos = consulta.consultar(_sql_receber(False, filtro_rca, "dtpag"), binds(dt_ini, dt_fim),
                               cache_key=f"fin:pmr:{dt_ini}:{dt_fim}:{lista_rcas}")
    emitidos = consulta.consultar(_sql_receber(False, filtro_rca, "dtemissao"), binds(dt_ini, dt_fim),
                                  cache_key=f"fin:conc:{dt_ini}:{dt_fim}:{lista_rcas}")
    # PMP nao tem RCA: uma duplicata de fornecedor nao pertence a vendedor nenhum.
    pagamentos = consulta.consultar(_sql_pagar(False), regras.periodo_binds(dt_ini, dt_fim),
                                    cache_key=f"fin:pmp:{dt_ini}:{dt_fim}")

    p = pagos[0] if pagos else {}
    e = emitidos[0] if emitidos else {}
    g = pagamentos[0] if pagamentos else {}

    pmr = _media(p.get("dias_pago"), p.get("valor"))
    concedido = _media(e.get("dias_concedido"), e.get("valor"))
    # concedido da MESMA carteira que foi paga: e contra ele que "atrasou X dias"
    # se sustenta (jun/26: boleto original 22,61 -> pago 29,80 -> atraso 7,20 d;
    # pelo vencimento vigente o mesmo mes mostrava 24,05 e escondia 1,45 dia).
    concedido_pago = _media(p.get("dias_concedido"), p.get("valor"))
    pmp = _media(g.get("dias_merc"), g.get("valor_merc"))
    pmp_geral = _media(g.get("dias_geral"), g.get("valor_geral"))

    # ---- serie de meses fechados ----
    fech_ini, fech_fim = calendario.mes_fechado()
    serie_ini = fech_ini
    for _ in range(meses - 1):
        serie_ini = calendario.primeiro_dia(calendario.mes_anterior(serie_ini))

    s_pagos = {r["mes"]: r for r in consulta.consultar(
        _sql_receber(True, filtro_rca, "dtpag"), binds(serie_ini, fech_fim),
        cache_key=f"fin:pmr:serie:{serie_ini}:{fech_fim}:{lista_rcas}")}
    s_emit = {r["mes"]: r for r in consulta.consultar(
        _sql_receber(True, filtro_rca, "dtemissao"), binds(serie_ini, fech_fim),
        cache_key=f"fin:conc:serie:{serie_ini}:{fech_fim}:{lista_rcas}")}
    s_pag = {r["mes"]: r for r in consulta.consultar(
        _sql_pagar(True), regras.periodo_binds(serie_ini, fech_fim),
        cache_key=f"fin:pmp:serie:{serie_ini}:{fech_fim}")}

    serie = []
    for m in _meses(serie_ini, fech_fim):
        a, b, c = s_pagos.get(m, {}), s_emit.get(m, {}), s_pag.get(m, {})
        serie.append({
            "mes": m,
            "pmr": _media(a.get("dias_pago"), a.get("valor")),
            "concedido": _media(b.get("dias_concedido"), b.get("valor")),
            "pmp": _media(c.get("dias_merc"), c.get("valor_merc")),
            "pmp_geral": _media(c.get("dias_geral"), c.get("valor_geral")),
            "valor_recebido": _f(a.get("valor") or 0),
            "valor_emitido": _f(b.get("valor") or 0),
            "valor_pago": _f(c.get("valor_merc") or 0),
        })

    # ---- antecipacao de recebiveis: VOLUME, informativo (custo e fase 2) ----
    ant = consulta.consultar(
        f"""SELECT COUNT(*) AS titulos,
                   COALESCE(SUM(t.valor), 0) AS valor,
                   COALESCE(SUM(CASE WHEN t.dtpag IS NULL THEN t.valor - COALESCE(t.vpago, 0) END), 0) AS em_aberto
            FROM {consulta.esquema()}.pcprest t
            WHERE t.dtemissao >= :dt_ini AND t.dtemissao < :dt_fim_x
              AND t.codcob = '{COB_ANTECIPACAO}'
              AND {regras.filtro_titulo('t')}{filtro_rca}""",
        binds(dt_ini, dt_fim), cache_key=f"fin:antecip:{dt_ini}:{dt_fim}:{lista_rcas}")
    ant = ant[0] if ant else {}

    fechado = dt_fim < calendario.primeiro_dia(date.today())
    return {
        "referencia": {
            "mes": dt_ini.strftime("%Y-%m"),
            "dt_ini": dt_ini.isoformat(),
            "dt_fim": dt_fim.isoformat(),
            "rotulo": f"{dt_ini.strftime('%d/%m/%Y')} a {dt_fim.strftime('%d/%m/%Y')}",
            "fechado": fechado,
        },
        "pmr": pmr,
        "prazo_concedido": concedido,
        "pmp": pmp,
        "pmp_geral": pmp_geral,
        # positivo = fornecedor financia a operacao; negativo = a empresa financia o cliente
        "gap_caixa": None if pmp is None or pmr is None else round(pmp - pmr, 2),
        "atraso_medio": None if pmr is None or concedido is None else round(pmr - concedido, 2),
        "serie": serie,
        "meta": {
            "fonte_pmp": f"PCLANC, CODCONTA {CONTA_COMPRA_MERCADORIA} (compra de mercadoria); "
                         "'todos os fornecedores' = CODFORNEC > 0; provisoes (TIPOLANC='P'), "
                         "lancamentos excluidos e cancelados ficam de fora",
            "fonte_pmr": "PCPREST com filtro canonico de titulo (sem estorno/reemissao/desdobramento)",
            "fonte_concedido": "PCPREST.DTVENCORIG - DTEMISSAO (vencimento ORIGINAL do boleto). "
                               "DTVENC e o vencimento vigente, reescrito pela prorrogacao, e por "
                               "isso nao mede prazo concedido; ele continua valendo no vencido e "
                               "no aging, onde a data que vale e a que esta em vigor.",
            "janela_pmr": "titulos PAGOS no periodo (DTPAG)",
            "janela_concedido": "titulos EMITIDOS no periodo (DTEMISSAO)",
            "janela_pmp": "lancamentos LIQUIDADOS no periodo (DTPAGTO)",
            "aviso_janelas": "As tres janelas cobrem carteiras diferentes: o titulo emitido no mes "
                             "so sera pago meses depois. Comparar, nunca somar.",
            "concedido_carteira_paga": concedido_pago,
            "atraso_carteira_paga": (None if pmr is None or concedido_pago is None
                                     else round(pmr - concedido_pago, 2)),
            # o outro lado do concedido: o prazo que a EMPRESA esticou depois da venda
            "prorrogacao": {
                "emitidos": _prorrogacao(e),
                "carteira_paga": _prorrogacao(p),
                "obs": "Titulos com vencimento reescrito depois da emissao (DTVENC <> DTVENCORIG). "
                       "O prazo concedido e medido pelo boleto ORIGINAL, entao a renegociacao nao "
                       "se disfarca de prazo concedido: aparece aqui, com o proprio numero.",
            },
            "titulos_recebidos": int(p.get("titulos") or 0),
            "valor_recebido": _f(p.get("valor") or 0),
            "titulos_emitidos": int(e.get("titulos") or 0),
            "valor_emitido": _f(e.get("valor") or 0),
            "lancamentos_pagos_mercadoria": int(g.get("lancamentos") or 0),
            "valor_pago_mercadoria": _f(g.get("valor_merc") or 0),
            "valor_pago_geral": _f(g.get("valor_geral") or 0),
            "serie": {"meses": meses, "dt_ini": serie_ini.isoformat(), "dt_fim": fech_fim.isoformat(),
                      "criterio": "apenas meses fechados"},
            "antecipacao": {
                "titulos": int(ant.get("titulos") or 0),
                "valor": _f(ant.get("valor") or 0),
                "em_aberto": _f(ant.get("em_aberto") or 0),
                "obs": "Volume antecipado (cobranca 50) no periodo. O CUSTO da antecipacao "
                       "depende das taxas que estao na base do BPO financeiro e nao e calculado aqui.",
            },
            "filtro_rca": lista_rcas or None,
            "aviso_rca": ("O filtro de RCA foi aplicado ao contas a RECEBER (PMR e prazo concedido). "
                          "O PMP e da empresa inteira: duplicata de fornecedor nao tem vendedor, "
                          "entao o gap de caixa mistura carteira do RCA com pagamento global."
                          if lista_rcas else None),
            "aviso_depto": ("Filtro de departamento ignorado: um titulo do contas a receber cobre a "
                            "nota inteira e nao se reparte por departamento do produto."
                            if lista_deptos else None),
        },
    }


# ---------------------------------------------------------------------------
# 2) /vencido — card de DESTAQUE da aba (metrica fundamental de saude de caixa)
# ---------------------------------------------------------------------------

@router.get("/vencido")
def vencido(rcas: str | None = None, deptos: str | None = None,
            limite: int = Query(10, ge=1, le=50)):
    """Vencido a receber: total, titulos, a vencer, aging e maiores devedores.

    Snapshot (posicao de HOJE), nao periodo: o dono pergunta "quanto ja venceu e
    nao entrou?", e a resposta e sempre agora. Por isso este endpoint ignora
    dt_ini/dt_fim de proposito — datar o vencido daria um numero que ja nasceu
    velho. Saldo = VALOR - VPAGO (pagamento parcial deixa saldo em aberto).
    """
    lista_rcas = _lista(rcas, "rcas")
    lista_deptos = _lista(deptos, "deptos")
    filtro_rca = regras.clausula_rca(lista_rcas, "t")
    o = consulta.esquema()
    b: dict = {"filial": regras.FILIAL}
    if lista_rcas:
        b["rcas"] = list(lista_rcas)

    # `dtvenc IS NOT NULL` protege o ELSE do CASE: sem isso um vencimento nulo
    # cairia silenciosamente na faixa "> 90 dias" e inventaria inadimplencia.
    faixa = """CASE WHEN t.dtvenc::date >= CURRENT_DATE THEN 0
                    WHEN CURRENT_DATE - t.dtvenc::date <= 15 THEN 1
                    WHEN CURRENT_DATE - t.dtvenc::date <= 30 THEN 2
                    WHEN CURRENT_DATE - t.dtvenc::date <= 60 THEN 3
                    WHEN CURRENT_DATE - t.dtvenc::date <= 90 THEN 4
                    ELSE 5 END"""
    linhas = consulta.consultar(
        f"""SELECT {faixa} AS ordem,
                   COUNT(*) AS titulos,
                   SUM(t.valor - COALESCE(t.vpago, 0)) AS valor
            FROM {o}.pcprest t
            WHERE t.dtpag IS NULL
              AND t.dtvenc IS NOT NULL
              AND {regras.filtro_titulo('t')}{filtro_rca}
            GROUP BY 1
            ORDER BY 1""",
        b, cache_key=f"fin:aging:{lista_rcas}")

    por_ordem = {int(r["ordem"]): r for r in linhas}
    aging = [{"faixa": FAIXAS[i],
              "titulos": int(por_ordem.get(i, {}).get("titulos") or 0),
              "valor": _f(por_ordem.get(i, {}).get("valor") or 0)}
             for i in range(len(FAIXAS))]

    vencidas = aging[1:]
    total = round(sum(f["valor"] for f in vencidas), 2)
    titulos = sum(f["titulos"] for f in vencidas)
    a_vencer = aging[0]["valor"]

    top = consulta.consultar(
        f"""SELECT t.codcli,
                   c.cliente,
                   t.codusur,
                   {regras.nome_rca()} AS rca,
                   COUNT(*) AS titulos,
                   SUM(t.valor - COALESCE(t.vpago, 0)) AS valor,
                   MAX(CURRENT_DATE - t.dtvenc::date) AS dias_atraso
            FROM {o}.pcprest t
            LEFT JOIN {o}.pcclient c ON c.codcli = t.codcli
            LEFT JOIN {o}.pcusuari u ON u.codusur = t.codusur
            WHERE t.dtpag IS NULL
              AND t.dtvenc::date < CURRENT_DATE
              AND {regras.filtro_titulo('t')}{filtro_rca}
            GROUP BY t.codcli, c.cliente, t.codusur, u.nome
            ORDER BY 6 DESC
            LIMIT :limite""",
        {**b, "limite": limite}, cache_key=f"fin:top-devedor:{lista_rcas}:{limite}")

    fresco = aging[1]["valor"]
    return {
        "total": total,
        "titulos": titulos,
        "a_vencer": a_vencer,
        "aging": aging,
        "top": [{"codcli": r["codcli"], "cliente": r["cliente"], "codusur": r["codusur"],
                 "rca": r["rca"], "titulos": int(r["titulos"]), "valor": _f(r["valor"]),
                 "dias_atraso": int(r["dias_atraso"])} for r in top],
        "meta": {
            "posicao": date.today().isoformat(),
            "criterio": "titulos em aberto (DTPAG nulo) com filtro canonico de titulo; "
                        "saldo = VALOR - VPAGO",
            "carteira_aberta": round(total + a_vencer, 2),
            # a leitura que muda a acao: atraso fresco se cobra por telefone,
            # atraso velho ja e problema de credito
            "ate_15_dias": fresco,
            "ate_15_dias_pct": round(100.0 * fresco / total, 1) if total else None,
            "vencido_sobre_carteira_pct": (round(100.0 * total / (total + a_vencer), 1)
                                           if (total + a_vencer) else None),
            "filtro_rca": lista_rcas or None,
            "aviso_depto": ("Filtro de departamento ignorado: o titulo cobre a nota inteira e nao "
                            "se reparte por departamento do produto." if lista_deptos else None),
        },
    }


# ---------------------------------------------------------------------------
# 3) /faturamento-por-prazo — relatorio 14 da rotina 1464
# ---------------------------------------------------------------------------

@router.get("/faturamento-por-prazo")
def faturamento_por_prazo(dt_ini: date | None = None, dt_fim: date | None = None,
                          rcas: str | None = None, deptos: str | None = None):
    """Faturamento LIQUIDO por plano de pagamento (relatorio 14 da rotina 1464).

    ★ NUNCA usar PCNFSAID.VLTOTAL aqui. A capa carrega as remessas de comodato,
    que nao sao venda e caem todas no plano "A VISTA": medido no semestre, a capa
    da R$ 294.059,38 em A VISTA contra R$ 65.455,77 do item — R$ 228.603,61 de
    inflacao (350%) concentrados no plano que o dono usa para julgar se esta
    vendendo a prazo demais. Fonte correta = item (PCMOV), medida canonica de
    faturamento liquido.

    ★ A devolucao (CODOPER='ED') NAO tem CODPLPAG preenchido — 0 de 178 linhas do
    semestre. Sem re-vinculo, a devolucao ficaria toda numa linha "sem plano" e
    o liquido por prazo seria so o bruto disfarcado. O re-vinculo sai de
    PCMOV.NUMPED -> PCPEDC.CODPLPAG, e foi conferido: as 178 linhas ED acharam o
    pedido de origem, com o MESMO cliente e o MESMO RCA em 178/178, e o pedido
    sempre anterior a devolucao (1 a 48 dias, media 6,6). Nas vendas o plano do
    item e o plano do pedido coincidem em 5.791/5.791 linhas, entao o COALESCE
    nao troca a classificacao de nenhuma venda.
    O que nao encontrar vinculo NAO e rateado: vai para `devolucao_sem_vinculo`
    no meta, explicito. Nao inventar precisao que o dado nao tem.
    """
    dt_ini, dt_fim = _periodo(dt_ini, dt_fim)
    lista_rcas = _lista(rcas, "rcas")
    lista_deptos = _lista(deptos, "deptos")
    o = consulta.esquema()

    # PCPRODUT so entra quando ha filtro de departamento: um JOIN a mais so
    # arrisca derrubar linha de produto ausente do cadastro sem ganhar nada.
    join_prod = f"\n            JOIN {o}.pcprodut p ON p.codprod = m.codprod" if lista_deptos else ""
    plano = "COALESCE(m.codplpag, c.codplpag)"

    binds = {**regras.periodo_binds(dt_ini, dt_fim), **regras.binds_dimensao(lista_rcas, lista_deptos)}
    rows = consulta.consultar(
        f"""SELECT x.codplpag,
                   pl.descricao,
                   pl.numdias,
                   x.bruto,
                   x.devolucao,
                   x.liquido
            FROM (SELECT {plano} AS codplpag,
                         {regras.valor_bruto('m')} AS bruto,
                         {regras.valor_devolucao('m')} AS devolucao,
                         {regras.valor_liquido('m')} AS liquido
                  FROM {o}.pcmov m
                  LEFT JOIN {o}.pcpedc c ON c.numped = m.numped{join_prod}
                  WHERE {regras.filtro_venda('m')}
                    {regras.clausula_rca(lista_rcas, 'm')}{regras.clausula_depto(lista_deptos, 'p')}
                  GROUP BY 1) x
            LEFT JOIN {o}.pcplpag pl ON pl.codplpag = x.codplpag
            ORDER BY pl.numdias NULLS LAST, x.codplpag NULLS LAST""",
        binds, cache_key=f"fin:por-prazo:{dt_ini}:{dt_fim}:{lista_rcas}:{lista_deptos}")

    saida, sem_vinculo_dev, sem_vinculo_bruto = [], 0.0, 0.0
    for r in rows:
        if r["codplpag"] is None:
            sem_vinculo_dev += float(r["devolucao"] or 0)
            sem_vinculo_bruto += float(r["bruto"] or 0)
            continue
        saida.append({
            "codplpag": int(r["codplpag"]),
            "descricao": (r["descricao"] or f"PLANO {r['codplpag']}").strip(),
            "numdias": None if r["numdias"] is None else int(r["numdias"]),
            "bruto": _f(r["bruto"]),
            "devolucao": _f(r["devolucao"]),
            "liquido": _f(r["liquido"]),
        })

    liquido_vinculado = sum(l["liquido"] for l in saida)
    for l in saida:
        l["participacao_pct"] = (round(100.0 * l["liquido"] / liquido_vinculado, 2)
                                 if liquido_vinculado else None)

    bruto_total = sum(l["bruto"] for l in saida) + sem_vinculo_bruto
    dev_total = sum(l["devolucao"] for l in saida) + sem_vinculo_dev
    # prazo medio praticado, ponderado pelo liquido — mesma leitura do PMR, mas
    # do lado do que foi VENDIDO (o PMR olha o que foi RECEBIDO)
    com_dias = [l for l in saida if l["numdias"] is not None and l["liquido"] > 0]
    base = sum(l["liquido"] for l in com_dias)
    prazo_medio = round(sum(l["numdias"] * l["liquido"] for l in com_dias) / base, 2) if base else None

    return {
        "rows": saida,
        "meta": {
            "periodo": {"dt_ini": dt_ini.isoformat(), "dt_fim": dt_fim.isoformat(),
                        "fechado": dt_fim < calendario.primeiro_dia(date.today())},
            "fonte": "PCMOV (item), CODOPER S/ED — plano do item, com a devolucao re-vinculada "
                     "ao plano do pedido de origem (PCPEDC.NUMPED)",
            "total_bruto": round(bruto_total, 2),
            "total_devolucao": round(dev_total, 2),
            "total_liquido": round(bruto_total - dev_total, 2),
            "total_liquido_vinculado": round(liquido_vinculado, 2),
            # linha explicita: e o quanto do liquido do periodo NAO foi possivel
            # atribuir a um prazo. Some com total_liquido_vinculado = total_liquido.
            "devolucao_sem_vinculo": round(sem_vinculo_dev, 2),
            "devolucao_vinculada_pct": (round(100.0 * (dev_total - sem_vinculo_dev) / dev_total, 1)
                                        if dev_total else None),
            "bruto_sem_vinculo": round(sem_vinculo_bruto, 2),
            "prazo_medio_praticado": prazo_medio,
            "participacao_base": "liquido vinculado a um plano de pagamento",
            "planos": len(saida),
            "filtro_rca": lista_rcas or None,
            "filtro_depto": lista_deptos or None,
        },
    }
