"""Agente de sincronismo Winthor (Oracle) -> espelho Postgres do h4c BI.

RODA NUMA MÁQUINA QUE ALCANCE O ORACLE (o servidor do BI não alcança).
Extrai do Oracle e envia por HTTPS para /api/sync — sem expor porta de banco.

Uso:
    python agente.py                    # sincroniza tudo (conforme config.py)
    python agente.py PCMOV PCNFSAID     # só as tabelas indicadas
    python agente.py --completo         # ignora marca d'água e recarrega tudo

Variáveis (ambiente, sync/.env ou /env/.env):
    DB_HOST DB_PORT DB_SERVICE_NAME DB_USER DB_PASSWORD  (Oracle)
    H4C_API      https://h4c.codexaurora.com.br
    SYNC_TOKEN   token combinado com o servidor
"""
import argparse
import datetime as dt
import json
import os
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import TABELAS, TIPOS_IGNORADOS  # noqa: E402
from oracle import conecta, config  # noqa: E402

# alvo de ~1,2 MB por requisição: tabelas largas levam menos linhas por lote
BYTES_POR_LOTE = 1_200_000
LOTE_MIN, LOTE_MAX = 200, 4000


def _post(api: str, token: str, rota: str, payload: dict, tentativas: int = 3) -> dict:
    corpo = json.dumps(payload, default=str).encode("utf-8")
    for tentativa in range(1, tentativas + 1):
        req = urllib.request.Request(
            f"{api}/api/sync/{rota}", data=corpo,
            headers={"Content-Type": "application/json", "X-Sync-Token": token},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=600) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            detalhe = e.read()[:300].decode("utf-8", "replace")
            if e.code < 500 or tentativa == tentativas:
                raise RuntimeError(f"{rota} [{e.code}]: {detalhe}") from e
        except Exception as e:  # noqa: BLE001 — rede instável: tenta de novo
            if tentativa == tentativas:
                raise RuntimeError(f"{rota}: {e}") from e
        time.sleep(2 * tentativa)
    raise RuntimeError(f"{rota}: falhou após {tentativas} tentativas")


def _colunas(cur, owner: str, tabela: str) -> list[str]:
    cur.execute(
        """SELECT column_name, data_type FROM all_tab_columns
           WHERE owner = :o AND table_name = :t ORDER BY column_id""",
        {"o": owner, "t": tabela},
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


def sincroniza(tabela: str, cfg: dict, cx, owner: str, api: str, token: str,
               forcar_completo: bool) -> tuple[int, str]:
    estrategia = "completa" if forcar_completo else cfg["estrategia"]
    inicio = _post(api, token, "iniciar", {"tabela": tabela, "estrategia": estrategia})
    marca = inicio.get("marca")

    cur = cx.cursor()
    cols = _colunas(cur, owner, tabela)
    lista = ", ".join(f'"{c}"' for c in cols)

    where, binds = "", {}
    if estrategia == "incremental" and marca:
        col = cfg["coluna_data"]
        recuo = cfg.get("reprocessa_dias", 0)
        where = f" WHERE \"{col}\" >= TO_DATE(:marca, 'YYYY-MM-DD HH24:MI:SS') - {recuo}"
        binds = {"marca": str(marca)[:19].replace("T", " ")}

    # lote adaptativo: estima o peso da linha pela quantidade de colunas
    por_lote = max(LOTE_MIN, min(LOTE_MAX, BYTES_POR_LOTE // max(len(cols) * 25, 1)))
    cur.arraysize = por_lote

    cur.execute(f'SELECT {lista} FROM {owner}."{tabela}"{where}', binds)

    total, maior_data = 0, marca
    idx_data = cols.index(cfg["coluna_data"]) if cfg.get("coluna_data") in cols else None
    while True:
        linhas = cur.fetchmany(por_lote)
        if not linhas:
            break
        dados = [[_normaliza(v) for v in linha] for linha in linhas]
        if idx_data is not None:
            for linha in dados:
                valor = linha[idx_data]
                if valor and (maior_data is None or str(valor) > str(maior_data)):
                    maior_data = str(valor)
        _post(api, token, "lote", {
            "tabela": tabela, "estrategia": estrategia, "colunas": cols,
            "linhas": dados, "pk": cfg.get("pk", []),
        })
        total += len(dados)
        print(f"      {total:,} linhas…", end="\r", flush=True)

    _post(api, token, "finalizar", {
        "tabela": tabela, "estrategia": estrategia, "linhas": total, "marca": maior_data,
    })
    return total, estrategia


def executa(tabelas: list[str] | None = None, forcar_completo: bool = False) -> int:
    cfg = config()
    api = (cfg.get("H4C_API") or "https://h4c.codexaurora.com.br").rstrip("/")
    token = cfg.get("SYNC_TOKEN") or ""
    if not token:
        raise SystemExit("ERRO: defina SYNC_TOKEN")
    owner = cfg["DB_OWNER"]

    pedidas = [t.upper() for t in (tabelas or [])]
    alvo = {t: c for t, c in TABELAS.items() if not pedidas or t in pedidas}
    if not alvo:
        raise SystemExit(f"nenhuma tabela reconhecida. Disponíveis: {', '.join(TABELAS)}")

    carimbo = dt.datetime.now().strftime("%d/%m %H:%M:%S")
    print(f"[{carimbo}] sincronizando {len(alvo)} tabela(s) -> {api}")
    t0, geral, falhas = time.time(), 0, []

    with conecta(cfg) as cx:
        for tabela, tcfg in alvo.items():
            ini = time.time()
            try:
                n, estrategia = sincroniza(tabela, tcfg, cx, owner, api, token, forcar_completo)
                geral += n
                print(f"  {tabela:14s} {estrategia:11s} {n:>8,} linhas  {time.time()-ini:5.1f}s")
            except Exception as e:  # noqa: BLE001
                falhas.append((tabela, str(e)[:160]))
                print(f"  {tabela:14s} FALHOU: {str(e)[:110]}")
                try:
                    _post(api, token, "finalizar", {
                        "tabela": tabela, "estrategia": tcfg["estrategia"],
                        "linhas": 0, "erro": str(e)[:500]})
                except Exception:  # noqa: BLE001
                    pass

    print(f"  total: {geral:,} linhas em {time.time()-t0:.1f}s"
          + (f" · {len(falhas)} falha(s)" if falhas else ""))
    for t, e in falhas:
        print(f"    - {t}: {e}")
    return 1 if falhas else 0


def main() -> None:
    p = argparse.ArgumentParser(description="Sincroniza o Winthor com o espelho Postgres do h4c BI")
    p.add_argument("tabelas", nargs="*", help="tabelas específicas (padrão: todas)")
    p.add_argument("--completo", action="store_true", help="ignora marca d'água e recarrega tudo")
    args = p.parse_args()
    sys.exit(executa(args.tabelas, args.completo))


if __name__ == "__main__":
    main()
