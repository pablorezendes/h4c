from db import run_query

sql = """
SELECT (SELECT ROUND(SUM(vltotal),2) FROM u_cmt9ge_wi.pcnfsaid
        WHERE dtsaida BETWEEN TRUNC(SYSDATE)-29 AND SYSDATE
        AND dtcancel IS NULL) AS nfsaid,
       (SELECT COUNT(*) FROM u_cmt9ge_wi.pcnfsaid
        WHERE dtsaida BETWEEN TRUNC(SYSDATE)-29 AND SYSDATE
        AND dtcancel IS NULL) AS nfsaid_notas,
       (SELECT ROUND(SUM(m.qt*m.punit),2) FROM u_cmt9ge_wi.pcmov m
        WHERE m.dtmov BETWEEN TRUNC(SYSDATE)-29 AND SYSDATE
        AND m.codoper = 'S' AND m.dtcancel IS NULL) AS mov_s
FROM dual"""

cols, rows = run_query(sql)
print(dict(zip(cols, rows[0])))
