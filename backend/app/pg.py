"""Pool Postgres do espelho local (leitura do BI + escrita do sincronismo)."""
import os
from functools import lru_cache

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

_pool: ConnectionPool | None = None


@lru_cache
def dsn() -> str:
    return os.environ.get("PG_DSN", "postgresql://h4c:h4c@postgres:5432/h4c")


def _opcoes() -> str:
    """Parâmetros aplicados na ABERTURA da conexão.

    ★ Não usar o callback `configure` do pool para isso: um `conn.execute("SET ...")`
    abre transação implícita e a conexão volta em INTRANS, fazendo o psycopg_pool
    DESCARTAR toda conexão nova ("connection left in status INTRANS ... discarded")
    até estourar o timeout. Passando via `options` o servidor aplica no startup,
    sem transação.

    - search_path: tabelas do espelho sem prefixo (como o CURRENT_SCHEMA do Oracle)
    - TimeZone: CURRENT_DATE precisa ser o dia no fuso do Brasil
    """
    tz = os.environ.get("TZ", "America/Sao_Paulo")
    return f"-c search_path=winthor,public -c timezone={tz}"


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            dsn(),
            min_size=1,
            max_size=6,
            timeout=15,
            kwargs={"row_factory": dict_row, "options": _opcoes()},
        )
    return _pool


def consultar(sql: str, binds: dict | None = None) -> list[dict]:
    """SELECT no espelho. Mantém a mesma assinatura de db.fetch_all (dicts)."""
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, binds or {})
            return [dict(r) for r in cur.fetchall()]


def executar(sql: str, binds: dict | None = None) -> None:
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, binds or {})


def conexao() -> psycopg.Connection:
    """Conexão crua para operações transacionais do sincronismo."""
    return get_pool().connection()
