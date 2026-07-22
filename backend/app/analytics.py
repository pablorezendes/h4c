"""Pos-processadores Python das analises (preditivas/prescritivas).

Cada funcao recebe (rows: list[dict], params: dict) e devolve um dict
{"rows": [...], "meta": {...}} — rows prontos para o grafico do frontend.
Implementacoes em stdlib puro (statistics/math), adequadas a series de ~280 pontos.
"""
import math
import statistics
from datetime import date, datetime, timedelta

from . import calendario, regras

POSPROCESSADORES: dict[str, callable] = {}

# meta de suprimento por classe ABC (§10 da skill): a curva A (quimicos e papeis)
# tem alvo de 45 dias. B e C nao foram fixados em reuniao — defaults conservadores,
# documentados, que a reuniao com o Adriel (backlog) vai calibrar.
# ★ A curva A NAO repete o 45 aqui: sai de regras.META_COBERTURA_CURVA_A_DIAS, a
# mesma constante que /api/compras/sugestao usa como default. Duas copias do numero
# significam duas telas com metas diferentes na primeira vez que o dono mudar a meta.
META_DIAS_ABC = {"A": regras.META_COBERTURA_CURVA_A_DIAS, "B": 30, "C": 20}

MESES_PT = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho",
            "agosto", "setembro", "outubro", "novembro", "dezembro"]


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
# Projecao do FECHAMENTO DO MES CORRENTE por regra de tres de DIAS UTEIS (§7).
# Substitui as antigas "janelas moveis de 30 dias": o BI do cliente raciocina
# por ciclo mensal fechado. No comeco do mes a projecao vem None e a tela mostra
# "aguardando dados" em vez de extrapolar meio dia para o mes inteiro.
# ---------------------------------------------------------------------------

#: Texto unico do estado "aguardando dados" (§7). Nao diz mais "nenhum dia util
#: transcorrido": calendario.projetar() passou a exigir MINIMO_UTEIS_PARA_PROJETAR
#: dias, entao o aviso tambem dispara com 1 dia — e o dia corrente conta como
#: transcorrido mesmo estando pela metade. Um rotulo que afirma "nenhum" num dia em
#: que ja houve venda faz o gestor procurar bug onde ha regra.
_AVISO_AGUARDANDO = (
    f"aguardando dados (menos de {calendario.MINIMO_UTEIS_PARA_PROJETAR} dias uteis "
    "completos no mes — projetar sobre um dia pela metade daria numero instavel)"
)


def _ref_de(params: dict) -> date:
    ref = params.get("dt_fim")
    if isinstance(ref, datetime):
        return ref.date()
    if isinstance(ref, date):
        return ref
    return _parse_dia(ref) if ref else date.today()


def _rotulo_mes(d: date) -> str:
    return f"{MESES_PT[d.month - 1]} de {d.year}"


def _projecao_fechamento(rows: list[dict], campo: str, params: dict,
                         tipo_campo: str | None = None, tipo_val: str | None = None) -> dict:
    """Projeta o total do MES CORRENTE de `ref` (=dt_fim) somando o realizado dos
    dias uteis ja transcorridos e extrapolando pela regra de tres de dias uteis."""
    ref = _ref_de(params)
    ctx = calendario.contexto_projecao(ref)
    ini = _parse_dia(ctx["dt_ini"])
    realizado = 0.0
    for r in rows:
        if tipo_campo is not None and str(r.get(tipo_campo)) != tipo_val:
            continue
        d = r.get("dia")
        if d is None:
            continue
        if ini <= _parse_dia(d) <= ref:
            realizado += float(r.get(campo) or 0)
    projetado = calendario.projetar(realizado, ctx["uteis_transcorridos"], ctx["uteis_total"])
    proj = {
        "mes": ctx["mes"],
        "rotulo": f"Projecao do fechamento de {_rotulo_mes(ini)}",
        "realizado": round(realizado, 2),
        "projetado": projetado,
        "uteis_transcorridos": ctx["uteis_transcorridos"],
        "uteis_total": ctx["uteis_total"],
    }
    if projetado is None:
        proj["aviso"] = _AVISO_AGUARDANDO
    return proj


def _horizonte_ate_fim_mes(rows_limpos: list[dict], params: dict, minimo: int = 1) -> int:
    """Dias do ultimo ponto historico ate o ultimo dia do mes de `ref` — para a
    curva de previsao TERMINAR no fechamento do mes, nao 30 dias fixos."""
    ref = _ref_de(params)
    fim = calendario.ultimo_dia(ref)
    if not rows_limpos:
        return minimo
    ultimo = max(_parse_dia(r["dia"]) for r in rows_limpos)
    return max(minimo, (fim - ultimo).days)


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
    # faturamento ja vem LIQUIDO de devolucao do SQL (regra de ouro §1)
    limpos = [{"dia": r["dia"], "valor": r.get("faturamento", 0)} for r in _sem_dia_parcial(rows)]
    horizonte = _horizonte_ate_fim_mes(limpos, params)
    saida = forecast_linear_dow(limpos, "valor", horizonte)
    saida["meta"]["projecao_fechamento"] = _projecao_fechamento(rows, "faturamento", params)
    saida["meta"]["horizonte"] = "ate o ultimo dia do mes corrente"
    return saida


@registrar("ANA-PRE-02")
def _pre02(rows, params):
    limpos = [{"dia": r["dia"], "valor": r.get("qt_pedidos", 0)} for r in _sem_dia_parcial(rows)]
    horizonte = _horizonte_ate_fim_mes(limpos, params)
    saida = forecast_linear_dow(limpos, "valor", horizonte)
    saida["meta"]["projecao_fechamento"] = _projecao_fechamento(rows, "qt_pedidos", params)
    saida["meta"]["horizonte"] = "ate o ultimo dia do mes corrente"
    return saida


@registrar("ANA-SER-06")
def _ser06(rows, params):
    # termometro diario + projecao do fechamento do mes (§7); faturamento liquido (§1)
    return {"rows": rows, "meta": {"projecao_fechamento": _projecao_fechamento(rows, "faturamento", params)}}


@registrar("ANA-INT-06")
def _int06(rows, params):
    # o SQL traz duas populacoes (tipo): a projecao usa as linhas FATURAMENTO_DIA
    proj = _projecao_fechamento(rows, "valor", params, tipo_campo="tipo", tipo_val="FATURAMENTO_DIA")
    return {"rows": rows, "meta": {"projecao_fechamento": proj}}


@registrar("ANA-PRE-03")
def _pre03(rows, params):
    """Projeta o FECHAMENTO DO MES por carro-chefe: o realizado do mes corrente
    (vem repetido em cada linha do produto) extrapolado por dias uteis (§7).

    ★ A regra de tres passa por calendario.projetar() e nao por uma divisao local:
    era a unica projecao do modulo que fazia a conta a mao, e por isso continuava
    projetando com 1 dia util transcorrido enquanto ANA-PRE-01/02, ANA-SER-06 e
    ANA-INT-06 ja diziam "aguardando dados" — a mesma tela dando dois criterios.
    """
    ref = _ref_de(params)
    ctx = calendario.contexto_projecao(ref)
    t, tot = ctx["uteis_transcorridos"], ctx["uteis_total"]
    for r in rows:
        r["vl_projetado_fechamento"] = calendario.projetar(float(r.get("vl_mes_corrente") or 0), t, tot)
        r["qt_projetada_fechamento"] = calendario.projetar(float(r.get("qt_mes_corrente") or 0), t, tot)
    proj = {
        "mes": ctx["mes"],
        "rotulo": f"Projecao do fechamento de {_rotulo_mes(_parse_dia(ctx['dt_ini']))}",
        "uteis_transcorridos": t,
        "uteis_total": tot,
    }
    if t < calendario.MINIMO_UTEIS_PARA_PROJETAR:
        proj["aviso"] = _AVISO_AGUARDANDO
    return {"rows": rows, "meta": {"projecao_fechamento": proj}}


# ---------------------------------------------------------------------------
# Estoque e compras (§10): a demanda do mes fechado vira demanda DIARIA dividindo
# pelos DIAS UTEIS do mes (o calendario com feriados mora aqui, nao no SQL). O
# disponivel ja vem correto do SQL (qtest - reserv - bloqueada - pendente) e o
# TRANCADO vem separado — nunca somado no disponivel. Meta da curva A = 45 dias.
# ---------------------------------------------------------------------------

def _demanda_diaria_mes(qt_mes, dias_uteis):
    q = float(qt_mes or 0)
    return q / dias_uteis if dias_uteis else 0.0


def _contexto_mes_fechado(params: dict) -> dict:
    ini, fim = calendario.mes_fechado(_ref_de(params))
    return {"mes": ini.strftime("%Y-%m"), "dt_ini": ini.isoformat(), "dt_fim": fim.isoformat(),
            "dias_uteis": calendario.dias_uteis(ini, fim)}


@registrar("ANA-REP-01")
def _rep01(rows, params):
    ctx = _contexto_mes_fechado(params)
    du = ctx["dias_uteis"]
    for r in rows:
        disp = float(r.get("qt_disponivel") or 0)
        dd = _demanda_diaria_mes(r.get("qt_venda_mes"), du)
        pedido = float(r.get("qt_pedido_compra_aberto") or 0)
        tranc = float(r.get("qt_trancada") or 0)
        r["demanda_diaria"] = round(dd, 3)
        r["cobertura_dias"] = round(disp / dd, 1) if dd > 0 else None
        r["cobertura_dias_com_pedido"] = round((disp + pedido) / dd, 1) if dd > 0 else None
        r["dias_trancados"] = round(tranc / dd, 1) if dd > 0 else None
        meta_dias = META_DIAS_ABC.get(r.get("classe_abc"), 30)
        r["meta_dias"] = meta_dias
        if dd <= 0:
            r["classe_cobertura"] = "SEM_GIRO_MES"
        elif disp <= 0:
            r["classe_cobertura"] = "RUPTURA"
        elif disp / dd < 7:
            r["classe_cobertura"] = "RUPTURA_IMINENTE"
        elif disp / dd > meta_dias * 1.5:
            r["classe_cobertura"] = "EXCESSO"
        else:
            r["classe_cobertura"] = "SAUDAVEL"
    return {"rows": rows, "meta": {"mes_fechado": ctx["mes"], "dias_uteis": du,
                                   "meta_dias_curva_a": META_DIAS_ABC["A"]}}


@registrar("ANA-REP-03")
def _rep03(rows, params):
    """Sugestao de compra (§10): (demanda diaria x meta_dias) - disponivel - pedido
    pendente. Curva A a 45 dias. Testa o cenario de crescimento brusco (+50%) que
    ja aconteceu (fev->mar quase dobrou) e um alerta de salto vs o mes anterior.

    ★ ESTA ANALISE E IRMA DE /api/compras/sugestao (routers/compras.py::sugestao).
    As duas respondem a MESMA pergunta do §10 — "o que pedir e quanto" — e o
    comprador compara uma com a outra antes de aprovar a ordem. Duas implementacoes
    da mesma regra so param de divergir se os parametros que viram dinheiro forem
    literalmente os mesmos, entao ficam amarrados aqui, de proposito:

      1. BASE DE CUSTO — custo_unit vem do SQL da spec (PCEST.CUSTOFIN com queda
         para CUSTOREAL), a mesma coluna que compras._linhas_estoque le;
      2. ARREDONDAMENTO — math.ceil, porque nao se compra fracao de unidade;
      3. META DE DIAS — META_DIAS_ABC["A"] = regras.META_COBERTURA_CURVA_A_DIAS.

    Mexeu num lado, desce no outro. Conferido no Oracle em 2026-07-21 (mes fechado
    jun/2026, 21 dias uteis): curva A = R$ 230.374,23 aqui contra R$ 230.374,21 do
    endpoint, com as quantidades IDENTICAS SKU a SKU. Os R$ 0,02 sao um empate de
    arredondamento em um unico item — o endpoint corta o custo unitario em 4 casas
    e o DETERG MASTER STAR (cod. 13) custa 42,61125, meio decimo de milesimo que o
    round() do Python resolve para baixo, vezes 676 unidades. A outra fonte
    possivel de divergencia esta mapeada: o pendente de compra aqui e
    PCEST.QTPEDIDA e la e o saldo de PCITEM — hoje os dois sao ZERO na base inteira
    (733 linhas de PCEST), porque a operacao lanca o pedido depois de receber.

    ★ APRENDIZADO CARO: ate 2026-07-21 a sugestao era precificada pelo PRECO DE
    VENDA (vl_venda_mes / qt_venda_mes), nao pelo custo. A curva A saia
    R$ 426.011,58 contra os R$ 230.374,21 do endpoint para a MESMA compra — o
    comprador aprovava uma ordem com ~R$ 196 mil de orcamento inflado, e o total
    geral ia a R$ 447.405,72 contra R$ 242.624,54 ao custo (+84,4%).
    """
    ctx = _contexto_mes_fechado(params)
    du = ctx["dias_uteis"]
    custo_total = 0.0
    custo_curva_a = 0.0
    sem_custo = 0
    for r in rows:
        disp = float(r.get("qt_disponivel") or 0)
        pedido = float(r.get("qt_pedido_aberto") or 0)
        dd = _demanda_diaria_mes(r.get("qt_venda_mes"), du)
        classe = r.get("classe_abc")
        meta_dias = META_DIAS_ABC.get(classe, 30)
        lead = float(r.get("lt_real_medio_dias") or r.get("lt_cadastro_dias") or 0)
        custo = float(r.get("custo_unit") or 0)
        alvo = dd * meta_dias
        sug = math.ceil(max(0.0, alvo - disp - pedido))
        sug50 = math.ceil(max(0.0, dd * 1.5 * meta_dias - disp - pedido))
        ant = float(r.get("qt_venda_mes_ant") or 0)
        r["demanda_diaria"] = round(dd, 3)
        r["meta_dias"] = meta_dias
        r["lead_time_dias"] = round(lead, 1)
        r["cobertura_dias"] = round(disp / dd, 1) if dd > 0 else None
        r["sugestao_qt"] = sug
        # unitario SEM arredondar: e a auditoria da linha (qt x unitario tem de
        # reproduzir o valor exibido), e PCEST guarda ate 5 casas — cortar em 4
        # aqui faria a conta de cabeca do comprador nao fechar com a coluna
        r["custo_unitario"] = custo
        r["sugestao_valor"] = round(sug * custo, 2)
        r["sugestao_qt_mais50"] = sug50
        r["alerta_salto"] = bool(ant > 0 and dd * du > 1.5 * ant)
        if dd <= 0:
            r["status"] = "sem_giro"
        elif disp <= 0:
            r["status"] = "ruptura"
        elif disp / dd < max(7, lead):
            r["status"] = "comprar_agora"
        elif sug > 0:
            r["status"] = "repor"
        else:
            r["status"] = "ok"
        if sug > 0 and custo <= 0:
            sem_custo += 1
        custo_total += sug * custo
        if classe == "A":
            custo_curva_a += sug * custo
    aviso = "pedido de compra pendente = 0 hoje (a operacao lanca o pedido depois de receber)" \
        if rows and all(float(r.get("qt_pedido_aberto") or 0) == 0 for r in rows) else None
    return {"rows": rows, "meta": {"mes_fechado": ctx["mes"], "dias_uteis": du,
                                   "meta_dias_curva_a": META_DIAS_ABC["A"],
                                   "custo_total_sugestao": round(custo_total, 2),
                                   # a curva A sozinha e o numero comparavel com
                                   # /api/compras/sugestao (que so a apura por padrao):
                                   # sem ele o dono compara R$ 242 mil com R$ 230 mil e
                                   # acha que as duas telas discordam
                                   "custo_total_sugestao_curva_a": round(custo_curva_a, 2),
                                   "base_custo": "PCEST.CUSTOFIN (queda para CUSTOREAL) — "
                                                 "a mesma de /api/compras/sugestao",
                                   "skus_sem_custo_cadastrado": sem_custo,
                                   "aviso_pendente_zero": aviso}}


@registrar("ANA-REP-05")
def _rep05(rows, params):
    """Cada linha e um ponto (produto x dia) da curva de disponivel. Aqui so
    anexamos, por produto, a demanda diaria do mes fechado e os dias ate a ruptura
    a partir do ultimo disponivel — a projecao fina (OLS) fica no frontend."""
    ctx = _contexto_mes_fechado(params)
    du = ctx["dias_uteis"]
    ultimo = {}
    for r in rows:
        cod = r.get("codprod")
        d = r.get("data")
        if cod is None or d is None:
            continue
        dd = _demanda_diaria_mes(r.get("qt_venda_mes"), du)
        r["demanda_diaria"] = round(dd, 3)
        anterior = ultimo.get(cod)
        if anterior is None or _parse_dia(d) >= _parse_dia(anterior["data"]):
            ultimo[cod] = r
    for r in ultimo.values():
        disp = float(r.get("qt_disponivel") or 0)
        dd = float(r.get("demanda_diaria") or 0)
        lead = float(r.get("lt_cadastro_dias") or 0)
        r["dias_ate_ruptura"] = round(disp / dd, 1) if dd > 0 else None
        r["rompe_antes_da_reposicao"] = bool(dd > 0 and disp / dd < max(1, lead))
    return {"rows": rows, "meta": {"mes_fechado": ctx["mes"], "dias_uteis": du}}


@registrar("ANA-REP-06")
def _rep06(rows, params):
    """Dinheiro parado: excedente sobre o alvo de 45 dias (curva A) por dias uteis
    do mes fechado. Mantem so quem esta sem giro ou acima do alvo."""
    ctx = _contexto_mes_fechado(params)
    du = ctx["dias_uteis"]
    saida, imob_total = [], 0.0
    for r in rows:
        fisico = float(r.get("qt_estoque_fisico") or 0)
        custo = float(r.get("custo_unit") or 0)
        pedido = float(r.get("qt_pedido_aberto") or 0)
        dd = _demanda_diaria_mes(r.get("qt_venda_mes"), du)
        alvo_un = dd * META_DIAS_ABC["A"]  # 45 dias
        cobertura = round(fisico / dd, 1) if dd > 0 else None
        excedente = max(0.0, fisico - alvo_un)
        r["demanda_diaria"] = round(dd, 3)
        r["cobertura_dias"] = cobertura
        r["vl_excedente_vs_alvo"] = round(excedente * custo, 2)
        if dd <= 0 and pedido > 0:
            r["acao_sugerida"] = "SEM_GIRO_CANCELAR_PEDIDO_ABERTO"
        elif dd <= 0:
            r["acao_sugerida"] = "SEM_GIRO_AVALIAR_QUEIMA"
        elif pedido > 0:
            r["acao_sugerida"] = "EXCESSO_SUSPENDER_PEDIDO_ABERTO"
        elif cobertura is not None and cobertura > 120:
            r["acao_sugerida"] = "EXCESSO_CRITICO_ACAO_COMERCIAL"
        elif cobertura is not None and cobertura > 60:
            r["acao_sugerida"] = "EXCESSO_PAUSAR_COMPRA"
        else:
            r["acao_sugerida"] = None
        if r["acao_sugerida"] is not None:
            imob_total += float(r.get("vl_imobilizado") or 0)
            saida.append(r)
    saida.sort(key=lambda r: float(r.get("vl_imobilizado") or 0), reverse=True)
    return {"rows": saida, "meta": {"mes_fechado": ctx["mes"], "dias_uteis": du,
                                    "vl_imobilizado_total": round(imob_total, 2)}}


@registrar("ANA-MRG-02")
def _mrg02(rows, params):
    """Classifica cada produto em 4 grupos de acao (proteger/renegociar/empurrar/revisar).

    Os dois cortes sao numeros que o dono ja acompanha, nao estatistica:
      - "vende muito"  = esta entre os produtos que somados fazem 80% da venda
                         (mediana de share daria ~0,27% e chamaria 182 itens de campeao);
      - "lucra bem"    = margem acima da margem consolidada da empresa no periodo
                         (mediana de margem_pct e media nao-ponderada: um item de R$ 80
                         pesaria igual a um de R$ 102 mil).
    """
    def num(v) -> float:
        return float(v or 0)

    venda_tot = sum(num(r.get("venda")) for r in rows)
    lucro_tot = sum(num(r.get("margem_valor")) for r in rows)
    mg_empresa = 100 * lucro_tot / venda_tot if venda_tot else 0.0

    # marca na propria linha, sem depender de codprod ser unico (ou existir), e
    # acumula a partir de venda/venda_tot em vez de confiar em share_venda_pct:
    # se a coluna faltasse, o acumulado ficaria em 0 e TODO produto viraria campeao
    acumulado = 0.0
    for r in sorted(rows, key=lambda r: num(r.get("venda")), reverse=True):
        r["_vende_muito"] = acumulado < 80.0
        acumulado += 100 * num(r.get("venda")) / venda_tot if venda_tot else 0.0

    for r in rows:
        mg = r.get("margem_pct")
        if mg is None or r.get("custo") is None:
            r["grupo"] = "sem_custo"
        else:
            # piso em zero: num periodo em que a empresa fecha no prejuizo, o corte
            # nu promoveria produto vendido ABAIXO DO CUSTO a "Campeao — proteger"
            muito, lucra = r.pop("_vende_muito", False), float(mg) >= max(mg_empresa, 0.0)
            r["grupo"] = ("campeoes" if lucra else "volume_fino") if muito else \
                         ("joias" if lucra else "peso_morto")
        r["abaixo_do_custo"] = mg is not None and float(mg) < 0
        r.pop("_vende_muito", None)  # linhas sem custo nao passam pelo pop acima

    return {"rows": rows, "meta": {"margem_empresa_pct": round(mg_empresa, 1)}}


def media_movel(valores: list[float], janela: int) -> list[float | None]:
    out: list[float | None] = []
    for i in range(len(valores)):
        if i + 1 < janela:
            out.append(None)
        else:
            out.append(round(sum(valores[i + 1 - janela : i + 1]) / janela, 2))
    return out
