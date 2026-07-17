"""Pos-processadores Python das analises (preditivas/prescritivas).

Cada funcao recebe (rows: list[dict], params: dict) e devolve um dict
{"rows": [...], "meta": {...}} — rows prontos para o grafico do frontend.
Implementacoes em stdlib puro (statistics/math), adequadas a series de ~280 pontos.
"""
import math
import statistics
from datetime import date, datetime, timedelta

POSPROCESSADORES: dict[str, callable] = {}


def registrar(analise_id: str):
    def deco(fn):
        POSPROCESSADORES[analise_id] = fn
        return fn
    return deco


def aplicar(analise_id: str, rows: list[dict], params: dict) -> dict:
    fn = POSPROCESSADORES.get(analise_id)
    if fn is None:
        return {"rows": rows, "meta": {}}
    return fn(rows, params)


# ---------------------------------------------------------------------------
# Forecast: regressao linear (tendencia) + fatores multiplicativos de
# dia-da-semana, com intervalo ~95% pelo desvio dos residuos.
# Serve para qualquer serie diaria [{dia: 'YYYY-MM-DD', valor: n}].
# ---------------------------------------------------------------------------

def _parse_dia(d) -> date:
    if isinstance(d, datetime):
        return d.date()
    if isinstance(d, date):
        return d
    return datetime.strptime(str(d)[:10], "%Y-%m-%d").date()


def forecast_linear_dow(rows: list[dict], campo_valor: str, horizonte: int = 30) -> dict:
    serie = [(_parse_dia(r["dia"]), float(r[campo_valor] or 0)) for r in rows]
    serie.sort(key=lambda t: t[0])
    if len(serie) < 28:
        return {"rows": [dict(r, tipo="historico") for r in rows], "meta": {"erro": "serie curta demais para forecast (<28 dias)"}}

    dias = [t[0] for t in serie]
    y = [t[1] for t in serie]
    n = len(y)
    x = list(range(n))

    # tendencia linear (minimos quadrados)
    mx, my = statistics.fmean(x), statistics.fmean(y)
    sxx = sum((xi - mx) ** 2 for xi in x) or 1.0
    b = sum((xi - mx) * (yi - my) for xi, yi in zip(x, y)) / sxx
    a = my - b * mx

    # fatores de dia-da-semana sobre a tendencia
    razoes: dict[int, list[float]] = {i: [] for i in range(7)}
    for xi, (d, yi) in zip(x, serie):
        base = a + b * xi
        if base > 0:
            razoes[d.weekday()].append(yi / base)
    fator = {wd: (statistics.fmean(v) if v else 1.0) for wd, v in razoes.items()}

    # residuos do modelo ajustado
    ajuste = [(a + b * xi) * fator[d.weekday()] for xi, (d, _) in zip(x, serie)]
    residuos = [yi - fi for yi, fi in zip(y, ajuste)]
    dp = statistics.pstdev(residuos) if len(residuos) > 1 else 0.0

    saida = [
        {"dia": d.isoformat(), "valor": round(v, 2), "tipo": "historico"}
        for d, v in serie
    ]
    ultimo = dias[-1]
    for h in range(1, horizonte + 1):
        d = ultimo + timedelta(days=h)
        prev = max(0.0, (a + b * (n - 1 + h)) * fator[d.weekday()])
        saida.append({
            "dia": d.isoformat(),
            "valor": round(prev, 2),
            "ic_min": round(max(0.0, prev - 1.96 * dp), 2),
            "ic_max": round(prev + 1.96 * dp, 2),
            "tipo": "previsao",
        })

    total_prev = sum(r["valor"] for r in saida if r["tipo"] == "previsao")
    return {
        "rows": saida,
        "meta": {
            "metodo": "regressao linear + fatores dia-da-semana",
            "horizonte_dias": horizonte,
            "tendencia_diaria": round(b, 2),
            "desvio_residuo": round(dp, 2),
            "total_previsto_horizonte": round(total_prev, 2),
        },
    }


# --- pos-processadores registrados para analises da spec (analises-spec.json) ---

def _sem_dia_parcial(rows: list[dict]) -> list[dict]:
    hoje = date.today().isoformat()
    return [r for r in rows if str(_parse_dia(r["dia"]))[:10] != hoje]


@registrar("ANA-PRE-01")
def _pre01(rows, params):
    limpos = [{"dia": r["dia"], "valor": r.get("faturamento", 0)} for r in _sem_dia_parcial(rows)]
    return forecast_linear_dow(limpos, "valor", 30)


@registrar("ANA-PRE-02")
def _pre02(rows, params):
    limpos = [{"dia": r["dia"], "valor": r.get("qt_pedidos", 0)} for r in _sem_dia_parcial(rows)]
    return forecast_linear_dow(limpos, "valor", 30)


def media_movel(valores: list[float], janela: int) -> list[float | None]:
    out: list[float | None] = []
    for i in range(len(valores)):
        if i + 1 < janela:
            out.append(None)
        else:
            out.append(round(sum(valores[i + 1 - janela : i + 1]) / janela, 2))
    return out
