"""Validacoes seletivas (leves) em tabelas pequenas — conforme regra da skill."""
from db import get_connection

OWNER = "U_CMT9GE_WI"

CHECKS = [
    ("Dominio PCMOV.CODOPER (venda vs devolucao)",
     f"SELECT codoper, COUNT(*) qtd FROM {OWNER}.pcmov GROUP BY codoper ORDER BY qtd DESC"),
    ("Periodo de dados PCMOV",
     f"SELECT TO_CHAR(MIN(dtmov),'YYYY-MM-DD'), TO_CHAR(MAX(dtmov),'YYYY-MM-DD') FROM {OWNER}.pcmov"),
    ("Periodo de pedidos PCPEDC",
     f"SELECT TO_CHAR(MIN(data),'YYYY-MM-DD'), TO_CHAR(MAX(data),'YYYY-MM-DD') FROM {OWNER}.pcpedc"),
    ("Posicao dos pedidos PCPEDC.POSICAO",
     f"SELECT posicao, COUNT(*) FROM {OWNER}.pcpedc GROUP BY posicao ORDER BY 2 DESC"),
    ("Status contas a receber PCPREST (pagas vs abertas)",
     f"SELECT CASE WHEN dtpag IS NULL THEN 'ABERTA' ELSE 'PAGA' END st, COUNT(*), ROUND(SUM(valor),2) FROM {OWNER}.pcprest GROUP BY CASE WHEN dtpag IS NULL THEN 'ABERTA' ELSE 'PAGA' END"),
    ("Contas a pagar PCPAGAR existe/volume",
     f"SELECT COUNT(*) FROM {OWNER}.pcpagar"),
    ("Filiais",
     f"SELECT codigo, razaosocial FROM {OWNER}.pcfilial"),
]

with get_connection() as conn:
    cur = conn.cursor()
    for titulo, sql in CHECKS:
        print(f"\n== {titulo}")
        try:
            cur.execute(sql)
            for row in cur.fetchmany(25):
                print("  ", row)
        except Exception as e:
            print("   ERRO:", str(e).splitlines()[0])
