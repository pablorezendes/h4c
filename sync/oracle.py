"""Conexão Oracle do agente de sincronismo — autossuficiente (roda em container Linux).

Usa oracledb em modo THIN: não precisa de Instant Client. Credenciais por variável
de ambiente (ou arquivo .env ao lado), nunca hardcoded.
"""
import os

import oracledb

_VARS = ("DB_HOST", "DB_PORT", "DB_SERVICE_NAME", "DB_USER", "DB_PASSWORD", "DB_OWNER")


def carrega_env(caminho: str) -> dict:
    env = {}
    if not os.path.exists(caminho):
        return env
    with open(caminho, encoding="utf-8") as f:
        for linha in f:
            linha = linha.strip()
            if linha and not linha.startswith("#") and "=" in linha:
                k, v = linha.split("=", 1)
                env[k.strip()] = v.strip()
    return env


def config() -> dict:
    """Ambiente > sync/.env > /env/.env (montado no container) > Z:\\.env (dev Windows)."""
    cfg = {}
    aqui = os.path.dirname(os.path.abspath(__file__))
    for caminho in (os.path.join(aqui, ".env"), "/env/.env", r"Z:\.env"):
        cfg.update(carrega_env(caminho))
    for v in _VARS + ("H4C_API", "SYNC_TOKEN"):
        if os.environ.get(v):
            cfg[v] = os.environ[v]
    faltando = [v for v in _VARS if not cfg.get(v) and v != "DB_OWNER"]
    if faltando:
        raise SystemExit(f"ERRO: faltam variáveis do Oracle: {', '.join(faltando)}")
    cfg.setdefault("DB_OWNER", "U_CMT9GE_WI")
    return cfg


def conecta(cfg: dict | None = None) -> oracledb.Connection:
    c = cfg or config()
    return oracledb.connect(
        user=c["DB_USER"],
        password=c["DB_PASSWORD"],
        dsn=f'{c["DB_HOST"]}:{c["DB_PORT"]}/{c["DB_SERVICE_NAME"]}',
    )
