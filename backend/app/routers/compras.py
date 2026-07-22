"""Aba Compras e sub-aba Estoque — a folha de papel do comprador virando sugestao.

O Winthor NAO sugere reposicao. Hoje o comprador anota as saidas numa folha de
papel e calcula a reposicao por achismo; o BI so cumpre o papel quando essa folha
for aposentada. Este modulo entrega os quatro numeros que a substituem: demanda
do mes fechado, curva ABC, sugestao de compra de 45 dias e o estoque com o
TRANCADO exposto.

★ APRENDIZADOS CAROS (medidos no Oracle de producao em 2026-07-21, filial 1)

1. DIAS UTEIS — a demanda diaria divide pelos dias uteis do calendario canonico
   (calendario.py), nunca por dias corridos e nunca pela PCDIASUTEIS do ERP.
   Em jun/2026 a PCDIASUTEIS conta 22 dias porque ignora Corpus Christi (04/06);
   o calendario conta 21. Sao 4,8% de diferenca que viram R$ 15 mil na sugestao
   da curva A: R$ 214.084,83 com 22 dias contra R$ 229.212,53 com 21.

2. JANELA — a demanda e sempre a do ULTIMO MES FECHADO, nunca "ultimos 30 dias"
   (§10). O mes corrente entra so como contexto no meta, PROJETADO por dias uteis
   (§7); o parcial cru mentiria para menos todo dia 5.
   Nao basta o DEFAULT do parametro: a barra de filtro global sempre emite
   dt_ini/dt_fim, entao qualquer preset movel (7d/30d/90d/180d, "Mes corrente")
   chegava aqui e virava a demanda de reposicao. Por isso `_periodo()` NORMALIZA
   o que recebe para um mes fechado inteiro e declara o ajuste em
   `meta.ajuste_periodo` — a regra mora no endpoint, nao na tela.

3. CURVA ABC — em jun/2026 a curva A tem 41 SKUs e 80,36% do liquido, dominada
   por Higiene Pessoal (papeis) 48,3% e Quimicos 37,1% = 85,4% da propria curva.
   Linhas de valor liquido <= 0 (devolucao maior que a venda) NAO entram na
   acumulacao: incluidas, o acumulado passa de 100% e a curva perde o sentido.
   Elas vao para meta.negativos, visiveis mas fora do ranking.

4. PENDENTE DE COMPRA — PCITEM soma ZERO pendente hoje (355 pedidos, 1.604 itens,
   QTENTREGUE = QTPEDIDA em todos): a operacao lanca o pedido DEPOIS de receber a
   mercadoria. Isso nao e bug do BI e precisa ficar visivel no meta, senao o
   comprador acha que o BI perdeu o que esta em transito. PCPEDIDO tambem nao tem
   coluna de situacao utilizavel (DTENTRADAESTOQUE e DTCHEGADA vem nulas nos 355
   pedidos), entao o filtro de "em aberto" e o proprio saldo QTPEDIDA-QTENTREGUE.

5. TRANCADO — QTINDENIZ (avaria) esta CONTIDO em QTBLOQUEADA, entao trancado pela
   gestao = QTBLOQUEADA - QTINDENIZ (regras.TRANCADO_GESTAO). Somar os dois
   contaria a avaria duas vezes. O trancado nunca entra no disponivel e nunca
   some da tela: o BI existe para o dono ver o que o time de vendas nao ve.
   Caso de teste: CODPROD 197 (toalha rolo) — fisico 52, trancado 52, disponivel
   ZERO e 7,1 dias de demanda trancados (perto do padrao de ~1 semana do dono).

★ O SQL deste modulo e POSTGRES (espelho `winthor`), como o resto dos routers.
  A classificacao ABC e feita em Python de proposito: sao no maximo ~500 produtos,
  e uma unica implementacao da curva serve /demanda, /curva-abc e /sugestao sem
  risco de as tres divergirem.
"""
import logging
import math
from datetime import date, timedelta
from typing import Literal

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ..auth import require_user
from .. import calendario, consulta, pg, regras
from .meta import DEPTO_AGREGADOR

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/compras", tags=["compras"], dependencies=[Depends(require_user)])

MSG_SEM_APP = ("Parametrização de lead time indisponível: o schema `app` do Postgres não está "
               "acessível. As demais telas de Compras continuam funcionando (o lead time apenas "
               "fica em branco); as tabelas são criadas no start da API.")

#: "Se a empresa crescer mais 50% de repente, a operacao trava" — avaliacao do
#: dono. O faturamento ja saltou ~72% de fev para mar/2026 e quebrou a previsao
#: manual, entao o BI sinaliza a variacao em vez de projetar cegamente (§10).
LIMIAR_VARIACAO_PCT = 50.0
CENARIO_CRESCIMENTO = 1.5

#: O alerta de variacao so vale para item que pesa na operacao. Sem esse corte,
#: jun x mai/2026 acusaria 245 alertas em 316 produtos (um item que passou de 1
#: para 2 unidades vira "+100%") e o comprador ignoraria a tela inteira. Com o
#: corte sobram 112, todos de curva A ou B em um dos dois meses.
CLASSES_RELEVANTES = ("A", "B")

LIMITE_PADRAO = 2000

MESES_PT = ["", "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]


# ---------------------------------------------------------------------------
# Parametros comuns
# ---------------------------------------------------------------------------

def _lista_int(valor: str | None) -> list[int]:
    """csv de inteiros ("1,3") -> [1, 3]. Vazio = todos."""
    if not valor:
        return []
    try:
        return [int(p) for p in str(valor).split(",") if p.strip() != ""]
    except ValueError:
        raise HTTPException(422, f"Lista invalida: {valor} (use inteiros separados por virgula)")


def _f(v) -> float:
    """Decimal do psycopg -> float. None vira 0.0 (soma nao pode carregar None)."""
    return 0.0 if v is None else float(v)


def _mes_cheio(dt_ini: date, dt_fim: date) -> bool:
    return dt_ini.day == 1 and dt_fim == calendario.ultimo_dia(dt_ini)


def _rotulo(dt_ini: date, dt_fim: date) -> str:
    if _mes_cheio(dt_ini, dt_fim):
        return f"{MESES_PT[dt_ini.month]}/{dt_ini.year}"
    return f"{dt_ini.strftime('%d/%m/%Y')} a {dt_fim.strftime('%d/%m/%Y')}"


def _mes_fechado_de(dt_fim: date, hoje: date) -> tuple[date, date]:
    """Mes FECHADO de referencia para uma janela que termina em `dt_fim`.

    Se `dt_fim` ja e anterior ao mes corrente, o proprio mes dele esta fechado e
    e o mais recente contido na janela pedida. Caso contrario (janela que encosta
    no mes corrente ou no futuro) vale o ultimo mes fechado de hoje.
    """
    if dt_fim < calendario.primeiro_dia(hoje):
        return calendario.primeiro_dia(dt_fim), calendario.ultimo_dia(dt_fim)
    return calendario.mes_fechado(hoje)


def _periodo(dt_ini: date | None, dt_fim: date | None) -> tuple[date, date, dict | None]:
    """Default = ultimo mes FECHADO, e NORMALIZA qualquer periodo recebido para um
    mes fechado inteiro. Devolve (ini, fim, ajuste) — `ajuste` e None quando nada
    mudou.

    ★ APRENDIZADO CARO — POR QUE NAO BASTA O DEFAULT
    A barra de filtro global oferece 7d/30d/90d/180d e "Mes corrente", e o front
    SEMPRE emite dt_ini/dt_fim: o default nunca era alcancado e um clique em "30d"
    transformava a demanda de reposicao numa JANELA MOVEL — o anti-padrao literal
    do §10/§11 ("Calcular demanda de compras por janela movel de 30 dias"). Medido
    na producao em 2026-07-21: a curva A caia de R$ 230.374,21 (jun/2026 fechado,
    21 dias uteis) para R$ 214.892,04 no preset "30d" (22/06 a 21/07, 22 dias uteis
    de DOIS meses) e para R$ 202.829,69 em "Mes corrente" — e a tela continuava
    escrita "Demanda do mes fechado". Esconder os presets no front resolveria a
    tela de hoje, mas o endpoint e publico e a proxima tela repetiria o erro: a
    regra mora aqui.

    Nao se recusa com 422 de proposito: 422 quebraria a aba inteira a cada clique
    num preset que a propria barra oferece. O BI normaliza, entrega o numero certo
    e DECLARA o ajuste em `meta.ajuste_periodo` para a tela avisar o usuario.

    Mes fechado inteiro pedido explicitamente (ex.: mar/2026) passa intacto — o
    comprador precisa poder olhar um mes passado especifico.
    """
    hoje = date.today()
    padrao_ini, padrao_fim = calendario.mes_fechado(hoje)
    if dt_ini is None and dt_fim is None:
        return padrao_ini, padrao_fim, None

    # meia janela ("so dt_fim") vira o mes daquela data, nunca uma mistura do
    # default com a data recebida — que produziria dt_fim < dt_ini sem sentido
    pedido_ini = dt_ini or calendario.primeiro_dia(dt_fim)
    pedido_fim = dt_fim or calendario.ultimo_dia(dt_ini)
    if pedido_fim < pedido_ini:
        raise HTTPException(422, "dt_fim anterior a dt_ini")

    if _mes_cheio(pedido_ini, pedido_fim) and pedido_fim < calendario.primeiro_dia(hoje):
        return pedido_ini, pedido_fim, None

    alvo_ini, alvo_fim = _mes_fechado_de(pedido_fim, hoje)
    ajuste = {
        "ajustado": True,
        "solicitado": {
            "dt_ini": pedido_ini.isoformat(),
            "dt_fim": pedido_fim.isoformat(),
            "rotulo": _rotulo(pedido_ini, pedido_fim),
        },
        "aplicado": {
            "dt_ini": alvo_ini.isoformat(),
            "dt_fim": alvo_fim.isoformat(),
            "rotulo": _rotulo(alvo_ini, alvo_fim),
        },
        "motivo": (f"A demanda de compras é sempre a do último mês FECHADO (§10) — janela móvel "
                   f"é anti-padrão. O período pedido ({_rotulo(pedido_ini, pedido_fim)}) foi "
                   f"ajustado para {_rotulo(alvo_ini, alvo_fim)}."),
    }
    return alvo_ini, alvo_fim, ajuste


def _periodo_anterior(dt_ini: date, dt_fim: date) -> tuple[date, date]:
    """Mes cheio compara com o mes cheio anterior (30 dias antes de 01/06 cairia
    em 02/05 e cortaria um dia de venda). Periodo livre compara com a janela
    imediatamente anterior de mesmo tamanho.

    Depois que `_periodo()` passou a normalizar tudo para mes fechado, o ramo de
    periodo livre so sobrevive como rede de seguranca (nenhum endpoint chega aqui
    com janela solta) — nao apagado para o helper continuar correto se alguem
    reusa-lo fora do fluxo dos quatro endpoints.
    """
    if _mes_cheio(dt_ini, dt_fim):
        ant_fim = dt_ini - timedelta(days=1)
        return calendario.primeiro_dia(ant_fim), ant_fim
    dias = (dt_fim - dt_ini).days + 1
    return dt_ini - timedelta(days=dias), dt_ini - timedelta(days=1)


def _descricao_periodo(dt_ini: date, dt_fim: date) -> dict:
    hoje = date.today()
    return {
        "mes": dt_ini.strftime("%Y-%m") if _mes_cheio(dt_ini, dt_fim) else None,
        "dt_ini": dt_ini.isoformat(),
        "dt_fim": dt_fim.isoformat(),
        "rotulo": _rotulo(dt_ini, dt_fim),
        "mes_cheio": _mes_cheio(dt_ini, dt_fim),
        "fechado": dt_fim < calendario.primeiro_dia(hoje),
        "dias_uteis": calendario.dias_uteis(dt_ini, dt_fim),
    }


# ---------------------------------------------------------------------------
# Curva ABC (uma unica implementacao para os tres endpoints)
# ---------------------------------------------------------------------------

def _curva_abc(linhas: list[dict], chave: str, sufixo: str = "") -> dict:
    """Classifica in-place por acumulado do criterio `chave` (valor ou quantidade).

    A = ate 80% acumulado, B = 80-95%, C = resto (regras.CURVA_*_CORTE_PCT). O item
    que ATRAVESSA o corte fica na classe de baixo — por isso a comparacao usa o
    acumulado ANTERIOR ao item; do contrario a curva A perderia justamente o item
    que fecha os 80%.

    Linhas com criterio <= 0 ficam FORA (classe None): sao devolucao liquida, e
    somadas no acumulado empurrariam o total acima de 100%.
    """
    classe_k, share_k, acum_k = f"classe_abc{sufixo}", f"share_pct{sufixo}", f"acumulado_pct{sufixo}"
    for l in linhas:
        l[classe_k] = None
        l[share_k] = None
        l[acum_k] = None

    positivos = sorted((l for l in linhas if l.get(chave, 0) > 0),
                       key=lambda l: (-l[chave], l["codprod"]))
    total = sum(l[chave] for l in positivos)
    corte_a = regras.CURVA_A_CORTE_PCT / 100.0 * total
    corte_b = regras.CURVA_B_CORTE_PCT / 100.0 * total

    acum = 0.0
    contagem = {"A": 0, "B": 0, "C": 0}
    for l in positivos:
        anterior = acum
        acum += l[chave]
        classe = "A" if anterior < corte_a else "B" if anterior < corte_b else "C"
        l[classe_k] = classe
        contagem[classe] += 1
        if total:
            l[share_k] = round(100.0 * l[chave] / total, 4)
            l[acum_k] = round(100.0 * acum / total, 4)

    return {
        "criterio": chave,
        "total": round(total, 2),
        "skus": len(positivos),
        "skus_a": contagem["A"],
        "skus_b": contagem["B"],
        "skus_c": contagem["C"],
        "corte_a_pct": regras.CURVA_A_CORTE_PCT,
        "corte_b_pct": regras.CURVA_B_CORTE_PCT,
        "fora_da_curva": sum(1 for l in linhas if l[classe_k] is None),
    }


# ---------------------------------------------------------------------------
# Fonte de dados: movimento, estoque, pedido de compra e lead time
# ---------------------------------------------------------------------------

def _sql_movimento(rcas: list[int], deptos: list[int]) -> str:
    """Demanda do periodo e do periodo anterior numa varredura so.

    O intervalo vai de :dt_ant_ini a :dt_fim_x e e partido em dois pelo CASE em
    :dt_ini — os dois periodos sao sempre contiguos (ver _periodo_anterior).
    Comparar com `< :dt_fim_x` em vez de BETWEEN preserva o ultimo dia mesmo com
    DTMOV chegando como timestamp no espelho.
    """
    esq = consulta.esquema()
    return f"""
WITH mov AS (
  SELECT m.codprod,
         SUM(CASE WHEN m.dtmov >= :dt_ini
                  THEN CASE WHEN m.codoper = 'S' THEN m.qt ELSE -m.qt END ELSE 0 END) AS qt_liquida,
         SUM(CASE WHEN m.dtmov >= :dt_ini
                  THEN CASE WHEN m.codoper = 'S' THEN m.qt * m.punit
                            ELSE -(m.qt * m.punit) END ELSE 0 END)                    AS valor_liquido,
         SUM(CASE WHEN m.dtmov >= :dt_ini AND m.codoper = 'S'
                  THEN m.qt * m.punit ELSE 0 END)                                     AS bruto,
         SUM(CASE WHEN m.dtmov >= :dt_ini AND m.codoper = 'ED'
                  THEN m.qt * m.punit ELSE 0 END)                                     AS devolucao,
         SUM(CASE WHEN m.dtmov < :dt_ini
                  THEN CASE WHEN m.codoper = 'S' THEN m.qt ELSE -m.qt END ELSE 0 END) AS qt_anterior,
         SUM(CASE WHEN m.dtmov < :dt_ini
                  THEN CASE WHEN m.codoper = 'S' THEN m.qt * m.punit
                            ELSE -(m.qt * m.punit) END ELSE 0 END)                    AS valor_anterior
    FROM {esq}.pcmov m
    JOIN {esq}.pcprodut p ON p.codprod = m.codprod
   WHERE {regras.filtro_venda('m', periodo=False)}
     AND m.dtmov >= :dt_ant_ini AND m.dtmov < :dt_fim_x
     {regras.clausula_rca(rcas, 'm')}{regras.clausula_depto(deptos, 'p')}
   GROUP BY m.codprod
)
SELECT v.codprod, p.descricao, p.codepto, p.codsec, p.codfornec,
       d.descricao AS departamento, s.descricao AS secao, f.fornecedor,
       v.qt_liquida, v.valor_liquido, v.bruto, v.devolucao,
       v.qt_anterior, v.valor_anterior
  FROM mov v
  JOIN {esq}.pcprodut p ON p.codprod = v.codprod
  LEFT JOIN {esq}.pcdepto d ON d.codepto = p.codepto
  LEFT JOIN {esq}.pcsecao s ON s.codsec = p.codsec
  LEFT JOIN {esq}.pcfornec f ON f.codfornec = p.codfornec
"""


def _linhas_demanda(dt_ini: date, dt_fim: date, rcas: list[int],
                    deptos: list[int]) -> tuple[list[dict], dict]:
    """Produtos com movimento no periodo OU no periodo anterior, ja classificados.

    Devolve as linhas e o resumo da curva ABC por valor do periodo.

    Quem vendeu so no mes anterior entra com quantidade zero de proposito: e
    exatamente o produto que "parou" e que o comprador precisa ver.
    """
    dt_ant_ini, _ = _periodo_anterior(dt_ini, dt_fim)
    binds = regras.periodo_binds(dt_ini, dt_fim)
    binds["dt_ant_ini"] = dt_ant_ini
    binds.update(regras.binds_dimensao(rcas, deptos))
    chave = f"compras:mov:{dt_ini}:{dt_fim}:{rcas}:{deptos}"
    brutas = consulta.consultar(_sql_movimento(rcas, deptos), binds, cache_key=chave)

    linhas = [{
        "codprod": int(r["codprod"]),
        "descricao": r["descricao"],
        "codepto": r["codepto"],
        "departamento": r["departamento"],
        "codsec": r["codsec"],
        "secao": r["secao"],
        "codfornec": r["codfornec"],
        "fornecedor": r["fornecedor"],
        "qt_liquida": round(_f(r["qt_liquida"]), 3),
        "valor_liquido": round(_f(r["valor_liquido"]), 2),
        "bruto": round(_f(r["bruto"]), 2),
        "devolucao": round(_f(r["devolucao"]), 2),
        # ★ separa "nao teve movimento no periodo" de "teve movimento e o
        # liquido deu <= 0". Sem essa distincao os 83 produtos que so venderam
        # no mes anterior apareciam como devolucao liquida na curva ABC.
        "movimentou": _f(r["bruto"]) > 0 or _f(r["devolucao"]) > 0,
        "qt_liquida_anterior": round(_f(r["qt_anterior"]), 3),
        "valor_liquido_anterior": round(_f(r["valor_anterior"]), 2),
    } for r in brutas]

    resumo = _curva_abc(linhas, "valor_liquido")
    _curva_abc(linhas, "valor_liquido_anterior", sufixo="_anterior")
    return linhas, resumo


def _linhas_estoque(deptos: list[int]) -> list[dict]:
    """Snapshot de PCEST da filial, com as quatro quantidades separadas."""
    esq = consulta.esquema()
    sql = f"""
SELECT e.codprod, p.descricao, p.codepto, p.codsec, p.codfornec,
       d.descricao AS departamento, s.descricao AS secao,
       COALESCE(e.qtest, 0)      AS fisico,
       COALESCE(e.qtreserv, 0)   AS reservado,
       {regras.TRANCADO_GESTAO}  AS trancado,
       {regras.AVARIA}           AS avaria,
       COALESCE(e.qtpendente, 0) AS pendente_venda,
       {regras.DISPONIVEL_VENDA} AS disponivel,
       COALESCE(e.custoreal, 0)  AS custo
  FROM {esq}.pcest e
  JOIN {esq}.pcprodut p ON p.codprod = e.codprod
  LEFT JOIN {esq}.pcdepto d ON d.codepto = p.codepto
  LEFT JOIN {esq}.pcsecao s ON s.codsec = p.codsec
 WHERE e.codfilial = :filial{regras.clausula_depto(deptos, 'p')}
"""
    binds = {"filial": regras.FILIAL}
    binds.update(regras.binds_dimensao(None, deptos))
    rows = consulta.consultar(sql, binds, cache_key=f"compras:est:{deptos}")
    return [{
        "codprod": int(r["codprod"]),
        "descricao": r["descricao"],
        "codepto": r["codepto"],
        "departamento": r["departamento"],
        "codsec": r["codsec"],
        "secao": r["secao"],
        "codfornec": r["codfornec"],
        "fisico": round(_f(r["fisico"]), 3),
        "reservado": round(_f(r["reservado"]), 3),
        "trancado": round(_f(r["trancado"]), 3),
        "avaria": round(_f(r["avaria"]), 3),
        "pendente_venda": round(_f(r["pendente_venda"]), 3),
        "disponivel": round(_f(r["disponivel"]), 3),
        "custo": round(_f(r["custo"]), 4),
    } for r in rows]


def _mapa_pendente_compra() -> tuple[dict[int, float], int]:
    """Quantidade ja comprada e ainda nao recebida, por produto (PCITEM).

    Nao ha coluna de situacao utilizavel em PCPEDIDO (DTENTRADAESTOQUE e
    DTCHEGADA vem nulas nos 355 pedidos da base), entao o proprio saldo
    QTPEDIDA - QTENTREGUE define o que esta em aberto. Hoje o resultado e
    sempre ZERO porque o pedido e lancado depois do recebimento — o meta do
    /sugestao avisa isso em vez de deixar o comprador achar que o BI errou.
    """
    esq = consulta.esquema()
    sql = f"""
SELECT i.codprod,
       SUM(GREATEST(COALESCE(i.qtpedida, 0) - COALESCE(i.qtentregue, 0), 0)) AS pendente,
       COUNT(DISTINCT i.numped) AS pedidos
  FROM {esq}.pcitem i
  JOIN {esq}.pcpedido c ON c.numped = i.numped
 WHERE c.codfilial = :filial
   AND COALESCE(i.qtpedida, 0) > COALESCE(i.qtentregue, 0)
 GROUP BY i.codprod
"""
    try:
        rows = consulta.consultar(sql, {"filial": regras.FILIAL}, cache_key="compras:pendente")
    except Exception:  # noqa: BLE001 — sem PCITEM no espelho a sugestao ainda vale, so nao desconta transito
        return {}, 0
    mapa = {int(r["codprod"]): _f(r["pendente"]) for r in rows}
    pedidos = sum(int(r["pedidos"] or 0) for r in rows)
    return mapa, pedidos


def _lead_times() -> dict[tuple[str, int], int] | None:
    """app.lead_time (schema proprio do BI). None = schema indisponivel.

    ★ Le por `pg` direto, NUNCA por `consulta.consultar`: com FONTE_DADOS=oracle a
    consulta iria para o Winthor, onde o schema `app` nao existe — e o lead time
    sumiria justamente na configuracao em que o BI le a base de producao. Mesmo
    motivo (e mesmo padrao) das anotacoes de cliente em routers/clientes.py.

    Distinguir None de {} importa para a tela: "ninguem cadastrou ainda" pede um
    convite a parametrizar; "schema fora do ar" pede outra conversa.
    """
    try:
        rows = pg.consultar("SELECT escopo, codigo, dias FROM app.lead_time")
    except Exception as e:  # noqa: BLE001 — sem espelho a sugestao continua valendo
        log.warning("lead time indisponivel (%s)", e)
        return None
    return {(str(r["escopo"]), int(r["codigo"])): int(r["dias"]) for r in rows}


def _resolver_lead(lead: dict, codfornec, codsec, codepto) -> tuple[int | None, str | None]:
    """Precedencia fornecedor > secao > departamento: papel e quimico NAO podem
    ter o mesmo gatilho. Quimico tem fabrica a ~500 km e aguenta gatilho tardio;
    papel depende da janela da industria, e perder a janela obriga a comprar de
    concorrente mais caro (queima margem)."""
    for escopo, codigo in (("fornecedor", codfornec), ("secao", codsec), ("departamento", codepto)):
        if codigo is None:
            continue
        dias = (lead or {}).get((escopo, int(codigo)))
        if dias is not None:
            return dias, escopo
    return None, None


# ---------------------------------------------------------------------------
# Parametrizacao do lead time (schema `app` do Postgres — o Oracle e read-only)
# ---------------------------------------------------------------------------

ESCOPOS = ("fornecedor", "secao", "departamento")

#: Pseudo-cadastro "TODOS FORNECEDORES" do WinThor (par do DEPTO_AGREGADOR=9999 de
#: meta.py). Medido na base: os dois existem no cadastro e tem ZERO produtos — um
#: lead time gravado neles nunca resolveria para SKU nenhum e o comprador ficaria
#: achando que parametrizou. Por isso saem da lista e o PUT os recusa.
FORNEC_AGREGADOR = 999999

PRECEDENCIA = ("O mais específico vence: fornecedor > seção > departamento. "
               "Papel e químico não podem ter o mesmo gatilho de compra (§10).")


def _nomes_escopo() -> dict[tuple[str, int], str]:
    """Rotulo de cada codigo parametrizavel, para a tela nao mostrar so numeros.

    Vem do Winthor por `consulta.consultar` (Oracle ou espelho), enquanto o lead
    time vem do Postgres: como as duas fontes podem ser bancos diferentes, a
    juncao e feita em Python — mesma solucao do churn com app.cliente_anotacao.
    As tres dimensoes sao pequenas (225 fornecedores, 43 secoes, 9 departamentos),
    entao vale trazer inteiras e casar em memoria.
    """
    esq = consulta.esquema()
    sql = f"""
SELECT 'fornecedor' AS escopo, f.codfornec AS codigo, f.fornecedor AS nome
  FROM {esq}.pcfornec f WHERE f.codfornec <> {FORNEC_AGREGADOR}
UNION ALL
SELECT 'secao', s.codsec, s.descricao
  FROM {esq}.pcsecao s WHERE s.codepto <> {DEPTO_AGREGADOR}
UNION ALL
SELECT 'departamento', d.codepto, d.descricao
  FROM {esq}.pcdepto d WHERE d.codepto <> {DEPTO_AGREGADOR}
"""
    try:
        rows = consulta.consultar(sql, cache_key="compras:nomes_escopo")
    except Exception as e:  # noqa: BLE001 — sem nome a parametrizacao ainda funciona
        log.warning("nomes de escopo indisponiveis (%s)", e)
        return {}
    return {(str(r["escopo"]), int(r["codigo"])): r["nome"] for r in rows if r["codigo"] is not None}


def _linhas_lead_time() -> list[dict]:
    """Lista o que esta parametrizado hoje, com nome resolvido. 503 sem schema."""
    try:
        rows = pg.consultar(
            """SELECT escopo, codigo, dias, origem, alterado_por, atualizado_em
               FROM   app.lead_time ORDER BY escopo, codigo"""
        )
    except psycopg.Error as e:
        log.warning("schema app indisponivel (%s)", e)
        raise HTTPException(503, MSG_SEM_APP)
    nomes = _nomes_escopo()
    return [{
        "escopo": str(r["escopo"]),
        "codigo": int(r["codigo"]),
        "nome": nomes.get((str(r["escopo"]), int(r["codigo"]))),
        "dias": int(r["dias"]),
        "origem": r["origem"],
        "alterado_por": r["alterado_por"],
        "atualizado_em": r["atualizado_em"].isoformat() if r["atualizado_em"] else None,
    } for r in rows]


# ---------------------------------------------------------------------------
# 1. Demanda do mes fechado
# ---------------------------------------------------------------------------

def _alerta_variacao(atual: float, anterior: float, relevante: bool) -> str | None:
    if not relevante:
        return None
    if anterior <= 0 < atual:
        return "novo"
    if atual <= 0 < anterior:
        return "parou"
    if anterior > 0:
        variacao = (atual / anterior - 1) * 100.0
        if variacao >= LIMIAR_VARIACAO_PCT:
            return "salto"
        if variacao <= -LIMIAR_VARIACAO_PCT:
            return "queda"
    return None


def _projecao_mes_corrente(rcas: list[int], deptos: list[int]) -> dict:
    """Contexto do mes em andamento, SEMPRE projetado por dias uteis (§7).

    A cabeca do comprador olha o mes corrente junto com o passado; exibir o
    parcial cru ao lado de um mes fechado faria a demanda parecer despencar todo
    inicio de mes. No dia 1 (zero dia util) a projecao vem nula e a tela diz
    "aguardando dados".
    """
    ini, fim = calendario.mes_corrente()
    ctx = calendario.contexto_projecao()
    esq = consulta.esquema()
    sql = f"""
SELECT {regras.qt_liquida('m')} AS qt_liquida, {regras.valor_liquido('m')} AS valor_liquido
  FROM {esq}.pcmov m
  JOIN {esq}.pcprodut p ON p.codprod = m.codprod
 WHERE {regras.filtro_venda('m')}{regras.clausula_rca(rcas, 'm')}{regras.clausula_depto(deptos, 'p')}
"""
    binds = regras.periodo_binds(ini, fim)
    binds.update(regras.binds_dimensao(rcas, deptos))
    rows = consulta.consultar(sql, binds, cache_key=f"compras:corrente:{ini}:{rcas}:{deptos}")
    qt = _f(rows[0]["qt_liquida"]) if rows else 0.0
    valor = _f(rows[0]["valor_liquido"]) if rows else 0.0
    return {
        "mes": ctx["mes"],
        "rotulo": _rotulo(ini, fim),
        "uteis_transcorridos": ctx["uteis_transcorridos"],
        "uteis_total": ctx["uteis_total"],
        "qt_realizada": round(qt, 3),
        "valor_realizado": round(valor, 2),
        "qt_projetada": calendario.projetar(qt, ctx["uteis_transcorridos"], ctx["uteis_total"]),
        "valor_projetado": calendario.projetar(valor, ctx["uteis_transcorridos"], ctx["uteis_total"]),
        "parcial": True,
        "aviso": "Projeção por regra de três de dias úteis — não é o realizado do mês.",
    }


@router.get("/demanda")
def demanda(
    dt_ini: date | None = None,
    dt_fim: date | None = None,
    rcas: str | None = None,
    deptos: str | None = None,
    limite: int = Query(LIMITE_PADRAO, ge=1, le=10000),
):
    """Demanda por produto no ultimo mes fechado, com ABC e alerta de variacao.

    Periodo fora de mes fechado e NORMALIZADO (ver `_periodo`); o que foi pedido e
    o que foi aplicado saem em `meta.ajuste_periodo`.
    """
    dt_ini, dt_fim, ajuste = _periodo(dt_ini, dt_fim)
    lista_rcas, lista_deptos = _lista_int(rcas), _lista_int(deptos)
    ant_ini, ant_fim = _periodo_anterior(dt_ini, dt_fim)

    uteis = calendario.dias_uteis(dt_ini, dt_fim)
    uteis_ant = calendario.dias_uteis(ant_ini, ant_fim)
    linhas, resumo = _linhas_demanda(dt_ini, dt_fim, lista_rcas, lista_deptos)

    alertas = {"salto": 0, "queda": 0, "novo": 0, "parou": 0}
    rows = []
    for l in linhas:
        atual, anterior = l["qt_liquida"], l["qt_liquida_anterior"]
        relevante = (l["classe_abc"] in CLASSES_RELEVANTES
                     or l["classe_abc_anterior"] in CLASSES_RELEVANTES)
        alerta = _alerta_variacao(atual, anterior, relevante)
        if alerta:
            alertas[alerta] += 1
        rows.append({
            "codprod": l["codprod"],
            "descricao": l["descricao"],
            "codepto": l["codepto"],
            "departamento": l["departamento"],
            "codsec": l["codsec"],
            "secao": l["secao"],
            "qt_liquida": atual,
            "valor_liquido": l["valor_liquido"],
            "demanda_diaria": round(atual / uteis, 3) if uteis else None,
            "classe_abc": l["classe_abc"],
            "variacao_pct": round((atual / anterior - 1) * 100, 1) if anterior > 0 else None,
            "alerta_variacao": alerta,
            # auditoria do alerta: sem a base do mes anterior o gestor nao
            # consegue conferir de onde saiu a variacao
            "qt_liquida_anterior": anterior,
            "demanda_diaria_anterior": round(anterior / uteis_ant, 3) if uteis_ant else None,
        })

    rows.sort(key=lambda r: (-r["valor_liquido"], r["codprod"]))
    truncado = len(rows) > limite

    return {
        "rows": rows[:limite],
        "meta": {
            "mes_fechado": _descricao_periodo(dt_ini, dt_fim),
            "ajuste_periodo": ajuste,
            "dias_uteis": uteis,
            "periodo_anterior": _descricao_periodo(ant_ini, ant_fim),
            "mes_corrente": _projecao_mes_corrente(lista_rcas, lista_deptos),
            "produtos": len(rows),
            "curva": resumo,
            "alertas": alertas,
            "limiar_variacao_pct": LIMIAR_VARIACAO_PCT,
            "criterio_alerta": (f"variação de ±{LIMIAR_VARIACAO_PCT:.0f}% na quantidade líquida, "
                                "apenas para itens de curva A ou B em um dos dois meses"),
            "truncado_em": limite if truncado else None,
        },
    }


# ---------------------------------------------------------------------------
# 2. Curva ABC
# ---------------------------------------------------------------------------

@router.get("/curva-abc")
def curva_abc(
    criterio: str = "valor",
    dt_ini: date | None = None,
    dt_fim: date | None = None,
    rcas: str | None = None,
    deptos: str | None = None,
    limite: int = Query(LIMITE_PADRAO, ge=1, le=10000),
):
    """ABC por valor (padrao) ou por quantidade, sempre sobre o LIQUIDO."""
    criterio = (criterio or "valor").strip().lower()
    if criterio not in ("valor", "quantidade"):
        raise HTTPException(422, "criterio deve ser 'valor' ou 'quantidade'")
    chave = "valor_liquido" if criterio == "valor" else "qt_liquida"

    dt_ini, dt_fim, ajuste = _periodo(dt_ini, dt_fim)
    lista_rcas, lista_deptos = _lista_int(rcas), _lista_int(deptos)
    linhas, _ = _linhas_demanda(dt_ini, dt_fim, lista_rcas, lista_deptos)
    resumo = _curva_abc(linhas, chave)

    dentro = [l for l in linhas if l["classe_abc"] is not None]
    dentro.sort(key=lambda l: (-l[chave], l["codprod"]))
    # Devolucao maior que a venda no periodo: fica FORA do ranking (senao o
    # acumulado ultrapassa 100%) mas continua visivel para o comprador. So conta
    # quem REALMENTE se moveu no periodo — produto sem venda no mes (mas com
    # venda no mes anterior, por isso presente na lista) nao e "negativo".
    fora = sorted((l for l in linhas if l["classe_abc"] is None and l["movimentou"]),
                  key=lambda l: (l[chave], l["codprod"]))

    def _linha(l: dict) -> dict:
        return {
            "codprod": l["codprod"],
            "descricao": l["descricao"],
            "codepto": l["codepto"],
            "departamento": l["departamento"],
            "codsec": l["codsec"],
            "secao": l["secao"],
            "valor_liquido": l["valor_liquido"],
            "qt_liquida": l["qt_liquida"],
            "share_pct": l["share_pct"],
            "acumulado_pct": l["acumulado_pct"],
            "classe_abc": l["classe_abc"],
        }

    return {
        "rows": [_linha(l) for l in dentro[:limite]],
        "meta": {
            **resumo,
            "fora_da_curva": len(fora),
            "criterio": criterio,
            "periodo": _descricao_periodo(dt_ini, dt_fim),
            "ajuste_periodo": ajuste,
            "total_valor_liquido": round(sum(l["valor_liquido"] for l in linhas), 2),
            "total_qt_liquida": round(sum(l["qt_liquida"] for l in linhas), 3),
            "negativos": [{"codprod": l["codprod"], "descricao": l["descricao"],
                           "valor_liquido": l["valor_liquido"], "qt_liquida": l["qt_liquida"]}
                          for l in fora],
            "nota_negativos": ("Itens com resultado líquido zero ou negativo no período "
                               "(devolução ≥ venda) ficam fora da curva para o acumulado "
                               "não passar de 100%."),
            "truncado_em": limite if len(dentro) > limite else None,
        },
    }


# ---------------------------------------------------------------------------
# 3. Sugestao de compra
# ---------------------------------------------------------------------------

def _status_sugestao(diaria: float, disponivel: float, cobertura: float | None,
                     meta_dias: int, lead: int | None) -> str:
    """Gatilho da compra. A ordem importa: demanda zero vem antes de tudo para o
    produto parado nao aparecer no topo do alerta de ruptura com cobertura 0."""
    if diaria <= 0:
        return "sem demanda no mês fechado"
    if disponivel <= 0:
        return "ruptura"
    if lead is not None and cobertura is not None and cobertura <= lead:
        return "comprar agora"
    if cobertura is not None and cobertura < meta_dias:
        return "abaixo da meta"
    return "ok"


@router.get("/sugestao")
def sugestao(
    dt_ini: date | None = None,
    dt_fim: date | None = None,
    deptos: str | None = None,
    fornecedores: str | None = None,
    classes: str = "A",
    meta_dias: int = Query(regras.META_COBERTURA_CURVA_A_DIAS, ge=1, le=365),
    limite: int = Query(LIMITE_PADRAO, ge=1, le=10000),
):
    """Sugestao de reposicao: 45 dias de suprimento para a curva A (§10).

        sugestao_qt = max(0, demanda_diaria * 45 - disponivel - pendente_compra)

    `disponivel` e o que o app Ion Vendas enxerga (regras.DISPONIVEL_VENDA): o
    trancado NAO entra. Quando o produto esta trancado, a linha traz tambem
    `sugestao_se_destrancar` — sem isso o comprador pede 330 caixas de toalha
    rolo tendo 52 no galpao.

    O filtro de RCA nao existe aqui de proposito: a reposicao e da empresa
    inteira, e recortar a demanda por vendedor produziria sugestao menor que a
    necessidade real.
    """
    dt_ini, dt_fim, ajuste = _periodo(dt_ini, dt_fim)
    lista_deptos = _lista_int(deptos)
    lista_fornec = set(_lista_int(fornecedores))
    filtro_classes = {c.strip().upper() for c in (classes or "").split(",") if c.strip()}

    uteis = calendario.dias_uteis(dt_ini, dt_fim)
    linhas, _ = _linhas_demanda(dt_ini, dt_fim, [], lista_deptos)
    estoque = {e["codprod"]: e for e in _linhas_estoque(lista_deptos)}
    pendentes, pedidos_abertos = _mapa_pendente_compra()
    lead_cadastrado = _lead_times()

    rows = []
    custo_total = 0.0
    custo_cenario = 0.0
    custo_destrancar = 0.0
    sem_lead = 0
    sem_custo = 0
    for l in linhas:
        if filtro_classes and l["classe_abc"] not in filtro_classes:
            continue
        if lista_fornec and l["codfornec"] not in lista_fornec:
            continue

        e = estoque.get(l["codprod"], {})
        disponivel = _f(e.get("disponivel"))
        trancado = _f(e.get("trancado"))
        custo = _f(e.get("custo"))
        pendente = pendentes.get(l["codprod"], 0.0)
        diaria = (l["qt_liquida"] / uteis) if uteis and l["qt_liquida"] > 0 else 0.0
        # Cobertura com demanda zero e NULL, nunca 0: com 0 o produto parado
        # lideraria o ranking de ruptura e esconderia o que falta de verdade.
        cobertura = round(disponivel / diaria, 1) if diaria > 0 else None
        lead, escopo_lead = _resolver_lead(lead_cadastrado, l["codfornec"], l["codsec"], l["codepto"])
        if lead is None:
            sem_lead += 1

        alvo = diaria * meta_dias
        qt = math.ceil(max(0.0, alvo - disponivel - pendente)) if diaria > 0 else 0
        qt_cenario = math.ceil(max(0.0, alvo * CENARIO_CRESCIMENTO - disponivel - pendente)) if diaria > 0 else 0
        # Trancado e reserva de gestao, nao mercadoria que falta: se o dono
        # liberar, a compra necessaria cai. So faz sentido quando ha trancado.
        qt_destrancar = (math.ceil(max(0.0, alvo - (disponivel + trancado) - pendente))
                         if diaria > 0 and trancado > 0 else None)

        if qt > 0 and custo <= 0:
            sem_custo += 1
        custo_total += qt * custo
        custo_cenario += qt_cenario * custo
        custo_destrancar += (qt_destrancar if qt_destrancar is not None else qt) * custo

        rows.append({
            "codprod": l["codprod"],
            "descricao": l["descricao"],
            "codepto": l["codepto"],
            "departamento": l["departamento"],
            "codsec": l["codsec"],
            "secao": l["secao"],
            "codfornec": l["codfornec"],
            "fornecedor": l["fornecedor"],
            "classe_abc": l["classe_abc"],
            "demanda_diaria": round(diaria, 3),
            "disponivel": round(disponivel, 3),
            "trancado": round(trancado, 3),
            "pendente_compra": round(pendente, 3),
            "cobertura_dias": cobertura,
            "meta_dias": meta_dias,
            "sugestao_qt": qt,
            "sugestao_valor": round(qt * custo, 2),
            "sugestao_se_destrancar": qt_destrancar,
            "sugestao_qt_mais_50": qt_cenario,
            "lead_time_dias": lead,
            "lead_time_escopo": escopo_lead,
            "lead_time_status": ("lead time não parametrizado" if lead is None
                                 else f"{lead} dias (por {escopo_lead})"),
            "custo_unitario": round(custo, 4),
            "status": _status_sugestao(diaria, disponivel, cobertura, meta_dias, lead),
        })

    ordem = {"ruptura": 0, "comprar agora": 1, "abaixo da meta": 2, "ok": 3,
             "sem demanda no mês fechado": 4}
    rows.sort(key=lambda r: (ordem.get(r["status"], 9), -r["sugestao_valor"], r["codprod"]))

    total_pendente = sum(r["pendente_compra"] for r in rows)
    return {
        "rows": rows[:limite],
        "meta": {
            "meta_dias": meta_dias,
            "classes": sorted(filtro_classes) or ["todas"],
            "periodo": _descricao_periodo(dt_ini, dt_fim),
            "ajuste_periodo": ajuste,
            "dias_uteis": uteis,
            "skus": len(rows),
            "skus_com_sugestao": sum(1 for r in rows if r["sugestao_qt"] > 0),
            "custo_total": round(custo_total, 2),
            "custo_total_se_destrancar": round(custo_destrancar, 2),
            "cenario_mais_50": {
                "fator": CENARIO_CRESCIMENTO,
                "custo_total": round(custo_cenario, 2),
                "skus_com_sugestao": sum(1 for r in rows if r["sugestao_qt_mais_50"] > 0),
                "aviso": ("Crescimento repentino de 50% — cenário que o dono levantou como "
                          "risco de travar a operação. Compare com um mês de faturamento "
                          "antes de aprovar."),
            },
            "sem_lead_time": sem_lead,
            "lead_time_disponivel": lead_cadastrado is not None,
            "lead_time_parametrizados": None if lead_cadastrado is None else len(lead_cadastrado),
            "nota_lead_time": (
                MSG_SEM_APP if lead_cadastrado is None else
                ("Sem lead time o gatilho 'comprar agora' não dispara — vale só o corte de "
                 f"{meta_dias} dias de cobertura, e papel e químico ficam com o mesmo gatilho. "
                 "Cadastre em PUT /api/compras/lead-time (escopo fornecedor/seção/departamento).")
                if sem_lead else None
            ),
            "sem_custo_cadastrado": sem_custo,
            "pedidos_compra_abertos": pedidos_abertos,
            "aviso_pendente_zero": (
                "Nenhum pedido de compra em aberto no WinThor: a operação lança o pedido "
                "depois de receber a mercadoria, então nada é descontado como mercadoria "
                "em trânsito e a sugestão pode estar superestimada."
            ) if total_pendente <= 0 else None,
            "filtro_rca": "não se aplica — a reposição é da empresa inteira",
            "truncado_em": limite if len(rows) > limite else None,
        },
    }


# ---------------------------------------------------------------------------
# 4. Estoque (sub-aba) — as quatro quantidades lado a lado
# ---------------------------------------------------------------------------

@router.get("/estoque")
def estoque(
    dt_ini: date | None = None,
    dt_fim: date | None = None,
    deptos: str | None = None,
    somente_trancado: bool = False,
    limite: int = Query(LIMITE_PADRAO, ge=1, le=10000),
):
    """Fisico, reservado, trancado, avaria e disponivel por produto.

    O trancado e a reserva que o dono cria para nao romper contrato com multa
    (SLA): no Ion Vendas o item aparece ZERADO e o vendedor nao consegue vender
    para cliente pequeno. Aqui ele aparece separado e tambem em DIAS DE DEMANDA,
    que e como o dono confere se a reserva esta perto do padrao de ~1 semana.

    O estoque em si e snapshot de hoje; o periodo so define a demanda diaria que
    vira cobertura — e por isso segue a mesma normalizacao de mes fechado do §10
    (`meta.ajuste_periodo` declara quando a janela pedida foi ajustada).
    """
    dt_ini, dt_fim, ajuste = _periodo(dt_ini, dt_fim)
    lista_deptos = _lista_int(deptos)
    uteis = calendario.dias_uteis(dt_ini, dt_fim)

    linhas, _ = _linhas_demanda(dt_ini, dt_fim, [], lista_deptos)
    demanda_por_prod = {l["codprod"]: l for l in linhas}
    rows = []
    for e in _linhas_estoque(lista_deptos):
        if somente_trancado and e["trancado"] <= 0:
            continue
        qt = demanda_por_prod.get(e["codprod"], {}).get("qt_liquida", 0.0)
        diaria = (qt / uteis) if uteis and qt > 0 else 0.0
        rows.append({
            "codprod": e["codprod"],
            "descricao": e["descricao"],
            "codepto": e["codepto"],
            "departamento": e["departamento"],
            "codsec": e["codsec"],
            "secao": e["secao"],
            "fisico": e["fisico"],
            "reservado": e["reservado"],
            "trancado": e["trancado"],
            "avaria": e["avaria"],
            "disponivel": e["disponivel"],
            "demanda_diaria": round(diaria, 3),
            "cobertura_dias": round(e["disponivel"] / diaria, 1) if diaria > 0 else None,
            "dias_trancados": round(e["trancado"] / diaria, 1) if diaria > 0 and e["trancado"] > 0 else None,
            "trancado_valor": round(e["trancado"] * e["custo"], 2),
            "valor_estoque": round(e["fisico"] * e["custo"], 2),
            "custo_unitario": e["custo"],
        })

    # Trancado primeiro (e o que o time de vendas nao ve), depois o risco de
    # ruptura pela menor cobertura.
    rows.sort(key=lambda r: (
        0 if r["trancado"] > 0 else 1,
        -r["trancado_valor"],
        r["cobertura_dias"] if r["cobertura_dias"] is not None else 10 ** 9,
        -r["valor_estoque"],
    ))

    trancados = [r for r in rows if r["trancado"] > 0]
    return {
        "rows": rows[:limite],
        "meta": {
            "periodo": _descricao_periodo(dt_ini, dt_fim),
            "ajuste_periodo": ajuste,
            "dias_uteis": uteis,
            "skus": len(rows),
            "skus_trancados": len(trancados),
            "total_trancado_un": round(sum(r["trancado"] for r in trancados), 3),
            "total_trancado_valor": round(sum(r["trancado_valor"] for r in trancados), 2),
            "total_avaria_un": round(sum(r["avaria"] for r in rows), 3),
            "valor_estoque": round(sum(r["valor_estoque"] for r in rows), 2),
            "skus_em_ruptura": sum(1 for r in rows if r["disponivel"] <= 0 and r["demanda_diaria"] > 0),
            "meta_dias_curva_a": regras.META_COBERTURA_CURVA_A_DIAS,
            "nota_trancado": ("Trancado = PCEST.QTBLOQUEADA menos a avaria (QTINDENIZ, que está "
                              "contida nele). Nunca entra no disponível: é a reserva de gestão "
                              "que o Ion Vendas enxerga como estoque zero."),
            "truncado_em": limite if len(rows) > limite else None,
        },
    }


# ---------------------------------------------------------------------------
# 5. Parametrizacao do lead time (o que o comprador cadastra sozinho)
# ---------------------------------------------------------------------------

class LeadTimeIn(BaseModel):
    """Um lead time por (escopo, codigo). Reenviar o mesmo par sobrescreve.

    `origem` e obrigatoria de fato, ainda que opcional no tipo: sem ela ninguem
    sabe se o numero veio do PCFORNEC, do fornecedor por telefone ou de um chute —
    e lead time errado vira ordem de compra errada. O default deixa isso explicito.
    """
    escopo: Literal["fornecedor", "secao", "departamento"]
    codigo: int = Field(ge=0)
    dias: int = Field(ge=0, le=365)
    origem: str | None = Field(None, max_length=200)


@router.get("/lead-time")
def lead_time_listar():
    """O que esta parametrizado hoje. Alimenta a tela de parametrizacao do comprador."""
    rows = _linhas_lead_time()
    return {
        "rows": rows,
        "meta": {
            "escopos": list(ESCOPOS),
            "precedencia": PRECEDENCIA,
            "parametrizados": len(rows),
            "nota": ("Sem lead time cadastrado o gatilho 'comprar agora' não dispara: a sugestão "
                     "usa apenas o corte de meta de cobertura. Cadastre por PUT /api/compras/lead-time."),
        },
    }


@router.put("/lead-time")
def lead_time_gravar(body: LeadTimeIn, usuario: str = Depends(require_user)):
    """Cadastra/atualiza o lead time de um fornecedor, secao ou departamento.

    Grava no Postgres (`app.lead_time`) porque o Oracle do cliente e somente
    leitura por contrato. Existe para o comprador parametrizar sem esperar deploy
    — foi o pedido literal da reuniao sobre o gargalo do papel.

    O codigo e conferido contra o cadastro do Winthor: sem isso um digito trocado
    criaria uma linha que nunca casa com produto nenhum e o comprador ficaria
    achando que parametrizou.
    """
    nomes = _nomes_escopo()
    chave = (body.escopo, body.codigo)
    if nomes and chave not in nomes:
        raise HTTPException(422, f"{body.escopo} {body.codigo} não existe no cadastro do WinThor "
                                 f"(ou é um pseudo-cadastro agregador, que não tem produto).")

    dados = {
        "e": body.escopo,
        "c": body.codigo,
        "d": body.dias,
        "o": (body.origem or "").strip() or "não informada",
        "u": usuario,
    }
    try:
        pg.executar(
            """INSERT INTO app.lead_time (escopo, codigo, dias, origem, alterado_por, atualizado_em)
               VALUES (%(e)s, %(c)s, %(d)s, %(o)s, %(u)s, now())
               ON CONFLICT (escopo, codigo) DO UPDATE
                  SET dias = EXCLUDED.dias,
                      origem = EXCLUDED.origem,
                      alterado_por = EXCLUDED.alterado_por,
                      atualizado_em = now()""",
            dados,
        )
    except psycopg.Error as e:
        log.warning("falha ao gravar lead time %s/%s (%s)", body.escopo, body.codigo, e)
        raise HTTPException(503, MSG_SEM_APP)

    return {
        "escopo": body.escopo,
        "codigo": body.codigo,
        "nome": nomes.get(chave),
        "dias": body.dias,
        "origem": dados["o"],
        "alterado_por": usuario,
        "precedencia": PRECEDENCIA,
    }
