"""Motor generico de analises: carrega a spec consolidada (discovery/analises-spec.json),
executa o SQL com os binds presentes e aplica pos-processamento registrado.

A spec e artefato do pipeline de discovery (arquivo local confiavel); ainda assim todo SQL
passa pela guarda SELECT-only de db.fetch_all.

★ GOVERNANCA VALE NO SERVIDOR, NAO NA TELA. Analise com `status: backlog` na spec
esta barrada por decisao de reuniao (o caso vivo e a projecao de entrada de caixa
em 30/60/90 dias, que depende da rodada com o BPO financeiro). Ate agora o
bloqueio existia so no filtro do React: GET /api/analises/<id> executava o SQL
normalmente e o assistente de ajuda entregava o resultado. Aqui a analise
bloqueada sai do catalogo e a execucao responde 409 — inclusive para o
assistente, que passa pela MESMA funcao rodar(). O criterio e o status, nunca o
id: a proxima analise que entrar em backlog ja nasce protegida.

★ AUTORIZACAO: a aba `analises` protege o router inteiro. Nao ha recurso por
analise — o catalogo de permissoes e por RELATORIO, e aqui o "relatorio" e o
motor; criar um recurso por id obrigaria o dono a remarcar caixinha toda vez que
o discovery publicasse uma analise nova.

★ POR QUE O ESCOPO DE CARTEIRA NAO SE APLICA AQUI — E O QUE FIZEMOS EM VEZ DISSO
O motor executa o SQL que veio da spec, e aquele SQL nao tem bind de RCA: os
binds disponiveis sao dt_ini, dt_fim, hora_ini, hora_fim e os parametros que a
propria analise declara. Nao da para "acrescentar um AND codusur = ANY(:rcas)"
por fora sem reescrever 234 KB de SQL de terceiros — e um filtro colado de
qualquer jeito num SQL com CTE, window function e subconsulta ou nao filtra nada
ou muda o numero em silencio, que e pior do que nao ter.
Entao a verdade e dita em vez de disfarcada: quem esta `restrito_a_carteira` NAO
entra nesta aba (403 explicando o motivo). As analises devolvem cliente a cliente
e produto a produto da EMPRESA INTEIRA — servir isso a um vendedor restrito
entregaria pela porta lateral exatamente a carteira que a restricao fechou.
Quando alguma analise ganhar parametro de RCA na spec, este bloqueio pode virar
escopo de verdade; ate la ele fica fechado.
"""
import json
import os
import re
from functools import lru_cache
from datetime import date, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status

from ..analytics import aplicar
from ..ajuda.acervo import bloqueada
from .. import consulta, permissoes


def exigir_visao_da_empresa(usuario, o_que: str) -> None:
    """Barra quem e restrito a carteira num relatorio que nao sabe se restringir.

    Mora aqui — e nao em permissoes.py — porque e regra DESTE motor e dos dois
    lugares que reusam o motor: `routers/indicadores.py` e o assistente de ajuda,
    que chamam `rodar()`/`indicadores()` como funcao Python e por isso passam por
    fora das dependencias do FastAPI. Uma funcao so, importada nos tres, para o
    dia em que a regra mudar ela mudar em um lugar.

    ★ Fail-closed proposital: e melhor o vendedor ler "esta aba ainda nao sabe
    respeitar carteira" do que receber a lista de clientes da empresa inteira.
    """
    if getattr(usuario, "restrito_a_carteira", False):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"{o_que} ainda não sabem respeitar o limite de carteira: os números são "
            f"da empresa inteira. Como seu acesso é restrito ao RCA "
            f"{getattr(usuario, 'codusur', None)}, este item fica indisponível. "
            f"Peça ao administrador do BI se precisar da visão geral.",
        )


def _acesso(usuario=Depends(permissoes.requer("analises"))):
    exigir_visao_da_empresa(usuario, "As análises")
    return usuario


router = APIRouter(prefix="/api/analises", tags=["analises"], dependencies=[Depends(_acesso)])

def _nome_spec() -> str:
    """No espelho Postgres usa a spec com SQL portado."""
    return "analises-spec-pg.json" if consulta.usando_espelho() else "analises-spec.json"


SPEC_PATHS = [
    os.environ.get("ANALISES_SPEC", ""),
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", _nome_spec()),
    os.path.join("/discovery", _nome_spec()),                      # container
    # repositório (desenvolvimento): backend/app/routers -> ../../../discovery
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "discovery", _nome_spec()),
]

_BIND_RE = re.compile(r":(\w+)")


@lru_cache(maxsize=2)
def _carregar_spec_cache(sufixo: str) -> list[dict]:
    """Cacheado: sao 234 KB de JSON que eram reparseados a cada requisicao."""
    for p in SPEC_PATHS:
        if p and os.path.exists(p):
            with open(p, encoding="utf-8") as f:
                return json.load(f)["analises"]
    return []


def _carregar_spec() -> list[dict]:
    """Spec CRUA, com os itens em backlog. Serve a rodar() — que precisa
    distinguir "nao existe" (404) de "existe mas esta barrada" (409) — e aos
    scripts de validacao de SQL, que devem continuar conferindo tudo."""
    return _carregar_spec_cache(_nome_spec())


def _publicas() -> list[dict]:
    """O que o BI pode publicar e executar hoje."""
    return [a for a in _carregar_spec() if not bloqueada(a)]


def _hhmm_para_horas(v: str | None) -> float | None:
    """'14:30' -> 14.5 ; '14' -> 14.0"""
    if v is None or v == "":
        return None
    partes = str(v).split(":")
    try:
        h = int(partes[0])
        m = int(partes[1]) if len(partes) > 1 else 0
        return h + m / 60.0
    except ValueError:
        raise HTTPException(422, f"Hora invalida: {v} (use HH ou HH:MM)")


@router.get("")
def catalogo():
    """Lista as analises disponiveis (sem SQL). Sem as bloqueadas: o que nao pode
    ser executado tambem nao pode ser oferecido."""
    return [
        {k: a.get(k) for k in ("id", "titulo", "pergunta_negocio", "nivel", "tecnica",
                               "como_calculado", "como_ler", "viz", "parametros", "status", "obs")}
        for a in _publicas()
    ]


@router.get("/{analise_id}")
def executar(analise_id: str, request: Request):
    return rodar(analise_id, dict(request.query_params))


def rodar(analise_id: str, q: dict) -> dict:
    """Executa uma analise. Extraido de executar() para o assistente de ajuda
    poder chamar a MESMA logica (incluindo o pos-processamento) em vez de
    montar SQL por fora e divergir do que a tela mostra."""
    spec = next((a for a in _carregar_spec() if a["id"] == analise_id), None)
    if spec is None:
        raise HTTPException(404, f"Analise {analise_id} nao encontrada")
    if bloqueada(spec):
        # 409 e nao 404: a analise existe, o que falta e a validacao de negocio.
        # Dizer "nao encontrada" faria alguem "consertar" o catalogo de volta.
        raise HTTPException(409, (
            f"A analise {analise_id} ({spec.get('titulo', '')}) esta em backlog e nao pode ser "
            "executada: o metodo ainda depende de validacao com o cliente antes de virar numero "
            "de decisao, e por isso ela tambem nao aparece no catalogo."))

    dt_fim = datetime.strptime(q.get("dt_fim", date.today().isoformat()), "%Y-%m-%d").date()
    dt_ini = datetime.strptime(q.get("dt_ini", (dt_fim - timedelta(days=89)).isoformat()), "%Y-%m-%d").date()

    disponiveis: dict[str, Any] = {
        "dt_ini": dt_ini,
        "dt_fim": dt_fim,
        "hora_ini": _hhmm_para_horas(q.get("hora_ini")) if q.get("hora_ini") else 0.0,
        "hora_fim": _hhmm_para_horas(q.get("hora_fim")) if q.get("hora_fim") else 23.999,
    }
    # parametros extras declarados na spec (ex.: :limite, :codcli)
    for p in spec.get("parametros") or []:
        nome = p.get("nome", "").lstrip(":")
        if nome and nome not in disponiveis:
            valor = q.get(nome, p.get("default"))
            if valor is not None:
                tipo = str(p.get("tipo", "")).upper()
                disponiveis[nome] = float(valor) if tipo.startswith("NUMBER") else valor

    sql = spec["sql"].replace("{OWNER}", consulta.esquema())
    # binds so contam fora de comentarios/literais ("1:1", "00:00:00" nao sao binds)
    usados = consulta.binds_usados(sql)
    binds = {k: v for k, v in disponiveis.items() if k in usados}
    faltando = usados - set(binds)
    if faltando:
        raise HTTPException(422, f"Parametros obrigatorios ausentes: {sorted(faltando)}")

    chave = f"analise:{analise_id}:" + ":".join(f"{k}={binds[k]}" for k in sorted(binds))
    rows = consulta.consultar(sql, binds, cache_key=chave)
    resultado = aplicar(analise_id, rows, disponiveis)
    truncado = len(resultado["rows"]) > 2000
    if truncado:
        resultado["rows"] = resultado["rows"][:2000]
        resultado.setdefault("meta", {})["truncado_em"] = 2000
    return {
        "id": spec["id"],
        "titulo": spec["titulo"],
        "nivel": spec["nivel"],
        "viz": spec.get("viz"),
        "periodo": {"dt_ini": dt_ini.isoformat(), "dt_fim": dt_fim.isoformat()},
        "meta": resultado.get("meta", {}),
        "rows": resultado["rows"],
    }
