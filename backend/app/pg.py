"""Pool Postgres do espelho local (leitura do BI + escrita do sincronismo)."""
import os
from functools import lru_cache

import psycopg
from psycopg_pool import ConnectionPool
from psycopg.rows import dict_row

_pool: ConnectionPool | None = None


@lru_cache
def dsn() -> str:
    return os.environ.get(
        "PG_DSN",
        "postgresql://h4c:h4c@postgres:5432/h4c",
    )


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(dsn(), min_size=1, max_size=6, kwargs={"row_factory": dict_row})
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
