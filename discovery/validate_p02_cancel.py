"""Pendencias P-02 (filial 99 nas fatos) e cancelamentos — validacao seletiva."""
from db import get_connection

OWNER = "U_CMT9GE_WI"

CHECKS = [
    ("PCNFSAID por filial", f"SELECT codfilial, COUNT(*), ROUND(SUM(vltotal),2) FROM {OWNER}.pcnfsaid GROUP BY codfilial"),
    ("PCMOV por filial", f"SELECT codfilial, COUNT(*) FROM {OWNER}.pcmov GROUP BY codfilial"),
    ("PCPEDC por filial", f"SELECT codfilial, COUNT(*) FROM {OWNER}.pcpedc GROUP BY codfilial"),
    ("PCPREST por filial", f"SELECT codfilial, COUNT(*) FROM {OWNER}.pcprest GROUP BY codfilial"),
    ("PCNFSAID canceladas", f"SELECT CASE WHEN dtcancel IS NULL THEN 'ATIVA' ELSE 'CANCELADA' END, COUNT(*), ROUND(SUM(vltotal),2) FROM {OWNER}.pcnfsaid GROUP BY CASE WHEN dtcancel IS NULL THEN 'ATIVA' ELSE 'CANCELADA' END"),
    ("PCMOV S canceladas", f"SELECT CASE WHEN dtcancel IS NULL THEN 'ATIVA' ELSE 'CANCELADA' END, COUNT(*) FROM {OWNER}.pcmov WHERE codoper='S' GROUP BY CASE WHEN dtcancel IS NULL THEN 'ATIVA' ELSE 'CANCELADA' END"),
]

with get_connection() as conn:
    cur = conn.cursor()
    for titulo, sql in CHECKS:
        print(f"\n== {titulo}")
        cur.execute(sql)
        for row in cur.fetchmany(10):
            print("  ", row)
