"""Endpoints de KPIs do BI h4c.

Os SQLs seguem o catálogo validado em Z:\\h4c-bi\\discovery\\catalogo-kpis-validado.md.
Colunas confirmadas no dicionário real (fase2): PCNFSAID.VLTOTAL/DTSAIDA, PCPEDC.DATA/POSICAO/VLTOTAL,
PCPREST.VALOR/VPAGO/DTVENC/DTPAG, PCMOV.QT/PUNIT/CODOPER/DTMOV (PVENDA NAO existe nesta base).

★ REGUA CANONICA DE "NOTA DE VENDA" (validada no banco em 2026-07-17):
uma NF de saida so e venda se tiver item com CODOPER='S'. Notas sem item 'S' carregam
operacao 'SR' = REMESSA (dispensers/equipamentos em comodato) — saem do estoque mas o
cliente NAO paga: 293/293 notas com item 'S' geram titulo no contas a receber, contra
apenas 1/18 das notas 'SR'. Sem esse filtro o faturamento inflava ~6,8% (R$ 31,8 mil/mes)
e a positivacao contava 114 clientes em vez de 110.
"""
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query

from ..auth import require_user
from .. import consulta

router = APIRouter(prefix="/api/kpis", tags=["kpis"], dependencies=[Depends(require_user)])


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


def _existe_item_venda(alias: str = "n") -> str:
    """Regua canonica: exclui remessas de comodato (ver docstring do modulo)."""
    return (f"EXISTS (SELECT 1 FROM {consulta.esquema()}.pcmov m "
            f"WHERE m.numtransvenda = {alias}.numtransvenda "
            f"AND m.codoper = 'S' AND m.dtcancel IS NULL)")


def _horas(v: str | None) -> float | None:
    """'14:30' -> 14.5. None/'' -> None."""
    if not v:
        return None
    partes = str(v).split(":")
    try:
        return int(partes[0]) + (int(partes[1]) if len(partes) > 1 else 0) / 60.0
    except ValueError:
        return None


@router.get("/overview")
def overview(dt_ini: date | None = None, dt_fim: date | None = None,
             hora_ini: str | None = None, hora_fim: str | None = None):
    """Cards do dashboard: faturamento, pedidos, ticket medio, CR em aberto.
    Filtro de hora aplica-se aos PEDIDOS (PCPEDC.HORA/MINUTO); a NF nao tem hora."""
    dt_ini, dt_fim = _periodo(dt_ini, dt_fim)
    ant_ini, ant_fim = _periodo_anterior(dt_ini, dt_fim)
    o = consulta.esquema()
    h_ini, h_fim = _horas(hora_ini), _horas(hora_fim)

    def faturamento(i, f):
        # VEN-01 — faturamento bruto por NF de saida, excluindo remessas de comodato
        r = consulta.consultar(
            f"""SELECT COALESCE(SUM(n.vltotal),0) AS total, COUNT(*) AS notas
                FROM {o}.pcnfsaid n
                WHERE n.dtsaida BETWEEN :i AND :f
                AND   n.dtcancel IS NULL
                AND   {_existe_item_venda('n')}""",
            {"i": i, "f": f},
        )[0]
        return float(r["total"]), int(r["notas"])

    def pedidos(i, f):
        # VEN-04 — pedidos digitados no periodo, excluindo cancelados (POSICAO='C');
        # hora do pedido = HORA + MINUTO/60 (unico registro de hora confiavel da base)
        filtro_hora = ""
        binds: dict = {"i": i, "f": f}
        if h_ini is not None or h_fim is not None:
            filtro_hora = " AND COALESCE(hora,0) + COALESCE(minuto,0)/60.0 BETWEEN :h1 AND :h2"
            binds["h1"] = h_ini if h_ini is not None else 0
            binds["h2"] = h_fim if h_fim is not None else 24
        r = consulta.consultar(
            f"""SELECT COUNT(*) AS qtd, COALESCE(SUM(vltotal),0) AS valor
                FROM {o}.pcpedc
                WHERE data BETWEEN :i AND :f AND posicao <> 'C'{filtro_hora}""",
            binds,
        )[0]
        return int(r["qtd"]), float(r["valor"])

    fat_atual, notas_atual = faturamento(dt_ini, dt_fim)
    fat_ant, _ = faturamento(ant_ini, ant_fim)
    ped_atual, _ = pedidos(dt_ini, dt_fim)
    ped_ant, _ = pedidos(ant_ini, ant_fim)

    ticket_atual = fat_atual / notas_atual if notas_atual else 0
    # FCR-01 — carteira em aberto (posicao atual, nao depende do periodo)
    cr = consulta.consultar(
        f"""SELECT COALESCE(SUM(valor - COALESCE(vpago,0)),0) AS aberto,
                   COALESCE(SUM(CASE WHEN dtvenc < CURRENT_DATE THEN valor - COALESCE(vpago,0) END),0) AS vencido
            FROM {o}.pcprest
            WHERE dtpag IS NULL""",
        cache_key="kpi:cr-aberto",
    )[0]

    return {
        "periodo": {"dt_ini": dt_ini.isoformat(), "dt_fim": dt_fim.isoformat()},
        "cards": [
            {"id": "faturamento", "label": "Faturamento", "valor": round(fat_atual, 2),
             "formato": "moeda", "variacao_pct": _variacao(fat_atual, fat_ant)},
            {"id": "pedidos", "label": "Pedidos", "valor": ped_atual,
             "formato": "inteiro", "variacao_pct": _variacao(ped_atual, ped_ant)},
            {"id": "ticket_medio", "label": "Ticket médio", "valor": round(ticket_atual, 2),
             "formato": "moeda", "variacao_pct": None},
            {"id": "cr_aberto", "label": "A receber em aberto", "valor": round(float(cr["aberto"]), 2),
             "formato": "moeda", "extra": {"vencido": round(float(cr["vencido"]), 2)}},
        ],
    }


@router.get("/vendas/serie")
def vendas_serie(dt_ini: date | None = None, dt_fim: date | None = None):
    """VEN-02 — serie diaria de faturamento (PCNFSAID)."""
    dt_ini, dt_fim = _periodo(dt_ini, dt_fim)
    return consulta.consultar(
        f"""SELECT to_char(n.dtsaida::date,'YYYY-MM-DD') AS dia,
                   ROUND(SUM(n.vltotal)::numeric,2) AS faturamento,
                   COUNT(*) AS notas
            FROM {consulta.esquema()}.pcnfsaid n
            WHERE n.dtsaida BETWEEN :i AND :f
            AND   n.dtcancel IS NULL
            AND   {_existe_item_venda('n')}
            GROUP BY n.dtsaida::date
            ORDER BY 1""",
        {"i": dt_ini, "f": dt_fim},
    )


@router.get("/vendas/top-produtos")
def top_produtos(dt_ini: date | None = None, dt_fim: date | None = None, limite: int = Query(10, le=50),
                 hora_ini: str | None = None, hora_fim: str | None = None):
    """VEN-06 — mix por produto na venda faturada (PCMOV, saidas de venda).
    Hora via HORALANC/MINUTOLANC (hora de lancamento do item, populada nesta base)."""
    dt_ini, dt_fim = _periodo(dt_ini, dt_fim)
    h_ini, h_fim = _horas(hora_ini), _horas(hora_fim)
    filtro_hora = ""
    binds: dict = {"i": dt_ini, "f": dt_fim, "lim": limite}
    if h_ini is not None or h_fim is not None:
        filtro_hora = (" AND COALESCE(NULLIF(regexp_replace(m.horalanc::text, '[^0-9]', '', 'g'), '')::numeric,0) + COALESCE(NULLIF(regexp_replace(m.minutolanc::text, '[^0-9]', '', 'g'), '')::numeric,0)/60.0"
                       " BETWEEN :h1 AND :h2")
        binds["h1"] = h_ini if h_ini is not None else 0
        binds["h2"] = h_fim if h_fim is not None else 24
    return consulta.consultar(
        f"""SELECT m.codprod,
                   p.descricao,
                   ROUND(SUM(m.qt * m.punit)::numeric,2) AS valor,
                   ROUND(SUM(m.qt)::numeric,2) AS quantidade
            FROM {consulta.esquema()}.pcmov m
            JOIN {consulta.esquema()}.pcprodut p ON p.codprod = m.codprod
            WHERE m.dtmov BETWEEN :i AND :f
            AND   m.codoper = 'S'
            AND   m.dtcancel IS NULL{filtro_hora}
            GROUP BY m.codprod, p.descricao
            ORDER BY valor DESC
            LIMIT :lim""",
        binds,
    )


@router.get("/financeiro/aging")
def aging_receber():
    """FCR-03 — aging da carteira em aberto por faixas de atraso."""
    return consulta.consultar(
        f"""SELECT CASE
                     WHEN dtvenc >= CURRENT_DATE THEN 'A vencer'
                     WHEN CURRENT_DATE - dtvenc <= 30 THEN '1-30 dias'
                     WHEN CURRENT_DATE - dtvenc <= 60 THEN '31-60 dias'
                     WHEN CURRENT_DATE - dtvenc <= 90 THEN '61-90 dias'
                     ELSE '> 90 dias'
                   END AS faixa,
                   COUNT(*) AS titulos,
                   ROUND(SUM(valor - COALESCE(vpago,0))::numeric,2) AS valor
            FROM {consulta.esquema()}.pcprest
            WHERE dtpag IS NULL
            GROUP BY CASE
                     WHEN dtvenc >= CURRENT_DATE THEN 'A vencer'
                     WHEN CURRENT_DATE - dtvenc <= 30 THEN '1-30 dias'
                     WHEN CURRENT_DATE - dtvenc <= 60 THEN '31-60 dias'
                     WHEN CURRENT_DATE - dtvenc <= 90 THEN '61-90 dias'
                     ELSE '> 90 dias'
                   END""",
        cache_key="kpi:aging",
    )
