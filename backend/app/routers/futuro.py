"""Tela "Veja o Futuro" — endpoints preditivos e prescritivos.

Honestidade estatistica: a base tem ~9 meses de historico (out/2025->hoje).
Sazonalidade ANUAL completa so sera estimavel com 12+ meses; os modelos aqui
usam tendencia + sazonalidade de dia-da-semana + padrao mensal OBSERVADO.
Toda previsao sai com metodo e limitacoes declarados no campo meta.
"""
import statistics
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query

from ..analytics import forecast_linear_dow
from ..auth import require_user
from .. import consulta

router = APIRouter(prefix="/api/futuro", tags=["futuro"], dependencies=[Depends(require_user)])

MESES_PT = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
            "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]

# Regua canonica de "nota de venda": exclui remessas de comodato (CODOPER='SR' —
# dispensers cedidos ao cliente, que nao geram contas a receber). Ver kpis.py.
EXISTE_ITEM_VENDA = """EXISTS (SELECT 1 FROM pcmov m
                               WHERE m.numtransvenda = n.numtransvenda
                               AND m.codoper = 'S' AND m.dtcancel IS NULL)"""


@router.get("/forecast-faturamento")
def forecast_faturamento(horizonte: int = Query(30, ge=7, le=90), dt_fim: date | None = None):
    """Previsao de faturamento diario (regressao + sazonalidade de dia-da-semana, IC 95%).
    A previsao parte da ancora (dt_fim do filtro; padrao = hoje)."""
    ancora = dt_fim or date.today()
    rows = consulta.consultar(
        f"""SELECT to_char(n.dtsaida::date,'YYYY-MM-DD') AS dia,
                   ROUND(SUM(n.vltotal)::numeric,2) AS valor
            FROM pcnfsaid n
            WHERE n.dtsaida >= :ancora::date - 180
            AND   n.dtsaida <  :ancora::date + 1
            AND   n.dtcancel IS NULL
            AND   {EXISTE_ITEM_VENDA}
            GROUP BY n.dtsaida::date
            ORDER BY 1""",
        {"ancora": ancora},
        cache_key=f"fut:serie-fat:{ancora}",
    )
    r = forecast_linear_dow(rows, "valor", horizonte)
    r["meta"]["limitacao"] = "temos 9 meses de historico — a previsao fica mais precisa a cada mes"
    return {"id": "FUT-01", "titulo": f"Faturamento previsto — próximos {horizonte} dias", **r}


@router.get("/sazonalidade-mensal")
def sazonalidade_mensal(dt_ini: date | None = None, dt_fim: date | None = None):
    """Faturamento e unidades por mes observado × departamento, dentro do periodo filtrado."""
    fim = dt_fim or date.today()
    ini = dt_ini or fim - timedelta(days=364)
    rows = consulta.consultar(
        """SELECT to_char(date_trunc('month', m.dtmov),'YYYY-MM') AS mes,
                  COALESCE(d.descricao,'(sem depto)')          AS departamento,
                  ROUND(SUM(m.qt * m.punit)::numeric,2)            AS faturamento,
                  ROUND(SUM(m.qt))                        AS unidades
           FROM pcmov m
           JOIN pcprodut p ON p.codprod = m.codprod
           LEFT JOIN pcdepto d ON d.codepto = p.codepto
           WHERE m.codoper = 'S'
           AND   m.dtcancel IS NULL
           AND   m.dtmov >= :ini::date
           AND   m.dtmov <  :fim::date + 1
           GROUP BY date_trunc('month', m.dtmov), COALESCE(d.descricao,'(sem depto)')
           ORDER BY 1, 3 DESC""",
        {"ini": ini, "fim": fim},
        cache_key=f"fut:sazonal-mes:{ini}:{fim}",
    )
    por_mes: dict[str, float] = {}
    for r in rows:
        por_mes[r["mes"]] = por_mes.get(r["mes"], 0) + float(r["faturamento"] or 0)
    pico = max(por_mes, key=por_mes.get) if por_mes else None
    return {
        "id": "FUT-02",
        "titulo": "Padrão mensal por departamento",
        "rows": rows,
        "meta": {
            "meses_observados": len(por_mes),
            "mes_pico": pico and f"{MESES_PT[int(pico[5:7])]}/{pico[:4]}",
            "limitacao": "baseado nos 9 meses que temos de historico — ainda nao cobre o ano inteiro",
        },
    }


@router.get("/quando-comprar")
def quando_comprar(limite: int = Query(40, le=100), dt_fim: date | None = None):
    """Planejamento de compra por produto: demanda recente, tendencia, estoque, dias ate
    ruptura, mes de pico historico e sugestao de compra para cobertura de 30 dias.
    Janelas de venda ancoradas em dt_fim; o estoque e sempre a foto de HOJE."""
    ancora = dt_fim or date.today()
    rows = consulta.consultar(
        """WITH venda AS (
             SELECT m.codprod,
                    SUM(CASE WHEN m.dtmov >= :ancora::date-28 THEN m.qt END)      AS qt_28d,
                    SUM(CASE WHEN m.dtmov >= :ancora::date-90 THEN m.qt END)      AS qt_90d,
                    ROUND(SUM(CASE WHEN m.dtmov >= :ancora::date-90
                              THEN m.qt * m.punit END),2)                          AS fat_90d
             FROM pcmov m
             WHERE m.codoper = 'S' AND m.dtcancel IS NULL
             AND   m.dtmov < :ancora::date + 1
             GROUP BY m.codprod
           ),
           pico AS (
             SELECT codprod, mes_num, qt_mes,
                    ROW_NUMBER() OVER (PARTITION BY codprod ORDER BY qt_mes DESC) AS rn
             FROM ( SELECT m.codprod,
                           EXTRACT(MONTH FROM m.dtmov)::int AS mes_num,
                           SUM(m.qt) AS qt_mes
                    FROM pcmov m
                    WHERE m.codoper = 'S' AND m.dtcancel IS NULL
                    GROUP BY m.codprod, EXTRACT(MONTH FROM m.dtmov)::int )
           ),
           estoque AS (
             SELECT codprod,
                    SUM(COALESCE(qtestger,0) - COALESCE(qtreserv,0) - COALESCE(qtbloqueada,0)) AS disponivel
             FROM pcest GROUP BY codprod
           )
           SELECT p.codprod,
                  p.descricao,
                  v.fat_90d,
                  ROUND(COALESCE(v.qt_28d,0)::numeric / 28, 2)  AS media_dia_28d,
                  ROUND(COALESCE(v.qt_90d,0)::numeric / 90, 2)  AS media_dia_90d,
                  COALESCE(e.disponivel,0)             AS estoque_disponivel,
                  pk.mes_num                      AS mes_pico
           FROM venda v
           JOIN pcprodut p  ON p.codprod = v.codprod
           LEFT JOIN estoque e ON e.codprod = v.codprod
           LEFT JOIN pico pk   ON pk.codprod = v.codprod AND pk.rn = 1
           WHERE v.fat_90d > 0
           ORDER BY v.fat_90d DESC
           LIMIT :limite""",
        {"limite": limite, "ancora": ancora},
        cache_key=f"fut:quando-comprar:{limite}:{ancora}",
    )
    saida = []
    for r in rows:
        md28 = float(r["media_dia_28d"] or 0)
        md90 = float(r["media_dia_90d"] or 0)
        estoque = float(r["estoque_disponivel"] or 0)
        tendencia = (md28 / md90 - 1) * 100 if md90 > 0 else 0.0
        dias_ruptura = round(estoque / md28, 1) if md28 > 0 else None
        demanda_30d = md28 * 30 * (1 + max(min(tendencia, 50), -50) / 100 / 2)  # tendencia amortecida
        sugestao = max(0, round(demanda_30d - estoque))
        if dias_ruptura is None:
            status = "sem_giro"
        elif dias_ruptura < 7:
            status = "ruptura_iminente"
        elif dias_ruptura < 15:
            status = "atencao"
        elif dias_ruptura > 60:
            status = "excesso"
        else:
            status = "saudavel"
        saida.append({
            "codprod": r["codprod"],
            "descricao": r["descricao"],
            "fat_90d": float(r["fat_90d"] or 0),
            "media_dia_28d": md28,
            "tendencia_pct": round(tendencia, 1),
            "estoque_disponivel": estoque,
            "dias_ate_ruptura": dias_ruptura,
            "mes_pico": MESES_PT[int(r["mes_pico"])] if r["mes_pico"] else None,
            "comprar_agora_un": sugestao,
            "status": status,
        })
    criticos = sum(1 for s in saida if s["status"] in ("ruptura_iminente", "atencao"))
    return {
        "id": "FUT-03",
        "titulo": "Quando e quanto comprar (cobertura-alvo 30 dias)",
        "rows": saida,
        "meta": {
            "produtos_analisados": len(saida),
            "em_risco_de_ruptura": criticos,
            "como_calculamos": "olhamos a venda dos ultimos 28 dias, se esta crescendo ou caindo, e o mes que cada produto mais vendeu",
        },
    }


@router.get("/clientes-risco")
def clientes_risco(dt_fim: date | None = None):
    """Risco de churn: recencia da ultima compra vs ciclo individual de recompra.
    Recencia medida em relacao a ancora (dt_fim do filtro)."""
    ancora = dt_fim or date.today()
    rows = consulta.consultar(
        f"""SELECT c.codcli,
                   c.cliente,
                   u.nome AS rca,
                   COUNT(DISTINCT n.dtsaida::date)                     AS compras,
                   to_char(MAX(n.dtsaida),'YYYY-MM-DD')                 AS ultima_compra,
                   ROUND(:ancora::date - MAX(n.dtsaida))               AS dias_sem_comprar,
                   ROUND((MAX(n.dtsaida) - MIN(n.dtsaida)) /
                         NULLIF(COUNT(DISTINCT n.dtsaida::date) - 1, 0), 1) AS ciclo_medio_dias,
                   ROUND(SUM(n.vltotal)::numeric, 2)                             AS valor_total
            FROM pcnfsaid n
            JOIN pcclient c ON c.codcli = n.codcli
            LEFT JOIN pcusuari u ON u.codusur = c.codusur1
            WHERE n.dtcancel IS NULL
            AND   n.dtsaida < :ancora::date + 1
            AND   {EXISTE_ITEM_VENDA}
            GROUP BY c.codcli, c.cliente, u.nome
            HAVING COUNT(DISTINCT n.dtsaida::date) >= 2
            ORDER BY valor_total DESC""",
        {"ancora": ancora},
        cache_key=f"fut:clientes-risco:{ancora}",
    )
    saida = []
    for r in rows:
        ciclo = float(r["ciclo_medio_dias"] or 0)
        recencia = float(r["dias_sem_comprar"] or 0)
        score = round(recencia / ciclo, 2) if ciclo > 0 else None
        if score is None:
            risco = "indefinido"
        elif score >= 2.5:
            risco = "provavelmente_perdido"
        elif score >= 1.8:
            risco = "alto"
        elif score >= 1.2:
            risco = "medio"
        else:
            risco = "saudavel"
        saida.append({**r, "score_risco": score, "risco": risco})
    em_risco = [s for s in saida if s["risco"] in ("alto", "provavelmente_perdido")]
    return {
        "id": "FUT-04",
        "titulo": "Clientes em risco de abandono",
        "rows": sorted(saida, key=lambda s: (s["score_risco"] or 0), reverse=True),
        "meta": {
            "clientes_ativos_analisados": len(saida),
            "em_risco": len(em_risco),
            "receita_em_risco": round(sum(s["valor_total"] for s in em_risco), 2),
            "como_calculamos": "comparamos ha quanto tempo o cliente nao compra com o ritmo normal de compra dele",
        },
    }


@router.get("/caixa-previsto")
def caixa_previsto(semanas: int = Query(8, ge=4, le=13), dt_fim: date | None = None):
    """Entrada de caixa prevista por semana: titulos abertos por vencimento,
    deslocados pelo atraso mediano historico de pagamento. Parte da ancora (dt_fim)."""
    ancora = dt_fim or date.today()
    historico = consulta.consultar(
        """SELECT ROUND(dtpag - dtvenc) AS atraso
           FROM pcprest
           WHERE dtpag IS NOT NULL AND dtvenc >= :ancora::date - 365""",
        {"ancora": ancora},
        cache_key=f"fut:atrasos-hist:{ancora}",
    )
    atrasos = [float(h["atraso"]) for h in historico if h["atraso"] is not None]
    atraso_mediano = statistics.median(atrasos) if atrasos else 0.0
    pontualidade = round(100 * sum(1 for a in atrasos if a <= 0) / len(atrasos), 1) if atrasos else None

    abertos = consulta.consultar(
        """SELECT to_char(date_trunc('week', dtvenc),'YYYY-MM-DD') AS semana_venc,
                  ROUND(SUM(valor - COALESCE(vpago,0))::numeric,2)       AS valor
           FROM pcprest
           WHERE dtpag IS NULL
           AND   dtvenc BETWEEN :ancora::date - 60 AND :ancora::date + :dias
           GROUP BY date_trunc('week', dtvenc)
           ORDER BY 1""",
        {"dias": semanas * 7, "ancora": ancora},
        cache_key=f"fut:caixa:{semanas}:{ancora}",
    )
    desloc = timedelta(days=atraso_mediano)
    hoje = ancora
    por_semana: dict[str, float] = {}
    for r in abertos:
        venc = date.fromisoformat(r["semana_venc"])
        prev = venc + desloc
        if prev < hoje:
            prev = hoje  # vencidos: assumimos recebimento na semana corrente em diante
        chave = (prev - timedelta(days=prev.weekday())).isoformat()
        por_semana[chave] = por_semana.get(chave, 0) + float(r["valor"])
    rows = [{"semana": k, "valor_previsto": round(v, 2)} for k, v in sorted(por_semana.items())][:semanas]
    return {
        "id": "FUT-05",
        "titulo": f"Caixa previsto — próximas {semanas} semanas",
        "rows": rows,
        "meta": {
            "atraso_mediano_dias": atraso_mediano,
            "pontualidade_historica_pct": pontualidade,
            "total_previsto": round(sum(r["valor_previsto"] for r in rows), 2),
            "como_calculamos": "somamos as contas a vencer de cada semana, ajustando pelo costume de pagamento dos clientes",
        },
    }


@router.get("/demanda-produtos")
def demanda_produtos(top: int = Query(8, ge=3, le=15), dt_fim: date | None = None):
    """Previsao de unidades 30d para os produtos de maior giro (tendencia amortecida)."""
    ancora = dt_fim or date.today()
    rows = consulta.consultar(
        """WITH top_prod AS (
             SELECT codprod FROM (
               SELECT m.codprod, SUM(m.qt*m.punit) AS fat
               FROM pcmov m
               WHERE m.codoper='S' AND m.dtcancel IS NULL AND m.dtmov >= :ancora::date-90
               GROUP BY m.codprod ORDER BY fat DESC
             ) LIMIT :top
           )
           SELECT m.codprod,
                  p.descricao,
                  ROUND(SUM(CASE WHEN m.dtmov >= :ancora::date-30 THEN m.qt END))     AS un_30d,
                  ROUND(SUM(CASE WHEN m.dtmov >= :ancora::date-60
                             AND m.dtmov <  :ancora::date-30 THEN m.qt END))          AS un_30d_ant,
                  ROUND(SUM(CASE WHEN m.dtmov >= :ancora::date-90 THEN m.qt END)::numeric/3)   AS media_mensal_90d
           FROM pcmov m
           JOIN top_prod t ON t.codprod = m.codprod
           JOIN pcprodut p ON p.codprod = m.codprod
           WHERE m.codoper='S' AND m.dtcancel IS NULL
           AND   m.dtmov < :ancora::date + 1
           GROUP BY m.codprod, p.descricao""",
        {"top": top, "ancora": ancora},
        cache_key=f"fut:demanda:{top}:{ancora}",
    )
    saida = []
    for r in rows:
        u30 = float(r["un_30d"] or 0)
        u30ant = float(r["un_30d_ant"] or 0)
        base = float(r["media_mensal_90d"] or 0)
        cresc = (u30 / u30ant - 1) if u30ant > 0 else 0.0
        previsao = round(max(0.0, (0.6 * u30 + 0.4 * base) * (1 + max(min(cresc, 0.5), -0.5) / 2)))
        saida.append({
            "codprod": r["codprod"],
            "descricao": r["descricao"],
            "vendido_30d": u30,
            "previsto_30d": previsao,
            "variacao_pct": round(((previsao / u30) - 1) * 100, 1) if u30 > 0 else None,
        })
    saida.sort(key=lambda s: s["previsto_30d"], reverse=True)
    return {
        "id": "FUT-06",
        "titulo": "Demanda prevista por produto — 30 dias",
        "rows": saida,
        "meta": {"como_calculamos": "media entre a venda do ultimo mes e dos ultimos 3, puxando na direcao da tendencia"},
    }
