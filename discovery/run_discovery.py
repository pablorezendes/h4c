"""Discovery Winthor — Fases 1 a 5 (queries de catalogo, SOMENTE LEITURA).

Roda as queries do playbook (Z:\\skill\\queries-oracle-winthor.md) e salva CSVs em output/.
Todas as queries batem em views ALL_* e no dicionario nativo (PCDICIONARIO*), que sao
leituras leves de catalogo — nenhuma varredura em tabela de movimento.
"""
import time
from db import get_connection, save_csv

OWNER = "U_CMT9GE_WI"

QUERIES = {
    # Fase 1 — inventario macro (tabelas + linhas estimadas + descricoes)
    "fase1_inventario.csv": f"""
        SELECT t.table_name,
               t.num_rows        AS linhas_estimadas,
               TO_CHAR(t.last_analyzed,'YYYY-MM-DD') AS last_analyzed,
               c.comments        AS descricao_oracle,
               d.descricao       AS descricao_winthor
        FROM   all_tables t
        LEFT   JOIN all_tab_comments c
               ON c.owner = t.owner AND c.table_name = t.table_name AND c.table_type = 'TABLE'
        LEFT   JOIN {OWNER}.pcdicionario d
               ON d.nomeobjeto = t.table_name
        WHERE  t.owner = '{OWNER}'
        ORDER  BY t.num_rows DESC NULLS LAST""",

    # Fase 3 — frequencia de nomes de coluna (chaves de juncao / dimensoes conformadas)
    "fase3_freq_colunas.csv": f"""
        SELECT column_name, COUNT(DISTINCT table_name) AS qtd_tabelas
        FROM   all_tab_columns
        WHERE  owner = '{OWNER}'
        GROUP  BY column_name
        HAVING COUNT(DISTINCT table_name) > 10
        ORDER  BY qtd_tabelas DESC""",

    # Fase 3 — FKs declaradas (poucas, alta confianca)
    "fase3_fks_declaradas.csv": f"""
        SELECT a.table_name       AS tabela_filha,
               a.column_name      AS coluna_filha,
               a.constraint_name,
               cpk.table_name     AS tabela_pai,
               cpk.column_name    AS coluna_pai
        FROM   all_cons_columns a
        JOIN   all_constraints  c   ON c.owner = a.owner AND c.constraint_name = a.constraint_name
        JOIN   all_constraints  rpk ON rpk.owner = c.r_owner AND rpk.constraint_name = c.r_constraint_name
        JOIN   all_cons_columns cpk ON cpk.owner = rpk.owner AND cpk.constraint_name = rpk.constraint_name
                                    AND cpk.position = a.position
        WHERE  c.constraint_type = 'R'
        AND    a.owner = '{OWNER}'
        ORDER  BY a.table_name, a.position""",

    # Fase 4 — composicao de colunas por tabela (sinais de fato vs dimensao)
    "fase4_composicao.csv": f"""
        SELECT c.table_name,
               COUNT(*)                                                        AS total_colunas,
               COUNT(CASE WHEN c.data_type IN ('NUMBER','FLOAT') THEN 1 END)   AS colunas_numericas,
               COUNT(CASE WHEN c.data_type IN ('DATE','TIMESTAMP') THEN 1 END) AS colunas_data,
               d.descricao
        FROM   all_tab_columns c
        LEFT   JOIN {OWNER}.pcdicionario d ON d.nomeobjeto = c.table_name
        WHERE  c.owner = '{OWNER}'
        GROUP  BY c.table_name, d.descricao
        ORDER  BY colunas_numericas DESC""",

    # Fase 4 — candidatos a fato (data + valor/quantidade)
    "fase4_candidatos_fato.csv": f"""
        SELECT DISTINCT c1.table_name
        FROM   all_tab_columns c1
        WHERE  c1.owner = '{OWNER}'
        AND    c1.data_type IN ('DATE','TIMESTAMP')
        AND EXISTS (
                SELECT 1 FROM all_tab_columns c2
                WHERE c2.owner = c1.owner AND c2.table_name = c1.table_name
                AND  (c2.column_name LIKE 'VL%' OR c2.column_name LIKE 'QT%'
                      OR c2.column_name IN ('PVENDA','PTABELA') OR c2.column_name LIKE 'CUSTO%'))
        ORDER  BY 1""",

    # Fase 4 — agregados prontos (consolidacoes)
    "fase4_agregados.csv": f"""
        SELECT nomeobjeto, descricao
        FROM   {OWNER}.pcdicionario
        WHERE  UPPER(descricao) LIKE '%CONSOLID%'
           OR  UPPER(descricao) LIKE '%SALDO%'
           OR  UPPER(descricao) LIKE '%RESUMO%'
           OR  UPPER(descricao) LIKE '%GERENCIA%'""",

    # Fase 6 — chaves primarias (grao real das tabelas)
    "fase6_pks.csv": f"""
        SELECT ac.table_name, acc.column_name, acc.position
        FROM   all_constraints ac
        JOIN   all_cons_columns acc
               ON acc.owner = ac.owner AND acc.constraint_name = ac.constraint_name
        WHERE  ac.owner = '{OWNER}'
        AND    ac.constraint_type = 'P'
        ORDER  BY ac.table_name, acc.position""",

    # Fase 2 — dicionario enriquecido completo (materia-prima da camada semantica)
    "fase2_dicionario.csv": f"""
        SELECT c.table_name,
               c.column_name,
               c.data_type,
               c.data_length,
               c.nullable,
               i.titulo        AS rotulo,
               i.ajuda         AS descricao_campo,
               i.criadopelocliente
        FROM   all_tab_columns c
        LEFT   JOIN {OWNER}.pcdicionarioitem i
               ON i.nomeobjeto = c.table_name
              AND i.nomecampo  = c.column_name
        WHERE  c.owner = '{OWNER}'
        ORDER  BY c.table_name, c.column_id""",
}


def main():
    with get_connection() as conn:
        cur = conn.cursor()
        cur.arraysize = 5000
        for fname, sql in QUERIES.items():
            t0 = time.time()
            cur.execute(sql)
            cols = [d[0] for d in cur.description]
            rows = cur.fetchall()
            path = save_csv(fname, cols, rows)
            print(f"{fname:35s} {len(rows):>7d} linhas  {time.time()-t0:5.1f}s  -> {path}")


if __name__ == "__main__":
    main()
