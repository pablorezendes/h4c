"""Compressao das linhas antes de irem para o modelo.

Uma analise devolve ate 2.000 linhas com 12 colunas. Mandar isso cru custaria
mais que a pergunta inteira e nao melhora a resposta: o dono quer o topo, o
total e a tendencia. Aqui cortamos para um envelope de texto com teto duro.

O envelope e CARIMBADO PELO SERVIDOR (id, periodo, nº de linhas, status). Sem
isso o modelo confunde "nao veio dado" com "o valor e zero" — e "nenhuma
ruptura no periodo" vira "a causa nao foi ruptura", que e falso.
"""
from typing import Any

TETO_CHARS = 2500
TOPO = 12

# colunas que nao ajudam o modelo a raciocinar e so ocupam espaco
_RUIDO = {"codprod", "codcli", "codusur", "codfilial", "codepto", "codsec",
          "numtransvenda", "numnota", "numped", "rk", "tipo"}


def _fmt(v: Any) -> str:
    if v is None:
        return "-"
    if isinstance(v, float):
        return f"{v:.2f}".rstrip("0").rstrip(".")
    if isinstance(v, bool):
        return "sim" if v else "nao"
    return str(v)[:60]


def comprimir(rows: list[dict], meta: dict | None = None, topo: int = TOPO) -> str:
    """Linhas -> tabela de texto curta (TSV), com total quando faz sentido."""
    if not rows:
        return "(sem linhas)"
    colunas = [c for c in rows[0].keys() if c not in _RUIDO] or list(rows[0].keys())
    linhas = ["\t".join(colunas)]
    for r in rows[:topo]:
        linhas.append("\t".join(_fmt(r.get(c)) for c in colunas))
    if len(rows) > topo:
        # somatorio das numericas para o modelo nao concluir que o topo e o todo
        somas = []
        for c in colunas:
            vals = [r.get(c) for r in rows if isinstance(r.get(c), (int, float))]
            if len(vals) == len(rows) and len(vals) > 0:
                somas.append(f"{c}={sum(vals):.2f}".rstrip("0").rstrip("."))
        linhas.append(f"... mais {len(rows) - topo} linhas."
                      + (f" Total de todas: {', '.join(somas[:4])}" if somas else ""))
    texto = "\n".join(linhas)
    if len(texto) > TETO_CHARS:
        texto = texto[:TETO_CHARS] + "\n(cortado)"
    return texto


def envelope(id_: str, titulo: str, periodo: str, rows: list[dict],
             meta: dict | None, status: str = "validado") -> str:
    """Carimbo do servidor + dados. O modelo nunca ve linha solta."""
    cab = f"[{id_} | {titulo} | periodo {periodo} | {len(rows)} linhas | {status}]"
    partes = [cab]
    if status != "validado":
        partes.append("AVISO: numero ainda nao conferido contra o banco; use como direcao.")
    if not rows:
        partes.append("AVISO: sem dados no periodo. Isso significa NAO HOUVE ocorrencia, "
                      "nao significa zero calculado nem falha.")
    if meta:
        resumo = ", ".join(f"{k}={_fmt(v)}" for k, v in list(meta.items())[:8])
        if resumo:
            partes.append(f"resumo: {resumo}")
    partes.append(comprimir(rows, meta))
    return "\n".join(partes)
