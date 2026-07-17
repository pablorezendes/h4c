"""O que significa CODOPER='SR'? (define se entra ou nao no faturamento)"""
from db import get_connection

OWNER = "U_CMT9GE_WI"

with get_connection() as conn:
    cur = conn.cursor()

    for titulo, sql in [
        ("PCCFO existe? (dicionario de operacoes do Winthor)",
         """SELECT table_name, num_rows FROM all_tables
            WHERE owner='U_CMT9GE_WI' AND table_name IN ('PCCFO','PCOPER','PCOPERACAO','PCNATOPER')"""),
        ("Dicionario Winthor: ajuda/titulo da coluna CODOPER",
         f"""SELECT nomeobjeto, nomecampo, titulo, SUBSTR(ajuda,1,400) ajuda
             FROM {OWNER}.pcdicionarioitem
             WHERE nomecampo='CODOPER' AND ajuda IS NOT NULL
             FETCH FIRST 3 ROWS ONLY"""),
        ("Amostra de itens SR — o que tem dentro?",
         f"""SELECT m.numtransvenda, m.codprod, p.descricao, m.qt, m.punit,
                    ROUND(m.qt*m.punit,2) valor, m.numnota
             FROM {OWNER}.pcmov m
             JOIN {OWNER}.pcprodut p ON p.codprod = m.codprod
             WHERE m.codoper='SR' AND m.dtcancel IS NULL
             AND   m.dtmov >= TRUNC(SYSDATE)-29
             ORDER BY valor DESC FETCH FIRST 8 ROWS ONLY"""),
        ("SR gera titulo no contas a receber? (se sim, e venda de verdade)",
         f"""SELECT COUNT(DISTINCT n.numtransvenda) notas_sem_item_S,
                    COUNT(DISTINCT pr.numtransvenda) dessas_com_titulo_no_CR,
                    ROUND(SUM(DISTINCT pr.valor),2) valor_em_titulos
             FROM {OWNER}.pcnfsaid n
             LEFT JOIN {OWNER}.pcprest pr ON pr.numtransvenda = n.numtransvenda
             WHERE n.dtcancel IS NULL AND n.dtsaida >= TRUNC(SYSDATE)-29
             AND NOT EXISTS (SELECT 1 FROM {OWNER}.pcmov m2
                             WHERE m2.numtransvenda=n.numtransvenda
                             AND m2.codoper='S' AND m2.dtcancel IS NULL)"""),
        ("Comparativo: notas COM item S geram titulo?",
         f"""SELECT COUNT(DISTINCT n.numtransvenda) notas_com_item_S,
                    COUNT(DISTINCT pr.numtransvenda) com_titulo_no_CR
             FROM {OWNER}.pcnfsaid n
             LEFT JOIN {OWNER}.pcprest pr ON pr.numtransvenda = n.numtransvenda
             WHERE n.dtcancel IS NULL AND n.dtsaida >= TRUNC(SYSDATE)-29
             AND EXISTS (SELECT 1 FROM {OWNER}.pcmov m2
                         WHERE m2.numtransvenda=n.numtransvenda
                         AND m2.codoper='S' AND m2.dtcancel IS NULL)"""),
        ("SR no total do historico — volume e valor",
         f"""SELECT codoper, COUNT(*) linhas, ROUND(SUM(qt*punit),2) valor,
                    TO_CHAR(MIN(dtmov),'YYYY-MM-DD') de, TO_CHAR(MAX(dtmov),'YYYY-MM-DD') ate
             FROM {OWNER}.pcmov WHERE codoper IN ('S','SR','SD','SB') AND dtcancel IS NULL
             GROUP BY codoper ORDER BY valor DESC"""),
    ]:
        print(f"\n== {titulo}")
        try:
            cur.execute(sql)
            cols = [d[0] for d in cur.description]
            for row in cur.fetchmany(10):
                print("  ", dict(zip(cols, row)))
        except Exception as e:
            print("   ERRO:", str(e).splitlines()[0])
