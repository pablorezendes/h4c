"""Calendario de dias uteis do BI — base das projecoes de fechamento de mes.

A skill do cliente (§7) manda projetar o FECHAMENTO DO MES por regra de tres de
DIAS UTEIS, nunca "proximos 30 dias" nem dias corridos:

    Projecao = realizado no mes ate hoje / dias uteis transcorridos * dias uteis do mes

Por que calendario proprio e nao PCDIASUTEIS: a tabela existe no Winthor e cobre
2025-2026, mas so marca DOIS feriados no ano inteiro (01/01 e 01/05) — e um
esqueleto seg-sex, nao um calendario. Usa-la levaria abril e dezembro a ter dois
dias uteis a mais e a projecao a subestimar o fechamento. A propria skill autoriza:
"se estiver desatualizada, manter calendario proprio de dias uteis/feriados".

Feriados moveis saem da Pascoa (algoritmo de Butcher), entao o calendario vale
para qualquer ano sem manutencao. Feriados estaduais/municipais (Goiania/GO) nao
sao chutados aqui: entram na tabela app.feriado, editavel (ver migracoes.py).
"""
from datetime import date, timedelta
from functools import lru_cache

# feriados nacionais fixos (dia, mes) — inclui 20/11, nacional desde 2024
FIXOS = [(1, 1), (21, 4), (1, 5), (7, 9), (12, 10), (2, 11), (15, 11), (20, 11), (25, 12)]


def pascoa(ano: int) -> date:
    """Domingo de Pascoa (algoritmo de Butcher/Meeus, calendario gregoriano)."""
    a, b, c = ano % 19, ano // 100, ano % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    mes = (h + l - 7 * m + 114) // 31
    dia = ((h + l - 7 * m + 114) % 31) + 1
    return date(ano, mes, dia)


@lru_cache(maxsize=32)
def feriados_nacionais(ano: int) -> frozenset[date]:
    """Fixos + moveis derivados da Pascoa (carnaval, sexta-feira santa, corpus christi)."""
    p = pascoa(ano)
    moveis = [p - timedelta(days=48), p - timedelta(days=47), p - timedelta(days=2), p + timedelta(days=60)]
    return frozenset([date(ano, m, d) for d, m in FIXOS] + moveis)


def _extras() -> frozenset[date]:
    """Feriados locais cadastrados pelo gestor em app.feriado (nunca quebra o BI)."""
    try:
        from . import pg
        return frozenset(r["data"] for r in pg.consultar("SELECT data FROM app.feriado"))
    except Exception:  # noqa: BLE001 — sem espelho/tabela, vale so o calendario nacional
        return frozenset()


def eh_util(d: date, extras: frozenset[date] | None = None) -> bool:
    if d.weekday() >= 5:  # sabado/domingo
        return False
    return d not in feriados_nacionais(d.year) and d not in (extras if extras is not None else _extras())


def dias_uteis(ini: date, fim: date) -> int:
    """Quantidade de dias uteis no intervalo fechado [ini, fim]."""
    if fim < ini:
        return 0
    extras = _extras()
    return sum(1 for n in range((fim - ini).days + 1) if eh_util(ini + timedelta(days=n), extras))


def primeiro_dia(d: date) -> date:
    return d.replace(day=1)


def ultimo_dia(d: date) -> date:
    return (primeiro_dia(d) + timedelta(days=32)).replace(day=1) - timedelta(days=1)


def mes_anterior(d: date) -> date:
    return primeiro_dia(d) - timedelta(days=1)


def mes_fechado(ref: date | None = None) -> tuple[date, date]:
    """Ultimo mes FECHADO (dia 1 ao ultimo dia) anterior ao mes de `ref`."""
    ref = ref or date.today()
    fim = primeiro_dia(ref) - timedelta(days=1)
    return primeiro_dia(fim), fim


def mes_corrente(ref: date | None = None) -> tuple[date, date]:
    ref = ref or date.today()
    return primeiro_dia(ref), ultimo_dia(ref)


def contexto_projecao(ref: date | None = None, inclui_hoje: bool = True) -> dict:
    """Numeros da regra de tres do mes corrente, prontos para o card.

    `inclui_hoje` conta o dia de hoje como transcorrido (padrao). O rotulo da tela
    deve dizer qual criterio esta em uso — a skill exige que a projecao seja explicita.
    """
    ref = ref or date.today()
    ini, fim = mes_corrente(ref)
    ate = ref if inclui_hoje else ref - timedelta(days=1)
    return {
        "mes": ini.strftime("%Y-%m"),
        "dt_ini": ini.isoformat(),
        "dt_fim": fim.isoformat(),
        "uteis_total": dias_uteis(ini, fim),
        "uteis_transcorridos": dias_uteis(ini, ate) if ate >= ini else 0,
        "inclui_dia_corrente": inclui_hoje,
    }


#: Minimo de dias uteis transcorridos para projetar. Sao 2 e nao 1 porque o dia
#: corrente conta como transcorrido mesmo estando pela metade: no primeiro dia util
#: do mes a projecao seria a manha de um unico dia multiplicada por ~22 — um numero
#: instavel e alarmante, exatamente o que o estado "aguardando dados" evita.
MINIMO_UTEIS_PARA_PROJETAR = 2


def projetar(realizado: float, uteis_transcorridos: int, uteis_total: int) -> float | None:
    """Regra de tres de dias uteis. None enquanto nao houver um dia util COMPLETO —
    a tela mostra "aguardando dados" em vez de projetar de meio dia."""
    if uteis_transcorridos < MINIMO_UTEIS_PARA_PROJETAR:
        return None
    return round(float(realizado) / uteis_transcorridos * uteis_total, 2)
