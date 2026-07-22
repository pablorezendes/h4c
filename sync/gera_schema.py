"""Lê o catálogo do Oracle e gera o DDL Postgres do espelho.

Roda numa máquina COM acesso ao Oracle. A saída (sync/sql/001_schema.sql) é
versionada e aplicada automaticamente pelo Postgres no primeiro start
(docker-entrypoint-initdb.d) — o servidor não precisa de Oracle para criar o schema.

Uso:  python sync/gera_schema.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import (  # noqa: E402
    OWNER, TABELAS, TIPOS_IGNORADOS, coluna_permitida, tipo_postgres,
)
# conexão THIN do próprio agente: o script é autossuficiente e não depende do
# Instant Client que o discovery/ exige (modo thick)
from oracle import conecta as get_connection  # noqa: E402

SAIDA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sql", "001_schema.sql")

CABECALHO = """-- Espelho local do Winthor (Oracle) em Postgres — GERADO por sync/gera_schema.py
-- Não editar à mão: regenere com `python sync/gera_schema.py`.
-- Colunas binárias (BLOB/RAW/LONG) foram descartadas de propósito.

CREATE SCHEMA IF NOT EXISTS winthor;
SET search_path TO winthor, public;

-- controle do sincronismo: marca d'água e auditoria de cada carga
CREATE TABLE IF NOT EXISTS sync_controle (
  tabela            text PRIMARY KEY,
  estrategia        text        NOT NULL,
  ultima_marca      timestamp,              -- maior data já trazida (incremental)
  ultima_execucao   timestamptz,
  linhas_ultima     integer,
  duracao_seg       numeric(10,2),
  status            text,
  erro              text
);
"""


def main() -> None:
    os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
    partes = [CABECALHO]
    resumo = []

    with get_connection() as conn:
        cur = conn.cursor()
        for tabela, cfg in TABELAS.items():
            cur.execute(
                """SELECT column_name, data_type, data_precision, data_scale, char_length
                   FROM all_tab_columns
                   WHERE owner = :o AND table_name = :t
                   ORDER BY column_id""",
                {"o": OWNER, "t": tabela},
            )
            colunas = cur.fetchall()
            if not colunas:
                print(f"  !! {tabela}: não encontrada no Oracle — pulando")
                continue

            linhas_ddl, ignoradas, barradas = [], 0, 0
            for nome, tipo, prec, esc, tam in colunas:
                if (tipo or "").upper() in TIPOS_IGNORADOS:
                    ignoradas += 1
                    continue
                if not coluna_permitida(nome):
                    # senha e documento pessoal não existem no espelho (ver config.py)
                    barradas += 1
                    continue
                linhas_ddl.append(f'  "{nome.lower()}" {tipo_postgres(tipo, prec, esc, tam)}')

            pk = [c.lower() for c in cfg["pk"]]
            pk_valida = all(any(f'"{p}" ' in ln for ln in linhas_ddl) for p in pk)
            # PK só é declarada quando a estratégia depende dela (incremental/upsert).
            # Em recarga completa a PK é dispensável e evita quebra por dado sujo
            # (ex.: PCMOV tem NUMTRANSITEM nulo em 7 linhas).
            if cfg["estrategia"] == "incremental" and pk_valida:
                linhas_ddl.append(f'  PRIMARY KEY ({", ".join(chr(34) + p + chr(34) for p in pk)})')

            partes.append(
                f'\n-- {tabela}: {len(linhas_ddl)} colunas'
                f'{f" ({ignoradas} binárias descartadas)" if ignoradas else ""}'
                f'{f" ({barradas} de credencial/documento barradas)" if barradas else ""}'
                f' · estratégia: {cfg["estrategia"]}\n'
                f'DROP TABLE IF EXISTS winthor."{tabela.lower()}" CASCADE;\n'
                f'CREATE TABLE winthor."{tabela.lower()}" (\n'
                + ",\n".join(linhas_ddl)
                + "\n);\n"
            )
            resumo.append((tabela, len(linhas_ddl), ignoradas, barradas, cfg["estrategia"]))

    # índices que as consultas do BI mais usam
    partes.append("""
-- índices de apoio às consultas do BI
CREATE INDEX IF NOT EXISTS ix_pcmov_dtmov      ON winthor.pcmov (dtmov);
CREATE INDEX IF NOT EXISTS ix_pcmov_codoper    ON winthor.pcmov (codoper);
CREATE INDEX IF NOT EXISTS ix_pcmov_transvenda ON winthor.pcmov (numtransvenda);
CREATE INDEX IF NOT EXISTS ix_pcmov_codprod    ON winthor.pcmov (codprod);
CREATE INDEX IF NOT EXISTS ix_pcnfsaid_dtsaida ON winthor.pcnfsaid (dtsaida);
CREATE INDEX IF NOT EXISTS ix_pcnfsaid_codcli  ON winthor.pcnfsaid (codcli);
CREATE INDEX IF NOT EXISTS ix_pcpedc_data      ON winthor.pcpedc (data);
CREATE INDEX IF NOT EXISTS ix_pcprest_dtvenc   ON winthor.pcprest (dtvenc);
CREATE INDEX IF NOT EXISTS ix_pcprest_dtpag    ON winthor.pcprest (dtpag);
CREATE INDEX IF NOT EXISTS ix_pchistest_data   ON winthor.pchistest (data);
CREATE INDEX IF NOT EXISTS ix_pcpedi_numped    ON winthor.pcpedi (numped);

-- apoio às correções da skill: medida líquida por filial/período (§1),
-- PMR/PMP (§8) e itens do pedido de compra (§10)
CREATE INDEX IF NOT EXISTS ix_pcmov_filial_data ON winthor.pcmov (codfilial, dtmov);
CREATE INDEX IF NOT EXISTS ix_pcmov_codusur     ON winthor.pcmov (codusur);
CREATE INDEX IF NOT EXISTS ix_pcprest_dtemissao ON winthor.pcprest (dtemissao);
CREATE INDEX IF NOT EXISTS ix_pclanc_dtpagto    ON winthor.pclanc (dtpagto);
CREATE INDEX IF NOT EXISTS ix_pclanc_conta_pag  ON winthor.pclanc (codconta, dtpagto);
CREATE INDEX IF NOT EXISTS ix_pcitem_numped     ON winthor.pcitem (numped);
CREATE INDEX IF NOT EXISTS ix_pcest_codprod     ON winthor.pcest (codprod);
""")

    with open(SAIDA, "w", encoding="utf-8") as f:
        f.write("".join(partes))

    print(f"\n{'TABELA':16s} {'COLS':>5s} {'BIN':>4s} {'SEC':>4s}  ESTRATEGIA")
    for t, c, ig, ba, e in resumo:
        print(f"{t:16s} {c:>5d} {ig:>4d} {ba:>4d}  {e}")
    print(f"\nDDL gerado: {SAIDA}")
    print(f"{len(resumo)} tabelas, {sum(c for _, c, _, _, _ in resumo)} colunas, "
          f"{sum(i for _, _, i, _, _ in resumo)} binárias e "
          f"{sum(b for _, _, _, b, _ in resumo)} de credencial/documento descartadas")


if __name__ == "__main__":
    main()
