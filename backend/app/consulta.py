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


# comentário de linha, de bloco ou literal — regiões onde `:algo` NÃO é bind
RUIDO = re.compile(r"(--[^\n]*|/\*.*?\*/|'(?:[^']|'')*')", re.DOTALL)


def para_psycopg(sql: str) -> str:
    """`:nome` -> `%(nome)s`, preservando casts `::`, comentários e literais.

    ★ Converter no SQL cru cria placeholders fantasma: o `1:1` de um comentário
    virava `%(1)s` e o `'00:00:00'` de um literal virava `%(00)s`, e o psycopg
    respondia "query parameter missing: 1". Por isso a troca só acontece nas
    regiões de CÓDIGO — comentários e literais são copiados intactos.

    Todo `%` literal também vira `%%`, exigência do psycopg quando há parâmetros.
    """
    partes = RUIDO.split(sql)
    saida = []
    for i, parte in enumerate(partes):
        parte = parte.replace("%", "%%")
        if i % 2 == 0:  # índices pares = código; ímpares = comentário/literal
            parte = BIND.sub(r"%(\1)s", parte)
        saida.append(parte)
    return "".join(saida)


def esquema() -> str:
    """Prefixo de schema das tabelas conforme a fonte."""
    return "winthor" if usando_espelho() else oracle.owner()


def consultar(sql: str, binds: dict | None = None, cache_key: str | None = None) -> list[dict]:
    """Executa um SELECT na fonte configurada e devolve lista de dicts."""
    if usando_espelho():
        return pg.consultar(para_psycopg(sql), binds or {})
    return oracle.fetch_all(sql, binds, cache_key=cache_key)
