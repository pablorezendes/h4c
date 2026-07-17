"""O que sao as 18 NFs sem item codoper='S'? (decisao D2 — bonificacao/remessa contam?)"""
from db import get_connection

OWNER = "U_CMT9GE_WI"

with get_connection() as conn:
    cur = conn.cursor()

    print("== Colunas de PCNFSAID que podem identificar o tipo da nota")
    cur.execute("""SELECT column_name, data_type FROM all_tab_columns
                   WHERE owner='U_CMT9GE_WI' AND table_name='PCNFSAID'
                   AND (column_name LIKE '%OPER%' OR column_name LIKE '%CFOP%'
                        OR column_name LIKE '%ESPECIE%' OR column_name LIKE '%TIPO%'
                        OR column_name LIKE '%BONIF%' OR column_name LIKE '%OBS%')
                   ORDER BY column_name""")
    for r in cur.fetchall():
        print("  ", r)

    print("\n== As NFs sem item codoper='S' nos ultimos 30d (amostra)")
    cur.execute(f"""SELECT n.numnota, TO_CHAR(n.dtsaida,'YYYY-MM-DD') dia, n.codcli,
                           n.vltotal, n.condvenda, n.especie, n.numtransvenda
                    FROM {OWNER}.pcnfsaid n
                    WHERE n.dtcancel IS NULL AND n.dtsaida >= TRUNC(SYSDATE)-29
                    AND NOT EXISTS (SELECT 1 FROM {OWNER}.pcmov m
                                    WHERE m.numtransvenda=n.numtransvenda
                                    AND m.codoper='S' AND m.dtcancel IS NULL)
                    ORDER BY n.vltotal DESC
                    FETCH FIRST 12 ROWS ONLY""")
    cols = [d[0] for d in cur.description]
    for r in cur.fetchall():
        print("  ", dict(zip(cols, r)))

    print("\n== CONDVENDA das notas COM item S vs SEM item S (30d)")
    cur.execute(f"""SELECT n.condvenda,
                           SUM(CASE WHEN EXISTS (SELECT 1 FROM {OWNER}.pcmov m
                                 WHERE m.numtransvenda=n.numtransvenda AND m.codoper='S'
                                 AND m.dtcancel IS NULL) THEN 1 ELSE 0 END) com_item_S,
                           SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM {OWNER}.pcmov m
                                 WHERE m.numtransvenda=n.numtransvenda AND m.codoper='S'
                                 AND m.dtcancel IS NULL) THEN 1 ELSE 0 END) sem_item_S,
                           ROUND(SUM(n.vltotal),2) valor
                    FROM {OWNER}.pcnfsaid n
                    WHERE n.dtcancel IS NULL AND n.dtsaida >= TRUNC(SYSDATE)-29
                    GROUP BY n.condvenda ORDER BY 4 DESC""")
    cols = [d[0] for d in cur.description]
    for r in cur.fetchall():
        print("  ", dict(zip(cols, r)))

    print("\n== Que operacoes (codoper) essas notas 'sem item S' TEM em PCMOV?")
    cur.execute(f"""SELECT m.codoper, COUNT(*) linhas, ROUND(SUM(m.qt*m.punit),2) valor
                    FROM {OWNER}.pcnfsaid n
                    JOIN {OWNER}.pcmov m ON m.numtransvenda = n.numtransvenda
                    WHERE n.dtcancel IS NULL AND n.dtsaida >= TRUNC(SYSDATE)-29
                    AND NOT EXISTS (SELECT 1 FROM {OWNER}.pcmov m2
                                    WHERE m2.numtransvenda=n.numtransvenda
                                    AND m2.codoper='S' AND m2.dtcancel IS NULL)
                    GROUP BY m.codoper ORDER BY linhas DESC""")
    cols = [d[0] for d in cur.description]
    for r in cur.fetchall():
        print("  ", dict(zip(cols, r)))

    print("\n== DTULTCOMP esta populada? (auditoria disse que a coluna existe)")
    cur.execute(f"""SELECT COUNT(*) total, COUNT(dtultcomp) preenchida,
                           TO_CHAR(MAX(dtultcomp),'YYYY-MM-DD') mais_recente
                    FROM {OWNER}.pcclient""")
    cols = [d[0] for d in cur.description]
    print("  ", dict(zip(cols, cur.fetchone())))
