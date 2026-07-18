"""Agente de sincronismo Winthor (Oracle) -> espelho Postgres do h4c BI.

RODA NUMA MÁQUINA QUE ALCANCE O ORACLE (o servidor do BI não alcança).
Extrai do Oracle e envia por HTTPS para /api/sync do backend — sem expor porta
de banco na internet.

Uso:
    python sync/agente.py                 # sincroniza tudo (conforme config.py)
    python sync/agente.py PCMOV PCNFSAID  # só as tabelas indicadas
    python sync/agente.py --completo      # ignora marca d'água (recarrega tudo)

Variáveis de ambiente (ou .env ao lado):
    H4C_API     https://h4c.codexaurora.com.br
    SYNC_TOKEN  token combinado com o servidor
    (o acesso ao Oracle vem do .env já usado pelo discovery)
"""
import argparse
import datetime as dt
import json
import os
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "discovery"))
from db import get_connection, load_env  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import OWNER, TABELAS, TIPOS_IGNORADOS  # noqa: E402

LOTE = 2000  # linhas por requisição


def _cfg() -> tuple[str, str]:
    env = {}
    for caminho in (os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"), r"Z:\.env"):
        if os.path.exists(caminho):
            env.update(load_env(caminho))
    api = os.environ.get("H4C_API") or env.get("H4C_API") or "https://h4c.codexaurora.com.br"
    token = os.environ.get("SYNC_TOKEN") or env.get("SYNC_TOKEN") or ""
    if not token:
        sys.exit("ERRO: defina SYNC_TOKEN (variável de ambiente ou sync/.env)")
    return api.rstrip("/"), token


def _post(api: str, token: str, rota: str, payload: dict) -> dict:
    req = urllib.request.Request(
        f"{api}/api/sync/{rota}",
        data=json.dumps(payload, default=str).encode("utf-8"),
        headers={"Content-Type": "application/json", "X-Sync-Token": token},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{rota} falhou [{e.code}]: {e.read()[:300].decode('utf-8', 'replace')}") from e


def _colunas(cur, tabela: str) -> list[str]:
    cur.execute(
        """SELECT column_name, data_type FROM all_tab_columns
           WHERE owner = :o AND table_name = :t ORDER BY column_id""",
        {"o": OWNER, "t": tabela},
    )
    return [c for c, tipo in cur.fetchall() if (tipo or "").upper() not in TIPOS_IGNORADOS]


def _normaliza(v):
    if isinstance(v, dt.datetime):
        return v.isoformat(sep=" ")
    if isinstance(v, dt.date):
        return v.isoformat()
    if hasattr(v, "read"):  # LOB
        try:
            return v.read()
        except Exception:  # noqa: BLE001
            return None
    return v


def sincroniza(tabela: str, cfg: dict, api: str, token: str, forcar_completo: bool) -> tuple[int, str]:
    estrategia = "completa" if forcar_completo else cfg["estrategia"]
    inicio = _post(api, token, "iniciar", {"tabela": tabela, "estrategia": estrategia})
    marca = inicio.get("marca")

    with get_connection() as conn:
        cur = conn.cursor()
        cur.arraysize = LOTE
        cols = _colunas(cur, tabela)
        lista = ", ".join(f'"{c}"' for c in cols)

        where, binds = "", {}
        if estrategia == "incremental" and marca:
            col = cfg["coluna_data"]
            # relê alguns dias antes da marca: pega lançamento retroativo do dia anterior
            recuo = cfg.get("reprocessa_dias", 0)
            where = f' WHERE "{col}" >= TO_DATE(:marca, \'YYYY-MM-DD HH24:MI:SS\') - {recuo}'
            binds = {"marca": marca[:19].replace("T", " ")}

        cur.execute(f'SELECT {lista} FROM {OWNER}."{tabela}"{where}', binds)

        total, maior_data = 0, marca
        idx_data = cols.index(cfg["coluna_data"]) if cfg.get("coluna_data") in cols else None
        while True:
            linhas = cur.fetchmany(LOTE)
            if not linhas:
                break
            dados = [[_normaliza(v) for v in linha] for linha in linhas]
            if idx_data is not None:
                for linha in dados:
                    if linha[idx_data] and (maior_data is None or str(linha[idx_data]) > str(maior_data)):
                        maior_data = str(linha[idx_data])
            _post(api, token, "lote", {
                "tabela": tabela, "estrategia": estrategia, "colunas": cols,
                "linhas": dados, "pk": cfg.get("pk", []),
            })
            total += len(dados)
            print(f"    … {total:,} linhas", end="\r", flush=True)

    _post(api, token, "finalizar", {
        "tabela": tabela, "estrategia": estrategia, "linhas": total, "marca": maior_data,
    })
    return total, estrategia


def main() -> None:
    p = argparse.ArgumentParser(description="Sincroniza o Winthor com o espelho Postgres do h4c BI")
    p.add_argument("tabelas", nargs="*", help="tabelas específicas (padrão: todas)")
    p.add_argument("--completo", action="store_true", help="ignora marca d'água e recarrega tudo")
    args = p.parse_args()

    api, token = _cfg()
    alvo = {t: c for t, c in TABELAS.items() if not args.tabelas or t in [x.upper() for x in args.tabelas]}
    if not alvo:
        sys.exit(f"nenhuma tabela reconhecida. Disponíveis: {', '.join(TABELAS)}")

    print(f"Sincronizando {len(alvo)} tabela(s) para {api}\n")
    t0, geral, falhas = time.time(), 0, []
    for tabela, cfg in alvo.items():
        marca_ini = time.time()
        print(f"  {tabela:14s} ({cfg['estrategia']})", end=" ", flush=True)
        try:
            n, estrategia = sincroniza(tabela, cfg, api, token, args.completo)
            geral += n
            print(f"\r  {tabela:14s} ({estrategia:11s}) {n:>8,} linhas  {time.time()-marca_ini:5.1f}s")
        except Exception as e:  # noqa: BLE001
            falhas.append((tabela, str(e)[:200]))
            print(f"\r  {tabela:14s} FALHOU: {str(e)[:120]}")
            try:
                _post(api, token, "finalizar", {"tabela": tabela, "estrategia": cfg["estrategia"],
                                                "linhas": 0, "erro": str(e)[:500]})
            except Exception:  # noqa: BLE001
                pass

    print(f"\n{geral:,} linhas em {time.time()-t0:.1f}s")
    if falhas:
        print(f"\n{len(falhas)} falha(s):")
        for t, e in falhas:
            print(f"  - {t}: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
