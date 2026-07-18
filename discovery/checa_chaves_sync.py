"""Descobre chave unica de PCMOV (sem PK) e confere colunas de watermark do sync."""
from db import get_connection

OWNER = "U_CMT9GE_WI"

with get_connection() as conn:
    cur = conn.cursor()
    cur.execute(f"ALTER SESSION SET CURRENT_SCHEMA = {OWNER}")

    print("== PCMOV: colunas candidatas a chave unica ==")
    cur.execute("""SELECT column_name FROM all_tab_columns
                   WHERE owner=:o AND table_name='PCMOV'
                   AND column_name IN ('NUMTRANSITEM','SEQUENCIA','NUMTRANSVENDA','NUMSEQ','ROWID_')
                   ORDER BY column_name""", {"o": OWNER})
    cands = [r[0] for r in cur.fetchall()]
    print("  existem:", cands)

    if "NUMTRANSITEM" in cands:
        cur.execute("""SELECT COUNT(*) total, COUNT(DISTINCT numtransitem) distintos,
                              SUM(CASE WHEN numtransitem IS NULL THEN 1 ELSE 0 END) nulos
                       FROM pcmov""")
        t, d, n = cur.fetchone()
        print(f"  NUMTRANSITEM -> total={t} distintos={d} nulos={n} "
              f"{'UNICO ✔' if t == d and not n else 'NAO UNICO ✘'}")

    print("\n== indices unicos declarados em PCMOV ==")
    cur.execute("""SELECT i.index_name, i.uniqueness, LISTAGG(c.column_name, ',')
                          WITHIN GROUP (ORDER BY c.column_position)
                   FROM all_indexes i
                   JOIN all_ind_columns c ON c.index_name = i.index_name AND c.table_owner = i.table_owner
                   WHERE i.table_owner=:o AND i.table_name='PCMOV'
                   GROUP BY i.index_name, i.uniqueness
                   ORDER BY i.uniqueness DESC""", {"o": OWNER})
    for r in cur.fetchall():
        print(f"  {r[1]:9s} {r[0]:28s} {r[2][:70]}")

    print("\n== PCHISTEST: periodo e volume (tabela do sync incremental) ==")
    cur.execute("""SELECT TO_CHAR(MIN(data),'YYYY-MM-DD'), TO_CHAR(MAX(data),'YYYY-MM-DD'),
                          COUNT(*) FROM pchistest""")
    print("  ", cur.fetchone())

    print("\n== colunas DATE uteis por tabela (watermark) ==")
    for t, c in [("PCMOV", "DTMOV"), ("PCNFSAID", "DTSAIDA"), ("PCPEDC", "DATA"),
                 ("PCPREST", "DTEMISSAO"), ("PCPEDI", "DATA"), ("PCHISTEST", "DATA")]:
        cur.execute("""SELECT COUNT(*) FROM all_tab_columns
                       WHERE owner=:o AND table_name=:t AND column_name=:c""",
                    {"o": OWNER, "t": t, "c": c})
        print(f"  {t}.{c}: {'existe' if cur.fetchone()[0] else 'NAO EXISTE'}")

    print("\n== tipos exoticos que o espelho precisa tratar (LOB/LONG/RAW) ==")
    cur.execute("""SELECT table_name, data_type, COUNT(*) FROM all_tab_columns
                   WHERE owner=:o AND table_name IN
                     ('PCMOV','PCNFSAID','PCPRODUT','PCCLIENT','PCPEDC','PCPREST','PCPEDI',
                      'PCEST','PCHISTEST','PCNFENT','PCFORNEC','PCUSUARI','PCPRODFILIAL',
                      'PCPEDIDO','PCCOB','PCSECAO','PCPRACA','PCDEPTO')
                   AND data_type NOT IN ('NUMBER','VARCHAR2','DATE','CHAR','FLOAT')
                   GROUP BY table_name, data_type ORDER BY 1,2""", {"o": OWNER})
    linhas = cur.fetchall()
    for r in linhas:
        print(f"  {r[0]:14s} {r[1]:14s} {r[2]}")
    if not linhas:
        print("   (nenhum — só tipos simples)")
