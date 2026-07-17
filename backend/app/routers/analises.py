"""Motor generico de analises: carrega a spec consolidada (discovery/analises-spec.json),
executa o SQL com os binds presentes e aplica pos-processamento registrado.

A spec e artefato do pipeline de discovery (arquivo local confiavel); ainda assim todo SQL
passa pela guarda SELECT-only de db.fetch_all.
"""
import json
import os
import re
from datetime import date, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from ..auth import require_user
from ..analytics import aplicar
from ..db import fetch_all, limpar_sql, owner

router = APIRouter(prefix="/api/analises", tags=["analises"], dependencies=[Depends(require_user)])

SPEC_PATHS = [
    os.environ.get("ANALISES_SPEC", ""),
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "analises-spec.json"),
    r"Z:\h4c-bi\discovery\analises-spec.json",
]

_BIND_RE = re.compile(r":(\w+)")


def _carregar_spec() -> list[dict]:
    for p in SPEC_PATHS:
        if p and os.path.exists(p):
            with open(p, encoding="utf-8") as f:
                return json.load(f)["analises"]
    return []


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
    """Lista as analises disponiveis (sem SQL)."""
    return [
        {k: a.get(k) for k in ("id", "titulo", "pergunta_negocio", "nivel", "tecnica",
                               "como_calculado", "como_ler", "viz", "parametros", "status", "obs")}
        for a in _carregar_spec()
    ]


@router.get("/{analise_id}")
def executar(analise_id: str, request: Request):
    spec = next((a for a in _carregar_spec() if a["id"] == analise_id), None)
    if spec is None:
        raise HTTPException(404, f"Analise {analise_id} nao encontrada")

    q = dict(request.query_params)
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
                disponiveis[nome] = float(valor) if p.get("tipo") in ("number", "int", "float") else valor

    sql = spec["sql"].replace("{OWNER}", owner())
    # binds so contam fora de comentarios/literais ("1:1", "00:00:00" nao sao binds)
    usados = {b for b in _BIND_RE.findall(limpar_sql(sql)) if not b.isdigit()}
    binds = {k: v for k, v in disponiveis.items() if k in usados}
    faltando = usados - set(binds)
    if faltando:
        raise HTTPException(422, f"Parametros obrigatorios ausentes: {sorted(faltando)}")

    chave = f"analise:{analise_id}:" + ":".join(f"{k}={binds[k]}" for k in sorted(binds))
    rows = fetch_all(sql, binds, cache_key=chave)
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
