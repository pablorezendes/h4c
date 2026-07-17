"""Pendencias que destravam os 9 indicadores (P-IND01-D, P-IND02/09-REGUA, DTULTCOMP)."""
from db import get_connection

OWNER = "U_CMT9GE_WI"

CHECKS = [
    # A auditoria afirma que DTULTCOMP existe (eu havia testado DTULTCOMPRA). Conferir.
    ("DTULTCOMP existe mesmo em PCCLIENT?",
     """SELECT column_name, data_type, nullable FROM all_tab_columns
        WHERE owner='U_CMT9GE_WI' AND table_name='PCCLIENT' AND column_name LIKE 'DTULT%'"""),

    ("P-IND01-D — NFs de saida SEM nenhum item codoper='S' (o EXISTS remove notas?)",
     f"""SELECT COUNT(*) total_nf,
                SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM {OWNER}.pcmov m
                          WHERE m.numtransvenda = n.numtransvenda AND m.codoper='S'
                          AND m.dtcancel IS NULL) THEN 1 ELSE 0 END) nf_sem_item_S,
                ROUND(SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM {OWNER}.pcmov m
                          WHERE m.numtransvenda = n.numtransvenda AND m.codoper='S'
                          AND m.dtcancel IS NULL) THEN n.vltotal ELSE 0 END),2) valor_das_notas_sem_item_S
         FROM {OWNER}.pcnfsaid n
         WHERE n.dtcancel IS NULL AND n.dtsaida >= TRUNC(SYSDATE)-29"""),

    ("P-IND01-D — clientes positivados: NF pura vs NF com EXISTS item S",
     f"""SELECT (SELECT COUNT(DISTINCT codcli) FROM {OWNER}.pcnfsaid
                 WHERE dtcancel IS NULL AND dtsaida >= TRUNC(SYSDATE)-29) nf_pura,
                (SELECT COUNT(DISTINCT n.codcli) FROM {OWNER}.pcnfsaid n
                 WHERE n.dtcancel IS NULL AND n.dtsaida >= TRUNC(SYSDATE)-29
                 AND EXISTS (SELECT 1 FROM {OWNER}.pcmov m
                             WHERE m.numtransvenda=n.numtransvenda AND m.codoper='S'
                             AND m.dtcancel IS NULL)) nf_com_item_S
         FROM dual"""),

    ("P-IND02/09 — PCMOV.DTMOV nula? DTMOV = DTSAIDA da nota?",
     f"""SELECT COUNT(*) itens_S,
                SUM(CASE WHEN m.dtmov IS NULL THEN 1 ELSE 0 END) dtmov_nula,
                SUM(CASE WHEN TRUNC(m.dtmov) <> TRUNC(n.dtsaida) THEN 1 ELSE 0 END) dtmov_difere_dtsaida
         FROM {OWNER}.pcmov m
         JOIN {OWNER}.pcnfsaid n ON n.numtransvenda = m.numtransvenda
         WHERE m.codoper='S' AND m.dtcancel IS NULL AND n.dtcancel IS NULL
         AND   n.dtsaida >= TRUNC(SYSDATE)-29"""),

    ("P-IND02 — itens vendidos pela REGUA DA NOTA (vs 7.244 medido por DTMOV)",
     f"""SELECT ROUND(SUM(m.qt),2) unidades, COUNT(*) linhas, COUNT(DISTINCT m.codprod) skus,
                ROUND(SUM(m.qt*m.punit),2) venda_itens,
                ROUND(SUM(m.qt*NVL(m.custoreal,m.custofin)),2) custo_itens,
                ROUND(100*(SUM(m.qt*m.punit)-SUM(m.qt*NVL(m.custoreal,m.custofin)))
                      /NULLIF(SUM(m.qt*m.punit),0),2) margem_pct
         FROM {OWNER}.pcmov m
         JOIN {OWNER}.pcnfsaid n ON n.numtransvenda = m.numtransvenda
         WHERE m.codoper='S' AND m.dtcancel IS NULL AND n.dtcancel IS NULL
         AND   n.dtsaida >= TRUNC(SYSDATE)-29"""),

    ("D2 — existem notas de bonificacao/remessa? (dominio de operacao da NF)",
     f"""SELECT n.codoper, COUNT(*) qtd, ROUND(SUM(n.vltotal),2) valor
         FROM {OWNER}.pcnfsaid n
         WHERE n.dtcancel IS NULL AND n.dtsaida >= TRUNC(SYSDATE)-89
         GROUP BY n.codoper ORDER BY qtd DESC"""),

    ("IND-04 — carteira: viva / apta / bloqueada",
     f"""SELECT COUNT(*) total,
                SUM(CASE WHEN dtexclusao IS NULL THEN 1 ELSE 0 END) viva,
                SUM(CASE WHEN dtexclusao IS NULL AND NVL(bloqueiodefinitivo,'N')<>'S' THEN 1 ELSE 0 END) apta,
                SUM(CASE WHEN NVL(bloqueio,'N')='S' THEN 1 ELSE 0 END) bloq_credito,
                SUM(CASE WHEN NVL(bloqueiodefinitivo,'N')='S' THEN 1 ELSE 0 END) bloq_definitivo
         FROM {OWNER}.pcclient"""),
]

with get_connection() as conn:
    cur = conn.cursor()
    for titulo, sql in CHECKS:
        print(f"\n== {titulo}")
        try:
            cur.execute(sql)
            cols = [d[0] for d in cur.description]
            for row in cur.fetchmany(20):
                print("  ", dict(zip(cols, row)))
        except Exception as e:
            print("   ERRO:", str(e).splitlines()[0])
