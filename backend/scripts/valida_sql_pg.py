"""Valida TODAS as consultas contra o Postgres usando EXPLAIN (não executa, não altera nada).

EXPLAIN faz o Postgres analisar sintaxe, nomes de coluna e TIPOS — pega justamente
os erros de dialeto (interval x número, round(double precision, int), coluna
inexistente) sem varrer os dados. Roda em segundos.

    docker compose exec backend python scripts/valida_sql_pg.py
"""
import re
import sys
from datetime import date, timedelta

sys.path.insert(0, "/app")

from app import consulta  # noqa: E402
from app.pg import get_pool  # noqa: E402
from app.routers import analises as r_analises  # noqa: E402
from app.routers import indicadores as r_indicadores  # noqa: E402

DT_FIM = date(2026, 7, 17)
DT_INI = DT_FIM - timedelta(days=29)
VALORES = {"dt_ini": DT_INI, "dt_fim": DT_FIM, "hora_ini": 0.0, "hora_fim": 23.999,
           "top_n": 10, "limite": 10, "lim": 10, "i": DT_INI, "f": DT_FIM,
           "h1": 0.0, "h2": 23.999, "ancora": DT_FIM, "ini": DT_INI, "fim": DT_FIM,
           "dias": 56, "top": 8, "marca": DT_INI}

# SQL embutido nos routers (kpis.py / futuro.py) — extraído do código-fonte
INLINE = re.compile(r'(?:consultar|fetch_all)\(\s*f?"""(.*?)"""', re.S)


def sqls_inline() -> list[tuple[str, str]]:
    achados = []
    for arq in ("/app/app/routers/kpis.py", "/app/app/routers/futuro.py"):
        try:
            fonte = open(arq, encoding="utf-8").read()
        except OSError:
            continue
        for i, sql in enumerate(INLINE.findall(fonte), 1):
            # resolve as f-string simples usadas nesses arquivos
            sql = sql.replace("{o}", "winthor").replace("{consulta.esquema()}", "winthor")
            sql = sql.replace("{_existe_item_venda('n')}", "true").replace("{EXISTE_ITEM_VENDA}", "true")
            sql = sql.replace("{filtro_hora}", "")
            if "{" in sql:  # trecho dinâmico que não sei resolver: pula
                continue
            achados.append((f"{arq.split('/')[-1]}#{i}", sql))
    return achados


def valida(nome: str, sql: str) -> str | None:
    binds = {k: VALORES[k] for k in consulta.binds_usados(sql) if k in VALORES}
    faltando = consulta.binds_usados(sql) - set(binds)
    if faltando:
        return f"binds sem valor de teste: {sorted(faltando)}"
    try:
        with get_pool().connection() as conn:
            with conn.cursor() as cur:
                cur.execute("EXPLAIN " + consulta.para_psycopg(sql), binds)
        return None
    except Exception as e:  # noqa: BLE001
        return str(e).splitlines()[0][:170]


def main() -> int:
    itens: list[tuple[str, str]] = []
    itens += [(a["id"], a["sql"].replace("{OWNER}", "winthor")) for a in r_analises._carregar_spec()]
    itens += [(i["id"], i["sql"].replace("{OWNER}", "winthor")) for i in r_indicadores._carregar_spec()]
    itens += sqls_inline()

    print(f"validando {len(itens)} consultas com EXPLAIN (fonte={consulta.fonte()})\n")
    ruins = []
    for nome, sql in itens:
        erro = valida(nome, sql)
        if erro:
            ruins.append((nome, erro))
            print(f"  ERRO  {nome:16s} {erro}")
    print(f"\n{len(itens) - len(ruins)}/{len(itens)} válidas")
    if ruins:
        print(f"\n{len(ruins)} com problema:")
        for n, e in ruins:
            print(f"  - {n}: {e}")
    return 1 if ruins else 0


if __name__ == "__main__":
    sys.exit(main())
