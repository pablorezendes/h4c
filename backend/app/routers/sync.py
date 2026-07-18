"""Endpoints de ingestão do espelho Winthor.

O servidor não alcança o Oracle: quem extrai é o agente (sync/agente.py), que roda
numa máquina da rede do ERP e ENVIA os lotes por HTTPS para cá. Assim não é preciso
expor porta de banco na internet — reaproveita o TLS do Traefik.

Protocolo por tabela:
  1. POST /api/sync/iniciar    -> devolve a marca d'água (incremental) e prepara staging (completa)
  2. POST /api/sync/lote       -> N vezes, com as linhas
  3. POST /api/sync/finalizar  -> troca atômica (completa) e grava o controle

Autenticação por token dedicado (SYNC_TOKEN), separado do login da aplicação.
"""
import os
import time
from typing import Any

from fastapi import APIRouter, Header, HTTPException
from psycopg import sql
from pydantic import BaseModel

from ..pg import conexao, consultar

router = APIRouter(prefix="/api/sync", tags=["sync"])

_TEMPOS: dict[str, float] = {}


def _autorizar(x_sync_token: str | None) -> None:
    esperado = os.environ.get("SYNC_TOKEN", "")
    if not esperado:
        raise HTTPException(503, "SYNC_TOKEN não configurado no servidor")
    if x_sync_token != esperado:
        raise HTTPException(401, "token de sincronismo inválido")


def _valida_tabela(nome: str) -> str:
    """Só aceita tabelas que existem no schema winthor (evita SQL injection por nome)."""
    achou = consultar(
        "SELECT table_name FROM information_schema.tables "
        "WHERE table_schema='winthor' AND table_name=%(t)s",
        {"t": nome.lower()},
    )
    if not achou:
        raise HTTPException(400, f"tabela desconhecida no espelho: {nome}")
    return nome.lower()


class Iniciar(BaseModel):
    tabela: str
    estrategia: str  # 'completa' | 'incremental'


class Lote(BaseModel):
    tabela: str
    estrategia: str
    colunas: list[str]
    linhas: list[list[Any]]
    pk: list[str] = []


class Finalizar(BaseModel):
    tabela: str
    estrategia: str
    linhas: int
    marca: str | None = None  # maior data trazida (incremental)
    erro: str | None = None


@router.post("/iniciar")
def iniciar(body: Iniciar, x_sync_token: str = Header(default=None)):
    _autorizar(x_sync_token)
    t = _valida_tabela(body.tabela)
    _TEMPOS[t] = time.time()

    if body.estrategia == "completa":
        # staging vazia com a mesma estrutura; a troca é atômica no finalizar
        with conexao() as conn, conn.cursor() as cur:
            cur.execute(sql.SQL("DROP TABLE IF EXISTS winthor.{}").format(sql.Identifier(f"{t}__stg")))
            cur.execute(
                sql.SQL("CREATE TABLE winthor.{} (LIKE winthor.{} INCLUDING DEFAULTS)").format(
                    sql.Identifier(f"{t}__stg"), sql.Identifier(t)
                )
            )
        return {"tabela": t, "estrategia": "completa", "marca": None}

    marca = consultar(
        "SELECT ultima_marca FROM winthor.sync_controle WHERE tabela=%(t)s", {"t": t}
    )
    return {
        "tabela": t,
        "estrategia": "incremental",
        "marca": marca[0]["ultima_marca"].isoformat() if marca and marca[0]["ultima_marca"] else None,
    }


@router.post("/lote")
def lote(body: Lote, x_sync_token: str = Header(default=None)):
    _autorizar(x_sync_token)
    t = _valida_tabela(body.tabela)
    if not body.linhas:
        return {"gravadas": 0}

    alvo = f"{t}__stg" if body.estrategia == "completa" else t
    cols = [c.lower() for c in body.colunas]
    ident_cols = sql.SQL(", ").join(sql.Identifier(c) for c in cols)
    placeholders = sql.SQL(", ").join(sql.Placeholder() * len(cols))

    if body.estrategia == "incremental" and body.pk:
        pk = [c.lower() for c in body.pk]
        atualiza = sql.SQL(", ").join(
            sql.SQL("{c} = EXCLUDED.{c}").format(c=sql.Identifier(c)) for c in cols if c not in pk
        )
        comando = sql.SQL(
            "INSERT INTO winthor.{alvo} ({cols}) VALUES ({vals}) "
            "ON CONFLICT ({pk}) DO UPDATE SET {upd}"
        ).format(
            alvo=sql.Identifier(alvo),
            cols=ident_cols,
            vals=placeholders,
            pk=sql.SQL(", ").join(sql.Identifier(c) for c in pk),
            upd=atualiza,
        )
    else:
        comando = sql.SQL("INSERT INTO winthor.{alvo} ({cols}) VALUES ({vals})").format(
            alvo=sql.Identifier(alvo), cols=ident_cols, vals=placeholders
        )

    with conexao() as conn, conn.cursor() as cur:
        cur.executemany(comando, body.linhas)
    return {"gravadas": len(body.linhas)}


@router.post("/finalizar")
def finalizar(body: Finalizar, x_sync_token: str = Header(default=None)):
    _autorizar(x_sync_token)
    t = _valida_tabela(body.tabela)
    duracao = round(time.time() - _TEMPOS.pop(t, time.time()), 2)

    with conexao() as conn, conn.cursor() as cur:
        if body.estrategia == "completa" and not body.erro:
            # Troca atômica: os três comandos rodam na MESMA transação que o
            # psycopg abre e confirma ao sair do `with` — quem está lendo o
            # dashboard nunca enxerga a tabela vazia.
            # (Não usar "BEGIN;/COMMIT;" explícitos: o psycopg já está em
            #  transação e o BEGIN aninhado é ignorado com aviso.)
            cur.execute(sql.SQL("TRUNCATE winthor.{}").format(sql.Identifier(t)))
            cur.execute(
                sql.SQL("INSERT INTO winthor.{alvo} SELECT * FROM winthor.{stg}").format(
                    alvo=sql.Identifier(t), stg=sql.Identifier(f"{t}__stg")
                )
            )
            cur.execute(sql.SQL("DROP TABLE winthor.{}").format(sql.Identifier(f"{t}__stg")))
        elif body.estrategia == "completa":
            cur.execute(sql.SQL("DROP TABLE IF EXISTS winthor.{}").format(sql.Identifier(f"{t}__stg")))

        cur.execute(
            """INSERT INTO winthor.sync_controle
                 (tabela, estrategia, ultima_marca, ultima_execucao, linhas_ultima, duracao_seg, status, erro)
               VALUES (%(t)s, %(e)s, %(m)s, now(), %(n)s, %(d)s, %(s)s, %(err)s)
               ON CONFLICT (tabela) DO UPDATE SET
                 estrategia = EXCLUDED.estrategia,
                 ultima_marca = COALESCE(EXCLUDED.ultima_marca, winthor.sync_controle.ultima_marca),
                 ultima_execucao = EXCLUDED.ultima_execucao,
                 linhas_ultima = EXCLUDED.linhas_ultima,
                 duracao_seg = EXCLUDED.duracao_seg,
                 status = EXCLUDED.status,
                 erro = EXCLUDED.erro""",
            {"t": t, "e": body.estrategia, "m": body.marca, "n": body.linhas,
             "d": duracao, "s": "erro" if body.erro else "ok", "err": body.erro},
        )
    return {"tabela": t, "linhas": body.linhas, "duracao_seg": duracao,
            "status": "erro" if body.erro else "ok"}


@router.get("/status")
def status(x_sync_token: str = Header(default=None)):
    """Painel do sincronismo: o que foi carregado, quando e quantas linhas."""
    _autorizar(x_sync_token)
    return consultar(
        """SELECT tabela, estrategia, ultima_marca, ultima_execucao,
                  linhas_ultima, duracao_seg, status, erro
           FROM winthor.sync_controle ORDER BY tabela"""
    )
