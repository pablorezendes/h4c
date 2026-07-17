"""PCCFO = dicionario de operacoes do Winthor. O que e SR, oficialmente?"""
from db import get_connection

OWNER = "U_CMT9GE_WI"

with get_connection() as conn:
    cur = conn.cursor()

    print("== Colunas de PCCFO")
    cur.execute("""SELECT column_name, data_type FROM all_tab_columns
                   WHERE owner='U_CMT9GE_WI' AND table_name='PCCFO' ORDER BY column_id""")
    print("  ", [r[0] for r in cur.fetchall()])

    print("\n== PCCFO — operacoes de saida (o significado oficial de S / SR / SD / SB)")
    try:
        cur.execute(f"""SELECT DISTINCT codoper, cfop, operacao, tipo
                        FROM {OWNER}.pccfo
                        WHERE codoper IN ('S','SR','SD','SB')
                        ORDER BY codoper""")
        cols = [d[0] for d in cur.description]
        for r in cur.fetchall():
            print("  ", dict(zip(cols, r)))
    except Exception as e:
        print("   ", str(e).splitlines()[0])
        # fallback: descobrir as colunas certas
        cur.execute(f"""SELECT * FROM {OWNER}.pccfo WHERE ROWNUM <= 3""")
        cols = [d[0] for d in cur.description]
        for r in cur.fetchall():
            print("   AMOSTRA:", {k: v for k, v in zip(cols, r) if v is not None})

    print("\n== Os produtos que saem como SR sao vendidos alguma vez como S?")
    cur.execute(f"""SELECT p.codprod, p.descricao,
                           SUM(CASE WHEN m.codoper='SR' THEN m.qt ELSE 0 END) qt_remessa,
                           SUM(CASE WHEN m.codoper='S'  THEN m.qt ELSE 0 END) qt_venda
                    FROM {OWNER}.pcmov m
                    JOIN {OWNER}.pcprodut p ON p.codprod = m.codprod
                    WHERE m.dtcancel IS NULL AND m.codoper IN ('S','SR')
                    GROUP BY p.codprod, p.descricao
                    HAVING SUM(CASE WHEN m.codoper='SR' THEN m.qt ELSE 0 END) > 0
                    ORDER BY qt_remessa DESC FETCH FIRST 10 ROWS ONLY""")
    cols = [d[0] for d in cur.description]
    for r in cur.fetchall():
        print("  ", dict(zip(cols, r)))
