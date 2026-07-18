"""Teste a seco: extrai do Oracle e mostra o que SERIA enviado (sem rede)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "discovery"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db import get_connection  # noqa: E402
from config import OWNER, TABELAS  # noqa: E402
from agente import _colunas, _normaliza  # noqa: E402

ALVO = ["PCDEPTO", "PCUSUARI", "PCNFSAID", "PCHISTEST"]

with get_connection() as conn:
    cur = conn.cursor()
    cur.arraysize = 500
    for tabela in ALVO:
        cfg = TABELAS[tabela]
        cols = _colunas(cur, tabela)
        lista = ", ".join(f'"{c}"' for c in cols)
        cur.execute(f'SELECT {lista} FROM {OWNER}."{tabela}" FETCH FIRST 3 ROWS ONLY')
        linhas = [[_normaliza(v) for v in ln] for ln in cur.fetchall()]

        cur2 = conn.cursor()
        cur2.execute(f'SELECT COUNT(*) FROM {OWNER}."{tabela}"')
        total = cur2.fetchone()[0]

        import json
        peso = len(json.dumps(linhas, default=str).encode()) / max(len(linhas), 1)
        print(f"\n== {tabela} ({cfg['estrategia']}) — {total:,} linhas, {len(cols)} colunas")
        print(f"   ~{peso:,.0f} bytes/linha  ->  carga total estimada: {peso*total/1e6:,.1f} MB")
        if linhas:
            amostra = {c: v for c, v in list(zip(cols, linhas[0]))[:6]}
            print(f"   amostra: {json.dumps(amostra, default=str, ensure_ascii=False)[:180]}")
        if cfg.get("coluna_data"):
            cur2.execute(f'SELECT TO_CHAR(MAX("{cfg["coluna_data"]}"),\'YYYY-MM-DD\') FROM {OWNER}."{tabela}"')
            print(f"   marca d'água inicial ({cfg['coluna_data']}): {cur2.fetchone()[0]}")
