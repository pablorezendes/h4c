"""Aba COMERCIAL — faturamento liquido, metas com semaforo e desempenho por RCA.

Tudo aqui deriva de `regras.py` (medida canonica) e `calendario.py` (dias uteis).
Nenhum numero e recalculado a mao: se a medida mudar, muda em um lugar so.

★ CICLO MENSAL FECHADO E A UNIDADE DE ANALISE (§7 da regra do cliente)
O padrao de TODO endpoint e o ULTIMO MES FECHADO, e o comparativo de um mes fechado
e o MES FECHADO ANTERIOR — nunca uma janela movel deslocada. Comparar "01/06 a 30/06"
com "02/05 a 31/05" faria o mes de 31 dias perder um dia util e inventar variacao onde
nao ha. `_periodo_anterior()` detecta o mes cheio e recua de mes, nao de dias.

★ POSITIVACAO SEGUE A DEFINICAO DA ROTINA 1464, NAO O CADASTRO
Carteira = clientes que compraram nos ULTIMOS 90 DIAS terminando no fim do periodo
("Nº Dias Clientes Ativos = 90" da 1464); positivados = os que compraram no periodo.
Medido na producao (jun/2026): 112 / 153 = 73,2% — abr 63,8% · mai 71,0%. Pela outra
definicao possivel (carteira = todo cliente cadastrado no RCA) o indicador cai para
40-47% e a meta de 80% viraria inalcancavel por construcao — seria trocar o termometro
para o numero ficar bonito, com o efeito contrario.

★ DEVOLUCAO POR RCA E INFORMATIVA (§5.4)
Sai de graca da medida canonica e e exibida, mas SEM meta e SEM semaforo: a criacao de
meta individual de devolucao por vendedor e backlog e depende de decisao do cliente.
(No semestre o RCA 4 concentra 58% da devolucao, 8,03% do bruto dele — e um alerta de
conversa, nao de cobranca automatica.)

★ DEPARTAMENTO VEM DO CADASTRO DO PRODUTO
PCPRODUT.CODEPTO, como manda o mapeamento da 1464 — nunca PCMOV.CODEPTO (classificacao
historica, diverge do cadastro). O join com pcprodut so entra quando ha filtro/quebra
por departamento, para nao pagar o custo nas consultas de total.

★ AUTORIZACAO EM DUAS CAMADAS + CARTEIRA (permissoes.py)
A aba protege o router (`requer('comercial')`) e cada relatorio protege o proprio
endpoint (`requer('comercial.rca')`). A terceira camada e a CARTEIRA: todo endpoint
daqui aceita o filtro `rcas`, e o valor efetivo sai de `permissoes.escopo_rca()` —
para quem e `restrito_a_carteira` o que veio na querystring e IGNORADO, nao
validado. Medido na producao (jun/2026, filial 1): a empresa faturou
R$ 416.378,65 liquidos em 112 clientes; sob o escopo do RCA 3 sao R$ 41.737,96 em
21 clientes. Sem o escopo, um `?rcas=1,4` na mao entregaria R$ 172.734,50 e 66
clientes das carteiras dos colegas.

★ O ESCOPO ENTRA ANTES DO CACHE, NAO DEPOIS. `_chave()` ja carrega a lista de RCAs,
entao trocar `lista_rcas` pelo escopo efetivo LOGO NA ENTRADA do handler faz o
cache_key mudar junto. Se o filtro fosse aplicado so na hora de montar o SQL, o
vendedor e o dono compartilhariam a mesma chave e o segundo a chegar receberia o
resultado cacheado do primeiro — vazamento, nao lentidao.

SQL POSTGRES (espelho `winthor`), binds no estilo Oracle `:nome` — ver consulta.py.
"""
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query

from .. import calendario, consulta, permissoes, regras

router = APIRouter(prefix="/api/comercial", tags=["comercial"],
                   dependencies=[Depends(permissoes.requer("comercial"))])

MESES_PT = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho",
            "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]

#: "TODOS OS DEPARTAMENTOS" — linha de agrupamento do cadastro, nao um departamento.
#: Hoje nenhum produto aponta para ela; o filtro e defensivo (se alguem cadastrar, o
#: total nao pode dobrar).
DEPTO_AGREGADOR = 9999


# ---------------------------------------------------------------------------
# Entrada: filtros globais da visao Comercial (§3)
# ---------------------------------------------------------------------------

def _lista_int(valor: str | None, campo: str) -> list[int]:
    """Converte o csv da query ("1,3") em [1, 3]. Vazio/None -> [] (= todos os itens).

    Entrada nao numerica devolve 422 — mas lista VAZIA nao: a tela manda o parametro
    em branco quando o usuario limpa o filtro, e recusar isso derrubaria o dashboard
    inteiro por causa de um filtro apagado.
    """
    if not valor or not valor.strip():
        return []
    saida: list[int] = []
    for parte in valor.split(","):
        parte = parte.strip()
        if not parte:
            continue
        try:
            saida.append(int(parte))
        except ValueError:
            raise HTTPException(422, f"Filtro '{campo}' invalido: '{parte}' nao e um numero inteiro")
    return saida


def _rcas(usuario, rcas: str | None) -> list[int]:
    """Lista EFETIVA de RCAs desta requisicao: o que foi pedido, ja sob o escopo.

    Ponto unico de entrada de proposito. Todo handler desta aba chama isto em vez
    de `_lista_int(rcas, 'rcas')` — quem esquecer o escopo aqui esquece tambem no
    cache_key, e a proxima leitura do dono devolveria a carteira ao vendedor.
    """
    return permissoes.escopo_rca(usuario, _lista_int(rcas, "rcas"))


def _mes_cheio(dt_ini: date, dt_fim: date) -> bool:
    return (dt_ini == calendario.primeiro_dia(dt_ini)
            and dt_fim == calendario.ultimo_dia(dt_ini)
            and (dt_ini.year, dt_ini.month) == (dt_fim.year, dt_fim.month))


def _periodo(dt_ini: date | None, dt_fim: date | None) -> tuple[date, date]:
    """Default = ultimo mes FECHADO. Nunca "ultimos 30 dias" (§7)."""
    if dt_ini is None and dt_fim is None:
        return calendario.mes_fechado()
    if dt_ini is None:
        dt_ini = calendario.primeiro_dia(dt_fim)          # type: ignore[arg-type]
    if dt_fim is None:
        dt_fim = calendario.ultimo_dia(dt_ini)
    if dt_fim < dt_ini:
        raise HTTPException(422, "dt_fim anterior a dt_ini")
    return dt_ini, dt_fim


def _periodo_anterior(dt_ini: date, dt_fim: date) -> tuple[date, date]:
    """Mes cheio compara com o MES FECHADO ANTERIOR; periodo solto recua N dias."""
    if _mes_cheio(dt_ini, dt_fim):
        return calendario.mes_fechado(dt_ini)
    dias = (dt_fim - dt_ini).days + 1
    return dt_ini - timedelta(days=dias), dt_ini - timedelta(days=1)


def _rotulo(dt_ini: date, dt_fim: date) -> str:
    if _mes_cheio(dt_ini, dt_fim):
        return f"{MESES_PT[dt_ini.month - 1]}/{dt_ini.year}"
    return f"{dt_ini.strftime('%d/%m/%Y')} a {dt_fim.strftime('%d/%m/%Y')}"


def _rotulo_mes(d: date) -> str:
    return f"{MESES_PT[d.month - 1]}/{d.year}"


def _fechado(dt_fim: date) -> bool:
    """Periodo encerrado = terminou antes do mes corrente comecar."""
    return dt_fim < calendario.primeiro_dia(date.today())


def _chave(*partes) -> str:
    return "com:" + ":".join(str(p) for p in partes)


# ---------------------------------------------------------------------------
# Montagem do SQL: origem, filtros e binds
# ---------------------------------------------------------------------------

def _origem(deptos: list[int], por_depto: bool = False) -> str:
    """FROM canonico. O join com pcprodut so aparece quando ha filtro ou quebra
    por departamento — nas consultas de total ele seria peso puro."""
    o = consulta.esquema()
    sql = f"{o}.pcmov m"
    if deptos or por_depto:
        sql += f" JOIN {o}.pcprodut p ON p.codprod = m.codprod"
    return sql


def _filtros(rcas: list[int], deptos: list[int], por_depto: bool = False) -> str:
    cond = regras.clausula_rca(rcas) + regras.clausula_depto(deptos)
    if deptos or por_depto:
        cond += f" AND COALESCE(p.codepto, 0) <> {DEPTO_AGREGADOR}"
    return cond


def _binds(dt_ini: date, dt_fim: date, rcas: list[int], deptos: list[int]) -> dict:
    b = regras.periodo_binds(dt_ini, dt_fim)
    b.update(regras.binds_dimensao(rcas, deptos))
    return b


# ---------------------------------------------------------------------------
# Numeros derivados (a razao fica no Python; o SQL devolve so as somas)
# ---------------------------------------------------------------------------

def _f(v) -> float:
    return float(v or 0)


def _pct(parte: float, todo: float, casas: int = 2) -> float | None:
    return round(parte / todo * 100, casas) if todo else None


def _variacao(atual: float, anterior: float) -> float | None:
    return round((atual - anterior) / abs(anterior) * 100, 1) if anterior else None


def _margem(liquido: float, custo: float) -> float | None:
    """Margem de CONTRIBUICAO (antes de imposto e frete), sobre o liquido.
    A devolucao ja abateu receita e custo dentro da medida — sem isso a margem infla."""
    return _pct(liquido - custo, liquido)


#: Mes como TEXTO 'YYYY-MM'. Sempre a MESMA expressao no SELECT e no GROUP BY, e
#: sempre texto: o espelho guarda dtmov como timestamp, e devolver date/timestamp faz
#: o casamento em Python falhar em silencio (a tela mostra zero, sem erro nenhum).
MES_TEXTO = "to_char(date_trunc('month', m.dtmov), 'YYYY-MM')"

SOMAS = f"""COALESCE({regras.valor_bruto()}, 0)      AS bruto,
            COALESCE({regras.valor_devolucao()}, 0)  AS devolucao,
            COALESCE({regras.valor_liquido()}, 0)    AS liquido,
            COALESCE({regras.custo_liquido()}, 0)    AS custo"""


def _totais(dt_ini: date, dt_fim: date, rcas: list[int], deptos: list[int], tag: str) -> dict:
    """Somas da medida canonica no periodo, ja com os filtros globais aplicados."""
    sql = f"""SELECT {SOMAS},
                     COUNT(DISTINCT CASE WHEN m.codoper = '{regras.OPER_VENDA}' THEN m.codcli END) AS clientes,
                     COUNT(DISTINCT CASE WHEN m.codoper = '{regras.OPER_VENDA}' THEN m.numtransvenda END) AS notas
              FROM {_origem(deptos)}
              WHERE {regras.filtro_venda()}{_filtros(rcas, deptos)}"""
    r = consulta.consultar(sql, _binds(dt_ini, dt_fim, rcas, deptos),
                           cache_key=_chave(tag, dt_ini, dt_fim, rcas, deptos))[0]
    return {"bruto": _f(r["bruto"]), "devolucao": _f(r["devolucao"]), "liquido": _f(r["liquido"]),
            "custo": _f(r["custo"]), "clientes": int(r["clientes"] or 0), "notas": int(r["notas"] or 0)}


def _janela_carteira(dt_fim: date) -> date:
    """Inicio dos 90 dias de "cliente ativo" (1464), ancorado no FIM do periodo."""
    return dt_fim - timedelta(days=regras.DIAS_CLIENTE_ATIVO - 1)


def _positivacao_apuravel(dt_ini: date, dt_fim: date) -> bool:
    """Positivacao so faz sentido em periodo menor que a janela de cliente ativo.

    ★ Esticar a janela da carteira para cobrir um periodo maior que 90 dias parece
    conservador, mas faz a carteira virar o PROPRIO periodo: todo cliente do
    denominador tambem esta no numerador e a positivacao trava em 100% (verde,
    125% da meta) nos presets "3 meses" e "6 meses" da barra de filtro. Melhor
    devolver "nao apuravel" do que um verde que nunca pisca.
    """
    return (dt_fim - dt_ini).days + 1 <= regras.DIAS_CLIENTE_ATIVO


def _positivacao(dt_ini: date, dt_fim: date, rcas: list[int], deptos: list[int],
                 por_rca: bool = False) -> list[dict]:
    """Carteira (90 dias ate dt_fim) x positivados (compraram no periodo).

    So CODOPER='S': devolucao nao positiva cliente. Uma unica varredura resolve os
    dois numeros — o positivado e um recorte da propria janela da carteira.
    """
    grupo = "m.codusur," if por_rca else ""
    sql = f"""SELECT {grupo}
                     COUNT(DISTINCT m.codcli) AS carteira,
                     COUNT(DISTINCT CASE WHEN m.dtmov >= :dt_ini THEN m.codcli END) AS positivados
              FROM {_origem(deptos)}
              WHERE m.codoper = '{regras.OPER_VENDA}'
                AND m.dtcancel IS NULL
                AND m.codfilial = :filial
                AND m.dtmov >= :dt_cart
                AND m.dtmov < :dt_fim_x{_filtros(rcas, deptos)}"""
    if por_rca:
        sql += " GROUP BY m.codusur"
    binds = _binds(dt_ini, dt_fim, rcas, deptos)
    binds["dt_cart"] = _janela_carteira(dt_fim)
    return consulta.consultar(sql, binds,
                              cache_key=_chave("posit", por_rca, dt_ini, dt_fim, rcas, deptos))


def _mix(dt_ini: date, dt_fim: date, rcas: list[int], deptos: list[int],
         por_rca: bool = True, por_mes: bool = False) -> list[dict]:
    """Mix = SKUs distintos com QUANTIDADE LIQUIDA > 0 (§5.2).

    O produto so conta se a devolucao nao zerou a venda dele no mes — por isso a
    soma vem primeiro e o COUNT depois. Numeros de producao (jun/2026): empresa 231,
    RCA 1 107 (era 122 em maio), RCA 4 130 (era 104).
    """
    dims: list[tuple[str, str]] = []
    if por_rca:
        dims.append(("m.codusur", "codusur"))
    if por_mes:
        dims.append((MES_TEXTO, "mes"))
    interno = "".join(f"{expr} AS {nome}, " for expr, nome in dims)
    agrupa_interno = "".join(f"{expr}, " for expr, _ in dims)
    externo = "".join(f"t.{nome}, " for _, nome in dims)

    sql = f"""SELECT {externo}COUNT(*) AS mix
              FROM (SELECT {interno}m.codprod, {regras.qt_liquida()} AS qt_liquida
                    FROM {_origem(deptos)}
                    WHERE {regras.filtro_venda()}{_filtros(rcas, deptos)}
                    GROUP BY {agrupa_interno}m.codprod) t
              WHERE t.qt_liquida > 0"""
    if dims:
        sql += " GROUP BY " + ", ".join(f"t.{nome}" for _, nome in dims)
    return consulta.consultar(sql, _binds(dt_ini, dt_fim, rcas, deptos),
                              cache_key=_chave("mix", por_rca, por_mes, dt_ini, dt_fim, rcas, deptos))


def _projecao(rcas: list[int], deptos: list[int]) -> dict:
    """Fechamento do mes corrente por regra de tres de DIAS UTEIS (§7).

    Nunca "proximos 30 dias" e nunca dias corridos. No dia 1 do mes (0 dia util
    transcorrido) `projetado` vem null e a tela mostra "aguardando dados".
    """
    ctx = calendario.contexto_projecao()
    ini, _ = calendario.mes_corrente()
    hoje = date.today()
    t = _totais(ini, hoje, rcas, deptos, "proj")
    return {
        "mes": ctx["mes"],
        "rotulo": f"Projecao do fechamento de {_rotulo_mes(ini)}",
        "realizado_liquido": round(t["liquido"], 2),
        "projetado": calendario.projetar(t["liquido"], ctx["uteis_transcorridos"], ctx["uteis_total"]),
        "uteis_transcorridos": ctx["uteis_transcorridos"],
        "uteis_total": ctx["uteis_total"],
    }


# ---------------------------------------------------------------------------
# §4 — Resumo da aba: faturamento, margem, positivacao, ticket e projecao
# ---------------------------------------------------------------------------

@router.get("/resumo")
def resumo(dt_ini: date | None = None, dt_fim: date | None = None,
           rcas: str | None = None, deptos: str | None = None,
           usuario=Depends(permissoes.requer("comercial.resumo"))):
    lista_rcas, lista_deptos = _rcas(usuario, rcas), _lista_int(deptos, "deptos")
    dt_ini, dt_fim = _periodo(dt_ini, dt_fim)
    ant_ini, ant_fim = _periodo_anterior(dt_ini, dt_fim)

    atual = _totais(dt_ini, dt_fim, lista_rcas, lista_deptos, "resumo")
    anterior = _totais(ant_ini, ant_fim, lista_rcas, lista_deptos, "resumo")

    apuravel = _positivacao_apuravel(dt_ini, dt_fim)
    p = (_positivacao(dt_ini, dt_fim, lista_rcas, lista_deptos) or [{}])[0] if apuravel else {}
    carteira, positivados = int(p.get("carteira") or 0), int(p.get("positivados") or 0)
    posit_pct = _pct(positivados, carteira) if apuravel else None

    margem = _margem(atual["liquido"], atual["custo"])

    return {
        "periodo": {"dt_ini": dt_ini.isoformat(), "dt_fim": dt_fim.isoformat(),
                    "rotulo": _rotulo(dt_ini, dt_fim), "fechado": _fechado(dt_fim),
                    # `fechado` = o periodo ja terminou; `mes_cheio` = o periodo E um mes.
                    # A tela precisa dos dois: so o mes cheio compara com meta.
                    "mes_cheio": _mes_cheio(dt_ini, dt_fim)},
        "faturamento": {
            "liquido": round(atual["liquido"], 2),
            "bruto": round(atual["bruto"], 2),
            "devolucao": round(atual["devolucao"], 2),
            "devolucao_pct": _pct(atual["devolucao"], atual["bruto"]),
            "liquido_anterior": round(anterior["liquido"], 2),
            "variacao_pct": _variacao(atual["liquido"], anterior["liquido"]),
        },
        "margem": {"valor_pct": margem, "receita": round(atual["liquido"], 2),
                   "custo": round(atual["custo"], 2),
                   **regras.semaforo(margem, regras.META_MARGEM_PCT)},
        "positivacao": {"valor_pct": posit_pct, "positivados": positivados, "carteira": carteira,
                        "apuravel": apuravel,
                        "motivo": None if apuravel else
                        (f"positivacao e apurada em janela de ate {regras.DIAS_CLIENTE_ATIVO} dias "
                         f"(cliente ativo da rotina 1464); escolha um mes fechado"),
                        **regras.semaforo(posit_pct, regras.META_POSITIVACAO_PCT)},
        # ticket por CLIENTE (nao por nota): o dono le "quanto cada cliente comprou no mes"
        "ticket_medio": round(atual["liquido"] / atual["clientes"], 2) if atual["clientes"] else None,
        "clientes": atual["clientes"],
        "notas": atual["notas"],
        "projecao": _projecao(lista_rcas, lista_deptos),
        "periodo_anterior": {"dt_ini": ant_ini.isoformat(), "dt_fim": ant_fim.isoformat(),
                             "rotulo": _rotulo(ant_ini, ant_fim)},
        # numero menor que o esperado sem aviso vira chamado de "o BI esta errado":
        # a tela precisa poder dizer que estes valores sao so da carteira de quem olha
        "escopo_carteira": permissoes.descreve_escopo(usuario),
    }


# ---------------------------------------------------------------------------
# §4 — Serie MENSAL: e o grafico que mostra a queda de margem
# ---------------------------------------------------------------------------

def _sequencia_meses(ini: date, fim: date) -> list[date]:
    saida, d = [], calendario.primeiro_dia(ini)
    while d <= fim:
        saida.append(d)
        d = calendario.primeiro_dia(d + timedelta(days=32))
    return saida


def _janela_serie(meses: int) -> tuple[date, date]:
    """N meses FECHADOS + o mes corrente (parcial, marcado fechado=false)."""
    ini, _ = calendario.mes_fechado()
    for _ in range(max(meses, 1) - 1):
        ini = calendario.primeiro_dia(calendario.mes_anterior(ini))
    return ini, calendario.ultimo_dia(date.today())


@router.get("/serie")
def serie(meses: int = Query(12, ge=1, le=36), dt_ini: date | None = None, dt_fim: date | None = None,
          rcas: str | None = None, deptos: str | None = None,
          usuario=Depends(permissoes.requer("comercial.serie"))):
    """Serie MENSAL (nunca diaria) de bruto, devolucao, liquido, custo e margem.

    E aqui que a queda de margem aparece: 37,39% em fev -> 29,83% em jun (meta 33%),
    causada por reajuste de fornecedor sem repasse ao cliente. Serie diaria esconderia
    a tendencia no ruido do dia a dia.
    """
    lista_rcas, lista_deptos = _rcas(usuario, rcas), _lista_int(deptos, "deptos")
    if dt_ini is None and dt_fim is None:
        dt_ini, dt_fim = _janela_serie(meses)
    else:
        dt_ini, dt_fim = _periodo(dt_ini, dt_fim)
        dt_ini, dt_fim = calendario.primeiro_dia(dt_ini), calendario.ultimo_dia(dt_fim)

    sql = f"""SELECT {MES_TEXTO} AS mes, {SOMAS}
              FROM {_origem(lista_deptos)}
              WHERE {regras.filtro_venda()}{_filtros(lista_rcas, lista_deptos)}
              GROUP BY {MES_TEXTO}
              ORDER BY 1"""
    achados = {r["mes"]: r for r in consulta.consultar(
        sql, _binds(dt_ini, dt_fim, lista_rcas, lista_deptos),
        cache_key=_chave("serie", dt_ini, dt_fim, lista_rcas, lista_deptos))}

    corrente = calendario.primeiro_dia(date.today()).strftime("%Y-%m")
    rows = []
    for m in _sequencia_meses(dt_ini, dt_fim):
        chave = m.strftime("%Y-%m")
        r = achados.get(chave, {})
        liquido, custo = _f(r.get("liquido")), _f(r.get("custo"))
        rows.append({
            "mes": chave,
            "rotulo": _rotulo_mes(m),
            "bruto": round(_f(r.get("bruto")), 2),
            "devolucao": round(_f(r.get("devolucao")), 2),
            "liquido": round(liquido, 2),
            "custo": round(custo, 2),
            "margem_pct": _margem(liquido, custo),
            "devolucao_pct": _pct(_f(r.get("devolucao")), _f(r.get("bruto"))),
            "fechado": chave < corrente,
        })
    # o historico comeca em out/2025: meses vazios ANTES do primeiro movimento sao
    # ausencia de base, nao mes fraco — mostra-los achataria o grafico da margem
    while len(rows) > 1 and rows[0]["bruto"] == 0 and rows[0]["devolucao"] == 0:
        rows.pop(0)

    return {"rows": rows,
            "meta": {"projecao_mes_corrente": _projecao(lista_rcas, lista_deptos),
                     "meta_margem_pct": regras.META_MARGEM_PCT,
                     "escopo_carteira": permissoes.descreve_escopo(usuario)}}


# ---------------------------------------------------------------------------
# §5.1 / §5.4 — Ranking por RCA
# ---------------------------------------------------------------------------

@router.get("/rca")
def ranking_rca(dt_ini: date | None = None, dt_fim: date | None = None,
                rcas: str | None = None, deptos: str | None = None,
                usuario=Depends(permissoes.requer("comercial.rca"))):
    """Faturamento, devolucao, margem, positivacao e mix por representante.

    A devolucao (% sobre o bruto do proprio RCA) e INFORMATIVA: sem meta e sem
    semaforo enquanto o cliente nao decidir controlar devolucao por vendedor (§5.4).

    ★ E o endpoint mais sensivel da aba: e o RANKING entre os vendedores. Para quem
    e restrito a carteira ele vira uma tabela de UMA linha — a propria. Nao ha
    "esconder as outras linhas na tela": elas nunca saem do banco.
    """
    lista_rcas, lista_deptos = _rcas(usuario, rcas), _lista_int(deptos, "deptos")
    dt_ini, dt_fim = _periodo(dt_ini, dt_fim)
    ant_ini, ant_fim = _periodo_anterior(dt_ini, dt_fim)
    o = consulta.esquema()

    def por_rca(i: date, f: date) -> dict[int, dict]:
        sql = f"""SELECT m.codusur, {regras.nome_rca()} AS nome, {SOMAS},
                         COUNT(DISTINCT CASE WHEN m.codoper = '{regras.OPER_VENDA}' THEN m.codcli END) AS clientes
                  FROM {_origem(lista_deptos)}
                  LEFT JOIN {o}.pcusuari u ON u.codusur = m.codusur
                  WHERE {regras.filtro_venda()}{_filtros(lista_rcas, lista_deptos)}
                  GROUP BY m.codusur, u.nome"""
        rows = consulta.consultar(sql, _binds(i, f, lista_rcas, lista_deptos),
                                  cache_key=_chave("rca", i, f, lista_rcas, lista_deptos))
        return {int(r["codusur"] or 0): r for r in rows}

    atual, anterior = por_rca(dt_ini, dt_fim), por_rca(ant_ini, ant_fim)
    apuravel = _positivacao_apuravel(dt_ini, dt_fim)
    posit = {int(r["codusur"] or 0): r for r in
             (_positivacao(dt_ini, dt_fim, lista_rcas, lista_deptos, por_rca=True)
              if apuravel else [])}
    mix = {int(r["codusur"] or 0): int(r["mix"] or 0) for r in
           _mix(dt_ini, dt_fim, lista_rcas, lista_deptos, por_rca=True)}

    rows = []
    for codusur, r in atual.items():
        liquido, custo, bruto = _f(r["liquido"]), _f(r["custo"]), _f(r["bruto"])
        liq_ant = _f((anterior.get(codusur) or {}).get("liquido"))
        p = posit.get(codusur, {})
        carteira, positivados = int(p.get("carteira") or 0), int(p.get("positivados") or 0)
        rows.append({
            "codusur": codusur,
            "nome": r["nome"],
            "liquido": round(liquido, 2),
            "bruto": round(bruto, 2),
            "devolucao": round(_f(r["devolucao"]), 2),
            "devolucao_pct": _pct(_f(r["devolucao"]), bruto),
            "liquido_anterior": round(liq_ant, 2),
            "variacao_pct": _variacao(liquido, liq_ant),
            "margem_pct": _margem(liquido, custo),
            "positivacao_pct": _pct(positivados, carteira) if apuravel else None,
            "positivados": positivados,
            "carteira": carteira,
            "clientes": int(r["clientes"] or 0),
            "mix": mix.get(codusur, 0),
        })
    rows.sort(key=lambda x: x["liquido"], reverse=True)

    return {"rows": rows,
            "meta": {"periodo": {"dt_ini": dt_ini.isoformat(), "dt_fim": dt_fim.isoformat(),
                                 "rotulo": _rotulo(dt_ini, dt_fim), "fechado": _fechado(dt_fim),
                    # `fechado` = o periodo ja terminou; `mes_cheio` = o periodo E um mes.
                    # A tela precisa dos dois: so o mes cheio compara com meta.
                    "mes_cheio": _mes_cheio(dt_ini, dt_fim)},
                     "periodo_anterior": {"dt_ini": ant_ini.isoformat(), "dt_fim": ant_fim.isoformat(),
                                          "rotulo": _rotulo(ant_ini, ant_fim)},
                     "meta_margem_pct": regras.META_MARGEM_PCT,
                     "meta_positivacao_pct": regras.META_POSITIVACAO_PCT,
                     "devolucao_sem_meta": True,
                     "positivacao_apuravel": apuravel,
                     "escopo_carteira": permissoes.descreve_escopo(usuario)}}


# ---------------------------------------------------------------------------
# §5.2 — Mix por RCA e itens que sairam do mix
# ---------------------------------------------------------------------------

def _mes_referencia(dt_fim: date | None) -> tuple[date, date, bool]:
    """Mes apurado, mes anterior e se o apurado ainda esta em andamento."""
    mes = calendario.primeiro_dia(dt_fim) if dt_fim else calendario.mes_fechado()[0]
    anterior = calendario.primeiro_dia(calendario.mes_anterior(mes))
    return mes, anterior, mes == calendario.primeiro_dia(date.today())


#: Mes corrente NUNCA e comparavel a um mes fechado como se fossem equivalentes (§5.2).
#: O parcial serve para agir durante o mes; a cobranca sai no fechamento.
AVISO_PARCIAL = ("Mes corrente em andamento: o mix parcial ainda nao e comparavel ao mes "
                 "fechado anterior. A lista de itens fora do mix e ferramenta de trabalho e "
                 "vai encolher ate o fim do mes; a apuracao formal da queda e no fechamento.")


@router.get("/rca/mix")
def rca_mix(dt_fim: date | None = None, rcas: str | None = None, deptos: str | None = None,
            usuario=Depends(permissoes.requer("comercial.mix"))):
    """Mix do mes x mes anterior, com alerta quando cai (§5.2).

    ★ O mix TOTAL DA EMPRESA vai junto de proposito. O "230 itens" que o dono cita na
    reuniao e o mix da EMPRESA (231 em jun/2026), nao o de um vendedor — o maior RCA
    tem 130. Sem os dois numeros lado a lado a tela parece errada e o indicador perde
    credibilidade.

    ★ SOB ESCOPO DE CARTEIRA O "MIX DA EMPRESA" NAO E O DA EMPRESA. Ele sai da mesma
    consulta, com o mesmo filtro de RCA, entao para o vendedor restrito ele vale o
    proprio mix e as duas colunas ficam iguais. E deliberado: entregar o mix real da
    empresa aqui seria devolver, pela porta dos fundos, o tamanho do sortimento que a
    restricao acabou de fechar. `escopo_carteira` diz isso na tela.
    """
    lista_rcas, lista_deptos = _rcas(usuario, rcas), _lista_int(deptos, "deptos")
    mes, anterior, parcial = _mes_referencia(dt_fim)
    ini, fim = anterior, calendario.ultimo_dia(mes)

    por_rca = _mix(ini, fim, lista_rcas, lista_deptos, por_rca=True, por_mes=True)
    empresa = _mix(ini, fim, lista_rcas, lista_deptos, por_rca=False, por_mes=True)
    nomes = {int(r["codusur"]): r["nome"] for r in consulta.consultar(
        f"SELECT u.codusur, {regras.nome_rca()} AS nome FROM {consulta.esquema()}.pcusuari u",
        cache_key="com:rca-nomes")}

    chave_mes, chave_ant = mes.strftime("%Y-%m"), anterior.strftime("%Y-%m")

    def do_mes(linhas: list[dict], quando: str) -> dict[int, int]:
        return {int(r["codusur"] or 0): int(r["mix"] or 0) for r in linhas if r["mes"] == quando}

    atual, passado = do_mes(por_rca, chave_mes), do_mes(por_rca, chave_ant)
    rows = []
    for codusur in sorted(set(atual) | set(passado)):
        mix_mes, mix_ant = atual.get(codusur, 0), passado.get(codusur, 0)
        rows.append({"codusur": codusur, "nome": nomes.get(codusur),
                     "mix_mes": mix_mes, "mix_anterior": mix_ant,
                     "variacao": mix_mes - mix_ant,
                     "alerta": mix_mes < mix_ant})
    rows.sort(key=lambda x: x["variacao"])

    emp = {r["mes"]: int(r["mix"] or 0) for r in empresa}
    return {"rows": rows,
            "meta": {"mes": chave_mes, "rotulo": _rotulo_mes(mes),
                     "mes_anterior": chave_ant, "rotulo_anterior": _rotulo_mes(anterior),
                     "mix_empresa": emp.get(chave_mes, 0),
                     "mix_empresa_anterior": emp.get(chave_ant, 0),
                     "parcial": parcial,
                     "aviso": AVISO_PARCIAL if parcial else None,
                     "escopo_carteira": permissoes.descreve_escopo(usuario),
                     "mix_empresa_e_do_escopo": bool(lista_rcas)}}


@router.get("/rca/mix/perdidos")
def rca_mix_perdidos(codusur: int | None = None, dt_fim: date | None = None,
                     rcas: str | None = None, deptos: str | None = None,
                     limite: int = Query(500, ge=1, le=5000),
                     usuario=Depends(permissoes.requer("comercial.mix"))):
    """Produtos vendidos pelo RCA no mes anterior e SEM venda no mes atual.

    Ordenado pelo valor do mes anterior: o gestor ataca primeiro o que pesava no
    faturamento ("o RCA deixou de vender o borrifador"). Em mai->jun/2026 sao 193
    pares RCA x produto, R$ 51,8 mil do mes anterior.

    ★ Este endpoint tem DUAS portas para o RCA: a lista `rcas` e o `codusur` do
    drill-down. O escopo passa DEPOIS das duas — `?codusur=4` de um vendedor
    restrito ao RCA 3 nao vira consulta ao RCA 4, vira consulta ao RCA 3.
    """
    lista_rcas, lista_deptos = _lista_int(rcas, "rcas"), _lista_int(deptos, "deptos")
    if codusur is not None:
        lista_rcas = [codusur]
    lista_rcas = permissoes.escopo_rca(usuario, lista_rcas)
    mes, anterior, parcial = _mes_referencia(dt_fim)
    o = consulta.esquema()

    sql = f"""WITH base AS (
                 SELECT m.codusur, m.codprod, {MES_TEXTO} AS mes,
                        {regras.qt_liquida()} AS qt_liquida,
                        {regras.valor_liquido()} AS valor_liquido
                 FROM {_origem(lista_deptos)}
                 WHERE {regras.filtro_venda()}{_filtros(lista_rcas, lista_deptos)}
                 GROUP BY m.codusur, m.codprod, {MES_TEXTO}
              )
              SELECT a.codusur, {regras.nome_rca()} AS nome, a.codprod, pr.descricao,
                     ROUND(a.qt_liquida::numeric, 2)    AS qt_mes_anterior,
                     ROUND(a.valor_liquido::numeric, 2) AS valor_mes_anterior
              FROM base a
              LEFT JOIN base t ON t.codusur = a.codusur AND t.codprod = a.codprod
                              AND t.mes = :mes AND t.qt_liquida > 0
              LEFT JOIN {o}.pcusuari u ON u.codusur = a.codusur
              LEFT JOIN {o}.pcprodut pr ON pr.codprod = a.codprod
              WHERE a.mes = :mes_ant AND a.qt_liquida > 0 AND t.codprod IS NULL
              ORDER BY a.valor_liquido DESC
              LIMIT :limite"""
    binds = _binds(anterior, calendario.ultimo_dia(mes), lista_rcas, lista_deptos)
    binds.update({"mes": mes.strftime("%Y-%m"), "mes_ant": anterior.strftime("%Y-%m"), "limite": limite})
    rows = consulta.consultar(sql, binds, cache_key=_chave("perdidos", mes, lista_rcas, lista_deptos, limite))

    return {"rows": [{"codusur": int(r["codusur"] or 0), "nome": r["nome"],
                      "codprod": int(r["codprod"]), "descricao": r["descricao"],
                      "qt_mes_anterior": _f(r["qt_mes_anterior"]),
                      "valor_mes_anterior": _f(r["valor_mes_anterior"])} for r in rows],
            "meta": {"mes": mes.strftime("%Y-%m"), "rotulo": _rotulo_mes(mes),
                     "mes_anterior": anterior.strftime("%Y-%m"), "rotulo_anterior": _rotulo_mes(anterior),
                     "parcial": parcial, "aviso": AVISO_PARCIAL if parcial else None,
                     "linhas": len(rows), "truncado_em": limite if len(rows) >= limite else None,
                     "escopo_carteira": permissoes.descreve_escopo(usuario)}}


# ---------------------------------------------------------------------------
# §5.3 — Faturamento cruzado RCA x Departamento, mes a mes
# ---------------------------------------------------------------------------

@router.get("/rca-departamento")
def rca_departamento(meses: int = Query(12, ge=1, le=36),
                     dt_ini: date | None = None, dt_fim: date | None = None,
                     rcas: str | None = None, deptos: str | None = None,
                     usuario=Depends(permissoes.requer("comercial.rca"))):
    """Responde "quanto o Sergino faturou em quimicos mes a mes" em dois cliques (§5.3).

    Serie mensal, nunca acumulado: e a evolucao dentro da categoria que revela o
    vendedor que parou de girar uma linha inteira.

    Protegido por `comercial.rca` (e nao por um recurso proprio): a pergunta que ele
    responde e sobre o DESEMPENHO DE UM VENDEDOR, so que aberta por categoria. Quem
    nao pode ver o ranking por RCA tambem nao pode ver o cruzamento dele.
    """
    lista_rcas, lista_deptos = _rcas(usuario, rcas), _lista_int(deptos, "deptos")
    if dt_ini is None and dt_fim is None:
        dt_ini, dt_fim = _janela_serie(meses)
    else:
        dt_ini, dt_fim = _periodo(dt_ini, dt_fim)
        dt_ini, dt_fim = calendario.primeiro_dia(dt_ini), calendario.ultimo_dia(dt_fim)
    o = consulta.esquema()

    sql = f"""SELECT {MES_TEXTO} AS mes,
                     m.codusur, {regras.nome_rca()} AS nome, p.codepto, d.descricao AS departamento,
                     {regras.valor_liquido()} AS liquido,
                     {regras.valor_bruto()}   AS bruto,
                     {regras.custo_liquido()} AS custo
              FROM {_origem(lista_deptos, por_depto=True)}
              LEFT JOIN {o}.pcusuari u ON u.codusur = m.codusur
              LEFT JOIN {o}.pcdepto  d ON d.codepto = p.codepto
              WHERE {regras.filtro_venda()}{_filtros(lista_rcas, lista_deptos, por_depto=True)}
              GROUP BY {MES_TEXTO}, m.codusur, u.nome, p.codepto, d.descricao
              ORDER BY 1, 2, 4"""
    rows = consulta.consultar(sql, _binds(dt_ini, dt_fim, lista_rcas, lista_deptos),
                              cache_key=_chave("rca-depto", dt_ini, dt_fim, lista_rcas, lista_deptos))

    corrente = calendario.primeiro_dia(date.today()).strftime("%Y-%m")
    return {"rows": [{"mes": r["mes"], "codusur": int(r["codusur"] or 0), "nome": r["nome"],
                      "codepto": int(r["codepto"] or 0), "departamento": r["departamento"],
                      "liquido": round(_f(r["liquido"]), 2),
                      "margem_pct": _margem(_f(r["liquido"]), _f(r["custo"])),
                      "fechado": r["mes"] < corrente} for r in rows],
            "meta": {"dt_ini": dt_ini.isoformat(), "dt_fim": dt_fim.isoformat(),
                     "mes_corrente": corrente,
                     "escopo_carteira": permissoes.descreve_escopo(usuario)}}


# ---------------------------------------------------------------------------
# §6 — Mapa de vendas por cidade (comercial.mapa)
# ---------------------------------------------------------------------------

def _coord(valor) -> float | None:
    """LATITUDE/LONGITUDE do cadastro sao VARCHAR — cast frouxo de proposito.

    '0', vazio, nulo ou qualquer lixo nao numerico vira "sem coordenada" (None): a
    cidade some do mapa mas continua no total. Nao confiamos no cadastro; um cast
    duro (`::numeric` no SQL) quebraria a consulta inteira por causa de uma celula
    fora do padrao, em vez de so tirar aquela cidade do mapa.
    """
    if valor is None:
        return None
    try:
        n = float(str(valor).strip().replace(",", "."))
    except ValueError:
        return None
    return round(n, 6) if n != 0 else None


@router.get("/mapa-cidades")
def mapa_cidades(dt_ini: date | None = None, dt_fim: date | None = None,
                 rcas: str | None = None, deptos: str | None = None,
                 usuario=Depends(permissoes.requer("comercial.mapa"))):
    """Faturamento LIQUIDO por CIDADE do cliente, com coordenada para o mapa.

    Cidade = PCCLIENT.CODCIDADE -> PCCIDADE (nome, UF, IBGE e lat/long). Agrupa por
    CIDADE, nunca por cliente: a leitura e "onde esta o faturamento" — concentracao e
    praca descoberta. Em jun/2026 GOIANIA vai na frente (R$ 225 mil / 41 clientes),
    depois RIO VERDE, SENADOR CANEDO, APARECIDA e JATAI; cauda longa de 1 cliente, GO
    dominante.

    ★ O TOTAL POR CIDADE BATE COM A MEDIDA CANONICA AO CENTAVO (LEFT JOIN de proposito).
    Uma venda cujo cliente/cidade nao resolvesse num INNER JOIN sumiria da soma — aqui
    ela cai numa linha "sem cidade/sem coordenada", visivel, e o total continua igual
    ao /resumo. Medido em jun/2026: as 16 cidades somam R$ 416.378,65, o mesmo liquido
    da empresa.

    ★ COORDENADA FROUXA (`_coord`). Lat/long sao VARCHAR; '0' e nao-numerico viram
    "sem coordenada": a cidade sai do MAPA mas o liquido dela fica no `total_liquido` e
    ela conta em `meta.sem_coordenada`. Sem isso, uma cidade sumindo do mapa faria o
    total encolher sem explicacao. Nesta base a cobertura e perfeita (0 sem coordenada
    no mes fechado), mas o numero existe para o dia em que alguem cadastrar torto.

    Escopo de carteira honrado (via `_rcas`) e embutido no cache_key: vendedor restrito
    ve so as cidades onde ELE vendeu, e nao herda o mapa do dono.
    """
    lista_rcas, lista_deptos = _rcas(usuario, rcas), _lista_int(deptos, "deptos")
    dt_ini, dt_fim = _periodo(dt_ini, dt_fim)
    o = consulta.esquema()

    sql = f"""SELECT c.codcidade, ci.codibge, ci.nomecidade, ci.uf,
                     ci.latitude, ci.longitude,
                     COALESCE({regras.valor_bruto()}, 0)     AS bruto,
                     COALESCE({regras.valor_devolucao()}, 0) AS devolucao,
                     COALESCE({regras.valor_liquido()}, 0)   AS liquido,
                     COUNT(DISTINCT CASE WHEN m.codoper = '{regras.OPER_VENDA}' THEN m.codcli END)       AS clientes,
                     COUNT(DISTINCT CASE WHEN m.codoper = '{regras.OPER_VENDA}' THEN m.numtransvenda END) AS notas
              FROM {_origem(lista_deptos)}
              LEFT JOIN {o}.pcclient c  ON c.codcli = m.codcli
              LEFT JOIN {o}.pccidade ci ON ci.codcidade = c.codcidade
              WHERE {regras.filtro_venda()}{_filtros(lista_rcas, lista_deptos)}
              GROUP BY c.codcidade, ci.codibge, ci.nomecidade, ci.uf, ci.latitude, ci.longitude"""
    achados = consulta.consultar(sql, _binds(dt_ini, dt_fim, lista_rcas, lista_deptos),
                                 cache_key=_chave("mapa", dt_ini, dt_fim, lista_rcas, lista_deptos))

    total_liquido = sum(_f(r["liquido"]) for r in achados)
    rows, sem_coordenada = [], 0
    por_uf: dict[str, float] = {}
    for r in achados:
        liquido = _f(r["liquido"])
        lat, lng = _coord(r["latitude"]), _coord(r["longitude"])
        if lat is None or lng is None:   # meia coordenada nao localiza — descarta o par
            lat = lng = None
            sem_coordenada += 1
        if r["uf"]:
            por_uf[r["uf"]] = por_uf.get(r["uf"], 0.0) + liquido
        rows.append({
            "codibge": int(r["codibge"]) if r["codibge"] is not None else None,
            "cidade": r["nomecidade"],
            "uf": r["uf"],
            "lat": lat,
            "lng": lng,
            "liquido": round(liquido, 2),
            "bruto": round(_f(r["bruto"]), 2),
            "devolucao": round(_f(r["devolucao"]), 2),
            "clientes": int(r["clientes"] or 0),
            "notas": int(r["notas"] or 0),
            "participacao_pct": _pct(liquido, total_liquido),
        })
    rows.sort(key=lambda x: x["liquido"], reverse=True)
    # UF dominante = a que concentra mais faturamento (por liquido, nao por nº de cidades)
    uf_principal = max(por_uf, key=por_uf.get) if por_uf else None

    return {"rows": rows,
            "meta": {"periodo": {"dt_ini": dt_ini.isoformat(), "dt_fim": dt_fim.isoformat(),
                                 "rotulo": _rotulo(dt_ini, dt_fim), "fechado": _fechado(dt_fim),
                                 "mes_cheio": _mes_cheio(dt_ini, dt_fim)},
                     "total_liquido": round(total_liquido, 2),
                     "cidades": len(rows),
                     "sem_coordenada": sem_coordenada,
                     "uf_principal": uf_principal,
                     "escopo_carteira": permissoes.descreve_escopo(usuario)}}
