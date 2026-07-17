"""Validacoes para os 9 indicadores pedidos: custo (P-03), clientes, positivacao."""
from db import get_connection

OWNER = "U_CMT9GE_WI"

CHECKS = [
    ("P-03 — quais colunas de custo estao populadas em PCMOV (saidas de venda)",
     f"""SELECT COUNT(*) linhas,
                COUNT(custofin) c_custofin, ROUND(AVG(custofin),4) avg_custofin,
                COUNT(custoreal) c_custoreal, ROUND(AVG(custoreal),4) avg_custoreal,
                COUNT(custocont) c_custocont, ROUND(AVG(custocont),4) avg_custocont,
                COUNT(custoultent) c_custoultent, ROUND(AVG(custoultent),4) avg_custoultent
         FROM {OWNER}.pcmov
         WHERE codoper='S' AND dtcancel IS NULL AND dtmov >= TRUNC(SYSDATE)-90"""),
    ("Custos ZERO ou nulos (% que atrapalha margem)",
     f"""SELECT COUNT(*) total,
                SUM(CASE WHEN NVL(custofin,0)=0 THEN 1 ELSE 0 END)  custofin_zero,
                SUM(CASE WHEN NVL(custoreal,0)=0 THEN 1 ELSE 0 END) custoreal_zero,
                SUM(CASE WHEN NVL(custocont,0)=0 THEN 1 ELSE 0 END) custocont_zero
         FROM {OWNER}.pcmov
         WHERE codoper='S' AND dtcancel IS NULL AND dtmov >= TRUNC(SYSDATE)-90"""),
    ("Margem % pelas 3 visoes de custo (90d) — qual faz sentido de negocio?",
     f"""SELECT ROUND(SUM(qt*punit),2) venda,
                ROUND(100*(SUM(qt*punit)-SUM(qt*custofin))/NULLIF(SUM(qt*punit),0),2)  margem_custofin,
                ROUND(100*(SUM(qt*punit)-SUM(qt*custoreal))/NULLIF(SUM(qt*punit),0),2) margem_custoreal,
                ROUND(100*(SUM(qt*punit)-SUM(qt*custocont))/NULLIF(SUM(qt*punit),0),2) margem_custocont
         FROM {OWNER}.pcmov
         WHERE codoper='S' AND dtcancel IS NULL AND dtmov >= TRUNC(SYSDATE)-90"""),
    ("PCCLIENT — colunas de status/bloqueio/exclusao disponiveis",
     """SELECT column_name, data_type FROM all_tab_columns
        WHERE owner='U_CMT9GE_WI' AND table_name='PCCLIENT'
        AND (column_name LIKE '%BLOQU%' OR column_name LIKE '%DTCAD%' OR column_name LIKE '%DTEXCL%'
             OR column_name LIKE '%ATIV%' OR column_name IN ('DTULTCOMPRA','DTPRIMEIRACOMPRA','CODCLI','CLIENTE','CODUSUR1','CODPRACA'))
        ORDER BY column_name"""),
    ("Clientes cadastrados — total, bloqueados, com DTCADASTRO",
     f"""SELECT COUNT(*) total,
                COUNT(dtcadastro) com_dtcadastro,
                SUM(CASE WHEN NVL(bloqueio,'N')='S' THEN 1 ELSE 0 END) bloqueados,
                COUNT(dtultcompra) com_dtultcompra
         FROM {OWNER}.pcclient"""),
    ("Positivacao 30d — clientes distintos que compraram (NF vs PEDIDO)",
     f"""SELECT (SELECT COUNT(DISTINCT codcli) FROM {OWNER}.pcnfsaid
                 WHERE dtsaida >= TRUNC(SYSDATE)-29 AND dtcancel IS NULL) via_nf,
                (SELECT COUNT(DISTINCT codcli) FROM {OWNER}.pcpedc
                 WHERE data >= TRUNC(SYSDATE)-29 AND posicao <> 'C') via_pedido
         FROM dual"""),
    ("Itens vendidos 30d — unidades (SUM QT) vs linhas vs SKUs distintos",
     f"""SELECT ROUND(SUM(qt),2) unidades, COUNT(*) linhas, COUNT(DISTINCT codprod) skus
         FROM {OWNER}.pcmov
         WHERE codoper='S' AND dtcancel IS NULL AND dtmov >= TRUNC(SYSDATE)-29"""),
]

with get_connection() as conn:
    cur = conn.cursor()
    for titulo, sql in CHECKS:
        print(f"\n== {titulo}")
        try:
            cur.execute(sql)
            cols = [d[0] for d in cur.description]
            for row in cur.fetchmany(30):
                print("  ", dict(zip(cols, row)))
        except Exception as e:
            print("   ERRO:", str(e).splitlines()[0])
