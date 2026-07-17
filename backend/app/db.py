"""Pool Oracle (modo thin) — acesso SOMENTE LEITURA ao Winthor."""
import re
import time

import oracledb

from .config import get_settings

_pool: oracledb.ConnectionPool | None = None

_SELECT_ONLY = re.compile(r"^\s*(SELECT|WITH)\b", re.IGNORECASE)

# comentarios de linha, de bloco e literais de string — precisam sair antes de
# checar o comando e de extrair binds (senao ':' dentro de '1:1' ou '00:00' vira bind)
_RUIDO = re.compile(r"--[^\n]*|/\*.*?\*/|'(?:[^']|'')*'", re.DOTALL)


def limpar_sql(sql: str) -> str:
    """Remove comentarios e literais, preservando o restante para analise."""
    return _RUIDO.sub(" ", sql)

# cache simples em memoria: chave -> (expira_em, resultado)
_cache: dict[str, tuple[float, list[dict]]] = {}
CACHE_TTL_SECONDS = 120


def _preparar_sessao(conn, _tag=None):
    # tabelas sem prefixo resolvem no schema do Winthor
    cur = conn.cursor()
    cur.execute(f"ALTER SESSION SET CURRENT_SCHEMA = {get_settings().db_owner}")
    cur.close()


def get_pool() -> oracledb.ConnectionPool:
    global _pool
    if _pool is None:
        s = get_settings()
        _pool = oracledb.create_pool(
            user=s.db_user,
            password=s.db_password,
            dsn=f"{s.db_host}:{s.db_port}/{s.db_service_name}",
            min=s.db_pool_min,
            max=s.db_pool_max,
            increment=1,
            getmode=oracledb.POOL_GETMODE_WAIT,
            session_callback=_preparar_sessao,
        )
    return _pool


def fetch_all(sql: str, binds: dict | None = None, cache_key: str | None = None) -> list[dict]:
    """Executa um SELECT e devolve lista de dicts (colunas em minusculas)."""
    if not _SELECT_ONLY.match(limpar_sql(sql)):
        raise ValueError("Apenas SELECT/WITH sao permitidos neste backend (BI read-only).")

    if cache_key:
        hit = _cache.get(cache_key)
        if hit and hit[0] > time.time():
            return hit[1]

    with get_pool().acquire() as conn:
        cur = conn.cursor()
        cur.arraysize = 1000
        cur.execute(sql, binds or {})
        cols = [d[0].lower() for d in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]

    if cache_key:
        _cache[cache_key] = (time.time() + CACHE_TTL_SECONDS, rows)
    return rows


def owner() -> str:
    return get_settings().db_owner
