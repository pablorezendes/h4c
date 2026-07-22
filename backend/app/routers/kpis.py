"""KPIs do painel legado do BI h4c — agora na medida canonica de faturamento.

★ REGRA DE OURO (regra n. 1 do dono): todo numero de venda deste modulo e
LIQUIDO de devolucao. A medida mora em app/regras.py e NAO e reimplementada
aqui — se este arquivo divergir de regras.py, este arquivo esta errado.

    liquido = SUM( +qt*punit dos itens CODOPER='S'  -qt*punit dos itens 'ED' )

O que mudou em 2026-07 (registrado para ninguem "consertar" de volta):

* Ate entao /overview, /vendas/serie e /vendas/top-produtos somavam venda
  BRUTA. A deducao de devolucao caiu de 10,87% (jan/26) para 1,02% (jun/26):
  sem deduzir, o BI mostrava os meses recentes melhores do que foram e
  distorcia toda comparacao mes a mes a favor do presente.

* A REGUA DE NOTA DE VENDA continua valendo, so mudou de lugar. Antes era um
  EXISTS por numtransvenda procurando item CODOPER='S' na nota; hoje o filtro
  canonico e no proprio item — CODOPER IN ('S','ED') ja deixa de fora, de
  graca: SR (remessa de comodato: o dispenser sai do estoque e o cliente NAO
  paga — 293/293 notas com item 'S' geram titulo, contra 1/18 das 'SR'), SB/EB
  (bonificacao), SD (devolucao AO fornecedor) e ER (retorno de comodato).
  Sem isso o faturamento inflava ~6,8%/mes e a positivacao contava clientes
  que nunca pagaram.

* O card "A receber em aberto" SAIU da /overview. Metrica financeira nao mora
  na visao comercial: a versao canonica e /api/financeiro/vencido.

* /financeiro/aging fica aqui so por COMPATIBILIDADE com a tela antiga. A
  versao canonica (com aging, top devedores e a_vencer) e /api/financeiro/vencido.
  Ele ja usa regras.filtro_titulo(): PCPREST guarda cadeias de estorno/reemissao
  e, sem o filtro, o mesmo titulo vencido era contado ate 3 vezes (8 titulos e
  R$ 640,73 de vencido fantasma na foto de 21/07/2026).

★ O MODULO "futuro" (routers/futuro.py) FOI REMOVIDO — nao recriar. Motivo,
  endpoint a endpoint:
    /caixa-previsto        projecao de fluxo de caixa: proibida antes da rodada
                           com o Vinicius/BPO (fase 2 do Financeiro);
    /forecast-faturamento  projetava "proximos 30 dias"; a regra e fechamento do
                           mes por dias uteis -> /api/comercial/resumo.projecao;
    /quando-comprar,
    /demanda-produtos      janelas moveis de 28/90 dias e cobertura-alvo de 30
                           dias; a regra e mes fechado e meta de 45 dias na
                           curva A -> /api/compras/*;
    /clientes-risco        limiares 1,2/1,8/2,5 sobre o historico TOTAL; a regra
                           e 1,6x/2,0x sobre ciclo de 90 dias com teto de 30
                           dias -> /api/clientes/churn;
    /sazonalidade-mensal   unico sem violacao: virou o endpoint
                           /api/kpis/vendas/sazonalidade-mensal deste modulo,
                           agora em faturamento liquido.

★ AUTORIZACAO DE UM MODULO LEGADO
Este router nao e uma aba: e a versao antiga de telas que hoje existem em
/api/comercial e /api/financeiro. Cada endpoint pede o recurso do relatorio
EQUIVALENTE na aba nova, nunca um recurso proprio — se o dono tirar "Faturamento
mes a mes" de alguem, a mesma serie nao pode continuar aberta por uma rota
esquecida. Por isso tambem nao ha dependencia de aba no router: /financeiro/aging
daqui pertence ao Financeiro e o resto ao Comercial.

★ CARTEIRA: todo endpoint que aceita `rcas` passa por `permissoes.escopo_rca()`.
A excecao e /financeiro/aging, que nao tem filtro de RCA nenhum e por isso nao
sabe se restringir — ele recusa usuario restrito a carteira e aponta para a versao
canonica (/api/financeiro/vencido), que sabe.
"""
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status

from .. import consulta, permissoes, regras

#: Sem dependencia de aba: ver "AUTORIZACAO DE UM MODULO LEGADO" no cabecalho.
router = APIRouter(prefix="/api/kpis", tags=["kpis"])

MESES_PT = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
            "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]


def _periodo(dt_ini: date | None, dt_fim: date | None) -> tuple[date, date]:
    dt_fim = dt_fim or date.today()
    dt_ini = dt_ini or dt_fim - timedelta(days=29)
    return dt_ini, dt_fim


def _periodo_anterior(dt_ini: date, dt_fim: date) -> tuple[date, date]:
    dias = (dt_fim - dt_ini).days + 1
    return dt_ini - timedelta(days=dias), dt_ini - timedelta(days=1)


def _variacao(atual: float, anterior: float) -> float | None:
    if not anterior:
        return None
    return round((atual - anterior) / anterior * 100, 1)


def _ids(csv: str | None) -> list[int]:
    """'1,3' -> [1, 3]. Vazio = todos (filtro global do FiltroBar)."""
    return [int(p) for p in (csv or "").replace(";", ",").split(",")
            if p.strip().lstrip("-").isdigit()]


def _rcas(usuario, csv: str | None) -> list[int]:
    """RCAs efetivos: o que veio na querystring, ja sob o escopo de carteira.

    Estes endpoints nao tem cache_key, entao o unico risco aqui e o filtro em si —
    mas a substituicao acontece na entrada do handler do mesmo jeito que nas abas
    novas, para as duas versoes da mesma tela nao darem respostas diferentes.
    """
    return permissoes.escopo_rca(usuario, _ids(csv))


def _f(v) -> float:
    """Decimal/None do driver -> float, para nao vazar Decimal no JSON."""
    return float(v or 0)


def _horas(v: str | None) -> float | None:
    """'14:30' -> 14.5. None/'' -> None."""
    if not v:
        return None
    partes = str(v).split(":")
    try:
        return int(partes[0]) + (int(partes[1]) if len(partes) > 1 else 0) / 60.0
    except ValueError:
        return None


def _origem(deptos: list[int]) -> str:
    """FROM da medida canonica. PCPRODUT so entra quando ha filtro de
    departamento: um join inutil esconderia movimento de produto sem cadastro."""
    o = consulta.esquema()
    fonte = f"{o}.pcmov m"
    if deptos:
        fonte += f" JOIN {o}.pcprodut p ON p.codprod = m.codprod"
    return fonte


def _filtros(rcas: list[int], deptos: list[int]) -> str:
    return regras.filtro_venda("m") + regras.clausula_rca(rcas, "m") + regras.clausula_depto(deptos, "p")


def _binds(dt_ini: date, dt_fim: date, rcas: list[int], deptos: list[int]) -> dict:
    return {**regras.periodo_binds(dt_ini, dt_fim), **regras.binds_dimensao(rcas, deptos)}


@router.get("/overview")
def overview(dt_ini: date | None = None, dt_fim: date | None = None,
             hora_ini: str | None = None, hora_fim: str | None = None,
             rcas: str | None = None, deptos: str | None = None,
             usuario=Depends(permissoes.requer("comercial.resumo"))):
    """Cards do painel: faturamento LIQUIDO, pedidos, ticket medio e devolucao.
    Filtro de hora aplica-se aos PEDIDOS (PCPEDC.HORA/MINUTO); a NF nao tem hora.

    ★ O card "Pedidos" conta PCPEDC sem filtro de RCA — a contagem e da empresa
    mesmo para quem esta restrito a carteira. Fica dito aqui porque e a unica
    assimetria da resposta: os outros tres cards saem da medida canonica, ja sob
    escopo. A versao canonica desta tela e /api/comercial/resumo, que nao tem esse
    card; nao "consertar" isto acrescentando um filtro que a consulta de pedidos
    nunca teve — o caminho e aposentar o modulo legado."""
    dt_ini, dt_fim = _periodo(dt_ini, dt_fim)
    ant_ini, ant_fim = _periodo_anterior(dt_ini, dt_fim)
    lista_rcas, lista_deptos = _rcas(usuario, rcas), _ids(deptos)
    o = consulta.esquema()
    h_ini, h_fim = _horas(hora_ini), _horas(hora_fim)

    def faturamento(i: date, f: date) -> dict:
        # medida canonica: venda menos devolucao, no item (PCMOV)
        r = consulta.consultar(
            f"""SELECT ROUND({regras.valor_liquido('m')}::numeric, 2)   AS liquido,
                       ROUND({regras.valor_bruto('m')}::numeric, 2)     AS bruto,
                       ROUND({regras.valor_devolucao('m')}::numeric, 2) AS devolucao,
                       COUNT(DISTINCT CASE WHEN m.codoper = 'S' THEN m.numtransvenda END) AS notas
                FROM {_origem(lista_deptos)}
                WHERE {_filtros(lista_rcas, lista_deptos)}""",
            _binds(i, f, lista_rcas, lista_deptos),
        )[0]
        return {"liquido": _f(r["liquido"]), "bruto": _f(r["bruto"]),
                "devolucao": _f(r["devolucao"]), "notas": int(r["notas"] or 0)}

    def pedidos(i: date, f: date) -> int:
        # VEN-04 — pedidos digitados no periodo, excluindo cancelados (POSICAO='C');
        # hora do pedido = HORA + MINUTO/60 (unico registro de hora confiavel da base).
        # ★ `>= :i AND < :f+1` e nao BETWEEN: DATA e timestamp no espelho e o
        # BETWEEN cortava em 00:00, perdendo os pedidos do ultimo dia do filtro.
        filtro_hora = ""
        binds: dict = {"i": i, "fx": f + timedelta(days=1)}
        if h_ini is not None or h_fim is not None:
            filtro_hora = " AND COALESCE(hora,0) + COALESCE(minuto,0)/60.0 BETWEEN :h1 AND :h2"
            binds["h1"] = h_ini if h_ini is not None else 0
            binds["h2"] = h_fim if h_fim is not None else 24
        r = consulta.consultar(
            f"""SELECT COUNT(*) AS qtd
                FROM {o}.pcpedc
                WHERE data >= :i AND data < :fx AND posicao <> 'C'{filtro_hora}""",
            binds,
        )[0]
        return int(r["qtd"] or 0)

    atual, anterior = faturamento(dt_ini, dt_fim), faturamento(ant_ini, ant_fim)
    ped_atual, ped_ant = pedidos(dt_ini, dt_fim), pedidos(ant_ini, ant_fim)

    # ticket medio deriva do LIQUIDO: com o bruto, uma nota devolvida inteira
    # continuaria inflando o ticket do periodo
    ticket = atual["liquido"] / atual["notas"] if atual["notas"] else 0.0
    devol_pct = 100.0 * atual["devolucao"] / atual["bruto"] if atual["bruto"] else 0.0

    return {
        "periodo": {"dt_ini": dt_ini.isoformat(), "dt_fim": dt_fim.isoformat()},
        "cards": [
            {"id": "faturamento", "label": "Faturamento líquido", "valor": round(atual["liquido"], 2),
             "formato": "moeda", "variacao_pct": _variacao(atual["liquido"], anterior["liquido"]),
             "extra": {"bruto": round(atual["bruto"], 2),
                       "devolucao": round(atual["devolucao"], 2),
                       "devolucao_pct": round(devol_pct, 2)}},
            {"id": "pedidos", "label": "Pedidos", "valor": ped_atual,
             "formato": "inteiro", "variacao_pct": _variacao(ped_atual, ped_ant)},
            {"id": "ticket_medio", "label": "Ticket médio", "valor": round(ticket, 2),
             "formato": "moeda", "variacao_pct": None,
             "extra": {"notas": atual["notas"]}},
            {"id": "devolucao", "label": "Devolução deduzida", "valor": round(atual["devolucao"], 2),
             "formato": "moeda", "variacao_pct": _variacao(atual["devolucao"], anterior["devolucao"]),
             "extra": {"percentual": round(devol_pct, 2)}},
        ],
    }


@router.get("/vendas/serie")
def vendas_serie(dt_ini: date | None = None, dt_fim: date | None = None,
                 rcas: str | None = None, deptos: str | None = None,
                 usuario=Depends(permissoes.requer("comercial.serie"))):
    """VEN-02 — serie diaria de faturamento LIQUIDO.

    `faturamento` continua sendo a coluna que o grafico le, mas agora vale o
    liquido; `bruto` e `devolucao` vao ao lado para o dia em que a devolucao
    derruba a barra e alguem perguntar por que."""
    dt_ini, dt_fim = _periodo(dt_ini, dt_fim)
    lista_rcas, lista_deptos = _rcas(usuario, rcas), _ids(deptos)
    return consulta.consultar(
        f"""SELECT to_char(m.dtmov::date, 'YYYY-MM-DD')                AS dia,
                   ROUND({regras.valor_liquido('m')}::numeric, 2)      AS faturamento,
                   ROUND({regras.valor_bruto('m')}::numeric, 2)        AS bruto,
                   ROUND({regras.valor_devolucao('m')}::numeric, 2)    AS devolucao,
                   COUNT(DISTINCT CASE WHEN m.codoper = 'S' THEN m.numtransvenda END) AS notas
            FROM {_origem(lista_deptos)}
            WHERE {_filtros(lista_rcas, lista_deptos)}
            GROUP BY m.dtmov::date
            ORDER BY 1""",
        _binds(dt_ini, dt_fim, lista_rcas, lista_deptos),
    )


@router.get("/vendas/top-produtos")
def top_produtos(dt_ini: date | None = None, dt_fim: date | None = None, limite: int = Query(10, le=50),
                 hora_ini: str | None = None, hora_fim: str | None = None,
                 rcas: str | None = None, deptos: str | None = None,
                 usuario=Depends(permissoes.requer("comercial.mix"))):
    """VEN-06 — mix por produto na venda faturada, em valor e quantidade LIQUIDOS.

    Hora via HORALANC/MINUTOLANC (hora de lancamento do item, populada nesta base).
    O produto devolvido perde posicao no ranking, que e exatamente o objetivo:
    campeao de venda que volta pela porta dos fundos nao e campeao.

    `comercial.mix` protege este endpoint: e a mesma pergunta de sortimento do
    "Mix de produtos" da aba nova, so que em valor e sem quebra por RCA."""
    dt_ini, dt_fim = _periodo(dt_ini, dt_fim)
    lista_rcas, lista_deptos = _rcas(usuario, rcas), _ids(deptos)
    h_ini, h_fim = _horas(hora_ini), _horas(hora_fim)
    o = consulta.esquema()
    binds = {**_binds(dt_ini, dt_fim, lista_rcas, lista_deptos), "lim": limite}
    filtro_hora = ""
    if h_ini is not None or h_fim is not None:
        filtro_hora = (" AND COALESCE(NULLIF(regexp_replace(m.horalanc::text, '[^0-9]', '', 'g'), '')::numeric,0)"
                       " + COALESCE(NULLIF(regexp_replace(m.minutolanc::text, '[^0-9]', '', 'g'), '')::numeric,0)/60.0"
                       " BETWEEN :h1 AND :h2")
        binds["h1"] = h_ini if h_ini is not None else 0
        binds["h2"] = h_fim if h_fim is not None else 24
    return consulta.consultar(
        f"""SELECT m.codprod,
                   p.descricao,
                   ROUND({regras.valor_liquido('m')}::numeric, 2)   AS valor,
                   ROUND({regras.valor_bruto('m')}::numeric, 2)     AS bruto,
                   ROUND({regras.valor_devolucao('m')}::numeric, 2) AS devolucao,
                   ROUND({regras.qt_liquida('m')}::numeric, 2)      AS quantidade
            FROM {o}.pcmov m
            JOIN {o}.pcprodut p ON p.codprod = m.codprod
            WHERE {_filtros(lista_rcas, lista_deptos)}{filtro_hora}
            GROUP BY m.codprod, p.descricao
            ORDER BY valor DESC
            LIMIT :lim""",
        binds,
    )


@router.get("/vendas/sazonalidade-mensal")
def sazonalidade_mensal(dt_ini: date | None = None, dt_fim: date | None = None,
                        rcas: str | None = None, deptos: str | None = None,
                        usuario=Depends(permissoes.requer("comercial.serie"))):
    """Padrao mensal observado por departamento — faturamento e unidades LIQUIDOS.

    Unico endpoint aproveitado do modulo "futuro" (era FUT-02): ele nao projeta
    nada, so mostra o que ja aconteceu mes a mes, por isso sobreviveu a revisao.
    O mes corrente sai marcado `parcial` — comparar mes parcial com mes fechado
    como se fossem iguais e o erro que a revisao existiu para matar."""
    dt_fim = dt_fim or date.today()
    dt_ini = dt_ini or dt_fim - timedelta(days=364)
    lista_rcas, lista_deptos = _rcas(usuario, rcas), _ids(deptos)
    o = consulta.esquema()
    rows = consulta.consultar(
        f"""SELECT to_char(date_trunc('month', m.dtmov), 'YYYY-MM')  AS mes,
                   p.codepto,
                   COALESCE(d.descricao, '(sem depto)')              AS departamento,
                   ROUND({regras.valor_liquido('m')}::numeric, 2)    AS faturamento,
                   ROUND({regras.qt_liquida('m')}::numeric, 2)       AS unidades
            FROM {o}.pcmov m
            JOIN {o}.pcprodut p ON p.codprod = m.codprod
            LEFT JOIN {o}.pcdepto d ON d.codepto = p.codepto
            WHERE {_filtros(lista_rcas, lista_deptos)}
            GROUP BY date_trunc('month', m.dtmov), p.codepto, COALESCE(d.descricao, '(sem depto)')
            ORDER BY 1, 4 DESC""",
        _binds(dt_ini, dt_fim, lista_rcas, lista_deptos),
    )
    mes_corrente = date.today().strftime("%Y-%m")
    por_mes: dict[str, float] = {}
    for r in rows:
        r["parcial"] = r["mes"] == mes_corrente
        por_mes[r["mes"]] = por_mes.get(r["mes"], 0.0) + _f(r["faturamento"])
    fechados = {m: v for m, v in por_mes.items() if m != mes_corrente}
    pico = max(fechados, key=fechados.get) if fechados else None
    return {
        "rows": rows,
        "meta": {
            "meses_observados": len(por_mes),
            "mes_pico": pico and f"{MESES_PT[int(pico[5:7])]}/{pico[:4]}",
            "aviso": ("historico comeca em out/2025 — ainda nao ha ano completo, "
                      "entao isto e o padrao OBSERVADO, nao sazonalidade anual"),
        },
    }


@router.get("/financeiro/aging")
def aging_receber(usuario=Depends(permissoes.requer("financeiro.vencido"))):
    """FCR-03 — aging da carteira em aberto por faixas de atraso.

    LEGADO: mantido para a tela antiga nao quebrar. A versao canonica do
    vencido a receber (com top devedores e total a vencer) e
    /api/financeiro/vencido, na aba Financeiro — metrica financeira nao mora
    na visao comercial.

    ★ Nao tem filtro de RCA e a `cache_key` e fixa ("kpi:aging"), entao ele nao
    tem como devolver so a carteira de quem pergunta — nem sob o TTL de 2 minutos
    do cache. Em vez de acrescentar um filtro que a tela antiga nunca mandou (e que
    faria esta rota divergir da canonica), o acesso e recusado para quem e restrito
    a carteira. Quem precisa do vencido da propria carteira usa
    /api/financeiro/vencido, que aplica escopo no aging E na lista de devedores."""
    if getattr(usuario, "restrito_a_carteira", False):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Este aging é da empresa inteira e não sabe separar por carteira. "
            "Use a aba Financeiro > Vencido, que mostra o vencido do seu RCA.",
        )
    faixa = """CASE
                 WHEN t.dtvenc::date >= CURRENT_DATE THEN 'A vencer'
                 WHEN CURRENT_DATE - t.dtvenc::date <= 30 THEN '1-30 dias'
                 WHEN CURRENT_DATE - t.dtvenc::date <= 60 THEN '31-60 dias'
                 WHEN CURRENT_DATE - t.dtvenc::date <= 90 THEN '61-90 dias'
                 ELSE '> 90 dias'
               END"""
    return consulta.consultar(
        f"""SELECT {faixa} AS faixa,
                   COUNT(*) AS titulos,
                   ROUND(SUM(t.valor - COALESCE(t.vpago, 0))::numeric, 2) AS valor
            FROM {consulta.esquema()}.pcprest t
            WHERE t.dtpag IS NULL
            AND   {regras.filtro_titulo('t')}
            GROUP BY {faixa}""",
        {"filial": regras.FILIAL},
        cache_key="kpi:aging",
    )
