"""Camada única de consulta do BI: espelho Postgres (padrão) ou Oracle (legado).

A fonte é escolhida por FONTE_DADOS=postgres|oracle, para permitir voltar atrás
sem redeploy caso alguma consulta portada apresente problema.

Os SQLs (specs e routers) usam sempre binds no estilo Oracle `:nome`. Aqui eles
são convertidos para o estilo do psycopg (`%(nome)s`) quando a fonte é Postgres.

★ ARMADILHA IMPORTANTE: em PostgreSQL `x::date` é um cast, e um regex ingênuo
`:(\\w+)` captura o "date" como se fosse um bind. Isso derrubaria 47 das 58
consultas com "parâmetro ausente". Por isso o padrão exige que os dois-pontos
NÃO sejam precedidos nem seguidos de outro dois-pontos.
"""
import os
import re

from . import db as oracle
from . import pg

# ':nome' que não faz parte de '::' (cast do Postgres)
BIND = re.compile(r"(?<!:):(?!:)(\w+)")


def fonte() -> str:
    return os.environ.get("FONTE_DADOS", "postgres").strip().lower()


def usando_espelho() -> bool:
    return fonte() == "postgres"


def limpar(sql: str) -> str:
    """Remove comentários e literais antes de procurar binds."""
    return oracle.limpar_sql(sql)


def binds_usados(sql: str) -> set[str]:
    """Nomes de bind realmente presentes no SQL (ignora casts e comentários)."""
    return {b for b in BIND.findall(limpar(sql)) if not b.isdigit()}


def para_psycopg(sql: str) -> str:
    """`:nome` -> `%(nome)s`, preservando `::casts` e `%` literais."""
    return BIND.sub(r"%(\1)s", sql.replace("%", "%%").replace("%%(", "%("))


def esquema() -> str:
    """Prefixo de schema das tabelas conforme a fonte."""
    return "winthor" if usando_espelho() else oracle.owner()


def consultar(sql: str, binds: dict | None = None, cache_key: str | None = None) -> list[dict]:
    """Executa um SELECT na fonte configurada e devolve lista de dicts."""
    if usando_espelho():
        return pg.consultar(para_psycopg(sql), binds or {})
    return oracle.fetch_all(sql, binds, cache_key=cache_key)
