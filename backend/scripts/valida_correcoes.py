"""Prova, contra o Oracle de producao, que as correcoes do BI continuam certas.

Roda DEPOIS de cada sync (ou a qualquer momento) e imprime, para os meses
fechados: bruto, devolucao deduzida, liquido, % de deducao, custo, margem de
contribuicao e o farol da meta; mais a conferencia capa x item (tem que dar
R$ 0,00) e a contagem de churn (ativo/risco/perdido) pela regua canonica.

E o "prove que ainda esta certo" das correcoes dos routers kpis/meta e da
medida canonica de regras.py. Se algum numero sair diferente do esperado, ou o
sync trouxe dado novo (ok, confira se faz sentido) ou uma query regrediu.

Conexao: mesmo padrao de app/db.py, lendo backend/.env — vai direto ao Oracle,
sem passar pelo espelho Postgres, para ser um cheque INDEPENDENTE do BI.

Uso:
    Z:/h4c-bi/backend/.venv/Scripts/python.exe backend/scripts/valida_correcoes.py
    (opcional)  --ref 2026-07-21   ancora as janelas de 12m/churn em outra data
"""
import os
import sys
from datetime import date, datetime

import oracledb

# ---------------------------------------------------------------------------
# .env e conexao (espelham app/db.py / app/config.py)
# ---------------------------------------------------------------------------
AQUI = os.path.dirname(os.path.abspath(__file__))
ENV = os.path.join(AQUI, "..", ".env")

META_MARGEM_PCT = 33.0   # meta de margem de contribuicao (regras.META_MARGEM_PCT)
FILIAL = "1"


def carregar_env() -> dict:
    d: dict[str, str] = {}
    with open(ENV, encoding="utf-8") as f:
        for linha in f:
            linha = linha.strip()
            if linha and not linha.startswith("#") and "=" in linha:
                k, v = linha.split("=", 1)
                d[k.strip()] = v.strip()
    return d


def conectar():
    e = carregar_env()
    conn = oracledb.connect(
        user=e["DB_USER"], password=e["DB_PASSWORD"],
        dsn=f'{e["DB_HOST"]}:{e["DB_PORT"]}/{e["DB_SERVICE_NAME"]}',
    )
    cur = conn.cursor()
    cur.execute(f'ALTER SESSION SET CURRENT_SCHEMA = {e.get("DB_OWNER", "U_CMT9GE_WI")}')
    cur.close()
    return conn


def um(cur, sql, binds=None):
    cur.execute(sql, binds or {})
    return cur.fetchone()


def linhas(cur, sql, binds=None):
    cur.execute(sql, binds or {})
    return cur.fetchall()


def farol(margem: float | None) -> str:
    if margem is None:
        return "INDEFINIDO"
    at = margem / META_MARGEM_PCT
    return "VERDE" if at >= 1.0 else "AMARELO" if at >= 0.9 else "VERMELHO"


def reais(v) -> str:
    return f"{float(v or 0):>14,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


# ---------------------------------------------------------------------------
# 1. Faturamento liquido, margem e farol por mes fechado
# ---------------------------------------------------------------------------
SQL_MESES = """
SELECT TO_CHAR(TRUNC(m.DTMOV,'MM'),'YYYY-MM') AS mes,
       SUM(CASE WHEN m.CODOPER='S'  THEN m.QT*m.PUNIT ELSE 0 END)                       AS bruto,
       SUM(CASE WHEN m.CODOPER='ED' THEN m.QT*m.PUNIT ELSE 0 END)                       AS devol,
       SUM(CASE WHEN m.CODOPER='S'  THEN m.QT*m.PUNIT ELSE -(m.QT*m.PUNIT) END)         AS liquido,
       SUM(CASE WHEN m.CODOPER='S'  THEN m.QT*NVL(m.CUSTOFIN,0)
                                    ELSE -(m.QT*NVL(m.CUSTOFIN,0)) END)                 AS custo
FROM   PCMOV m
WHERE  m.CODOPER IN ('S','ED') AND m.DTCANCEL IS NULL AND m.CODFILIAL = :filial
AND    m.DTMOV >= :ini AND m.DTMOV < :fim
GROUP  BY TRUNC(m.DTMOV,'MM')
ORDER  BY 1
"""


def bloco_faturamento(cur, ini: date, fim: date) -> None:
    print("=" * 92)
    print("1. FATURAMENTO LIQUIDO, MARGEM E FAROL POR MES FECHADO (medida canonica: PCMOV S/ED)")
    print("=" * 92)
    print(f"{'mes':8}{'bruto':>16}{'devolucao':>15}{'%ded':>7}{'liquido':>16}"
          f"{'custo':>16}{'margem%':>9}  farol")
    for mes, bruto, devol, liquido, custo in linhas(cur, SQL_MESES,
                                                    {"filial": FILIAL, "ini": ini, "fim": fim}):
        bruto, devol, liquido, custo = float(bruto), float(devol), float(liquido), float(custo)
        ded = 100.0 * devol / bruto if bruto else 0.0
        margem = 100.0 * (liquido - custo) / liquido if liquido else None
        m_txt = f"{margem:>8.2f}" if margem is not None else "     n/d"
        print(f"{mes:8}{reais(bruto)}{reais(devol)}{ded:>7.2f}{reais(liquido)}"
              f"{reais(custo)}{m_txt}  {farol(margem)}")


# ---------------------------------------------------------------------------
# 2. Conferencia capa (PCNFSAID/PCNFENT) x item (PCMOV) — tem que dar 0,00
# ---------------------------------------------------------------------------
SQL_CAPA_VENDA = """
SELECT NVL(SUM(n.VLTOTAL),0)
FROM   PCNFSAID n
WHERE  n.DTCANCEL IS NULL AND n.CODFILIAL = :filial
AND    n.DTSAIDA >= :ini AND n.DTSAIDA < :fim
AND    EXISTS (SELECT 1 FROM PCMOV m
               WHERE m.NUMTRANSVENDA = n.NUMTRANSVENDA
               AND   m.CODOPER='S' AND m.DTCANCEL IS NULL)
"""
SQL_ITEM_VENDA = """
SELECT NVL(SUM(m.QT*m.PUNIT),0)
FROM   PCMOV m
WHERE  m.CODOPER='S' AND m.DTCANCEL IS NULL AND m.CODFILIAL = :filial
AND    m.DTMOV >= :ini AND m.DTMOV < :fim
"""
SQL_CAPA_DEVOL = """
SELECT NVL(SUM(e.VLTOTAL),0)
FROM   PCNFENT e
WHERE  e.CODFISCAL = 132 AND e.CODFILIAL = :filial
AND    e.DTENT >= :ini AND e.DTENT < :fim
"""
SQL_ITEM_DEVOL = """
SELECT NVL(SUM(m.QT*m.PUNIT),0)
FROM   PCMOV m
WHERE  m.CODOPER='ED' AND m.DTCANCEL IS NULL AND m.CODFILIAL = :filial
AND    m.DTMOV >= :ini AND m.DTMOV < :fim
"""


def bloco_capa_item(cur, ini: date, fim: date) -> bool:
    print("\n" + "=" * 92)
    print("2. CONFERENCIA CAPA x ITEM (deve dar R$ 0,00 nos dois)")
    print("=" * 92)
    b = {"filial": FILIAL, "ini": ini, "fim": fim}
    capa_v = float(um(cur, SQL_CAPA_VENDA, b)[0])
    item_v = float(um(cur, SQL_ITEM_VENDA, b)[0])
    capa_d = float(um(cur, SQL_CAPA_DEVOL, b)[0])
    item_d = float(um(cur, SQL_ITEM_DEVOL, b)[0])
    dif_v, dif_d = item_v - capa_v, item_d - capa_d
    print(f"  venda      capa={reais(capa_v)}  item={reais(item_v)}  dif={reais(dif_v)}")
    print(f"  devolucao  capa={reais(capa_d)}  item={reais(item_d)}  dif={reais(dif_d)}")
    ok = abs(dif_v) < 0.005 and abs(dif_d) < 0.005
    print(f"  => {'OK, capa e item batem ao centavo' if ok else 'ATENCAO: capa e item DIVERGEM'}")
    return ok


# ---------------------------------------------------------------------------
# 3. Churn pela regua canonica (ancora na ULTIMA compra do cliente)
# ---------------------------------------------------------------------------
SQL_CHURN = """
WITH dc AS (
  SELECT m.CODCLI, TRUNC(m.DTMOV) AS dt
  FROM   PCMOV m
  WHERE  m.CODOPER='S' AND m.DTCANCEL IS NULL AND m.CODFILIAL = :filial
  GROUP  BY m.CODCLI, TRUNC(m.DTMOV)
), ult AS (
  SELECT CODCLI, MAX(dt) AS ultima FROM dc GROUP BY CODCLI
), ciclo AS (               -- janela de 90 dias ANCORADA na ultima compra do cliente
  SELECT c.CODCLI, COUNT(*) AS n90,
         (MAX(c.dt)-MIN(c.dt))/NULLIF(COUNT(*)-1,0) AS ciclo
  FROM   dc c JOIN ult u ON u.CODCLI = c.CODCLI
  WHERE  c.dt >= u.ultima - 90
  GROUP  BY c.CODCLI
), liq12 AS (
  SELECT m.CODCLI,
         SUM(CASE WHEN m.CODOPER='S' THEN m.QT*m.PUNIT ELSE -(m.QT*m.PUNIT) END) AS liquido
  FROM   PCMOV m
  WHERE  m.CODOPER IN ('S','ED') AND m.DTCANCEL IS NULL AND m.CODFILIAL = :filial
  AND    m.DTMOV >= ADD_MONTHS(:ref, -12)
  GROUP  BY m.CODCLI
), base AS (
  SELECT u.CODCLI, :ref - u.ultima AS dias,
         CASE WHEN k.n90 >= 2 THEN k.ciclo END AS ciclo, NVL(l.liquido,0) AS liquido
  FROM   ult u LEFT JOIN ciclo k ON k.CODCLI = u.CODCLI
                LEFT JOIN liq12 l ON l.CODCLI = u.CODCLI
)
SELECT CASE WHEN dias >= LEAST(30, NVL(2.0*ciclo, 30))              THEN 'PERDIDO'
            WHEN ciclo IS NOT NULL AND dias >= 1.6*ciclo            THEN 'RISCO'
            ELSE 'ATIVO' END AS status,
       COUNT(*) AS clientes, ROUND(SUM(liquido),2) AS liquido_12m
FROM   base
GROUP  BY CASE WHEN dias >= LEAST(30, NVL(2.0*ciclo, 30))          THEN 'PERDIDO'
               WHEN ciclo IS NOT NULL AND dias >= 1.6*ciclo        THEN 'RISCO'
               ELSE 'ATIVO' END
ORDER  BY 1
"""


def bloco_churn(cur, ref: date) -> None:
    print("\n" + "=" * 92)
    print(f"3. CHURN pela regua canonica (teto 30d, ciclo 90d, 1,6x/2,0x; ancora = {ref})")
    print("=" * 92)
    dados = {r[0]: (int(r[1]), float(r[2])) for r in linhas(cur, SQL_CHURN, {"filial": FILIAL, "ref": ref})}
    total_liq = sum(v[1] for v in dados.values()) or 1.0
    for st in ("ATIVO", "RISCO", "PERDIDO"):
        n, liq = dados.get(st, (0, 0.0))
        print(f"  {st:8} {n:>4} clientes   liquido 12m = {reais(liq)}")
    perdido_liq = dados.get("PERDIDO", (0, 0.0))[1]
    print(f"  receita perdida = {reais(perdido_liq)}  ({100*perdido_liq/total_liq:.1f}% do liquido de 12m)")


def meses_fechados(ref: date) -> tuple[date, date]:
    """Do inicio do historico (out/2025) ao 1o dia do mes de `ref` (exclusive)."""
    fim = ref.replace(day=1)
    return date(2025, 10, 1), fim


def main() -> int:
    ref = date.today()
    if "--ref" in sys.argv:
        ref = datetime.strptime(sys.argv[sys.argv.index("--ref") + 1], "%Y-%m-%d").date()
    ini, fim = meses_fechados(ref)
    print(f"referencia = {ref}   |   meses fechados: {ini} .. {fim} (exclusive)\n")
    with conectar() as conn:
        cur = conn.cursor()
        bloco_faturamento(cur, ini, fim)
        ok = bloco_capa_item(cur, ini, fim)
        bloco_churn(cur, ref)
    print("\n" + ("OK — conferencia capa x item fechou; numeros acima sao a verdade da base."
                  if ok else "FALHA — capa e item divergiram; investigar antes de publicar."))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
