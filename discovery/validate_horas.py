"""Valida se as colunas de hora estao populadas e se DATA carrega hora embutida."""
from db import get_connection

OWNER = "U_CMT9GE_WI"

CHECKS = [
    ("PCPEDC.HORA populada? (distrib. por hora, top 8)",
     f"SELECT hora, COUNT(*) FROM {OWNER}.pcpedc WHERE hora IS NOT NULL GROUP BY hora ORDER BY 2 DESC FETCH FIRST 8 ROWS ONLY"),
    ("PCPEDC.HORA nulos vs preenchidos",
     f"SELECT NVL2(hora,'PREENCHIDA','NULA'), COUNT(*) FROM {OWNER}.pcpedc GROUP BY NVL2(hora,'PREENCHIDA','NULA')"),
    ("PCPEDC.DATA tem hora embutida?",
     f"SELECT COUNT(CASE WHEN data <> TRUNC(data) THEN 1 END) AS com_hora, COUNT(*) AS total FROM {OWNER}.pcpedc"),
    ("PCNFSAID.DTHORASAIDA populada?",
     f"SELECT COUNT(dthorasaida) AS preenchidas, COUNT(*) AS total FROM {OWNER}.pcnfsaid"),
    ("PCNFSAID.HORAEMISSAO amostra",
     f"SELECT horaemissao, COUNT(*) FROM {OWNER}.pcnfsaid WHERE horaemissao IS NOT NULL GROUP BY horaemissao ORDER BY 2 DESC FETCH FIRST 5 ROWS ONLY"),
    ("PCMOV.HORALANC/MINUTOLANC amostra",
     f"SELECT horalanc, COUNT(*) FROM {OWNER}.pcmov WHERE horalanc IS NOT NULL GROUP BY horalanc ORDER BY 2 DESC FETCH FIRST 5 ROWS ONLY"),
]

with get_connection() as conn:
    cur = conn.cursor()
    for titulo, sql in CHECKS:
        print(f"\n== {titulo}")
        try:
            cur.execute(sql)
            for row in cur.fetchmany(10):
                print("  ", row)
        except Exception as e:
            print("   ERRO:", str(e).splitlines()[0])
