"""Indicadores comerciais (spec: discovery/indicadores-spec.json).

Cada indicador e um SQL que devolve 1 linha com a coluna VALOR (+ auxiliares).
O router roda o mesmo SQL no periodo pedido e no periodo anterior de mesma
duracao, e calcula a variacao — exceto para indicadores de snapshot
(depende_do_periodo = false), que nao tem comparativo.
"""
import json
import os
import re
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException

from ..auth import require_user
from .. import consulta

router = APIRouter(prefix="/api/indicadores", tags=["indicadores"], dependencies=[Depends(require_user)])

def _nome_spec() -> str:
    return "indicadores-spec-pg.json" if consulta.usando_espelho() else "indicadores-spec.json"


SPEC_PATHS = [
    os.environ.get("INDICADORES_SPEC", ""),
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", _nome_spec()),
    os.path.join("/discovery", _nome_spec()),                      # container
    # repositório (desenvolvimento): backend/app/routers -> ../../../discovery
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "discovery", _nome_spec()),
]

_BIND_RE = re.compile(r":(\w+)")


def _carregar_spec() -> list[dict]:
    for p in SPEC_PATHS:
        if p and os.path.exists(p):
            with open(p, encoding="utf-8") as f:
                return json.load(f)["indicadores"]
    return []


def _executar(spec: dict, dt_ini: date, dt_fim: date) -> dict | None:
    sql = spec["sql"].replace("{OWNER}", consulta.esquema())
    # binds so contam fora de comentarios/literais ("1:1", "00:00:00" nao sao binds)
    usados = consulta.binds_usados(sql)
    binds = {k: v for k, v in {"dt_ini": dt_ini, "dt_fim": dt_fim}.items() if k in usados}
    faltando = usados - set(binds)
    if faltando:
        raise HTTPException(500, f"{spec['id']}: SQL usa binds nao suportados {sorted(faltando)}")
    rows = consulta.consultar(sql, binds, cache_key=f"ind:{spec['id']}:{dt_ini}:{dt_fim}")
    return rows[0] if rows else None


def _num(v) -> float | None:
    return None if v is None else float(v)


@router.get("")
def indicadores(dt_ini: date | None = None, dt_fim: date | None = None):
    spec = _carregar_spec()
    if not spec:
        return {"periodo": None, "indicadores": []}

    dt_fim = dt_fim or date.today()
    dt_ini = dt_ini or dt_fim - timedelta(days=29)
    dias = (dt_fim - dt_ini).days + 1
    ant_fim = dt_ini - timedelta(days=1)
    ant_ini = ant_fim - timedelta(days=dias - 1)

    saida = []
    for s in spec:
        try:
            atual = _executar(s, dt_ini, dt_fim) or {}
        except Exception as e:  # noqa: BLE001 — um indicador quebrado nao derruba os outros
            saida.append({"id": s["id"], "nome": s["nome"], "erro": str(e).splitlines()[0][:180],
                          "formato": s.get("formato"), "definicao": s.get("definicao")})
            continue

        valor = _num(atual.get("valor"))
        anterior = None
        variacao = None
        if s.get("depende_do_periodo", True):
            try:
                ant = _executar(s, ant_ini, ant_fim) or {}
                anterior = _num(ant.get("valor"))
                if anterior:
                    variacao = round((valor - anterior) / abs(anterior) * 100, 1) if valor is not None else None
            except Exception:  # noqa: BLE001 — sem comparativo e melhor que erro
                pass

        auxiliares = {k: _num(v) if isinstance(v, (int, float)) else v
                      for k, v in atual.items() if k != "valor"}
        saida.append({
            "id": s["id"],
            "nome": s["nome"],
            "definicao": s.get("definicao"),
            "formato": s.get("formato", "decimal"),
            "valor": valor,
            "valor_anterior": anterior,
            "variacao_pct": variacao,
            "depende_do_periodo": s.get("depende_do_periodo", True),
            "auxiliares": auxiliares,
            "status": s.get("status", "validado"),
            "obs": s.get("obs"),
        })

    return {
        "periodo": {"dt_ini": dt_ini.isoformat(), "dt_fim": dt_fim.isoformat(), "dias": dias},
        "periodo_anterior": {"dt_ini": ant_ini.isoformat(), "dt_fim": ant_fim.isoformat()},
        "indicadores": saida,
    }


@router.get("/catalogo")
def catalogo():
    """Definicoes dos indicadores (sem executar SQL)."""
    return [
        {k: s.get(k) for k in ("id", "nome", "definicao", "definicao_escolhida_porque", "grao",
                               "formato", "depende_do_periodo", "fontes", "armadilhas", "status", "obs")}
        for s in _carregar_spec()
    ]
