"""Reescreve o SQL do IND-08 (ORA-00937) preservando as decisoes da consolidacao:
denominador = carteira apta (bloqueio de credito CONTA; so exclui excluido/bloqueio definitivo),
regua canonica de venda (EXISTS codoper='S'), guarda de anacronismo por DTCADASTRO.
A causa do erro era misturar agregacao com subqueries escalares no mesmo nivel —
resolvido agregando antes (CTE 'tot') e deixando o SELECT final sem funcoes de grupo.
"""
import json
from datetime import date, timedelta

from db import get_connection

SQL_NOVO = """WITH par AS (
  SELECT TRUNC(:dt_ini) AS d_ini, TRUNC(:dt_fim) AS d_fim FROM dual
),
base AS (
  -- CARTEIRA APTA CANONICA (= IND-04.carteira_apta = IND-06.carteira_apta):
  -- bloqueado por credito CONTINUA no denominador (anti-gaming); cliente cadastrado
  -- depois do periodo nao entra; excluido durante/depois continua.
  SELECT c.codcli
  FROM   pcclient c CROSS JOIN par p
  WHERE  (c.dtcadastro IS NULL OR c.dtcadastro < p.d_fim + 1)
  AND    (c.dtexclusao IS NULL OR c.dtexclusao >= p.d_ini)
  AND    NVL(c.bloqueiodefinitivo, 'N') <> 'S'
),
pos AS (
  -- REGUA CANONICA DE VENDA: EXISTS item CODOPER='S' exclui remessa de comodato ('SR')
  SELECT DISTINCT d.codcli
  FROM   pcnfsaid d CROSS JOIN par p
  WHERE  d.dtcancel IS NULL
  AND    d.dtsaida >= p.d_ini
  AND    d.dtsaida <  p.d_fim + 1
  AND    EXISTS (SELECT 1 FROM pcmov m
                  WHERE m.numtransvenda = d.numtransvenda
                    AND m.codoper = 'S' AND m.dtcancel IS NULL)
),
ativos90 AS (
  -- Mesma janela e regua do IND-06 => os dois numeros batem.
  SELECT DISTINCT d.codcli
  FROM   pcnfsaid d CROSS JOIN par p
  WHERE  d.dtcancel IS NULL
  AND    d.dtsaida >= p.d_fim - 89
  AND    d.dtsaida <  p.d_fim + 1
  AND    EXISTS (SELECT 1 FROM pcmov m
                  WHERE m.numtransvenda = d.numtransvenda
                    AND m.codoper = 'S' AND m.dtcancel IS NULL)
),
tot AS (
  SELECT COUNT(*) AS qt_carteira,
         COUNT(CASE WHEN EXISTS (SELECT 1 FROM pos po WHERE po.codcli = b.codcli)
                    THEN 1 END) AS qt_pos
  FROM   base b
)
SELECT ROUND(100 * t.qt_pos / NULLIF(t.qt_carteira, 0), 2)  AS valor,
       t.qt_pos                                             AS positivados_na_carteira,
       t.qt_carteira                                        AS carteira_apta,
       (SELECT COUNT(*) FROM pos)                           AS positivados_total,
       (SELECT COUNT(*) FROM ativos90)                      AS base_ativa_90d,
       ROUND(100 * (SELECT COUNT(*) FROM pos p2
                    WHERE EXISTS (SELECT 1 FROM ativos90 a WHERE a.codcli = p2.codcli))
             / NULLIF((SELECT COUNT(*) FROM ativos90), 0), 2) AS pct_sobre_base_ativa_90d
FROM   tot t"""

if __name__ == "__main__":
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute("ALTER SESSION SET CURRENT_SCHEMA = U_CMT9GE_WI")
        cur.execute(SQL_NOVO, {"dt_ini": date.today() - timedelta(days=29), "dt_fim": date.today()})
        cols = [d[0] for d in cur.description]
        print("IND-08 OK ->", dict(zip(cols, cur.fetchone())))

    caminho = "indicadores-spec.json"
    doc = json.load(open(caminho, encoding="utf-8"))
    for ind in doc["indicadores"]:
        if ind["id"] == "IND-08":
            ind["sql"] = SQL_NOVO
            ind["obs"] = ((ind.get("obs") or "") +
                          " | Correcao 2026-07-17: SQL reescrito (ORA-00937 por agregacao "
                          "misturada com subqueries escalares); decisoes de definicao preservadas.").strip()
    json.dump(doc, open(caminho, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("spec atualizada")
